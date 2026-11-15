import { Request, Response } from 'express';
import { Product } from '../models/Product.ts';
import { Sale } from '../models/Sale.ts';
import { SaleItem } from '../models/SaleItem.ts';
import { PurchaseOrder } from '../models/PurchaseOrder.ts';
import { InventoryTransaction } from '../models/InventoryTransaction.ts';
import { ReorderRecommendation } from '../models/ReorderRecommendation.ts';
import { syncSystemNotifications } from '../services/notificationService.ts';

export async function getDashboardSummary(_req: Request, res: Response): Promise<void> {
  const now = new Date();
  const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOf90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  await syncSystemNotifications().catch(() => {});

  const [
    products,
    totalSalesAgg,
    monthlySalesAgg,
    pendingPOsCount,
    pendingPOsList,
    salesTrend30d,
    movement30d,
    topProductsAgg,
    monthlyDemandAgg,
    recentTransactions,
    pendingRecommendations,
  ] = await Promise.all([
    Product.find({ isActive: true }).populate('category', 'name').populate('supplier', 'name').lean(),
    Sale.aggregate([
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { saleDate: { $gte: startOfMonth } } },
      { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
    ]),
    PurchaseOrder.countDocuments({
      status: { $in: ['Pending Approval', 'Approved', 'Ordered', 'Partially Received'] },
    }),
    PurchaseOrder.find({
      status: { $in: ['Pending Approval', 'Approved', 'Ordered', 'Partially Received'] },
    })
      .populate('supplier', 'name')
      .sort({ expectedDeliveryDate: 1 })
      .limit(6)
      .lean(),
    Sale.aggregate([
      { $match: { saleDate: { $gte: startOf30Days } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    InventoryTransaction.aggregate([
      { $match: { transactionDate: { $gte: startOf30Days } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$transactionDate' } },
            dir: { $cond: [{ $gte: ['$quantityChange', 0] }, 'in', 'out'] },
          },
          units: { $sum: { $abs: '$quantityChange' } },
        },
      },
      { $sort: { '_id.day': 1 } },
    ]),
    SaleItem.aggregate([
      { $match: { saleDate: { $gte: startOf30Days } } },
      {
        $group: {
          _id: '$product',
          productName: { $first: '$productName' },
          sku: { $first: '$sku' },
          unitsSold: { $sum: '$quantity' },
          revenue: { $sum: '$lineTotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 8 },
    ]),
    SaleItem.aggregate([
      { $match: { saleDate: { $gte: startOf90Days } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$saleDate' } },
          units: { $sum: '$quantity' },
          revenue: { $sum: '$lineTotal' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    InventoryTransaction.find()
      .populate('product', 'name sku')
      .sort({ transactionDate: -1 })
      .limit(10)
      .lean(),
    ReorderRecommendation.find({ status: 'Pending' })
      .populate('product', 'name sku currentStock reorderLevel')
      .populate('supplier', 'name')
      .sort({ stockoutRiskPct: -1 })
      .limit(6)
      .lean(),
  ]);

  let totalInventoryValue = 0;
  let estimatedAnnualHoldingCost = 0;
  let lowStockProductsCount = 0;
  let outOfStockProductsCount = 0;
  let healthyStockCount = 0;
  let overstockCount = 0;

  const categoryMap = new Map<string, { name: string; value: number; count: number; units: number }>();
  const lowStockAlerts: Array<{
    _id: unknown;
    name: string;
    sku: string;
    currentStock: number;
    reorderLevel: number;
    minStock: number;
    supplierName: string;
  }> = [];

  for (const p of products) {
    const stockVal = p.currentStock * p.costPrice;
    totalInventoryValue += stockVal;
    estimatedAnnualHoldingCost += stockVal * (p.holdingCostRate || 0.2);

    if (p.currentStock <= 0) {
      outOfStockProductsCount += 1;
      lowStockAlerts.push({
        _id: p._id,
        name: p.name,
        sku: p.sku,
        currentStock: p.currentStock,
        reorderLevel: p.reorderLevel,
        minStock: p.minStock,
        supplierName: (p.supplier as { name?: string })?.name || 'Unknown',
      });
    } else if (p.currentStock <= p.reorderLevel) {
      lowStockProductsCount += 1;
      lowStockAlerts.push({
        _id: p._id,
        name: p.name,
        sku: p.sku,
        currentStock: p.currentStock,
        reorderLevel: p.reorderLevel,
        minStock: p.minStock,
        supplierName: (p.supplier as { name?: string })?.name || 'Unknown',
      });
    } else if (p.currentStock > p.maxStock) {
      overstockCount += 1;
    } else {
      healthyStockCount += 1;
    }

    const catName = (p.category as { name?: string })?.name || 'Uncategorized';
    const existing = categoryMap.get(catName) || { name: catName, value: 0, count: 0, units: 0 };
    existing.value += stockVal;
    existing.count += 1;
    existing.units += p.currentStock;
    categoryMap.set(catName, existing);
  }

  // Merge movement30d into { date, stockIn, stockOut }
  const moveMap = new Map<string, { date: string; stockIn: number; stockOut: number }>();
  for (const row of movement30d) {
    const day = row._id.day;
    const entry = moveMap.get(day) || { date: day, stockIn: 0, stockOut: 0 };
    if (row._id.dir === 'in') entry.stockIn += row.units;
    else entry.stockOut += row.units;
    moveMap.set(day, entry);
  }

  const demoCount = products.filter((p) => p.isDemoData).length;

  res.json({
    hasDemoData: demoCount > 0,
    kpis: {
      totalProducts: products.length,
      totalInventoryValue: Math.round(totalInventoryValue),
      totalSales: Math.round(totalSalesAgg[0]?.totalRevenue || 0),
      totalSalesCount: totalSalesAgg[0]?.count || 0,
      lowStockProducts: lowStockProductsCount,
      outOfStockProducts: outOfStockProductsCount,
      pendingPurchaseOrders: pendingPOsCount,
      monthlyRevenue: Math.round(monthlySalesAgg[0]?.revenue || 0),
      monthlyOrders: monthlySalesAgg[0]?.orders || 0,
      estimatedMonthlyHoldingCost: Math.round(estimatedAnnualHoldingCost / 12),
      estimatedAnnualHoldingCost: Math.round(estimatedAnnualHoldingCost),
    },
    charts: {
      salesTrend: salesTrend30d.map((d) => ({
        date: d._id,
        revenue: Math.round(d.revenue),
        orders: d.orders,
      })),
      inventoryMovement: Array.from(moveMap.values()),
      categoryDistribution: Array.from(categoryMap.values()).map((c) => ({
        ...c,
        value: Math.round(c.value),
      })),
      topSellingProducts: topProductsAgg.map((t) => ({
        productId: t._id,
        name: t.productName,
        sku: t.sku,
        unitsSold: t.unitsSold,
        revenue: Math.round(t.revenue),
      })),
      monthlyDemandTrends: monthlyDemandAgg.map((m) => ({
        month: m._id,
        units: m.units,
        revenue: Math.round(m.revenue),
      })),
      stockHealthOverview: [
        { status: 'Healthy', count: healthyStockCount },
        { status: 'Low Stock', count: lowStockProductsCount },
        { status: 'Out of Stock', count: outOfStockProductsCount },
        { status: 'Overstock', count: overstockCount },
      ],
    },
    sections: {
      recentTransactions,
      lowStockAlerts: lowStockAlerts.slice(0, 8),
      pendingPurchaseOrders: pendingPOsList,
      topPerformingProducts: topProductsAgg.slice(0, 5),
      reorderRecommendations: pendingRecommendations,
    },
  });
}
