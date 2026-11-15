import { Request, Response } from 'express';
import { SeasonalEvent } from '../models/SeasonalEvent.ts';
import { SaleItem } from '../models/SaleItem.ts';
import { Product } from '../models/Product.ts';
import { Category } from '../models/Category.ts';
import { AppError } from '../middleware/errorHandler.ts';
import { seasonalEventSchema } from '../validators/schemas.ts';

export async function listSeasonalAnalysis(_req: Request, res: Response): Promise<void> {
  const [events, categories, products] = await Promise.all([
    SeasonalEvent.find().populate('affectedCategories', 'name slug').sort({ startDate: 1 }).lean(),
    Category.find({ isActive: true }).lean(),
    Product.find({ isActive: true }).populate('category', 'name').lean(),
  ]);

  // Baseline daily demand across last 90 days per category
  const lookbackStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const dailyCategorySales = await SaleItem.aggregate([
    { $match: { saleDate: { $gte: lookbackStart } } },
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'prod',
      },
    },
    { $unwind: '$prod' },
    {
      $group: {
        _id: {
          category: '$prod.category',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        },
        units: { $sum: '$quantity' },
        revenue: { $sum: '$lineTotal' },
      },
    },
  ]);

  const catAvgDaily = new Map<string, number>();
  const catDailyBuckets = new Map<string, number[]>();
  for (const row of dailyCategorySales) {
    const cid = String(row._id.category);
    const list = catDailyBuckets.get(cid) || [];
    list.push(row.units);
    catDailyBuckets.set(cid, list);
  }
  for (const [cid, list] of catDailyBuckets.entries()) {
    const total = list.reduce((a, b) => a + b, 0);
    catAvgDaily.set(cid, Number((total / 90).toFixed(2)));
  }

  // Monthly historical trend for seasonal comparison
  const monthlyTrend = await SaleItem.aggregate([
    { $match: { saleDate: { $gte: lookbackStart } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
        units: { $sum: '$quantity' },
        revenue: { $sum: '$lineTotal' },
        isDemo: { $max: '$isDemoData' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Build seasonal stock recommendations for upcoming/active events
  const now = new Date();
  const upcomingEvents = events.filter((e) => new Date(e.endDate) >= now && e.isActive);
  const nextEvent = upcomingEvents[0] || events[0];

  const seasonalRecommendations = [];
  if (nextEvent) {
    const affectedIds = new Set((nextEvent.affectedCategories || []).map((c: { _id?: unknown }) => String(c._id || c)));
    for (const p of products) {
      const catId = String((p.category as { _id?: unknown })?._id || p.category);
      const isAffected = affectedIds.size === 0 || affectedIds.has(catId);
      if (!isAffected) continue;

      const catBase = catAvgDaily.get(catId) || 1;
      const estimatedDaily = Math.max(0.5, catBase / Math.max(1, products.filter((pr) => String((pr.category as { _id?: unknown })?._id || pr.category) === catId).length));
      const eventDays = Math.max(
        1,
        Math.ceil((new Date(nextEvent.endDate).getTime() - new Date(nextEvent.startDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
      );
      const normalDemand = Math.round(estimatedDaily * eventDays);
      const upliftedDemand = Math.round(normalDemand * nextEvent.demandMultiplier);
      const additionalNeeded = Math.max(0, upliftedDemand - p.currentStock);

      if (additionalNeeded > 0) {
        seasonalRecommendations.push({
          productId: p._id,
          name: p.name,
          sku: p.sku,
          categoryName: (p.category as { name?: string })?.name || 'General',
          currentStock: p.currentStock,
          normalPeriodDemand: normalDemand,
          upliftedDemand,
          additionalBufferNeeded: additionalNeeded,
          estimatedCost: Math.round(additionalNeeded * p.costPrice),
        });
      }
    }
  }

  res.json({
    events,
    categories,
    dailyTrend: monthlyTrend.map((m) => ({
      date: m._id,
      units: m.units,
      revenue: Math.round(m.revenue),
      isDemoData: Boolean(m.isDemo),
    })),
    featuredEvent: nextEvent || null,
    seasonalRecommendations: seasonalRecommendations
      .sort((a, b) => b.additionalBufferNeeded - a.additionalBufferNeeded)
      .slice(0, 15),
  });
}

export async function createSeasonalEvent(req: Request, res: Response): Promise<void> {
  const parsed = seasonalEventSchema.parse(req.body);
  const existing = await SeasonalEvent.findOne({ code: parsed.code.toUpperCase() });
  if (existing) {
    throw new AppError(`Seasonal event code "${parsed.code.toUpperCase()}" already exists.`, 409);
  }
  const event = await SeasonalEvent.create({
    ...parsed,
    code: parsed.code.toUpperCase(),
    startDate: new Date(parsed.startDate),
    endDate: new Date(parsed.endDate),
  });
  const populated = await SeasonalEvent.findById(event._id).populate('affectedCategories', 'name slug');
  res.status(201).json({ event: populated });
}

export async function updateSeasonalEvent(req: Request, res: Response): Promise<void> {
  const parsed = seasonalEventSchema.partial().parse(req.body);
  const event = await SeasonalEvent.findById(req.params.id);
  if (!event) throw new AppError('Seasonal event not found', 404);

  if (parsed.name !== undefined) event.name = parsed.name;
  if (parsed.demandMultiplier !== undefined) event.demandMultiplier = parsed.demandMultiplier;
  if (parsed.startDate !== undefined) event.startDate = new Date(parsed.startDate);
  if (parsed.endDate !== undefined) event.endDate = new Date(parsed.endDate);
  if (parsed.affectedCategories !== undefined) event.affectedCategories = parsed.affectedCategories as unknown as typeof event.affectedCategories;
  if (parsed.description !== undefined) event.description = parsed.description;
  if (parsed.isActive !== undefined) event.isActive = parsed.isActive;

  await event.save();
  const populated = await SeasonalEvent.findById(event._id).populate('affectedCategories', 'name slug');
  res.json({ event: populated });
}

export async function deleteSeasonalEvent(req: Request, res: Response): Promise<void> {
  const deleted = await SeasonalEvent.findByIdAndDelete(req.params.id);
  if (!deleted) throw new AppError('Seasonal event not found', 404);
  res.json({ message: 'Seasonal event removed.' });
}
