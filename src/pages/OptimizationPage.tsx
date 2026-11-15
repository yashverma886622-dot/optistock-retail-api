import { useEffect, useState, useCallback } from 'react';
import { Calculator, Save, Boxes, RotateCcw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiFetch, formatINR, formatNumber } from '../lib/api.ts';
import { ErrorBanner, KpiCard, SkeletonRows, StatusTag } from '../components/ui.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface OptimizationRow {
  product: {
    _id: string;
    name: string;
    sku: string;
    currentStock: number;
    reorderLevel: number;
    costPrice: number;
    leadTimeDays: number;
    serviceLevel: number;
    orderingCost: number;
    holdingCostRate: number;
    minOrderQuantity: number;
    supplier?: { name: string };
  };
  pendingIncomingQty: number;
  demandStats: {
    avgDailyDemand: number;
    demandStdDev: number;
    forecasted30d: number;
    isPreliminary: boolean;
  };
  optimization: {
    zScore: number;
    serviceLevelPct: number;
    annualDemand: number;
    annualHoldingCostPerUnit: number;
    safetyStock: number;
    reorderPoint: number;
    eoq: number;
    recommendedOrderQty: number;
    averageInventory: number;
    estimatedAnnualHoldingCost: number;
    estimatedAnnualOrderingCost: number;
    totalAnnualInventoryCost: number;
    stockoutRiskPct: number;
    daysOfCover: number | null;
    needsReorder: boolean;
    urgency: string;
    formulaBreakdown: {
      safetyStockFormula: string;
      reorderPointFormula: string;
      eoqFormula: string;
    };
  };
}

export function OptimizationPage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState<OptimizationRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editable parameters for selected SKU sensitivity analysis
  const [params, setParams] = useState({
    leadTimeDays: 5,
    serviceLevel: 95,
    orderingCost: 500,
    holdingCostRate: 0.2,
    minOrderQuantity: 10,
  });
  const [simulated, setSimulated] = useState<OptimizationRow | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ items: OptimizationRow[] }>('/api/optimization');
      setRows(res.items);
      if (res.items.length > 0 && !selectedId) {
        const first = res.items[0];
        setSelectedId(first.product._id);
        setParams({
          leadTimeDays: first.product.leadTimeDays,
          serviceLevel: first.product.serviceLevel,
          orderingCost: first.product.orderingCost,
          holdingCostRate: first.product.holdingCostRate,
          minOrderQuantity: first.product.minOrderQuantity,
        });
        setSimulated(first);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load optimization data');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const runSimulation = useCallback(
    async (prodId: string, cfg: typeof params) => {
      if (!prodId) return;
      try {
        const qs = new URLSearchParams({
          productId: prodId,
          leadTimeDays: String(cfg.leadTimeDays),
          serviceLevel: String(cfg.serviceLevel),
          orderingCost: String(cfg.orderingCost),
          holdingCostRate: String(cfg.holdingCostRate),
          minOrderQuantity: String(cfg.minOrderQuantity),
        });
        const res = await apiFetch<{ items: OptimizationRow[] }>(`/api/optimization?${qs.toString()}`);
        if (res.items[0]) setSimulated(res.items[0]);
      } catch {
        // ignore
      }
    },
    []
  );

  const handleSelectProduct = (id: string) => {
    setSelectedId(id);
    const match = rows.find((r) => r.product._id === id);
    if (match) {
      const nextCfg = {
        leadTimeDays: match.product.leadTimeDays,
        serviceLevel: match.product.serviceLevel,
        orderingCost: match.product.orderingCost,
        holdingCostRate: match.product.holdingCostRate,
        minOrderQuantity: match.product.minOrderQuantity,
      };
      setParams(nextCfg);
      setSimulated(match);
    }
  };

  const handleSaveParams = async () => {
    if (!selectedId || !simulated) return;
    setSaving(true);
    try {
      await apiFetch(`/api/optimization/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...params,
          reorderLevel: simulated.optimization.reorderPoint,
        }),
      });
      addToast({
        type: 'success',
        title: 'Optimization parameters saved',
        message: `Updated ROP (${simulated.optimization.reorderPoint}) and service level (${params.serviceLevel}%) on product.`,
      });
      await loadAll();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Could not update parameters',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Inventory Optimization Engine</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Mathematical Safety Stock, Reorder Point (ROP), Economic Order Quantity (EOQ), and Stockout Risk modeling
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadAll} />}

      {/* Interactive Product Sensitivity Simulator */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-blue-700" />
            <h2 className="text-sm font-semibold text-slate-900">SKU Optimization & Formula Explorer</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(e) => handleSelectProduct(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white max-w-xs"
            >
              {rows.map((r) => (
                <option key={r.product._id} value={r.product._id}>
                  {r.product.name} ({r.product.sku})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSaveParams}
              disabled={saving || !simulated}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save to Product'}
            </button>
          </div>
        </div>

        {/* Configurable Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Lead Time (Days)</label>
            <input
              type="number"
              min="1"
              max="180"
              value={params.leadTimeDays}
              onChange={(e) => {
                const next = { ...params, leadTimeDays: Number(e.target.value) };
                setParams(next);
                runSimulation(selectedId, next);
              }}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Service Level (%)</label>
            <select
              value={params.serviceLevel}
              onChange={(e) => {
                const next = { ...params, serviceLevel: Number(e.target.value) };
                setParams(next);
                runSimulation(selectedId, next);
              }}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-mono"
            >
              <option value={90}>90% (Z = 1.28)</option>
              <option value={95}>95% (Z = 1.64)</option>
              <option value={98}>98% (Z = 2.05)</option>
              <option value={99}>99% (Z = 2.33)</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Ordering Cost S (₹)</label>
            <input
              type="number"
              min="1"
              value={params.orderingCost}
              onChange={(e) => {
                const next = { ...params, orderingCost: Number(e.target.value) };
                setParams(next);
                runSimulation(selectedId, next);
              }}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Holding Cost Rate</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="1"
              value={params.holdingCostRate}
              onChange={(e) => {
                const next = { ...params, holdingCostRate: Number(e.target.value) };
                setParams(next);
                runSimulation(selectedId, next);
              }}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Min Order Qty (MOQ)</label>
            <input
              type="number"
              min="1"
              value={params.minOrderQuantity}
              onChange={(e) => {
                const next = { ...params, minOrderQuantity: Number(e.target.value) };
                setParams(next);
                runSimulation(selectedId, next);
              }}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono"
            />
          </div>
        </div>

        {simulated && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                label="Economic Order Qty (EOQ)"
          icon={Boxes}
                value={`${formatNumber(simulated.optimization.eoq)} units`}
                subtext={`Annual demand: ${formatNumber(simulated.optimization.annualDemand, 0)}`}
                tone="blue"
              />
              <KpiCard
                label="Reorder Point (ROP)"
          icon={RotateCcw}
                value={`${formatNumber(simulated.optimization.reorderPoint)} units`}
                subtext={`Current stock: ${simulated.product.currentStock} (+${simulated.pendingIncomingQty} in transit)`}
              />
              <KpiCard
                label="Safety Stock"
          icon={ShieldCheck}
                value={`${formatNumber(simulated.optimization.safetyStock)} units`}
                subtext={`Service level ${simulated.optimization.serviceLevelPct}% (Z=${simulated.optimization.zScore})`}
              />
              <KpiCard
                label="Estimated Stockout Risk"
          icon={AlertTriangle}
                value={`${simulated.optimization.stockoutRiskPct}%`}
                subtext={`Avg Inventory: ${formatNumber(simulated.optimization.averageInventory, 1)} units`}
                tone={simulated.optimization.stockoutRiskPct > 30 ? 'danger' : 'default'}
              />
            </div>

            {/* Academic Formula Transparency Panel */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
              <p className="font-semibold text-slate-900">Calculation Methodology & Live Formula Substitution</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px] text-slate-700">
                <div className="p-2.5 rounded bg-white border border-slate-200">
                  <span className="font-sans font-semibold text-slate-500 block mb-1">Safety Stock</span>
                  {simulated.optimization.formulaBreakdown.safetyStockFormula}
                </div>
                <div className="p-2.5 rounded bg-white border border-slate-200">
                  <span className="font-sans font-semibold text-slate-500 block mb-1">Reorder Point</span>
                  {simulated.optimization.formulaBreakdown.reorderPointFormula}
                </div>
                <div className="p-2.5 rounded bg-white border border-slate-200">
                  <span className="font-sans font-semibold text-slate-500 block mb-1">Economic Order Quantity</span>
                  {simulated.optimization.formulaBreakdown.eoqFormula}
                </div>
              </div>
              <div className="flex flex-wrap gap-6 pt-1 text-slate-600">
                <span>Annual Holding Cost: <strong className="font-mono">{formatINR(simulated.optimization.estimatedAnnualHoldingCost)}</strong></span>
                <span>Annual Ordering Cost: <strong className="font-mono">{formatINR(simulated.optimization.estimatedAnnualOrderingCost)}</strong></span>
                <span>Total Policy Cost: <strong className="font-mono">{formatINR(simulated.optimization.totalAnnualInventoryCost)}</strong></span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Store-wide Optimization Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Store-Wide SKU Optimization Policy Table</h2>
        </div>
        {loading ? (
          <SkeletonRows rows={8} cols={7} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Product</th>
                  <th className="px-4 py-3 text-right font-semibold">Avg Daily Demand</th>
                  <th className="px-4 py-3 text-right font-semibold">Current Stock</th>
                  <th className="px-4 py-3 text-right font-semibold">Safety Stock</th>
                  <th className="px-4 py-3 text-right font-semibold">ROP</th>
                  <th className="px-4 py-3 text-right font-semibold">EOQ</th>
                  <th className="px-4 py-3 text-right font-semibold">Stockout Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 30).map((r) => (
                  <tr
                    key={r.product._id}
                    onClick={() => handleSelectProduct(r.product._id)}
                    className={`cursor-pointer ${
                      r.product._id === selectedId ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{r.product.name}</p>
                      <p className="text-[11px] font-mono text-slate-500">{r.product.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {r.demandStats.avgDailyDemand.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {r.product.currentStock}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{r.optimization.safetyStock}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-blue-700">
                      {r.optimization.reorderPoint}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{r.optimization.eoq}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusTag
                        tone={
                          r.optimization.stockoutRiskPct >= 50
                            ? 'danger'
                            : r.optimization.stockoutRiskPct >= 20
                            ? 'warning'
                            : 'success'
                        }
                        label={`${r.optimization.stockoutRiskPct}%`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
