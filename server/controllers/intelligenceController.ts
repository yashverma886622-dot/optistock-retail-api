import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Product } from '../models/Product.ts';
import { SaleItem } from '../models/SaleItem.ts';
import { PurchaseOrder } from '../models/PurchaseOrder.ts';
import { PurchaseOrderItem } from '../models/PurchaseOrderItem.ts';
import { DemandForecast, ForecastMethod } from '../models/DemandForecast.ts';
import { ReorderRecommendation } from '../models/ReorderRecommendation.ts';
import { SeasonalEvent } from '../models/SeasonalEvent.ts';
import { AppError } from '../middleware/errorHandler.ts';
import { generateDemandForecast, ForecastMethodKey, DailyObservation } from '../services/forecastingService.ts';
import { calculateInventoryOptimization } from '../services/optimizationService.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { createEventNotification } from '../services/notificationService.ts';

async function getSeasonalMultiplierMapForCategory(categoryId: string, horizonDays: number) {
  const now = new Date();
  const futureEnd = new Date(now.getTime() + (horizonDays + 2) * 24 * 60 * 60 * 1000);
  const events = await SeasonalEvent.find({
    isActive: true,
    endDate: { $gte: now },
    startDate: { $lte: futureEnd },
    $or: [{ affectedCategories: { $size: 0 } }, { affectedCategories: categoryId }],
  }).lean();

  const map: Record<string, number> = {};
  for (const ev of events) {
    const start = new Date(ev.startDate);
    const end = new Date(ev.endDate);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      map[iso] = Math.max(map[iso] || 1, ev.demandMultiplier);
    }
  }
  return map;
}

export async function getProductForecast(req: Request, res: Response): Promise<void> {
  const productId = String(req.query.productId || '');
  const categoryId = String(req.query.categoryId || '');
  const horizonRaw = Number(req.query.horizon || 30);
  const horizon = ([7, 14, 30, 60, 90].includes(horizonRaw) ? horizonRaw : 30) as 7 | 14 | 30 | 60 | 90;
  const methodRaw = String(req.query.method || 'TREND_SEASONAL');
  const method: ForecastMethodKey = ['SMA', 'WMA', 'EXPONENTIAL_SMOOTHING', 'TREND_SEASONAL'].includes(methodRaw)
    ? (methodRaw as ForecastMethodKey)
    : 'TREND_SEASONAL';

  const lookbackStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  if (productId) {
    const product = await Product.findById(productId).populate('category', 'name').populate('supplier', 'name').lean();
    if (!product) {
      throw new AppError('Product not found', 404);
    }

    const salesAgg = await SaleItem.aggregate([
      { $match: { product: product._id, saleDate: { $gte: lookbackStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
          quantity: { $sum: '$quantity' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const observations: DailyObservation[] = salesAgg.map((s) => ({ date: s._id, quantity: s.quantity }));
    const seasonalMultipliers = await getSeasonalMultiplierMapForCategory(String(product.category?._id || product.category), horizon);

    const methods: ForecastMethodKey[] = ['SMA', 'WMA', 'EXPONENTIAL_SMOOTHING', 'TREND_SEASONAL'];
    const comparisons = methods.map((m) =>
      generateDemandForecast({
        observations,
        horizonDays: horizon,
        method: m,
        lookbackDays: 90,
        seasonalMultipliers,
      })
    );

    const selected = comparisons.find((c) => c.method === method) || comparisons[0];

    // Persist snapshot in MongoDB DemandForecast collection
    await DemandForecast.findOneAndUpdate(
      { product: product._id, horizonDays: horizon, method: selected.method as ForecastMethod },
      {
        product: product._id,
        horizonDays: horizon,
        method: selected.method as ForecastMethod,
        historicalDaysUsed: selected.historicalDaysUsed,
        isPreliminary: selected.isPreliminary,
        forecastTotal: selected.forecastTotal,
        avgDailyForecast: selected.avgDailyForecast,
        confidenceLow: selected.confidenceLow,
        confidenceHigh: selected.confidenceHigh,
        metrics: selected.metrics,
        dailySeries: selected.dailySeries.map((d) => ({
          date: d.date,
          forecast: d.forecast,
          lower: d.lower,
          upper: d.upper,
        })),
        calculatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({
      scope: 'product',
      product,
      forecast: selected,
      modelComparison: comparisons.map((c) => ({
        method: c.method,
        forecastTotal: c.forecastTotal,
        avgDailyForecast: c.avgDailyForecast,
        metrics: c.metrics,
        isPreliminary: c.isPreliminary,
      })),
    });
    return;
  }

  // Category-wise or Store-wide aggregate forecast
  const productFilter: Record<string, unknown> = { isActive: true };
  if (categoryId && categoryId !== 'all') {
    productFilter.category = categoryId;
  }
  const matchingProducts = await Product.find(productFilter).select('_id').lean();
  const productIds = matchingProducts.map((p) => p._id);

  const salesAgg = await SaleItem.aggregate([
    { $match: { product: { $in: productIds }, saleDate: { $gte: lookbackStart } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        quantity: { $sum: '$quantity' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const observations: DailyObservation[] = salesAgg.map((s) => ({ date: s._id, quantity: s.quantity }));
  const seasonalMultipliers =
    categoryId && categoryId !== 'all' ? await getSeasonalMultiplierMapForCategory(categoryId, horizon) : {};

  const methods: ForecastMethodKey[] = ['SMA', 'WMA', 'EXPONENTIAL_SMOOTHING', 'TREND_SEASONAL'];
  const comparisons = methods.map((m) =>
    generateDemandForecast({
      observations,
      horizonDays: horizon,
      method: m,
      lookbackDays: 90,
      seasonalMultipliers,
    })
  );

  const selected = comparisons.find((c) => c.method === method) || comparisons[0];

  res.json({
    scope: categoryId && categoryId !== 'all' ? 'category' : 'store',
    productCount: productIds.length,
    forecast: selected,
    modelComparison: comparisons.map((c) => ({
      method: c.method,
      forecastTotal: c.forecastTotal,
      avgDailyForecast: c.avgDailyForecast,
      metrics: c.metrics,
      isPreliminary: c.isPreliminary,
    })),
  });
}

async function computeProductDemandStats(productIds: string[]) {
  const lookbackStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const objectIds = productIds.map((id) => new mongoose.Types.ObjectId(id));
  const raw = await SaleItem.aggregate([
    { $match: { product: { $in: objectIds }, saleDate: { $gte: lookbackStart } } },
    {
      $group: {
        _id: {
          product: '$product',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        },
        qty: { $sum: '$quantity' },
      },
    },
  ]);

  const byProduct = new Map<string, DailyObservation[]>();
  for (const r of raw) {
    const pid = String(r._id.product);
    const list = byProduct.get(pid) || [];
    list.push({ date: r._id.day, quantity: r.qty });
    byProduct.set(pid, list);
  }
  return byProduct;
}

export async function getOptimizationAnalysis(req: Request, res: Response): Promise<void> {
  const productId = String(req.query.productId || '');
  const overrideLeadTime = req.query.leadTimeDays ? Number(req.query.leadTimeDays) : undefined;
  const overrideServiceLevel = req.query.serviceLevel ? Number(req.query.serviceLevel) : undefined;
  const overrideOrderingCost = req.query.orderingCost ? Number(req.query.orderingCost) : undefined;
  const overrideHoldingRate = req.query.holdingCostRate ? Number(req.query.holdingCostRate) : undefined;
  const overrideMoq = req.query.minOrderQuantity ? Number(req.query.minOrderQuantity) : undefined;

  const filter: Record<string, unknown> = { isActive: true };
  if (productId) filter._id = productId;

  const products = await Product.find(filter)
    .populate('category', 'name')
    .populate('supplier', 'name averageLeadTimeDays leadTimeStdDevDays')
    .sort({ currentStock: 1 })
    .lean();

  if (productId && products.length === 0) {
    throw new AppError('Product not found', 404);
  }

  const demandMap = await computeProductDemandStats(products.map((p) => String(p._id)));

  // Pending PO quantities
  const openPOs = await PurchaseOrder.find({
    status: { $in: ['Approved', 'Ordered', 'Partially Received'] },
  })
    .select('_id')
    .lean();
  const openPOIds = openPOs.map((po) => po._id);
  const openItems = await PurchaseOrderItem.find({ purchaseOrder: { $in: openPOIds } }).lean();
  const incomingByProduct = new Map<string, number>();
  for (const item of openItems) {
    const remaining = Math.max(0, item.orderedQuantity - item.receivedQuantity);
    const pid = String(item.product);
    incomingByProduct.set(pid, (incomingByProduct.get(pid) || 0) + remaining);
  }

  const results = products.map((p) => {
    const pid = String(p._id);
    const obs = demandMap.get(pid) || [];
    const forecast = generateDemandForecast({
      observations: obs,
      horizonDays: 30,
      method: 'TREND_SEASONAL',
      lookbackDays: 90,
    });

    const sup = p.supplier as { averageLeadTimeDays?: number; leadTimeStdDevDays?: number } | undefined;
    const optimization = calculateInventoryOptimization({
      currentStock: p.currentStock,
      avgDailyDemand: forecast.avgDailyHistorical,
      demandStdDev: forecast.demandStdDev,
      leadTimeDays: overrideLeadTime ?? p.leadTimeDays ?? sup?.averageLeadTimeDays ?? 5,
      leadTimeStdDevDays: sup?.leadTimeStdDevDays ?? 1,
      serviceLevelPct: overrideServiceLevel ?? p.serviceLevel ?? 95,
      unitCost: p.costPrice,
      orderingCost: overrideOrderingCost ?? p.orderingCost ?? 500,
      holdingCostRate: overrideHoldingRate ?? p.holdingCostRate ?? 0.2,
      minOrderQuantity: overrideMoq ?? p.minOrderQuantity ?? 10,
      maxStock: p.maxStock,
      pendingIncomingQty: incomingByProduct.get(pid) || 0,
    });

    return {
      product: {
        _id: p._id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        supplier: p.supplier,
        currentStock: p.currentStock,
        reorderLevel: p.reorderLevel,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        leadTimeDays: p.leadTimeDays,
        serviceLevel: p.serviceLevel,
        orderingCost: p.orderingCost,
        holdingCostRate: p.holdingCostRate,
        minOrderQuantity: p.minOrderQuantity,
      },
      pendingIncomingQty: incomingByProduct.get(pid) || 0,
      demandStats: {
        avgDailyDemand: forecast.avgDailyHistorical,
        demandStdDev: forecast.demandStdDev,
        forecasted30d: forecast.forecastTotal,
        isPreliminary: forecast.isPreliminary,
      },
      optimization,
    };
  });

  res.json({ items: results });
}

export async function updateProductOptimizationParams(req: Request, res: Response): Promise<void> {
  const { productId } = req.params;
  const { leadTimeDays, serviceLevel, orderingCost, holdingCostRate, minOrderQuantity, reorderLevel } = req.body;

  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  if (leadTimeDays !== undefined) product.leadTimeDays = Math.max(1, Number(leadTimeDays));
  if (serviceLevel !== undefined) product.serviceLevel = Math.min(99.9, Math.max(80, Number(serviceLevel)));
  if (orderingCost !== undefined) product.orderingCost = Math.max(1, Number(orderingCost));
  if (holdingCostRate !== undefined) product.holdingCostRate = Math.min(1, Math.max(0.01, Number(holdingCostRate)));
  if (minOrderQuantity !== undefined) product.minOrderQuantity = Math.max(1, Math.round(Number(minOrderQuantity)));
  if (reorderLevel !== undefined) product.reorderLevel = Math.max(0, Math.round(Number(reorderLevel)));

  await product.save();
  res.json({ product });
}

export async function generateRecommendations(_req: Request, res: Response): Promise<void> {
  const products = await Product.find({ isActive: true })
    .populate('supplier', 'name averageLeadTimeDays leadTimeStdDevDays')
    .lean();

  const demandMap = await computeProductDemandStats(products.map((p) => String(p._id)));

  const openPOs = await PurchaseOrder.find({
    status: { $in: ['Approved', 'Ordered', 'Partially Received'] },
  })
    .select('_id')
    .lean();
  const openItems = await PurchaseOrderItem.find({
    purchaseOrder: { $in: openPOs.map((po) => po._id) },
  }).lean();
  const incomingByProduct = new Map<string, number>();
  for (const item of openItems) {
    const pid = String(item.product);
    incomingByProduct.set(pid, (incomingByProduct.get(pid) || 0) + Math.max(0, item.orderedQuantity - item.receivedQuantity));
  }

  // Clear stale pending recommendations so fresh recommendations reflect live MongoDB state
  await ReorderRecommendation.deleteMany({ status: 'Pending' });

  const toInsert = [];
  for (const p of products) {
    const pid = String(p._id);
    const obs = demandMap.get(pid) || [];
    const forecast = generateDemandForecast({
      observations: obs,
      horizonDays: 30,
      method: 'TREND_SEASONAL',
      lookbackDays: 90,
    });

    const sup = p.supplier as { _id?: unknown; averageLeadTimeDays?: number; leadTimeStdDevDays?: number } | undefined;
    const opt = calculateInventoryOptimization({
      currentStock: p.currentStock,
      avgDailyDemand: forecast.avgDailyHistorical,
      demandStdDev: forecast.demandStdDev,
      leadTimeDays: p.leadTimeDays ?? sup?.averageLeadTimeDays ?? 5,
      leadTimeStdDevDays: sup?.leadTimeStdDevDays ?? 1,
      serviceLevelPct: p.serviceLevel ?? 95,
      unitCost: p.costPrice,
      orderingCost: p.orderingCost ?? 500,
      holdingCostRate: p.holdingCostRate ?? 0.2,
      minOrderQuantity: p.minOrderQuantity ?? 10,
      maxStock: p.maxStock,
      pendingIncomingQty: incomingByProduct.get(pid) || 0,
    });

    if (opt.needsReorder && opt.recommendedOrderQty > 0) {
      toInsert.push({
        product: p._id,
        supplier: sup?._id || p.supplier,
        currentStock: p.currentStock,
        avgDailyDemand: forecast.avgDailyHistorical,
        demandStdDev: forecast.demandStdDev,
        forecastedDemand30d: forecast.forecastTotal,
        safetyStock: opt.safetyStock,
        reorderPoint: opt.reorderPoint,
        eoq: opt.eoq,
        recommendedOrderQty: opt.recommendedOrderQty,
        estimatedOrderCost: opt.estimatedOrderCost,
        leadTimeDays: p.leadTimeDays,
        serviceLevel: opt.serviceLevelPct,
        stockoutRiskPct: opt.stockoutRiskPct,
        urgency: opt.urgency,
        status: 'Pending',
        formulaBreakdown: opt.formulaBreakdown,
        generatedAt: new Date(),
      });
    }
  }

  const created = toInsert.length > 0 ? await ReorderRecommendation.insertMany(toInsert) : [];

  if (created.length > 0) {
    const criticalCount = created.filter((c) => c.urgency === 'Critical').length;
    await createEventNotification({
      dedupeKey: `REORDER_GEN:${new Date().toISOString().slice(0, 10)}:${created.length}`,
      type: 'REORDER_ALERT',
      title: `${created.length} Reorder Recommendations Generated`,
      message: `${criticalCount} critical stockout-risk SKUs require immediate purchase order review.`,
      severity: criticalCount > 0 ? 'critical' : 'warning',
      entityType: 'Recommendation',
    });
  }

  const populated = await ReorderRecommendation.find()
    .populate('product', 'name sku unit costPrice currentStock reorderLevel')
    .populate('supplier', 'name code averageLeadTimeDays')
    .populate('purchaseOrder', 'poNumber status')
    .sort({ generatedAt: -1 })
    .lean();

  res.json({ generatedCount: created.length, recommendations: populated });
}

export async function listRecommendations(req: Request, res: Response): Promise<void> {
  const status = String(req.query.status || 'all');
  const urgency = String(req.query.urgency || 'all');

  const filter: Record<string, unknown> = {};
  if (status !== 'all') filter.status = status;
  if (urgency !== 'all') filter.urgency = urgency;

  const recommendations = await ReorderRecommendation.find(filter)
    .populate('product', 'name sku unit costPrice sellingPrice currentStock reorderLevel')
    .populate('supplier', 'name code averageLeadTimeDays')
    .populate('purchaseOrder', 'poNumber status')
    .sort({ status: 1, stockoutRiskPct: -1, generatedAt: -1 })
    .lean();

  res.json({ recommendations });
}

export async function actionRecommendation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { action } = req.body as { action: 'approve' | 'reject' | 'convert' };

  const rec = await ReorderRecommendation.findById(id).populate('product').populate('supplier');
  if (!rec) {
    throw new AppError('Recommendation not found', 404);
  }

  if (action === 'approve') {
    rec.status = 'Approved';
    rec.actionedBy = req.user?.userId as unknown as typeof rec.actionedBy;
    rec.actionedAt = new Date();
    await rec.save();
    res.json({ recommendation: rec });
    return;
  }

  if (action === 'reject') {
    rec.status = 'Rejected';
    rec.actionedBy = req.user?.userId as unknown as typeof rec.actionedBy;
    rec.actionedAt = new Date();
    await rec.save();
    res.json({ recommendation: rec });
    return;
  }

  if (action === 'convert') {
    if (rec.status === 'Converted' && rec.purchaseOrder) {
      throw new AppError('This recommendation has already been converted into a Purchase Order.', 409);
    }

    const product = await Product.findById(rec.product);
    if (!product) {
      throw new AppError('Associated product not found', 404);
    }

    const qty = Math.max(1, rec.recommendedOrderQty);
    const subtotal = Number((qty * product.costPrice).toFixed(2));
    const gstAmount = Number(((subtotal * (product.gstRate || 12)) / 100).toFixed(2));
    const totalAmount = Number((subtotal + gstAmount).toFixed(2));

    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const expectedDeliveryDate = new Date(Date.now() + (rec.leadTimeDays || 5) * 24 * 60 * 60 * 1000);

    const po = await PurchaseOrder.create({
      poNumber,
      supplier: rec.supplier,
      status: 'Approved',
      orderDate: new Date(),
      expectedDeliveryDate,
      subtotal,
      gstAmount,
      totalAmount,
      notes: `Auto-generated from Reorder Recommendation (${rec.urgency} urgency)`,
      createdBy: req.user?.userId,
      approvedBy: req.user?.userId,
    });

    await PurchaseOrderItem.create({
      purchaseOrder: po._id,
      product: product._id,
      sku: product.sku,
      productName: product.name,
      orderedQuantity: qty,
      receivedQuantity: 0,
      unitCost: product.costPrice,
      gstRate: product.gstRate || 12,
      lineTotal: totalAmount,
    });

    rec.status = 'Converted';
    rec.purchaseOrder = po._id;
    rec.actionedBy = req.user?.userId as unknown as typeof rec.actionedBy;
    rec.actionedAt = new Date();
    await rec.save();

    await createEventNotification({
      dedupeKey: `PO_CREATED:${po._id}`,
      type: 'PO_UPDATE',
      title: `Purchase Order ${po.poNumber} Created`,
      message: `Converted reorder recommendation for ${product.name} (${qty} ${product.unit}) into ${po.poNumber}.`,
      severity: 'info',
      entityType: 'PurchaseOrder',
      entityId: String(po._id),
    });

    res.json({ recommendation: rec, purchaseOrder: po });
    return;
  }

  throw new AppError('Invalid action. Expected approve, reject, or convert.', 400);
}
