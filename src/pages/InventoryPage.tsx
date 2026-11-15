import React, { useEffect, useState, useCallback } from 'react';
import { ArrowDownUp, Search, Warehouse, Wallet, IndianRupee, AlertTriangle, CalendarClock } from 'lucide-react';
import { apiFetch, formatDateIN, formatINR, formatNumber } from '../lib/api.ts';
import { InventoryTransaction, Product } from '../types/index.ts';
import { EmptyState, ErrorBanner, KpiCard, Modal, SkeletonRows, StatusTag } from '../components/ui.tsx';
import { useToast } from '../context/ToastContext.tsx';

export function InventoryPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<'stock' | 'ledger'>('stock');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [summary, setSummary] = useState({
    totalSkus: 0,
    totalCostValuation: 0,
    totalRetailValuation: 0,
    potentialMargin: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    expiringSoonCount: 0,
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [moveOpen, setMoveOpen] = useState(false);
  const [selectedProd, setSelectedProd] = useState<Product | null>(null);
  const [moveForm, setMoveForm] = useState({
    type: 'STOCK_IN' as 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN',
    quantity: 10,
    newAbsoluteStock: 0,
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invRes, txRes] = await Promise.all([
        apiFetch<{ summary: typeof summary; products: Product[] }>(
          `/api/inventory?filter=${filter}&search=${encodeURIComponent(search)}`
        ),
        apiFetch<{ transactions: InventoryTransaction[] }>(
          `/api/inventory/transactions?limit=50&type=${txTypeFilter}`
        ),
      ]);
      setSummary(invRes.summary);
      setProducts(invRes.products);
      setTransactions(txRes.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  }, [filter, search, txTypeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openMovementModal = (p: Product) => {
    setSelectedProd(p);
    setMoveForm({
      type: 'STOCK_IN',
      quantity: 10,
      newAbsoluteStock: p.currentStock,
      reason: '',
    });
    setMoveOpen(true);
  };

  const handleSubmitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProd) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/inventory/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: selectedProd._id,
          type: moveForm.type,
          quantity: moveForm.type === 'ADJUSTMENT' ? 1 : moveForm.quantity,
          newAbsoluteStock: moveForm.type === 'ADJUSTMENT' ? moveForm.newAbsoluteStock : undefined,
          reason: moveForm.reason,
        }),
      });
      addToast({ type: 'success', title: 'Stock updated', message: `${selectedProd.name} ledger recorded.` });
      setMoveOpen(false);
      await loadData();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Movement failed',
        message: err instanceof Error ? err.message : 'Unable to update stock',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Inventory Control & Valuation</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Atomic stock movements, expiry monitoring, damaged stock tracking, and full transaction ledger
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('stock')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === 'stock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stock Levels & Valuation
          </button>
          <button
            type="button"
            onClick={() => setTab('ledger')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === 'ledger' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Transaction Ledger ({transactions.length})
          </button>
        </div>
      </div>

      {/* Valuation & Health KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Wallet} label="Cost Valuation" value={formatINR(summary.totalCostValuation)} subtext={`${summary.totalSkus} active SKUs`} tone="blue" />
        <KpiCard icon={IndianRupee} label="Retail Valuation" value={formatINR(summary.totalRetailValuation)} subtext={`Margin: ${formatINR(summary.potentialMargin)}`} />
        <KpiCard
          label="Low / Out of Stock"
          icon={AlertTriangle}
          value={`${summary.lowStockCount} / ${summary.outOfStockCount}`}
          subtext="Low stock · Out of stock"
          tone={summary.outOfStockCount > 0 ? 'danger' : 'warning'}
        />
        <KpiCard
          label="Expiring Within 30d"
          icon={CalendarClock}
          value={formatNumber(summary.expiringSoonCount)}
          subtext="Perishable stock watchlist"
          tone={summary.expiringSoonCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {tab === 'stock' ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'all', label: 'All SKUs' },
                { key: 'low_stock', label: 'Low Stock' },
                { key: 'out_of_stock', label: 'Out of Stock' },
                { key: 'expiring', label: 'Expiring ≤ 30d' },
                { key: 'overstock', label: 'Overstock' },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    filter === f.key
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter SKU or product..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {loading ? (
              <SkeletonRows rows={8} cols={6} />
            ) : products.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Warehouse}
                  title="No inventory items found"
                  description="Adjust your filter criteria to inspect stock levels."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">SKU & Product</th>
                      <th className="px-4 py-3 text-right font-semibold">Current Stock</th>
                      <th className="px-4 py-3 text-right font-semibold">Reorder / Max</th>
                      <th className="px-4 py-3 text-right font-semibold">Stock Cost Value</th>
                      <th className="px-4 py-3 text-left font-semibold">Expiry</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((p) => (
                      <tr key={p._id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{p.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {p.currentStock} {p.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                          {p.reorderLevel} / {p.maxStock}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                          {formatINR(p.currentStock * p.costPrice)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {p.expiryDate ? formatDateIN(p.expiryDate) : 'Non-perishable'}
                        </td>
                        <td className="px-4 py-3">
                          {p.currentStock <= 0 ? (
                            <StatusTag tone="danger" label="Out of Stock" />
                          ) : p.currentStock <= p.reorderLevel ? (
                            <StatusTag tone="warning" label="Low Stock" />
                          ) : p.currentStock > p.maxStock ? (
                            <StatusTag tone="info" label="Overstock" />
                          ) : (
                            <StatusTag tone="success" label="Nominal" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openMovementModal(p)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium whitespace-nowrap"
                          >
                            <ArrowDownUp className="h-3.5 w-3.5" />
                            Adjust
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-600">Filter Movement Type</span>
            <select
              value={txTypeFilter}
              onChange={(e) => setTxTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="all">All Movements</option>
              <option value="STOCK_IN">Stock In</option>
              <option value="STOCK_OUT">Stock Out</option>
              <option value="SALE">POS Sale</option>
              <option value="PO_RECEIPT">PO Receipt</option>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="DAMAGE">Damage / Wastage</option>
              <option value="RETURN">Customer Return</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Product</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-right font-semibold">Change</th>
                    <th className="px-4 py-3 text-right font-semibold">Prev → New</th>
                    <th className="px-4 py-3 text-left font-semibold">Reference / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => (
                    <tr key={tx._id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {formatDateIN(tx.transactionDate)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {typeof tx.product === 'object' ? tx.product.name : 'SKU'}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {typeof tx.product === 'object' ? tx.product.sku : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusTag
                          tone={
                            tx.type === 'DAMAGE' || tx.type === 'STOCK_OUT'
                              ? 'warning'
                              : tx.type === 'PO_RECEIPT' || tx.type === 'STOCK_IN'
                              ? 'success'
                              : 'neutral'
                          }
                          label={tx.type}
                        />
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                          tx.quantityChange >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {tx.quantityChange >= 0 ? `+${tx.quantityChange}` : tx.quantityChange}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {tx.previousStock} → {tx.newStock}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                        {tx.referenceId ? `${tx.referenceId} · ` : ''}
                        {tx.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Stock Movement Modal */}
      <Modal
        open={moveOpen}
        title={`Stock Movement · ${selectedProd?.name || ''}`}
        subtitle={
          selectedProd
            ? `SKU: ${selectedProd.sku} · Current Stock: ${selectedProd.currentStock} ${selectedProd.unit}`
            : undefined
        }
        onClose={() => setMoveOpen(false)}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmitMovement} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Movement Type</label>
            <select
              value={moveForm.type}
              onChange={(e) =>
                setMoveForm({
                  ...moveForm,
                  type: e.target.value as typeof moveForm.type,
                })
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
            >
              <option value="STOCK_IN">Stock In (Add Inventory)</option>
              <option value="STOCK_OUT">Stock Out (Remove Inventory)</option>
              <option value="ADJUSTMENT">Audit Adjustment (Set Exact Count)</option>
              <option value="DAMAGE">Damaged / Expired Write-off</option>
              <option value="RETURN">Customer Return (Restock)</option>
            </select>
          </div>

          {moveForm.type === 'ADJUSTMENT' ? (
            <div>
              <label className="block font-medium text-slate-700 mb-1">New Physical Stock Count</label>
              <input
                type="number"
                min="0"
                required
                value={moveForm.newAbsoluteStock}
                onChange={(e) => setMoveForm({ ...moveForm, newAbsoluteStock: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
          ) : (
            <div>
              <label className="block font-medium text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                required
                value={moveForm.quantity}
                onChange={(e) => setMoveForm({ ...moveForm, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">Audit Reason *</label>
            <input
              required
              value={moveForm.reason}
              onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
              placeholder="e.g., Physical cycle count reconciliation, damaged packaging..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMoveOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-60"
            >
              {submitting ? 'Recording...' : 'Record Stock Movement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
