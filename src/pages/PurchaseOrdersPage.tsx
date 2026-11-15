import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardList, PackageCheck, Plus, Trash2 } from 'lucide-react';
import { apiFetch, formatDateIN, formatINR } from '../lib/api.ts';
import { Product, PurchaseOrder, Supplier } from '../types/index.ts';
import { EmptyState, ErrorBanner, Modal, SkeletonRows, StatusTag } from '../components/ui.tsx';
import { useToast } from '../context/ToastContext.tsx';

export function PurchaseOrdersPage() {
  const { addToast } = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create PO modal
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState(() =>
    new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
  );
  const [poStatus, setPoStatus] = useState<'Draft' | 'Pending Approval' | 'Approved' | 'Ordered'>('Pending Approval');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Array<{ productId: string; orderedQuantity: number; unitCost: number }>>([]);
  const [creating, setCreating] = useState(false);

  // Receive Delivery modal
  const [receivePO, setReceivePO] = useState<PurchaseOrder | null>(null);
  const [receiptId, setReceiptId] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [receiving, setReceiving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        apiFetch<{ purchaseOrders: PurchaseOrder[] }>(`/api/purchase-orders?status=${statusFilter}`),
        apiFetch<{ suppliers: Supplier[] }>('/api/suppliers'),
        apiFetch<{ products: Product[] }>('/api/products?limit=100'),
      ]);
      setOrders(poRes.purchaseOrders);
      setSuppliers(supRes.suppliers);
      setProducts(prodRes.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreateModal = () => {
    const firstSup = suppliers[0]?._id || '';
    setSupplierId(firstSup);
    const firstProd = products[0];
    setLines(
      firstProd
        ? [{ productId: firstProd._id, orderedQuantity: firstProd.minOrderQuantity || 20, unitCost: firstProd.costPrice }]
        : []
    );
    setNotes('');
    setCreateOpen(true);
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return;
    setCreating(true);
    try {
      await apiFetch('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          expectedDeliveryDate: expectedDate,
          status: poStatus,
          notes,
          items: lines,
        }),
      });
      addToast({ type: 'success', title: 'Purchase Order created' });
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Create PO failed',
        message: err instanceof Error ? err.message : 'Could not create PO',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: string, nextStatus: string) => {
    try {
      await apiFetch(`/api/purchase-orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      addToast({ type: 'success', title: `PO moved to ${nextStatus}` });
      await loadAll();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Status update failed',
        message: err instanceof Error ? err.message : 'Invalid status transition',
      });
    }
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setReceivePO(po);
    setReceiptId(`RCPT-${Date.now().toString(36).toUpperCase()}`);
    setReceiptNotes('');
    const initial: Record<string, number> = {};
    for (const it of po.items) {
      const pid = typeof it.product === 'object' ? it.product._id : it.product;
      const remaining = Math.max(0, it.orderedQuantity - it.receivedQuantity);
      if (remaining > 0) initial[pid] = remaining;
    }
    setReceiveQtys(initial);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivePO) return;
    const items = Object.entries(receiveQtys)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantityReceived]) => ({ productId, quantityReceived }));

    if (items.length === 0) {
      addToast({ type: 'error', title: 'Enter received quantities', message: 'At least one item must have quantity > 0.' });
      return;
    }

    setReceiving(true);
    try {
      await apiFetch(`/api/purchase-orders/${receivePO._id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          receiptId: receiptId.trim(),
          notes: receiptNotes.trim() || undefined,
          items,
        }),
      });
      addToast({
        type: 'success',
        title: `Stock received for ${receivePO.poNumber}`,
        message: `Batch ${receiptId} added to inventory with ledger audit.`,
      });
      setReceivePO(null);
      await loadAll();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Receiving failed',
        message: err instanceof Error ? err.message : 'Unable to process delivery',
      });
    } finally {
      setReceiving(false);
    }
  };

  const statusTone = (status: string) => {
    if (status === 'Received') return 'success';
    if (status === 'Partially Received' || status === 'Pending Approval') return 'warning';
    if (status === 'Cancelled') return 'danger';
    if (status === 'Approved' || status === 'Ordered') return 'info';
    return 'neutral';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Purchase Orders & Goods Receiving</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Approval workflow, partial/full delivery receiving, and idempotent stock addition protection
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          New Purchase Order
        </button>
      </div>

      {/* Status Filter */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center gap-1.5 text-xs">
        {['all', 'Draft', 'Pending Approval', 'Approved', 'Ordered', 'Partially Received', 'Received', 'Cancelled'].map(
          (st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {st === 'all' ? 'All Orders' : st}
            </button>
          )
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadAll} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <SkeletonRows rows={6} cols={6} />
        ) : orders.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ClipboardList}
              title="No purchase orders found"
              description="Create a purchase order directly or convert a Reorder Recommendation."
              actionLabel="New Purchase Order"
              onAction={openCreateModal}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {orders.map((po) => (
              <div key={po._id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-slate-900">{po.poNumber}</span>
                      <StatusTag tone={statusTone(po.status)} label={po.status} />
                      {po.isDemoData && <span className="text-[10px] text-slate-400">DEMO</span>}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Supplier: <strong>{po.supplier?.name}</strong> · Ordered {formatDateIN(po.orderDate)} · Expected{' '}
                      {formatDateIN(po.expectedDeliveryDate)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900 mr-2 tabular-nums">
                      {formatINR(po.totalAmount, 2)}
                    </span>

                    {po.status === 'Draft' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(po._id, 'Pending Approval')}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50"
                      >
                        Submit for Approval
                      </button>
                    )}
                    {po.status === 'Pending Approval' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(po._id, 'Approved')}
                        className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                      >
                        Approve PO
                      </button>
                    )}
                    {po.status === 'Approved' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(po._id, 'Ordered')}
                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs font-semibold hover:bg-blue-100"
                      >
                        Mark Ordered
                      </button>
                    )}
                    {['Approved', 'Ordered', 'Partially Received'].includes(po.status) && (
                      <button
                        type="button"
                        onClick={() => openReceiveModal(po)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        Receive Delivery
                      </button>
                    )}
                    {['Draft', 'Pending Approval', 'Approved', 'Ordered'].includes(po.status) && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(po._id, 'Cancelled')}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-medium hover:bg-rose-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Product</th>
                        <th className="px-3 py-2 text-right font-medium">Ordered</th>
                        <th className="px-3 py-2 text-right font-medium">Received</th>
                        <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
                        <th className="px-3 py-2 text-right font-medium">Line Total (incl. GST)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {po.items.map((it) => (
                        <tr key={it._id}>
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-900">{it.productName}</span>
                            <span className="ml-2 font-mono text-[11px] text-slate-400">{it.sku}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{it.orderedQuantity}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                            {it.receivedQuantity}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatINR(it.unitCost, 2)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                            {formatINR(it.lineTotal, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create PO Modal */}
      <Modal
        open={createOpen}
        title="Create Purchase Order"
        subtitle="Stock increases only when goods are physically received"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreatePO} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Supplier *</label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Expected Delivery *</label>
              <input
                type="date"
                required
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Initial Status</label>
              <select
                value={poStatus}
                onChange={(e) => setPoStatus(e.target.value as typeof poStatus)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="Draft">Draft</option>
                <option value="Pending Approval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Ordered">Ordered</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Order Line Items</span>
              <button
                type="button"
                onClick={() => {
                  if (products[0]) {
                    setLines((prev) => [
                      ...prev,
                      { productId: products[0]._id, orderedQuantity: 20, unitCost: products[0].costPrice },
                    ]);
                  }
                }}
                className="text-blue-700 font-semibold hover:underline"
              >
                + Add Line
              </button>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={line.productId}
                  onChange={(e) => {
                    const prod = products.find((p) => p._id === e.target.value);
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx
                          ? { ...l, productId: e.target.value, unitCost: prod?.costPrice ?? l.unitCost }
                          : l
                      )
                    );
                  }}
                  className="col-span-6 px-2.5 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={line.orderedQuantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, orderedQuantity: Number(e.target.value) } : l))
                    )
                  }
                  placeholder="Qty"
                  className="col-span-2 px-2.5 py-2 border border-slate-200 rounded-lg font-mono"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.unitCost}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, unitCost: Number(e.target.value) } : l))
                    )
                  }
                  placeholder="Cost ₹"
                  className="col-span-3 px-2.5 py-2 border border-slate-200 rounded-lg font-mono"
                />
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 p-1.5 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Receive Delivery Modal */}
      <Modal
        open={Boolean(receivePO)}
        title={`Receive Delivery · ${receivePO?.poNumber || ''}`}
        subtitle="Enter partial or full quantities received. Receipt ID prevents duplicate stock addition."
        onClose={() => setReceivePO(null)}
      >
        {receivePO && (
          <form onSubmit={handleReceiveSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Unique Delivery / Challan Receipt ID *</label>
                <input
                  required
                  value={receiptId}
                  onChange={(e) => setReceiptId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Delivery Notes</label>
                <input
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="Optional inspection notes"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-right">Receive Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receivePO.items.map((it) => {
                    const pid = typeof it.product === 'object' ? it.product._id : it.product;
                    const remaining = Math.max(0, it.orderedQuantity - it.receivedQuantity);
                    return (
                      <tr key={it._id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{it.productName}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            Ordered: {it.orderedQuantity} · Already received: {it.receivedQuantity}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{remaining}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            disabled={remaining === 0}
                            value={receiveQtys[pid] ?? 0}
                            onChange={(e) =>
                              setReceiveQtys((prev) => ({
                                ...prev,
                                [pid]: Math.min(remaining, Math.max(0, Number(e.target.value))),
                              }))
                            }
                            className="w-24 px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono text-right"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" onClick={() => setReceivePO(null)} className="px-4 py-2 rounded-lg border border-slate-200">
                Cancel
              </button>
              <button
                type="submit"
                disabled={receiving}
                className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold disabled:opacity-60"
              >
                {receiving ? 'Recording Receipt...' : 'Confirm Stock Receipt'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
