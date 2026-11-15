import { Request, Response } from 'express';
import { Product } from '../models/Product.ts';
import { Sale } from '../models/Sale.ts';
import { SaleItem } from '../models/SaleItem.ts';
import { InventoryTransaction } from '../models/InventoryTransaction.ts';
import { AppError } from '../middleware/errorHandler.ts';
import { createSaleSchema } from '../validators/schemas.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { syncSystemNotifications } from '../services/notificationService.ts';

function generateInvoiceNumber(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${ymd}-${rand}`;
}

export async function createSale(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = createSaleSchema.parse(req.body);

  // Idempotency: a repeated submission (double-click, retry after timeout) returns the original invoice
  if (parsed.clientRequestId) {
    const prior = await Sale.findOne({ clientRequestId: parsed.clientRequestId });
    if (prior) {
      const priorItems = await SaleItem.find({ sale: prior._id });
      res.status(200).json({ sale: prior, items: priorItems, duplicate: true });
      return;
    }
  }

  // Consolidate duplicate product IDs in cart
  const qtyByProduct = new Map<string, { quantity: number; discountPercent: number }>();
  for (const item of parsed.items) {
    const existing = qtyByProduct.get(item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      qtyByProduct.set(item.productId, {
        quantity: item.quantity,
        discountPercent: item.discountPercent ?? 0,
      });
    }
  }

  const productIds = Array.from(qtyByProduct.keys());
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });

  if (products.length !== productIds.length) {
    throw new AppError('One or more products in the cart were not found or are inactive.', 404);
  }

  const productMap = new Map(products.map((p) => [String(p._id), p]));

  // Pre-validate stock availability before deducting
  for (const [productId, line] of qtyByProduct.entries()) {
    const prod = productMap.get(productId)!;
    if (prod.currentStock < line.quantity) {
      throw new AppError(
        `Insufficient stock for "${prod.name}" (${prod.sku}). Available: ${prod.currentStock}, requested: ${line.quantity}.`,
        400
      );
    }
  }

  // Compute totals (prices in INR; GST on discounted taxable value; cart discount reduces GST proportionally)
  let subtotal = 0;
  let lineGstTotal = 0;
  const lineItemsToInsert: Array<{
    product: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    discountPercent: number;
    gstRate: number;
    gstAmount: number;
    lineTotal: number;
  }> = [];

  for (const [productId, line] of qtyByProduct.entries()) {
    const prod = productMap.get(productId)!;
    const gross = prod.sellingPrice * line.quantity;
    const itemDiscount = (gross * line.discountPercent) / 100;
    const taxable = Math.max(0, gross - itemDiscount);
    const itemGst = Number(((taxable * prod.gstRate) / 100).toFixed(2));
    const lineTotal = Number((taxable + itemGst).toFixed(2));

    subtotal += taxable;
    lineGstTotal += itemGst;

    lineItemsToInsert.push({
      product: productId,
      sku: prod.sku,
      productName: prod.name,
      quantity: line.quantity,
      unitPrice: prod.sellingPrice,
      costPrice: prod.costPrice,
      discountPercent: line.discountPercent,
      gstRate: prod.gstRate,
      gstAmount: itemGst,
      lineTotal,
    });
  }

  const cartDiscount = Math.min(subtotal, parsed.discountAmount || 0);
  const discountRatio = subtotal > 0 ? cartDiscount / subtotal : 0;
  const gstAmount = Number((lineGstTotal * (1 - discountRatio)).toFixed(2));
  const finalTotal = Math.max(0, Number((subtotal - cartDiscount + gstAmount).toFixed(2)));
  const saleDate = new Date();

  // Atomic stock deductions; any later failure triggers a compensating rollback of everything written
  const deducted: Array<{ productId: string; quantity: number; previousStock: number; newStock: number }> = [];
  let createdSaleId: unknown = null;

  const rollback = async () => {
    await Promise.allSettled([
      ...deducted.map((d) => Product.updateOne({ _id: d.productId }, { $inc: { currentStock: d.quantity } })),
      ...(createdSaleId
        ? [SaleItem.deleteMany({ sale: createdSaleId }), Sale.deleteOne({ _id: createdSaleId })]
        : []),
    ]);
  };

  try {
    for (const [productId, line] of qtyByProduct.entries()) {
      const updated = await Product.findOneAndUpdate(
        { _id: productId, currentStock: { $gte: line.quantity } },
        { $inc: { currentStock: -line.quantity } },
        { new: true }
      );

      if (!updated) {
        const prod = productMap.get(productId)!;
        throw new AppError(
          `Stock for "${prod.name}" changed while processing the sale. Please refresh and retry.`,
          409
        );
      }

      deducted.push({
        productId,
        quantity: line.quantity,
        previousStock: updated.currentStock + line.quantity,
        newStock: updated.currentStock,
      });
    }

    // Create the invoice; retry on the (unlikely) invoice-number collision
    let sale = null;
    for (let attempt = 0; attempt < 5 && !sale; attempt++) {
      try {
        sale = await Sale.create({
          invoiceNumber: generateInvoiceNumber(),
          clientRequestId: parsed.clientRequestId,
          customerName: parsed.customerName,
          customerPhone: parsed.customerPhone,
          subtotal: Number(subtotal.toFixed(2)),
          discountAmount: Number(cartDiscount.toFixed(2)),
          gstAmount,
          totalAmount: finalTotal,
          paymentMethod: parsed.paymentMethod,
          paymentStatus: 'Paid',
          cashier: req.user?.userId,
          notes: parsed.notes,
          saleDate,
        });
      } catch (err) {
        const dup = (err as { code?: number; keyPattern?: Record<string, unknown> });
        if (dup.code === 11000 && dup.keyPattern && 'clientRequestId' in dup.keyPattern) {
          // A concurrent identical request won the race: undo our deduction and return its result
          await rollback();
          const winner = await Sale.findOne({ clientRequestId: parsed.clientRequestId });
          if (winner) {
            const winnerItems = await SaleItem.find({ sale: winner._id });
            res.status(200).json({ sale: winner, items: winnerItems, duplicate: true });
            return;
          }
        }
        if (dup.code === 11000 && attempt < 4) continue;
        throw err;
      }
    }
    if (!sale) throw new AppError('Could not allocate an invoice number. Please retry.', 500);
    createdSaleId = sale._id;

    const saleItems = await SaleItem.insertMany(
      lineItemsToInsert.map((item) => ({ ...item, sale: sale._id, saleDate }))
    );

    await InventoryTransaction.insertMany(
      deducted.map((d) => {
        const prod = productMap.get(d.productId)!;
        return {
          product: d.productId,
          type: 'SALE',
          quantityChange: -d.quantity,
          previousStock: d.previousStock,
          newStock: d.newStock,
          unitCost: prod.costPrice,
          referenceType: 'Sale',
          referenceId: sale.invoiceNumber,
          reason: `POS Sale ${sale.invoiceNumber}`,
          performedBy: req.user?.userId,
          transactionDate: saleDate,
        };
      })
    );

    await syncSystemNotifications().catch(() => {});

    res.status(201).json({ sale, items: saleItems });
  } catch (err) {
    if (!res.headersSent) await rollback();
    throw err;
  }
}

export async function listSales(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const search = String(req.query.search || '').trim();
  const paymentMethod = String(req.query.paymentMethod || '').trim();

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { invoiceNumber: { $regex: search, $options: 'i' } },
      { customerName: { $regex: search, $options: 'i' } },
      { customerPhone: { $regex: search, $options: 'i' } },
    ];
  }
  if (paymentMethod && paymentMethod !== 'all') {
    filter.paymentMethod = paymentMethod;
  }

  const [sales, total] = await Promise.all([
    Sale.find(filter)
      .populate('cashier', 'name role')
      .sort({ saleDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Sale.countDocuments(filter),
  ]);

  res.json({
    sales,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

export async function getSaleById(req: Request, res: Response): Promise<void> {
  const sale = await Sale.findById(req.params.id).populate('cashier', 'name email role').lean();
  if (!sale) {
    throw new AppError('Sale invoice not found', 404);
  }
  const items = await SaleItem.find({ sale: sale._id }).lean();
  res.json({ sale, items });
}
