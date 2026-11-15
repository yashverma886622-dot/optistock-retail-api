import { Request, Response } from 'express';
import { Product } from '../models/Product.ts';
import { Category } from '../models/Category.ts';
import { SaleItem } from '../models/SaleItem.ts';
import { PurchaseOrderItem } from '../models/PurchaseOrderItem.ts';
import { InventoryTransaction } from '../models/InventoryTransaction.ts';
import { AppError } from '../middleware/errorHandler.ts';
import { categorySchema, productSchema } from '../validators/schemas.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';

export async function listCategories(_req: Request, res: Response): Promise<void> {
  const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
  res.json({ categories });
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const parsed = categorySchema.parse(req.body);
  const slug = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const category = await Category.create({
    name: parsed.name,
    slug,
    description: parsed.description,
    targetTurnoverDays: parsed.targetTurnoverDays ?? 30,
  });
  res.status(201).json({ category });
}

export async function listProducts(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();
  const stockStatus = String(req.query.stockStatus || '').trim();
  const sortBy = String(req.query.sortBy || 'createdAt');
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  const filter: Record<string, unknown> = { isActive: true };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { brand: { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
    ];
  }
  if (category && category !== 'all') {
    filter.category = category;
  }
  if (stockStatus === 'out_of_stock') {
    filter.currentStock = { $lte: 0 };
  } else if (stockStatus === 'low_stock') {
    filter.currentStock = { $gt: 0 };
    filter.$expr = { $lte: ['$currentStock', '$reorderLevel'] };
  } else if (stockStatus === 'overstock') {
    filter.$expr = { $gt: ['$currentStock', '$maxStock'] };
  } else if (stockStatus === 'healthy') {
    filter.$expr = {
      $and: [{ $gt: ['$currentStock', '$reorderLevel'] }, { $lte: ['$currentStock', '$maxStock'] }],
    };
  }

  const allowedSorts = ['name', 'sku', 'sellingPrice', 'costPrice', 'currentStock', 'reorderLevel', 'createdAt'];
  const sortField = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .populate('supplier', 'name code averageLeadTimeDays')
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  res.json({
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

export async function getProductById(req: Request, res: Response): Promise<void> {
  const product = await Product.findById(req.params.id)
    .populate('category', 'name slug')
    .populate('supplier', 'name code phone email averageLeadTimeDays')
    .lean();
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const [recentTransactions, recentSales] = await Promise.all([
    InventoryTransaction.find({ product: product._id }).sort({ transactionDate: -1 }).limit(15).lean(),
    SaleItem.find({ product: product._id }).sort({ saleDate: -1 }).limit(15).lean(),
  ]);

  res.json({ product, recentTransactions, recentSales });
}

export async function createProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = productSchema.parse(req.body);
  const existingSku = await Product.findOne({ sku: parsed.sku.toUpperCase() });
  if (existingSku) {
    throw new AppError(`SKU "${parsed.sku.toUpperCase()}" already exists. Duplicate SKUs are not permitted.`, 409);
  }

  const product = await Product.create({
    ...parsed,
    sku: parsed.sku.toUpperCase(),
    expiryDate: parsed.expiryDate ? new Date(parsed.expiryDate) : null,
  });

  if (product.currentStock > 0) {
    await InventoryTransaction.create({
      product: product._id,
      type: 'STOCK_IN',
      quantityChange: product.currentStock,
      previousStock: 0,
      newStock: product.currentStock,
      unitCost: product.costPrice,
      referenceType: 'Manual',
      reason: 'Opening stock on product creation',
      performedBy: req.user?.userId,
      transactionDate: new Date(),
    });
  }

  const populated = await Product.findById(product._id)
    .populate('category', 'name slug')
    .populate('supplier', 'name code');

  res.status(201).json({ product: populated });
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const parsed = productSchema.partial().parse(req.body);
  const product = await Product.findById(req.params.id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  if (parsed.sku && parsed.sku.toUpperCase() !== product.sku) {
    const dup = await Product.findOne({ sku: parsed.sku.toUpperCase(), _id: { $ne: product._id } });
    if (dup) {
      throw new AppError(`SKU "${parsed.sku.toUpperCase()}" is already assigned to another product.`, 409);
    }
    product.sku = parsed.sku.toUpperCase();
  }

  const fields = [
    'name', 'barcode', 'description', 'category', 'brand', 'unit',
    'costPrice', 'sellingPrice', 'gstRate', 'minStock', 'maxStock',
    'reorderLevel', 'supplier', 'leadTimeDays', 'orderingCost',
    'holdingCostRate', 'serviceLevel', 'minOrderQuantity',
  ] as const;

  for (const field of fields) {
    if (parsed[field] !== undefined) {
      (product as unknown as Record<string, unknown>)[field] = parsed[field];
    }
  }

  if (parsed.expiryDate !== undefined) {
    product.expiryDate = parsed.expiryDate ? new Date(parsed.expiryDate) : null;
  }

  await product.save();
  const populated = await Product.findById(product._id)
    .populate('category', 'name slug')
    .populate('supplier', 'name code');
  res.json({ product: populated });
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const product = await Product.findById(req.params.id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const [hasSales, hasPOs] = await Promise.all([
    SaleItem.exists({ product: product._id }),
    PurchaseOrderItem.exists({ product: product._id }),
  ]);

  if (hasSales || hasPOs) {
    // Safeguard: archive instead of hard delete to preserve accounting & historical sales integrity
    product.isActive = false;
    await product.save();
    res.json({
      message: 'Product has historical sales or purchase orders and was safely archived instead of permanently deleted.',
      archived: true,
    });
    return;
  }

  await Product.deleteOne({ _id: product._id });
  res.json({ message: 'Product deleted successfully.', archived: false });
}
