import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Calendar, Info, Plus, Trash2 } from 'lucide-react';
import { apiFetch, formatDateIN, formatINR } from '../lib/api.ts';
import { Category } from '../types/index.ts';
import { ErrorBanner, Modal, StatusTag } from '../components/ui.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useConfirm } from '../context/ConfirmContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface SeasonalEventItem {
  _id: string;
  name: string;
  code: string;
  startDate: string;
  endDate: string;
  demandMultiplier: number;
  affectedCategories: Array<{ _id: string; name: string }>;
  description?: string;
  year: number;
  isActive: boolean;
  isDemoData?: boolean;
}

interface SeasonalResponse {
  events: SeasonalEventItem[];
  categories: Category[];
  dailyTrend: Array<{ date: string; units: number; revenue: number; isDemoData: boolean }>;
  featuredEvent: SeasonalEventItem | null;
  seasonalRecommendations: Array<{
    productId: string;
    name: string;
    sku: string;
    categoryName: string;
    currentStock: number;
    normalPeriodDemand: number;
    upliftedDemand: number;
    additionalBufferNeeded: number;
    estimatedCost: number;
  }>;
}

export function SeasonalPage() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { hasRole } = useAuth();
  const [data, setData] = useState<SeasonalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    startDate: '',
    endDate: '',
    demandMultiplier: 1.5,
    affectedCategories: [] as string[],
    description: '',
    year: new Date().getFullYear() + 1,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<SeasonalResponse>('/api/seasonal');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load seasonal analysis');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/seasonal', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      addToast({ type: 'success', title: 'Seasonal event added' });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Create failed',
        message: err instanceof Error ? err.message : 'Unable to save seasonal event',
      });
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this seasonal event?',
      message: 'Forecasts will no longer apply this event\'s demand multiplier.',
      confirmLabel: 'Delete event',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/seasonal/${id}`, { method: 'DELETE' });
      addToast({ type: 'info', title: 'Seasonal event removed' });
      await loadData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Unable to delete event',
      });
    }
  };

  const hasDemoSales = data?.dailyTrend.some((d) => d.isDemoData);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Seasonal & Indian Festival Analysis</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Festival calendar multipliers (Diwali, Holi, Navratri, Eid, Raksha Bandhan, Christmas, New Year) & buffer planning
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Festival / Event
        </button>
      </div>

      {hasDemoSales && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-2.5 text-xs text-blue-900">
          <Info className="h-4 w-4 text-blue-700 shrink-0" />
          <span>
            Historical 90-day seasonal comparison includes clearly labeled <strong>seeded Indian retail demonstration data</strong> alongside any live POS transactions.
          </span>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {data && !loading && (
        <>
          {/* Historical Trend Chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">90-Day Historical Daily Units & Revenue</h2>
            <p className="text-xs text-slate-500 mb-4">Observe festive demand spikes across historical sales records</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="units" name="Units Sold" stroke="#1d4ed8" fill="#dbeafe" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Festival Calendar */}
            <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">Configured Festival Calendar</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {data.events.map((ev) => (
                  <div key={ev._id} className="p-4 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{ev.name}</p>
                        {ev.isDemoData && <span className="text-[10px] text-slate-400">DEMO</span>}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {formatDateIN(ev.startDate)} – {formatDateIN(ev.endDate)} · Code: <span className="font-mono">{ev.code}</span>
                      </p>
                      {ev.description && <p className="text-slate-600 mt-1">{ev.description}</p>}
                      {ev.affectedCategories.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Categories: {ev.affectedCategories.map((c) => c.name).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusTag tone="info" label={`${ev.demandMultiplier}× Demand`} />
                      {hasRole('Admin') && (
                        <button
                          type="button"
                          onClick={() => handleDelete(ev._id)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Delete event"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Seasonal Stock Recommendations */}
            <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">
                  Seasonal Stock Buffer Recommendations
                </h2>
                <p className="text-xs text-slate-500">
                  {data.featuredEvent
                    ? `Prepared for ${data.featuredEvent.name} (${data.featuredEvent.demandMultiplier}× uplift)`
                    : 'No upcoming event selected'}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Stock</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Uplifted Demand</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Buffer Needed</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Est. Budget</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.seasonalRecommendations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Current inventory covers projected festive uplift.
                        </td>
                      </tr>
                    ) : (
                      data.seasonalRecommendations.map((rec) => (
                        <tr key={rec.productId} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-900">{rec.name}</p>
                            <p className="text-[11px] text-slate-500">{rec.categoryName}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{rec.currentStock}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{rec.upliftedDemand}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-blue-700">
                            +{rec.additionalBufferNeeded}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {formatINR(rec.estimatedCost)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add Seasonal Event Modal */}
      <Modal
        open={modalOpen}
        title="Add Seasonal / Festival Event"
        subtitle="Configure demand multiplier for Indian retail forecasting"
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateEvent} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Event Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Ganesh Chaturthi Festive Rush"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Code *</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="GANESH-2027"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Demand Multiplier *</label>
              <input
                type="number"
                step="0.05"
                min="0.5"
                max="5"
                required
                value={form.demandMultiplier}
                onChange={(e) => setForm({ ...form, demandMultiplier: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div className="col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold">
              Save Event
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
