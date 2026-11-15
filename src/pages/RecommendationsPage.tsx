import { useEffect, useState, useCallback } from 'react';
import { Check, Eye, FilePlus2, RefreshCw, Sparkles, X } from 'lucide-react';
import { apiFetch, formatINR } from '../lib/api.ts';
import { EmptyState, ErrorBanner, Modal, SkeletonRows, StatusTag } from '../components/ui.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface RecommendationItem {
  _id: string;
  product: { _id: string; name: string; sku: string; unit: string; currentStock: number; reorderLevel: number };
  supplier: { _id: string; name: string; code: string; averageLeadTimeDays: number };
  currentStock: number;
  avgDailyDemand: number;
  forecastedDemand30d: number;
  safetyStock: number;
  reorderPoint: number;
  eoq: number;
  recommendedOrderQty: number;
  estimatedOrderCost: number;
  leadTimeDays: number;
  serviceLevel: number;
  stockoutRiskPct: number;
  urgency: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'Approved' | 'Rejected' | 'Converted';
  purchaseOrder?: { _id: string; poNumber: string; status: string };
  formulaBreakdown?: {
    safetyStockFormula?: string;
    reorderPointFormula?: string;
    eoqFormula?: string;
  };
}

export function RecommendationsPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [detailItem, setDetailItem] = useState<RecommendationItem | null>(null);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ recommendations: RecommendationItem[] }>(
        `/api/recommendations?status=${statusFilter}&urgency=${urgencyFilter}`
      );
      setItems(res.recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reorder recommendations');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, urgencyFilter]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch<{ generatedCount: number }>('/api/recommendations/generate', {
        method: 'POST',
      });
      addToast({
        type: 'success',
        title: 'Recommendations refreshed',
        message: `${res.generatedCount} replenishment recommendations computed from live inventory & sales.`,
      });
      await loadRecommendations();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Generation failed',
        message: err instanceof Error ? err.message : 'Unable to generate recommendations',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'convert') => {
    try {
      const res = await apiFetch<{ purchaseOrder?: { poNumber: string } }>(
        `/api/recommendations/${id}/action`,
        {
          method: 'POST',
          body: JSON.stringify({ action }),
        }
      );
      if (action === 'convert' && res.purchaseOrder) {
        addToast({
          type: 'success',
          title: `Converted to ${res.purchaseOrder.poNumber}`,
          message: 'Purchase Order created and ready in Purchase Orders module.',
        });
      } else {
        addToast({ type: 'success', title: `Recommendation ${action}ed` });
      }
      await loadRecommendations();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Action failed',
        message: err instanceof Error ? err.message : 'Unable to perform action',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Reorder Recommendations</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Dynamic replenishment queue computed from current stock, lead times, demand velocity, and EOQ
          </p>
        </div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Recalculating...' : 'Recalculate from Live Data'}
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center gap-3 text-xs">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Converted">Converted to PO</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white"
        >
          <option value="all">All Urgency Levels</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadRecommendations} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <SkeletonRows rows={7} cols={8} />
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Sparkles}
              title="No reorder recommendations match this filter"
              description="Recalculate from live inventory & sales data to detect SKUs below reorder point."
              actionLabel="Recalculate Now"
              onAction={handleRegenerate}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Product & Supplier</th>
                  <th className="px-4 py-3 text-right font-semibold">Stock / ROP</th>
                  <th className="px-4 py-3 text-right font-semibold">Avg Daily / 30d</th>
                  <th className="px-4 py-3 text-right font-semibold">Safety Stock</th>
                  <th className="px-4 py-3 text-right font-semibold">Rec. Order</th>
                  <th className="px-4 py-3 text-right font-semibold">Est. Cost</th>
                  <th className="px-4 py-3 text-left font-semibold">Urgency · Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{r.product?.name}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-mono">{r.product?.sku}</span> · {r.supplier?.name} ({r.leadTimeDays}d)
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className="font-bold text-slate-900">{r.currentStock}</span>
                      <span className="text-slate-400"> / {r.reorderPoint}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {r.avgDailyDemand.toFixed(1)} / {Math.round(r.forecastedDemand30d)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{r.safetyStock}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-blue-700">
                      {r.recommendedOrderQty} {r.product?.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatINR(r.estimatedOrderCost)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusTag
                          tone={
                            r.urgency === 'Critical'
                              ? 'danger'
                              : r.urgency === 'High'
                              ? 'warning'
                              : 'info'
                          }
                          label={`${r.urgency} · ${r.stockoutRiskPct}% risk`}
                        />
                        <span className="text-[11px] text-slate-500">
                          {r.status}
                          {r.purchaseOrder ? ` (${r.purchaseOrder.poNumber})` : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailItem(r)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                          title="Calculation Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {(r.status === 'Pending' || r.status === 'Approved') && (
                          <>
                            {r.status === 'Pending' && (
                              <button
                                type="button"
                                onClick={() => handleAction(r._id, 'approve')}
                                className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50"
                                title="Approve"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleAction(r._id, 'convert')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-medium whitespace-nowrap"
                              title="Convert to Purchase Order"
                            >
                              <FilePlus2 className="h-3.5 w-3.5" />
                              Create PO
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAction(r._id, 'reject')}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                              title="Reject"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calculation Details Modal */}
      <Modal
        open={Boolean(detailItem)}
        title={`Calculation Breakdown · ${detailItem?.product?.name || ''}`}
        subtitle={detailItem ? `SKU: ${detailItem.product?.sku} · Service Level: ${detailItem.serviceLevel}%` : undefined}
        onClose={() => setDetailItem(null)}
      >
        {detailItem && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Current Stock</p>
                <p className="text-sm font-bold font-mono mt-0.5">{detailItem.currentStock}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Reorder Point</p>
                <p className="text-sm font-bold font-mono mt-0.5">{detailItem.reorderPoint}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">EOQ</p>
                <p className="text-sm font-bold font-mono mt-0.5">{detailItem.eoq}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Recommended Qty</p>
                <p className="text-sm font-bold font-mono text-blue-700 mt-0.5">{detailItem.recommendedOrderQty}</p>
              </div>
            </div>
            <div className="space-y-2 font-mono text-[11px] text-slate-700">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-sans font-semibold text-slate-600 block mb-1">Safety Stock Formula</span>
                {detailItem.formulaBreakdown?.safetyStockFormula || 'N/A'}
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-sans font-semibold text-slate-600 block mb-1">Reorder Point Formula</span>
                {detailItem.formulaBreakdown?.reorderPointFormula || 'N/A'}
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-sans font-semibold text-slate-600 block mb-1">EOQ Formula</span>
                {detailItem.formulaBreakdown?.eoqFormula || 'N/A'}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
