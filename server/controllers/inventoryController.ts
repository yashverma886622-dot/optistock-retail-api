import { Request, Response } from 'express';
import { Product } from '../models/Product.ts';
import { InventoryTransaction } from '../models/InventoryTransaction.ts';
import { AppError } from '../middleware/errorHandler.ts';
import { stockMovementSchema } from '../validators/schemas.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { syncSystemNotifications } from '../services/notificationService.ts';

export async function getInventoryOverview(req: Request, res: Response): Promise<void> {
  const filterType = String(req.query.filter || 'all');
  const search = String(req.query.search || '').trim();
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const query: Record<string, unknown> = { isActive: true };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
    ];
  }
  if (filterType === 'low_stock') {
    query.currentStock = { $gt: 0 };
    query.$expr = { $lte: ['$currentStock', '$reorderLevel'] };
  } else if (filterType === 'out_of_stock') {
    query.currentStock = { $lte: 0 };
  } else if (filterType === 'expiring') {
    query.expiryDate = { $ne: null, $lte: in30Days };
  } else if (filterType === 'overstock') {
    query.$expr = { $gt: ['$currentStock', '$maxStock'] };
  }

  const [products, allActive] = await Promise.all([
    Product.find(query)
      .populate('category', 'name')
      .populate('supplier', 'name')
      .sort({ currentStock: 1 })
      .lean(),
    Product.find({ isActive: true }).select('currentStock costPrice sellingPrice reorderLevel maxStock expiryDate').lean(),
  ]);

  let totalCostValuation = 0;
  let totalRetailValuation = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let expiringSoonCount = 0;

  for (const p of allActive) {
    totalCostValuation += p.currentStock * p.costPrice;
    totalRetailValuation += p.currentStock * p.sellingPrice;
    if (p.currentStock <= 0) outOfStockCount += 1;
    else if (p.currentStock <= p.reorderLevel) lowStockCount += 1;
    if (p.expiryDate && new Date(p.expiryDate) <= in30Days && p.currentStock > 0) expiringSoonCount += 1;
  }

  res.json({
    summary: {
      totalSkus: allActive.length,
      totalCostValuation: Math.round(totalCostValuation),
      totalRetailValuation: Math.round(totalRetailValuation),
      potentialMargin: Math.round(totalRetailValuation - totalCostValuation),
      lowStockCount,
      outOfStockCount,
      expiringSoonCount,
    },
    products,
  });
}

export async function recordStockMovement(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = stockMovementSchema.parse(req.body);
  const product = await Product.findById(parsed.productId);
  if (!product || !product.isActive) {
    throw new AppError('Product not found or inactive', 404);
  }

  const quantity = parsed.quantity ?? 0;
  let quantityChange = 0;
  if (parsed.type === 'STOCK_IN' || parsed.type === 'RETURN') {
    quantityChange = quantity;
  } else if (parsed.type === 'STOCK_OUT' || parsed.type === 'DAMAGE') {
    quantityChange = -quantity;
  } else if (parsed.type === 'ADJUSTMENT') {
    if (parsed.newAbsoluteStock !== undefined) {
      quantityChange = parsed.newAbsoluteStock - product.currentStock;
    } else {
      quantityChange = quantity;
    }
  }

  if (quantityChange === 0) {
    throw new AppError('Stock adjustment results in zero quantity change.', 400);
  }

  // Atomic conditional update so concurrent stock-outs cannot drop stock below zero
  const condition: Record<string, unknown> = { _id: product._id };
  if (parsed.type === 'ADJUSTMENT' && parsed.newAbsoluteStock !== undefined) {
    // Compare-and-set so a concurrent sale cannot make the absolute count stale
    condition.currentStock = product.currentStock;
  } else if (quantityChange < 0) {
    condition.currentStock = { $gte: Math.abs(quantityChange) };
  }

  const updated = await Product.findOneAndUpdate(
    condition,
    { $inc: { currentStock: quantityChange } },
    { new: true }
  );

  if (!updated) {
    if (parsed.type === 'ADJUSTMENT' && parsed.newAbsoluteStock !== undefined) {
      throw new AppError(`Stock for ${product.name} changed while you were counting. Refresh and retry.`, 409);
    }
    throw new AppError(
      `Insufficient stock for ${product.name}. Available: ${product.currentStock}, requested deduction: ${Math.abs(quantityChange)}.`,
      400
    );
  }

  const previousStock = updated.currentStock - quantityChange;

  const transaction = await InventoryTransaction.create({
    product: updated._id,
    type: parsed.type,
    quantityChange,
    previousStock,
    newStock: updated.currentStock,
    unitCost: updated.costPrice,
    referenceType: 'Manual',
    reason: parsed.reason,
    performedBy: req.user?.userId,
    transactionDate: new Date(),
  });

  await syncSystemNotifications().catch(() => {});

  res.status(201).json({
    product: updated,
    transaction,
  });
}

export async function listInventoryTransactions(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const type = String(req.query.type || '').trim();
  const productId = String(req.query.productId || '').trim();

  const filter: Record<string, unknown> = {};
  if (type && type !== 'all') filter.type = type;
  if (productId) filter.product = productId;

  const [transactions, total] = await Promise.all([
    InventoryTransaction.find(filter)
      .populate('product', 'name sku unit')
      .populate('performedBy', 'name role')
      .sort({ transactionDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    InventoryTransaction.countDocuments(filter),
  ]);

  res.json({
    transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}
