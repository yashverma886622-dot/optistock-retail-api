import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, Eye, ArrowUpDown, Package } from 'lucide-react';
import { apiFetch, formatDateIN, formatINR } from '../lib/api.ts';
import { Category, Product, Supplier } from '../types/index.ts';
import { EmptyState, ErrorBanner, Modal, SkeletonRows, StatusTag } from '../components/ui.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useConfirm } from '../context/ConfirmContext.tsx';

const EMPTY_FORM = {
  name: '',
  sku: '',
  barcode: '',
  description: '',
  category: '',
  brand: '',
  unit: 'pcs',
  costPrice: 100,
  sellingPrice: 130,
  gstRate: 12,
  currentStock: 0,
  minStock: 10,
  maxStock: 200,
  reorderLevel: 25,
  supplier: '',
  leadTimeDays: 5,
  expiryDate: '',
  orderingCost: 500,
  holdingCostRate: 0.2,
  serviceLevel: 95,
  minOrderQuantity: 10,
};

export function ProductsPage() {
  const { hasRole } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [stockReason, setStockReason] = useState('Initial stock correction from product catalog');
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const canEdit = hasRole('Admin', 'Manager');
  const canDelete = hasRole('Admin');

  const loadMeta = useCallback(async () => {
    try {
      const catRes = await apiFetch<{ categories: Category[] }>('/api/categories');
      setCategories(catRes.categories);
      if (hasRole('Admin', 'Manager')) {
        const supRes = await apiFetch<{ suppliers: Supplier[] }>('/api/suppliers');
        setSuppliers(supRes.suppliers);
      }
    } catch {
      // handled in main load
    }
  }, [hasRole]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        sortBy,
        sortOrder,
      });
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (stockFilter !== 'all') params.set('stockStatus', stockFilter);

      const res = await apiFetch<{
        products: Product[];
        pagination: { page: number; totalPages: number; total: number };
      }>(`/api/products?${params.toString()}`);

      setProducts(res.products);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, stockFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setStockReason('Opening stock entry');
    setForm({
      ...EMPTY_FORM,
      category: categories[0]?._id || '',
      supplier: suppliers[0]?._id || '',
    });
    setModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingId(p._id);
    setStockReason('Manual stock correction from product catalog');
    setForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      description: p.description || '',
      category: typeof p.category === 'object' ? p.category._id : p.category,
      brand: p.brand,
      unit: p.unit,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      gstRate: p.gstRate,
      currentStock: p.currentStock,
      minStock: p.minStock,
      maxStock: p.maxStock,
      reorderLevel: p.reorderLevel,
      supplier: typeof p.supplier === 'object' ? p.supplier._id : p.supplier,
      leadTimeDays: p.leadTimeDays,
      expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : '',
      orderingCost: p.orderingCost,
      holdingCostRate: p.holdingCostRate,
      serviceLevel: p.serviceLevel,
      minOrderQuantity: p.minOrderQuantity,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        expiryDate: form.expiryDate ? form.expiryDate : null,
      };
      if (editingId) {
        const existingProduct = products.find((product) => product._id === editingId);
        await apiFetch(`/api/products/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        // Stock changes must go through the inventory movement API so the ledger stays accurate.
        if (existingProduct && Number(form.currentStock) !== Number(existingProduct.currentStock)) {
          await apiFetch('/api/inventory/movements', {
            method: 'POST',
            body: JSON.stringify({
              productId: editingId,
              type: 'ADJUSTMENT',
              newAbsoluteStock: Number(form.currentStock),
              reason: stockReason.trim() || 'Manual stock correction from product catalog',
            }),
          });
        }
        addToast({ type: 'success', title: 'Product updated', message: 'Product details and stock have been saved.' });
      } else {
        await apiFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        addToast({ type: 'success', title: 'Product created' });
      }
      setModalOpen(false);
      await loadProducts();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Could not save product',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Product) => {
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      message: 'Products with sales or stock history are archived instead of permanently removed.',
      confirmLabel: 'Delete product',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await apiFetch<{ message: string }>(`/api/products/${p._id}`, {
        method: 'DELETE',
      });
      addToast({ type: 'info', title: 'Product removed', message: res.message });
      await loadProducts();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Unable to delete product',
      });
    }
  };

  const getStockTag = (p: Product) => {
    if (p.currentStock <= 0) return <StatusTag tone="danger" label="Out of Stock" />;
    if (p.currentStock <= p.reorderLevel) return <StatusTag tone="warning" label="Low Stock" />;
    if (p.currentStock > p.maxStock) return <StatusTag tone="info" label="Overstock" />;
    return <StatusTag tone="success" label="Healthy" />;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Product Catalog</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {total} active SKUs · Unique SKU enforcement, GST rates, and replenishment thresholds
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by product name, SKU, brand, or barcode..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={stockFilter}
          onChange={(e) => {
            setStockFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="all">All Stock Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="overstock">Overstock</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadProducts} />}

      {/* Products Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <SkeletonRows rows={8} cols={7} />
        ) : products.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Package}
              title="No products match your filters"
              description="Try clearing search filters or add a new SKU to the catalog."
              actionLabel={canEdit ? 'Add First Product' : undefined}
              onAction={canEdit ? openCreateModal : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Product <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Category · Supplier</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <button type="button" onClick={() => toggleSort('costPrice')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Cost <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <button type="button" onClick={() => toggleSort('sellingPrice')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Price <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <button type="button" onClick={() => toggleSort('currentStock')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Stock <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {p.sku} · {p.brand} · GST {p.gstRate}%
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800">
                        {typeof p.category === 'object' ? p.category.name : '—'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {typeof p.supplier === 'object' ? p.supplier.name : '—'} · {p.leadTimeDays}d lead
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {formatINR(p.costPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatINR(p.sellingPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className="font-semibold text-slate-900">{p.currentStock}</span>
                      <span className="text-slate-400"> / {p.reorderLevel} rop</span>
                    </td>
                    <td className="px-4 py-3">{getStockTag(p)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailProduct(p);
                            setDetailOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                          title="View Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                            title="Edit Product"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50"
                            title="Delete / Archive Product"
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>
              Page {page} of {totalPages} ({total} products)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        title={editingId ? 'Edit Product' : 'Add New Product'}
        subtitle="All monetary values are in Indian Rupees (₹)"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Product Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">SKU (Unique) *</label>
              <input
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Barcode / EAN</label>
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Category *</label>
              <select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Primary Supplier *</label>
              <select
                required
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.averageLeadTimeDays}d)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Brand *</label>
              <input
                required
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Unit *</label>
              <input
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="pcs, kg, bag, bottle"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Cost Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Selling Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">GST Rate (%)</label>
              <input
                type="number"
                min="0"
                max="28"
                value={form.gstRate}
                onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">{editingId ? 'Current Stock' : 'Opening Stock'}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.currentStock}
                onChange={(e) => setForm({ ...form, currentStock: Math.max(0, Number(e.target.value)) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                {editingId ? 'Set the actual available quantity. Changes are recorded in the inventory ledger.' : 'Initial quantity available in your store.'}
              </p>
            </div>
            {editingId && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">Stock Adjustment Reason</label>
                <input
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                  placeholder="e.g. Physical stock count / Opening balance"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
            )}
            <div>
              <label className="block font-medium text-slate-700 mb-1">Min Stock</label>
              <input
                type="number"
                min="0"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Reorder Level</label>
              <input
                type="number"
                min="0"
                value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Max Stock</label>
              <input
                type="number"
                min="1"
                value={form.maxStock}
                onChange={(e) => setForm({ ...form, maxStock: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Lead Time (Days)</label>
              <input
                type="number"
                min="1"
                value={form.leadTimeDays}
                onChange={(e) => setForm({ ...form, leadTimeDays: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Expiry Date (Optional)</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
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
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Product Detail Modal */}
      <Modal
        open={detailOpen}
        title={detailProduct?.name || 'Product Details'}
        subtitle={detailProduct ? `SKU: ${detailProduct.sku} · Brand: ${detailProduct.brand}` : undefined}
        onClose={() => setDetailOpen(false)}
      >
        {detailProduct && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Current Stock</p>
                <p className="text-base font-bold font-mono text-slate-900 mt-0.5">
                  {detailProduct.currentStock} {detailProduct.unit}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Cost / Selling</p>
                <p className="text-base font-bold font-mono text-slate-900 mt-0.5">
                  {formatINR(detailProduct.costPrice)} / {formatINR(detailProduct.sellingPrice)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Reorder / Max</p>
                <p className="text-base font-bold font-mono text-slate-900 mt-0.5">
                  {detailProduct.reorderLevel} / {detailProduct.maxStock}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-slate-700">
              <div><span className="text-slate-500">Barcode:</span> <span className="font-mono">{detailProduct.barcode || '—'}</span></div>
              <div><span className="text-slate-500">GST Rate:</span> {detailProduct.gstRate}%</div>
              <div><span className="text-slate-500">Lead Time:</span> {detailProduct.leadTimeDays} days</div>
              <div><span className="text-slate-500">Service Level:</span> {detailProduct.serviceLevel}%</div>
              <div><span className="text-slate-500">Expiry Date:</span> {formatDateIN(detailProduct.expiryDate)}</div>
              <div><span className="text-slate-500">Created:</span> {formatDateIN(detailProduct.createdAt)}</div>
            </div>
            {detailProduct.description && (
              <p className="text-slate-600 border-t border-slate-100 pt-3">{detailProduct.description}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
