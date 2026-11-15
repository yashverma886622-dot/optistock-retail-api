import { Request, Response } from 'express';
import { Supplier } from '../models/Supplier.ts';
import { Product } from '../models/Product.ts';
import { PurchaseOrder } from '../models/PurchaseOrder.ts';
import { AppError } from '../middleware/errorHandler.ts';
import { supplierSchema } from '../validators/schemas.ts';

export async function listSuppliers(req: Request, res: Response): Promise<void> {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || 'all');

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { contactPerson: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } },
      { gstin: { $regex: search, $options: 'i' } },
    ];
  }
  if (status !== 'all') {
    filter.status = status;
  }

  const [suppliers, productCounts, poStats] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).lean(),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$supplier', count: { $sum: 1 } } },
    ]),
    PurchaseOrder.aggregate([
      {
        $group: {
          _id: '$supplier',
          totalOrders: { $sum: 1 },
          totalSpend: { $sum: '$totalAmount' },
          receivedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Received'] }, 1, 0] },
          },
          onTimeCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'Received'] },
                    { $lte: ['$receivedDate', '$expectedDeliveryDate'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const prodMap = new Map(productCounts.map((p) => [String(p._id), p.count]));
  const poMap = new Map(poStats.map((p) => [String(p._id), p]));

  const enriched = suppliers.map((s) => {
    const sid = String(s._id);
    const po = poMap.get(sid);
    const onTimeRate =
      po && po.receivedCount > 0 ? Math.round((po.onTimeCount / po.receivedCount) * 100) : null;
    return {
      ...s,
      productCount: prodMap.get(sid) || 0,
      performance: {
        totalOrders: po?.totalOrders || 0,
        totalSpend: Math.round(po?.totalSpend || 0),
        receivedCount: po?.receivedCount || 0,
        onTimeRatePct: onTimeRate,
      },
    };
  });

  res.json({ suppliers: enriched });
}

export async function createSupplier(req: Request, res: Response): Promise<void> {
  const parsed = supplierSchema.parse(req.body);
  const existingCode = await Supplier.findOne({ code: parsed.code.toUpperCase() });
  if (existingCode) {
    throw new AppError(`Supplier code "${parsed.code.toUpperCase()}" already exists.`, 409);
  }
  const supplier = await Supplier.create({
    ...parsed,
    code: parsed.code.toUpperCase(),
    gstin: parsed.gstin ? parsed.gstin.toUpperCase() : undefined,
  });
  res.status(201).json({ supplier });
}

export async function updateSupplier(req: Request, res: Response): Promise<void> {
  const parsed = supplierSchema.partial().parse(req.body);
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw new AppError('Supplier not found', 404);

  if (parsed.code && parsed.code.toUpperCase() !== supplier.code) {
    const dup = await Supplier.findOne({ code: parsed.code.toUpperCase(), _id: { $ne: supplier._id } });
    if (dup) throw new AppError(`Supplier code "${parsed.code.toUpperCase()}" already exists.`, 409);
    supplier.code = parsed.code.toUpperCase();
  }

  Object.assign(supplier, {
    ...parsed,
    code: supplier.code,
    gstin: parsed.gstin !== undefined ? (parsed.gstin ? parsed.gstin.toUpperCase() : undefined) : supplier.gstin,
  });
  await supplier.save();
  res.json({ supplier });
}

export async function deleteSupplier(req: Request, res: Response): Promise<void> {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw new AppError('Supplier not found', 404);

  const [linkedProducts, linkedPOs] = await Promise.all([
    Product.exists({ supplier: supplier._id, isActive: true }),
    PurchaseOrder.exists({ supplier: supplier._id }),
  ]);

  if (linkedProducts || linkedPOs) {
    supplier.status = 'Inactive';
    await supplier.save();
    res.json({
      message: 'Supplier has active products or purchase orders and was marked Inactive instead of deleted.',
      archived: true,
    });
    return;
  }

  await Supplier.deleteOne({ _id: supplier._id });
  res.json({ message: 'Supplier deleted successfully.', archived: false });
}
