import { Request, Response } from 'express';
import { Product } from '../models/Product.ts';
import { Sale } from '../models/Sale.ts';
import { SaleItem } from '../models/SaleItem.ts';
import { InventoryTransaction } from '../models/InventoryTransaction.ts';
import { PurchaseOrder } from '../models/PurchaseOrder.ts';
import { Supplier } from '../models/Supplier.ts';
import { DemandForecast } from '../models/DemandForecast.ts';

export async function generateReports(req: Request, res: Response): Promise<void> {
  const reportType = String(req.query.type || 'sales_performance');
  const categoryId = String(req.query.categoryId || 'all');
  const startDateStr = req.query.startDate ? String(req.query.startDate) : '';
  const endDateStr = req.query.endDate ? String(req.query.endDate) : '';

  const endDate = endDateStr ? new Date(`${endDateStr}T23:59:59.999Z`) : new Date();
  const startDate = startDateStr
    ? new Date(`${startDateStr}T00:00:00.000Z`)
    : new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  const productFilter: Record<string, unknown> = { isActive: true };
  if (categoryId !== 'all') productFilter.category = categoryId;

  const products = await Product.find(productFilter)
    .populate('category', 'name')
    .populate('supplier', 'name code averageLeadTimeDays')
    .lean();
  const productIds = products.map((p) => p._id);

  if (reportType === 'sales_performance') {
    const daily = await Sale.aggregate([
      { $match: { saleDate: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
          orders: { $sum: 1 },
          subtotal: { $sum: '$subtotal' },
          gst: { $sum: '$gstAmount' },
          discount: { $sum: '$discountAmount' },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: -1 } },
    ]);
    res.json({
      reportType,
      columns: ['Date', 'Orders', 'Subtotal (INR)', 'Discount (INR)', 'GST (INR)', 'Total Revenue (INR)'],
      rows: daily.map((d) => ({
        Date: d._id,
        Orders: d.orders,
        'Subtotal (INR)': Math.round(d.subtotal),
        'Discount (INR)': Math.round(d.discount),
        'GST (INR)': Math.round(d.gst),
        'Total Revenue (INR)': Math.round(d.revenue),
      })),
    });
    return;
  }

  if (reportType === 'inventory_valuation') {
    res.json({
      reportType,
      columns: ['SKU', 'Product', 'Category', 'Stock', 'Cost Price (INR)', 'Selling Price (INR)', 'Stock Cost Value (INR)', 'Retail Value (INR)'],
      rows: products.map((p) => ({
        SKU: p.sku,
        Product: p.name,
        Category: (p.category as { name?: string })?.name || 'N/A',
        Stock: p.currentStock,
        'Cost Price (INR)': p.costPrice,
        'Selling Price (INR)': p.sellingPrice,
        'Stock Cost Value (INR)': Math.round(p.currentStock * p.costPrice),
        'Retail Value (INR)': Math.round(p.currentStock * p.sellingPrice),
      })),
    });
    return;
  }

  if (reportType === 'stock_movement') {
    const txs = await InventoryTransaction.find({
      product: { $in: productIds },
      transactionDate: { $gte: startDate, $lte: endDate },
    })
      .populate('product', 'name sku')
      .sort({ transactionDate: -1 })
      .limit(200)
      .lean();
    res.json({
      reportType,
      columns: ['Date', 'SKU', 'Product', 'Type', 'Qty Change', 'Prev Stock', 'New Stock', 'Reference', 'Reason'],
      rows: txs.map((t) => ({
        Date: new Date(t.transactionDate).toISOString().slice(0, 10),
        SKU: (t.product as { sku?: string })?.sku || '-',
        Product: (t.product as { name?: string })?.name || '-',
        Type: t.type,
        'Qty Change': t.quantityChange,
        'Prev Stock': t.previousStock,
        'New Stock': t.newStock,
        Reference: t.referenceId || '-',
        Reason: t.reason || '-',
      })),
    });
    return;
  }

  if (reportType === 'product_performance') {
    const salesAgg = await SaleItem.aggregate([
      { $match: { product: { $in: productIds }, saleDate: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: '$product',
          unitsSold: { $sum: '$quantity' },
          revenue: { $sum: '$lineTotal' },
          cogs: { $sum: { $multiply: ['$quantity', '$costPrice'] } },
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    const prodMap = new Map(products.map((p) => [String(p._id), p]));
    res.json({
      reportType,
      columns: ['SKU', 'Product', 'Category', 'Units Sold', 'Revenue (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin %'],
      rows: salesAgg.map((s) => {
        const p = prodMap.get(String(s._id));
        const profit = s.revenue - s.cogs;
        const margin = s.revenue > 0 ? Number(((profit / s.revenue) * 100).toFixed(1)) : 0;
        return {
          SKU: p?.sku || '-',
          Product: p?.name || '-',
          Category: (p?.category as { name?: string })?.name || '-',
          'Units Sold': s.unitsSold,
          'Revenue (INR)': Math.round(s.revenue),
          'COGS (INR)': Math.round(s.cogs),
          'Gross Profit (INR)': Math.round(profit),
          'Margin %': margin,
        };
      }),
    });
    return;
  }

  if (reportType === 'supplier_performance') {
    const suppliers = await Supplier.find().lean();
    const poStats = await PurchaseOrder.aggregate([
      {
        $group: {
          _id: '$supplier',
          orders: { $sum: 1 },
          totalSpend: { $sum: '$totalAmount' },
          received: { $sum: { $cond: [{ $eq: ['$status', 'Received'] }, 1, 0] } },
          onTime: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'Received'] }, { $lte: ['$receivedDate', '$expectedDeliveryDate'] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const poMap = new Map(poStats.map((s) => [String(s._id), s]));
    res.json({
      reportType,
      columns: ['Code', 'Supplier', 'City', 'Lead Time (d)', 'Rating', 'Total POs', 'Received POs', 'On-Time %', 'Total Spend (INR)'],
      rows: suppliers.map((s) => {
        const st = poMap.get(String(s._id));
        const onTimePct = st && st.received > 0 ? Math.round((st.onTime / st.received) * 100) : 'N/A';
        return {
          Code: s.code,
          Supplier: s.name,
          City: s.city,
          'Lead Time (d)': s.averageLeadTimeDays,
          Rating: s.rating,
          'Total POs': st?.orders || 0,
          'Received POs': st?.received || 0,
          'On-Time %': onTimePct,
          'Total Spend (INR)': Math.round(st?.totalSpend || 0),
        };
      }),
    });
    return;
  }

  if (reportType === 'purchase_orders') {
    const pos = await PurchaseOrder.find({ orderDate: { $gte: startDate, $lte: endDate } })
      .populate('supplier', 'name code')
      .sort({ orderDate: -1 })
      .lean();
    res.json({
      reportType,
      columns: ['PO Number', 'Supplier', 'Status', 'Order Date', 'Expected Delivery', 'Subtotal (INR)', 'GST (INR)', 'Total (INR)'],
      rows: pos.map((po) => ({
        'PO Number': po.poNumber,
        Supplier: (po.supplier as { name?: string })?.name || '-',
        Status: po.status,
        'Order Date': new Date(po.orderDate).toISOString().slice(0, 10),
        'Expected Delivery': new Date(po.expectedDeliveryDate).toISOString().slice(0, 10),
        'Subtotal (INR)': Math.round(po.subtotal),
        'GST (INR)': Math.round(po.gstAmount),
        'Total (INR)': Math.round(po.totalAmount),
      })),
    });
    return;
  }

  if (reportType === 'forecast_accuracy') {
    const forecasts = await DemandForecast.find({ product: { $in: productIds } })
      .populate('product', 'name sku')
      .sort({ calculatedAt: -1 })
      .limit(100)
      .lean();
    res.json({
      reportType,
      columns: ['SKU', 'Product', 'Method', 'Horizon (d)', 'Forecast Total', 'MAE', 'RMSE', 'MAPE %', 'WAPE %', 'Status'],
      rows: forecasts.map((f) => ({
        SKU: (f.product as { sku?: string })?.sku || '-',
        Product: (f.product as { name?: string })?.name || '-',
        Method: f.method,
        'Horizon (d)': f.horizonDays,
        'Forecast Total': f.forecastTotal,
        MAE: f.metrics?.mae ?? 'N/A',
        RMSE: f.metrics?.rmse ?? 'N/A',
        'MAPE %': f.metrics?.mape ?? 'N/A',
        'WAPE %': f.metrics?.wape ?? 'N/A',
        Status: f.isPreliminary ? 'Preliminary' : 'Validated',
      })),
    });
    return;
  }

  // Inventory turnover, dead stock, overstock, stockout analysis
  const periodDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
  const salesAgg = await SaleItem.aggregate([
    { $match: { product: { $in: productIds }, saleDate: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: '$product',
        unitsSold: { $sum: '$quantity' },
        cogs: { $sum: { $multiply: ['$quantity', '$costPrice'] } },
      },
    },
  ]);
  const salesMap = new Map(salesAgg.map((s) => [String(s._id), s]));

  if (reportType === 'inventory_turnover') {
    res.json({
      reportType,
      columns: ['SKU', 'Product', 'Current Stock', 'Stock Value (INR)', 'Units Sold', 'Annualized Turnover', 'Days of Supply'],
      rows: products.map((p) => {
        const s = salesMap.get(String(p._id));
        const unitsSold = s?.unitsSold || 0;
        const cogs = s?.cogs || 0;
        const invVal = p.currentStock * p.costPrice;
        const annualizedCogs = (cogs / periodDays) * 365;
        const turnover = invVal > 0 ? Number((annualizedCogs / invVal).toFixed(2)) : 0;
        const dailyRate = unitsSold / periodDays;
        const daysSupply = dailyRate > 0 ? Math.round(p.currentStock / dailyRate) : 'No Sales';
        return {
          SKU: p.sku,
          Product: p.name,
          'Current Stock': p.currentStock,
          'Stock Value (INR)': Math.round(invVal),
          'Units Sold': unitsSold,
          'Annualized Turnover': turnover,
          'Days of Supply': daysSupply,
        };
      }),
    });
    return;
  }

  if (reportType === 'dead_stock') {
    const deadRows = products
      .filter((p) => p.currentStock > 0 && (salesMap.get(String(p._id))?.unitsSold || 0) <= 2)
      .map((p) => ({
        SKU: p.sku,
        Product: p.name,
        Category: (p.category as { name?: string })?.name || '-',
        'Current Stock': p.currentStock,
        'Units Sold in Period': salesMap.get(String(p._id))?.unitsSold || 0,
        'Locked Capital (INR)': Math.round(p.currentStock * p.costPrice),
      }));
    res.json({
      reportType,
      columns: ['SKU', 'Product', 'Category', 'Current Stock', 'Units Sold in Period', 'Locked Capital (INR)'],
      rows: deadRows,
    });
    return;
  }

  if (reportType === 'overstock') {
    const overRows = products
      .filter((p) => p.currentStock > p.maxStock)
      .map((p) => ({
        SKU: p.sku,
        Product: p.name,
        'Current Stock': p.currentStock,
        'Max Stock': p.maxStock,
        'Excess Units': p.currentStock - p.maxStock,
        'Excess Value (INR)': Math.round((p.currentStock - p.maxStock) * p.costPrice),
      }));
    res.json({
      reportType,
      columns: ['SKU', 'Product', 'Current Stock', 'Max Stock', 'Excess Units', 'Excess Value (INR)'],
      rows: overRows,
    });
    return;
  }

  // stockout_analysis
  const stockoutRows = products
    .filter((p) => p.currentStock <= p.reorderLevel)
    .map((p) => ({
      SKU: p.sku,
      Product: p.name,
      Supplier: (p.supplier as { name?: string })?.name || '-',
      'Current Stock': p.currentStock,
      'Reorder Level': p.reorderLevel,
      'Lead Time (d)': p.leadTimeDays,
      Status: p.currentStock <= 0 ? 'Out of Stock' : 'Below Reorder Point',
    }));
  res.json({
    reportType: 'stockout_analysis',
    columns: ['SKU', 'Product', 'Supplier', 'Current Stock', 'Reorder Level', 'Lead Time (d)', 'Status'],
    rows: stockoutRows,
  });
}
