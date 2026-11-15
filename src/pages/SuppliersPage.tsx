import React, { useEffect, useState, useCallback } from 'react';
import { Pencil, Plus, Search, Trash2, Truck } from 'lucide-react';
import { apiFetch, formatINR } from '../lib/api.ts';
import { Supplier } from '../types/index.ts';
import { EmptyState, ErrorBanner, Modal, SkeletonRows, StatusTag } from '../components/ui.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useConfirm } from '../context/ConfirmContext.tsx';

const EMPTY_SUPPLIER = {
  name: '',
  code: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  gstin: '',
  averageLeadTimeDays: 5,
  leadTimeStdDevDays: 1,
  paymentTerms: 'Net 30',
  status: 'Active' as 'Active' | 'Inactive' | 'On Hold',
  rating: 4.5,
};

export function SuppliersPage() {
  const { hasRole } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ suppliers: Supplier[] }>(
        `/api/suppliers?search=${encodeURIComponent(search)}&status=${statusFilter}`
      );
      setSuppliers(res.suppliers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_SUPPLIER);
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s._id);
    setForm({
      name: s.name,
      code: s.code,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      city: s.city,
      state: s.state,
      gstin: s.gstin || '',
      averageLeadTimeDays: s.averageLeadTimeDays,
      leadTimeStdDevDays: s.leadTimeStdDevDays,
      paymentTerms: s.paymentTerms,
      status: s.status,
      rating: s.rating,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/api/suppliers/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        addToast({ type: 'success', title: 'Supplier updated' });
      } else {
        await apiFetch('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        addToast({ type: 'success', title: 'Supplier created' });
      }
      setModalOpen(false);
      await loadSuppliers();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Unable to save supplier',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Supplier) => {
    const ok = await confirm({
      title: `Remove supplier "${s.name}"?`,
      message: 'Suppliers linked to products or purchase orders are deactivated instead of deleted.',
      confirmLabel: 'Remove supplier',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await apiFetch<{ message: string }>(`/api/suppliers/${s._id}`, { method: 'DELETE' });
      addToast({ type: 'info', title: 'Supplier updated', message: res.message });
      await loadSuppliers();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Action failed',
        message: err instanceof Error ? err.message : 'Could not delete supplier',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Supplier Directory & Performance</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            GSTIN-registered vendors, lead time SLAs, payment terms, and PO fulfillment reliability
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Supplier
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier name, code, city, or GSTIN..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="On Hold">On Hold</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadSuppliers} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <SkeletonRows rows={6} cols={6} />
        ) : suppliers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Truck}
              title="No suppliers found"
              description="Add suppliers with GSTIN and lead-time data to power automated replenishment."
              actionLabel="Add Supplier"
              onAction={openCreate}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Supplier & GSTIN</th>
                  <th className="px-4 py-3 text-left font-semibold">Contact & Location</th>
                  <th className="px-4 py-3 text-right font-semibold">Lead Time</th>
                  <th className="px-4 py-3 text-right font-semibold">SKUs · POs</th>
                  <th className="px-4 py-3 text-right font-semibold">Total Spend</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{s.name}</p>
                      <p className="text-[11px] font-mono text-slate-500">
                        {s.code} · {s.gstin || 'No GSTIN'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800">{s.contactPerson} · {s.phone}</p>
                      <p className="text-[11px] text-slate-500">
                        {s.city}, {s.state} · {s.paymentTerms}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {s.averageLeadTimeDays}d (±{s.leadTimeStdDevDays}d)
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {s.productCount || 0} SKUs · {s.performance?.totalOrders || 0} POs
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatINR(s.performance?.totalSpend || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusTag
                        tone={s.status === 'Active' ? 'success' : s.status === 'On Hold' ? 'warning' : 'neutral'}
                        label={`${s.status} · ★ ${s.rating.toFixed(1)}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                          title="Edit Supplier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {hasRole('Admin') && (
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50"
                            title="Deactivate / Delete Supplier"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {/* Add / Edit Supplier Modal */}
      <Modal
        open={modalOpen}
        title={editingId ? 'Edit Supplier' : 'Add Supplier'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Supplier Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Supplier Code *</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="SUP-XXXX"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Contact Person *</label>
              <input
                required
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Phone *</label>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">GSTIN</label>
              <input
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                placeholder="27AABCS1429B1Z5"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Address *</label>
              <input
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">City *</label>
              <input
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">State *</label>
              <input
                required
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Avg Lead Time (Days) *</label>
              <input
                type="number"
                min="1"
                required
                value={form.averageLeadTimeDays}
                onChange={(e) => setForm({ ...form, averageLeadTimeDays: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Terms</label>
              <input
                value={form.paymentTerms}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Rating (1–5)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="5"
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Update Supplier' : 'Create Supplier'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
