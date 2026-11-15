import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { RefreshCw, ArrowUpRight, Info, Package, Warehouse, Receipt, IndianRupee, AlertTriangle, PackageX, ClipboardList, Wallet } from 'lucide-react';
import { apiFetch, formatDateIN, formatINR, formatNumber } from '../lib/api.ts';
import { ErrorBanner, KpiCard, StatusTag } from '../components/ui.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface DashboardData {
  hasDemoData: boolean;
  kpis: {
    totalProducts: number;
    totalInventoryValue: number;
    totalSales: number;
    totalSalesCount: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    pendingPurchaseOrders: number;
    monthlyRevenue: number;
    monthlyOrders: number;
    estimatedMonthlyHoldingCost: number;
    estimatedAnnualHoldingCost: number;
  };
  charts: {
    salesTrend: Array<{ date: string; revenue: number; orders: number }>;
    inventoryMovement: Array<{ date: string; stockIn: number; stockOut: number }>;
    categoryDistribution: Array<{ name: string; value: number; count: number; units: number }>;
    topSellingProducts: Array<{ productId: string; name: string; sku: string; unitsSold: number; revenue: number }>;
    monthlyDemandTrends: Array<{ month: string; units: number; revenue: number }>;
    stockHealthOverview: Array<{ status: string; count: number }>;
  };
  sections: {
    recentTransactions: Array<{
      _id: string;
      type: string;
      quantityChange: number;
      transactionDate: string;
      referenceId?: string;
      product?: { name: string; sku: string };
    }>;
    lowStockAlerts: Array<{
      _id: string;
      name: string;
      sku: string;
      currentStock: number;
      reorderLevel: number;
      supplierName: string;
    }>;
    pendingPurchaseOrders: Array<{
      _id: string;
      poNumber: string;
      status: string;
      expectedDeliveryDate: string;
      totalAmount: number;
      supplier?: { name: string };
    }>;
    topPerformingProducts: Array<{
      _id: string;
      productName: string;
      sku: string;
      unitsSold: number;
      revenue: number;
    }>;
    reorderRecommendations: Array<{
      _id: string;
      urgency: string;
      recommendedOrderQty: number;
      estimatedOrderCost: number;
      stockoutRiskPct: number;
      product?: { name: string; sku: string; currentStock: number };
      supplier?: { name: string };
    }>;
  };
}

const CHART_COLORS = ['#1d4ed8', '#0ea5e9', '#10b981', '#f59e0b', '#6366f1', '#64748b', '#0284c7', '#059669'];
const HEALTH_COLORS: Record<string, string> = {
  Healthy: '#10b981',
  'Low Stock': '#f59e0b',
  'Out of Stock': '#e11d48',
  Overstock: '#2563eb',
};

export function DashboardPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (error) {
    return <ErrorBanner message={error} onRetry={loadDashboard} />;
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white p-4 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
          <div className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
        </div>
      </div>
    );
  }

  const { kpis, charts, sections } = data;

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Executive Inventory Overview</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live MongoDB metrics across stock valuation, demand velocity, and replenishment pipeline
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {data.hasDemoData && (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg">
              <Info className="h-3.5 w-3.5" />
              Includes labeled Indian retail demo dataset
            </span>
          )}
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* 8 Live KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Products"
          icon={Package}
          value={formatNumber(kpis.totalProducts)}
          subtext="Active SKUs in catalog"
        />
        <KpiCard
          label="Total Inventory Value"
          icon={Warehouse}
          value={formatINR(kpis.totalInventoryValue)}
          subtext="At landed cost price"
          tone="blue"
        />
        <KpiCard
          label="Total Sales (All-Time)"
          icon={Receipt}
          value={formatINR(kpis.totalSales)}
          subtext={`${formatNumber(kpis.totalSalesCount)} completed invoices`}
        />
        <KpiCard
          label="Monthly Revenue"
          icon={IndianRupee}
          value={formatINR(kpis.monthlyRevenue)}
          subtext={`${formatNumber(kpis.monthlyOrders)} orders this month`}
          tone="blue"
        />
        <KpiCard
          label="Low Stock Products"
          icon={AlertTriangle}
          value={formatNumber(kpis.lowStockProducts)}
          subtext="At or below reorder level"
          tone={kpis.lowStockProducts > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Out of Stock Products"
          icon={PackageX}
          value={formatNumber(kpis.outOfStockProducts)}
          subtext="Immediate replenishment needed"
          tone={kpis.outOfStockProducts > 0 ? 'danger' : 'default'}
        />
        <KpiCard
          label="Pending Purchase Orders"
          icon={ClipboardList}
          value={formatNumber(kpis.pendingPurchaseOrders)}
          subtext="Awaiting approval or delivery"
        />
        <KpiCard
          label="Est. Holding Cost / Mo"
          icon={Wallet}
          value={formatINR(kpis.estimatedMonthlyHoldingCost)}
          subtext={`${formatINR(kpis.estimatedAnnualHoldingCost)} annualized`}
        />
      </div>

      {/* Charts Grid — Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Sales Trends (Last 30 Days)</h2>
              <p className="text-xs text-slate-500">Daily POS revenue in INR</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.salesTrend}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(val) => [formatINR(Number(val ?? 0)), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#1d4ed8" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Inventory Movement (Units)</h2>
              <p className="text-xs text-slate-500">Daily stock-in vs stock-out transactions</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.inventoryMovement}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="stockIn" name="Stock In" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="stockOut" name="Stock Out" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Grid — Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Category Valuation Distribution</h2>
          <p className="text-xs text-slate-500 mb-3">Stock value share across categories</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.categoryDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {charts.categoryDistribution.map((entry, idx) => (
                    <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => formatINR(Number(val ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Monthly Demand Trends (90d)</h2>
          <p className="text-xs text-slate-500 mb-3">Units sold per calendar month</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.monthlyDemandTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Bar dataKey="units" name="Units Sold" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Stock Health Overview</h2>
          <p className="text-xs text-slate-500 mb-3">SKU counts by inventory threshold status</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.stockHealthOverview} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis dataKey="status" type="category" width={90} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip />
                <Bar dataKey="count" name="SKUs" radius={[0, 4, 4, 0]}>
                  {charts.stockHealthOverview.map((entry) => (
                    <Cell key={entry.status} fill={HEALTH_COLORS[entry.status] || '#2563eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Selling Products Chart + Reorder Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Top-Selling Products (30d)</h2>
              <p className="text-xs text-slate-500">Ranked by gross sales revenue</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/pos')}
              className="text-xs font-medium text-blue-700 hover:underline inline-flex items-center gap-1"
            >
              Open POS <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.topSellingProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={150}
                  tick={{ fontSize: 11, fill: '#334155' }}
                  tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                />
                <Tooltip formatter={(val) => formatINR(Number(val ?? 0))} />
                <Bar dataKey="revenue" name="Revenue" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Priority Reorder Recommendations</h2>
              <p className="text-xs text-slate-500">Top stockout-risk items from optimization engine</p>
            </div>
            {hasRole('Admin', 'Manager') && (
              <button
                type="button"
                onClick={() => navigate('/recommendations')}
                className="text-xs font-medium text-blue-700 hover:underline inline-flex items-center gap-1"
              >
                Manage all <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-medium">Product</th>
                  <th className="py-2 text-right font-medium">Stock</th>
                  <th className="py-2 text-right font-medium">Order Qty</th>
                  <th className="py-2 text-right font-medium">Est. Cost</th>
                  <th className="py-2 text-right font-medium">Urgency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sections.reorderRecommendations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No pending reorder recommendations.
                    </td>
                  </tr>
                ) : (
                  sections.reorderRecommendations.map((r) => (
                    <tr key={r._id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-2">
                        <p className="font-medium text-slate-900 truncate max-w-[190px]">
                          {r.product?.name || 'SKU'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">{r.product?.sku}</p>
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-mono">
                        {r.product?.currentStock ?? 0}
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-mono font-semibold text-blue-700">
                        {r.recommendedOrderQty}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatINR(r.estimatedOrderCost)}
                      </td>
                      <td className="py-2.5 text-right">
                        <StatusTag
                          tone={r.urgency === 'Critical' ? 'danger' : r.urgency === 'High' ? 'warning' : 'info'}
                          label={r.urgency}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Operational Tables: Low Stock Alerts, Pending POs, Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Low Stock Alerts</h2>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Inventory
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {sections.lowStockAlerts.length === 0 ? (
              <p className="py-6 text-xs text-slate-500 text-center">All products above reorder threshold.</p>
            ) : (
              sections.lowStockAlerts.map((item) => (
                <div key={item._id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.sku} · {item.supplierName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusTag
                      tone={item.currentStock <= 0 ? 'danger' : 'warning'}
                      label={`${item.currentStock} / ${item.reorderLevel}`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Pending Purchase Orders</h2>
            {hasRole('Admin', 'Manager') && (
              <button
                type="button"
                onClick={() => navigate('/purchase-orders')}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                All POs
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {sections.pendingPurchaseOrders.length === 0 ? (
              <p className="py-6 text-xs text-slate-500 text-center">No pending purchase orders.</p>
            ) : (
              sections.pendingPurchaseOrders.map((po) => (
                <div key={po._id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-slate-900">{po.poNumber}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {po.supplier?.name} · Due {formatDateIN(po.expectedDeliveryDate)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold tabular-nums text-slate-900">{formatINR(po.totalAmount)}</p>
                    <p className="text-[11px] text-blue-700">{po.status}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Recent Inventory Ledger</h2>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Ledger
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {sections.recentTransactions.length === 0 ? (
              <p className="py-6 text-xs text-slate-500 text-center">No inventory movements recorded yet.</p>
            ) : (
              sections.recentTransactions.slice(0, 7).map((tx) => (
                <div key={tx._id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{tx.product?.name || 'SKU'}</p>
                    <p className="text-[11px] text-slate-500">
                      {tx.type} · {formatDateIN(tx.transactionDate)}
                    </p>
                  </div>
                  <span
                    className={`font-mono font-semibold tabular-nums shrink-0 ${
                      tx.quantityChange >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {tx.quantityChange >= 0 ? `+${tx.quantityChange}` : tx.quantityChange}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
