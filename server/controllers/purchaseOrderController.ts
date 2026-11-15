import { Request, Response } from 'express';
import { PurchaseOrder, PurchaseOrderStatus } from '../models/PurchaseOrder.ts';
import { PurchaseOrderItem } from '../models/PurchaseOrderItem.ts';
import { Product } from '../models/Product.ts';
import { Supplier } from '../models/Supplier.ts';
import { InventoryTransaction } from '../models/InventoryTransaction.ts';
import { AppError } from '../middleware/errorHandler.ts';
import { createPurchaseOrderSchema, receivePurchaseOrderSchema } from '../validators/schemas.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { createEventNotification, syncSystemNotifications } from '../services/notificationService.ts';

function generatePONumber(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PO-${ymd}-${rand}`;
}

export async function listPurchaseOrders(req: Request, res: Response): Promise<void> {
  const status = String(req.query.status || 'all');
  const search = String(req.query.search || '').trim();

  const filter: Record<string, unknown> = {};
  if (status !== 'all') filter.status = status;
  if (search) filter.poNumber = { $regex: search, $options: 'i' };

  const orders = await PurchaseOrder.find(filter)
    .populate('supplier', 'name code averageLeadTimeDays phone email')
    .populate('createdBy', 'name role')
    .populate('approvedBy', 'name role')
    .sort({ createdAt: -1 })
    .lean();

  const orderIds = orders.map((o) => o._id);
  const allItems = await PurchaseOrderItem.find({ purchaseOrder: { $in: orderIds } })
    .populate('product', 'name sku unit currentStock')
    .lean();

  const itemsByPO = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const pid = String(item.purchaseOrder);
    const list = itemsByPO.get(pid) || [];
    list.push(item);
    itemsByPO.set(pid, list);
  }

  res.json({
    purchaseOrders: orders.map((o) => ({
      ...o,
      items: itemsByPO.get(String(o._id)) || [],
    })),
  });
}

export async function createPurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = createPurchaseOrderSchema.parse(req.body);
  const supplierExists = await Supplier.exists({ _id: parsed.supplierId });
  if (!supplierExists) throw new AppError('Selected supplier was not found.', 404);
  if (Number.isNaN(new Date(parsed.expectedDeliveryDate).getTime())) {
    throw new AppError('Expected delivery date is invalid.', 400);
  }

  const productIds = parsed.items.map((i) => i.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new AppError('Each product may appear only once on a purchase order. Combine duplicate lines.', 400);
  }
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  if (products.length !== new Set(productIds).size) {
    throw new AppError('One or more selected products were not found.', 404);
  }
  const prodMap = new Map(products.map((p) => [String(p._id), p]));

  let subtotal = 0;
  let gstAmount = 0;
  const itemDocs = parsed.items.map((i) => {
    const p = prodMap.get(i.productId)!;
    const lineNet = Number((i.orderedQuantity * i.unitCost).toFixed(2));
    const lineGst = Number(((lineNet * (p.gstRate || 12)) / 100).toFixed(2));
    subtotal += lineNet;
    gstAmount += lineGst;
    return {
      product: p._id,
      sku: p.sku,
      productName: p.name,
      orderedQuantity: i.orderedQuantity,
      receivedQuantity: 0,
      unitCost: i.unitCost,
      gstRate: p.gstRate || 12,
      lineTotal: Number((lineNet + lineGst).toFixed(2)),
    };
  });

  let po = null;
  for (let attempt = 0; attempt < 5 && !po; attempt++) {
    try {
      po = await PurchaseOrder.create({
    poNumber: generatePONumber(),
    supplier: parsed.supplierId,
    status: parsed.status,
    orderDate: new Date(),
    expectedDeliveryDate: new Date(parsed.expectedDeliveryDate),
    subtotal: Number(subtotal.toFixed(2)),
    gstAmount: Number(gstAmount.toFixed(2)),
    totalAmount: Number((subtotal + gstAmount).toFixed(2)),
    notes: parsed.notes,
    createdBy: req.user?.userId,
    approvedBy: parsed.status === 'Approved' || parsed.status === 'Ordered' ? req.user?.userId : undefined,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  if (!po) throw new AppError('Could not allocate a PO number. Please retry.', 500);

  let items;
  try {
    items = await PurchaseOrderItem.insertMany(itemDocs.map((d) => ({ ...d, purchaseOrder: po._id })));
  } catch (err) {
    await PurchaseOrder.deleteOne({ _id: po._id }); // never leave a PO header without lines
    throw err;
  }

  await createEventNotification({
    dedupeKey: `PO_CREATE:${po._id}`,
    type: 'PO_UPDATE',
    title: `New Purchase Order ${po.poNumber}`,
    message: `Purchase Order ${po.poNumber} created with status "${po.status}" for ₹${po.totalAmount.toLocaleString('en-IN')}.`,
    severity: 'info',
    entityType: 'PurchaseOrder',
    entityId: String(po._id),
  });

  const populated = await PurchaseOrder.findById(po._id).populate('supplier', 'name code');
  res.status(201).json({ purchaseOrder: populated, items });
}

const VALID_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  Draft: ['Pending Approval', 'Approved', 'Cancelled'],
  'Pending Approval': ['Approved', 'Cancelled'],
  Approved: ['Ordered', 'Cancelled'],
  Ordered: ['Cancelled'],
  'Partially Received': ['Cancelled'],
  Received: [],
  Cancelled: [],
};

export async function updatePurchaseOrderStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status } = req.body as { status: PurchaseOrderStatus };

  const po = await PurchaseOrder.findById(id);
  if (!po) throw new AppError('Purchase order not found', 404);

  if (status === 'Received' || status === 'Partially Received') {
    throw new AppError('Use the delivery receiving workflow to receive stock and update receipt status.', 400);
  }

  const allowed = VALID_TRANSITIONS[po.status as PurchaseOrderStatus] || [];
  if (!allowed.includes(status)) {
    throw new AppError(`Cannot transition Purchase Order from "${po.status}" to "${status}".`, 400);
  }

  po.status = status;
  if (status === 'Approved') {
    po.approvedBy = req.user?.userId as unknown as typeof po.approvedBy;
  }
  await po.save();

  await createEventNotification({
    dedupeKey: `PO_STATUS:${po._id}:${status}`,
    type: 'PO_UPDATE',
    title: `PO ${po.poNumber} ${status}`,
    message: `Purchase Order ${po.poNumber} status updated to ${status}.`,
    severity: 'info',
    entityType: 'PurchaseOrder',
    entityId: String(po._id),
  });

  res.json({ purchaseOrder: po });
}

export async function receivePurchaseOrderDelivery(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = receivePurchaseOrderSchema.parse(req.body);

  const po = await PurchaseOrder.findById(id);
  if (!po) throw new AppError('Purchase order not found', 404);

  if (po.status === 'Cancelled') {
    throw new AppError('Cannot receive goods for a cancelled purchase order.', 400);
  }
  if (po.status === 'Received') {
    throw new AppError('This purchase order has already been fully received.', 409);
  }
  if (!['Approved', 'Ordered', 'Partially Received'].includes(po.status)) {
    throw new AppError('Purchase order must be Approved or Ordered before receiving deliveries.', 400);
  }

  // Idempotency guard: atomically claim receiptId so duplicate submissions cannot double-add stock
  const claimed = await PurchaseOrder.findOneAndUpdate(
    { _id: po._id, processedReceiptIds: { $ne: parsed.receiptId } },
    { $addToSet: { processedReceiptIds: parsed.receiptId } },
    { new: true }
  );

  if (!claimed) {
    throw new AppError(
      `Duplicate delivery receipt detected (${parsed.receiptId}). Stock was already added for this delivery.`,
      409
    );
  }

  const releaseReceipt = () =>
    PurchaseOrder.updateOne({ _id: po._id }, { $pull: { processedReceiptIds: parsed.receiptId } });

  // Merge duplicate product lines in the submission
  const receiveQty = new Map<string, number>();
  for (const r of parsed.items) {
    receiveQty.set(r.productId, (receiveQty.get(r.productId) || 0) + r.quantityReceived);
  }

  const poItems = await PurchaseOrderItem.find({ purchaseOrder: po._id });
  const itemByProduct = new Map(poItems.map((i) => [String(i.product), i]));

  // Validate every line up front so nothing is written for an invalid receipt
  for (const [productId, qty] of receiveQty.entries()) {
    const line = itemByProduct.get(productId);
    if (!line) {
      await releaseReceipt();
      throw new AppError(`Product ${productId} is not part of this purchase order.`, 400);
    }
    const remaining = line.orderedQuantity - line.receivedQuantity;
    if (qty > remaining) {
      await releaseReceipt();
      throw new AppError(
        `Cannot receive ${qty} units of ${line.productName}. Only ${remaining} remaining on order.`,
        400
      );
    }
  }

  const receiptTime = new Date();
  const txRecords: Array<Record<string, unknown>> = [];
  const applied: Array<{ itemId: unknown; productId: string; qty: number }> = [];

  try {
    for (const [productId, qty] of receiveQty.entries()) {
      const line = itemByProduct.get(productId)!;

      // Atomic over-receipt guard: only increments while received + qty <= ordered
      const bumped = await PurchaseOrderItem.findOneAndUpdate(
        {
          _id: line._id,
          $expr: { $lte: [{ $add: ['$receivedQuantity', qty] }, '$orderedQuantity'] },
        },
        { $inc: { receivedQuantity: qty } },
        { new: true }
      );
      if (!bumped) {
        throw new AppError(
          `Receipt for ${line.productName} exceeds the quantity still outstanding (concurrent receipt?).`,
          409
        );
      }

      const updatedProd = await Product.findOneAndUpdate(
        { _id: productId },
        { $inc: { currentStock: qty } },
        { new: true }
      );
      if (!updatedProd) {
        await PurchaseOrderItem.updateOne({ _id: line._id }, { $inc: { receivedQuantity: -qty } });
        throw new AppError(`Product ${line.productName} no longer exists; receipt aborted.`, 404);
      }
      applied.push({ itemId: line._id, productId, qty });

      txRecords.push({
        product: updatedProd._id,
        type: 'PO_RECEIPT',
        quantityChange: qty,
        previousStock: updatedProd.currentStock - qty,
        newStock: updatedProd.currentStock,
        unitCost: line.unitCost,
        referenceType: 'PurchaseOrder',
        referenceId: po.poNumber,
        reason: `PO Receipt (${po.poNumber}) · Batch ${parsed.receiptId}`,
        performedBy: req.user?.userId,
        transactionDate: receiptTime,
      });
    }

    await InventoryTransaction.insertMany(txRecords);
  } catch (err) {
    // Compensate: undo item counters and stock increments, then free the receipt id for a clean retry
    await Promise.allSettled([
      ...applied.flatMap((a) => [
        PurchaseOrderItem.updateOne({ _id: a.itemId }, { $inc: { receivedQuantity: -a.qty } }),
        Product.updateOne({ _id: a.productId }, { $inc: { currentStock: -a.qty } }),
      ]),
      releaseReceipt(),
    ]);
    throw err;
  }

  const updatedItems = await PurchaseOrderItem.find({ purchaseOrder: po._id });
  const allFullyReceived = updatedItems.every((i) => i.receivedQuantity >= i.orderedQuantity);

  po.status = allFullyReceived ? 'Received' : 'Partially Received';
  if (allFullyReceived) {
    po.receivedDate = receiptTime;
  }
  po.receiptLog.push({
    receiptId: parsed.receiptId,
    receivedAt: receiptTime,
    receivedBy: req.user?.userId as unknown as typeof po.createdBy,
    notes: parsed.notes,
    items: Array.from(receiveQty.entries()).map(([productId, qty]) => ({
      product: productId as unknown as typeof po.supplier,
      quantityReceived: qty,
    })),
  });
  await po.save();

  await createEventNotification({
    dedupeKey: `PO_RECEIPT:${po._id}:${parsed.receiptId}`,
    type: 'PO_UPDATE',
    title: `Goods Received for ${po.poNumber}`,
    message: `Delivery ${parsed.receiptId} recorded. PO status is now ${po.status}.`,
    severity: 'info',
    entityType: 'PurchaseOrder',
    entityId: String(po._id),
  });
  await syncSystemNotifications().catch(() => {});

  res.json({ purchaseOrder: po, items: updatedItems });
}
