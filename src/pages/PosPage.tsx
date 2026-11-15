import { useEffect, useState, useCallback, useRef } from 'react';
import { Minus, Plus, Printer, Receipt, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { apiFetch, formatDateIN, formatINR } from '../lib/api.ts';
import { Product, SaleRecord } from '../types/index.ts';
import { EmptyState, ErrorBanner, Modal, StatusTag } from '../components/ui.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface CartItem {
  product: Product;
  quantity: number;
  discountPercent: number;
}

interface InvoiceDetail {
  sale: SaleRecord;
  items: Array<{
    _id: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    gstRate: number;
    gstAmount: number;
    lineTotal: number;
  }>;
}

export function PosPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<'register' | 'history'>('register');

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'Cash' | 'Card' | 'NetBanking' | 'Credit'>('UPI');
  const [cartDiscount, setCartDiscount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const checkoutKeyRef = useRef<{ signature: string; key: string } | null>(null);

  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [error, setError] = useState('');

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceDetail | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res = await apiFetch<{ products: Product[] }>(
        `/api/products?limit=60&search=${encodeURIComponent(search)}`
      );
      setProducts(res.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    }
  }, [search]);

  const loadSalesHistory = useCallback(async () => {
    try {
      const res = await apiFetch<{ sales: SaleRecord[] }>('/api/sales?limit=40');
      setSalesHistory(res.sales);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (tab === 'history') loadSalesHistory();
  }, [tab, loadSalesHistory]);

  const addToCart = (p: Product) => {
    if (p.currentStock <= 0) {
      addToast({ type: 'error', title: 'Out of stock', message: `${p.name} has 0 units available.` });
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product._id === p._id);
      if (idx >= 0) {
        const nextQty = prev[idx].quantity + 1;
        if (nextQty > p.currentStock) {
          addToast({
            type: 'error',
            title: 'Insufficient stock',
            message: `Only ${p.currentStock} units available for ${p.name}.`,
          });
          return prev;
        }
        return prev.map((c, i) => (i === idx ? { ...c, quantity: nextQty } : c));
      }
      return [...prev, { product: p, quantity: 1, discountPercent: 0 }];
    });
  };

  const updateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product._id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((c) => {
        if (c.product._id !== productId) return c;
        if (qty > c.product.currentStock) {
          addToast({
            type: 'error',
            title: 'Stock limit reached',
            message: `Only ${c.product.currentStock} units available.`,
          });
          return c;
        }
        return { ...c, quantity: qty };
      })
    );
  };

  const updateItemDiscount = (productId: string, pct: number) => {
    const clamped = Math.min(100, Math.max(0, pct));
    setCart((prev) =>
      prev.map((c) => (c.product._id === productId ? { ...c, discountPercent: clamped } : c))
    );
  };

  // Live GST & Subtotal calculation
  let subtotal = 0;
  let totalGst = 0;
  for (const item of cart) {
    const gross = item.product.sellingPrice * item.quantity;
    const itemDisc = (gross * item.discountPercent) / 100;
    const taxable = Math.max(0, gross - itemDisc);
    const gst = (taxable * item.product.gstRate) / 100;
    subtotal += taxable;
    totalGst += gst;
  }
  const appliedCartDiscount = Math.min(subtotal, Math.max(0, cartDiscount));
  // Matches the server: a cart-level discount reduces taxable value, so GST is reduced proportionally
  const discountRatio = subtotal > 0 ? appliedCartDiscount / subtotal : 0;
  const effectiveGst = totalGst * (1 - discountRatio);
  const grandTotal = Math.max(0, subtotal - appliedCartDiscount + effectiveGst);

  const handleCheckout = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    // One key per checkout attempt: a retry or double-submit of the same cart can never create two invoices
    const signature = JSON.stringify([
      cart.map((c) => [c.product._id, c.quantity, c.discountPercent]),
      appliedCartDiscount,
      paymentMethod,
    ]);
    if (!checkoutKeyRef.current || checkoutKeyRef.current.signature !== signature) {
      checkoutKeyRef.current = {
        signature,
        key: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
      };
    }
    try {
      const res = await apiFetch<InvoiceDetail>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: checkoutKeyRef.current.key,
          customerName: customerName.trim() || 'Walk-in Customer',
          customerPhone: customerPhone.trim() || undefined,
          paymentMethod,
          discountAmount: appliedCartDiscount,
          items: cart.map((c) => ({
            productId: c.product._id,
            quantity: c.quantity,
            discountPercent: c.discountPercent,
          })),
        }),
      });
      addToast({
        type: 'success',
        title: `Sale Completed · ${res.sale.invoiceNumber}`,
        message: `Total ${formatINR(res.sale.totalAmount, 2)} recorded & inventory deducted.`,
      });
      checkoutKeyRef.current = null;
      setCart([]);
      setCartDiscount(0);
      setCustomerName('Walk-in Customer');
      setCustomerPhone('');
      setActiveInvoice(res);
      setInvoiceModalOpen(true);
      await loadProducts();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Checkout rejected',
        message: err instanceof Error ? err.message : 'Unable to complete sale',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const viewInvoice = async (saleId: string) => {
    try {
      const res = await apiFetch<InvoiceDetail>(`/api/sales/${saleId}`);
      setActiveInvoice(res);
      setInvoiceModalOpen(true);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to load invoice',
        message: err instanceof Error ? err.message : 'Error loading invoice',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Point of Sale (POS)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live billing in INR (₹) with GST calculation, atomic stock deduction, and printable invoices
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('register')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Billing Register
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sales History
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadProducts} />}

      {tab === 'register' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Product Picker */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name, SKU, or barcode..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[650px] overflow-y-auto pr-1">
              {products.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => addToCart(p)}
                  disabled={p.currentStock <= 0}
                  className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-blue-400 disabled:opacity-55 disabled:cursor-not-allowed transition-colors flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900 line-clamp-2">{p.name}</p>
                      <span className="font-mono text-xs font-bold text-blue-700 shrink-0 tabular-nums">
                        {formatINR(p.sellingPrice)}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 mt-1">
                      {p.sku} · GST {p.gstRate}%
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                    <span className={p.currentStock <= 0 ? 'text-rose-700 font-semibold' : 'text-slate-600'}>
                      Stock: <strong className="font-mono tabular-nums">{p.currentStock}</strong> {p.unit}
                    </span>
                    <span className="text-blue-700 font-semibold">+ Add</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Billing Cart */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">Current Invoice</h2>
              </div>
              <span className="text-xs text-slate-500 tabular-nums">{cart.length} line(s)</span>
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Select products from the catalog to build an invoice.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.product._id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">{item.product.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {formatINR(item.product.sellingPrice)} × {item.quantity} · GST {item.product.gstRate}%
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.discountPercent}
                        onChange={(e) => updateItemDiscount(item.product._id, Number(e.target.value))}
                        title="Line discount %"
                        className="w-12 px-1.5 py-1 text-[11px] font-mono border border-slate-200 rounded text-right"
                      />
                      <span className="text-[10px] text-slate-400">%</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product._id, item.quantity - 1)}
                        className="p-1 rounded border border-slate-200 hover:bg-slate-50"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center font-mono font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product._id, item.quantity + 1)}
                        className="p-1 rounded border border-slate-200 hover:bg-slate-50"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product._id, 0)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Customer Name</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Phone (Optional)</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+91..."
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="NetBanking">NetBanking</option>
                  <option value="Credit">Store Credit</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Bill Discount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={cartDiscount}
                  onChange={(e) => setCartDiscount(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Taxable Subtotal</span>
                <span className="font-mono tabular-nums">{formatINR(subtotal, 2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Bill Discount</span>
                <span className="font-mono tabular-nums text-emerald-700">-{formatINR(appliedCartDiscount, 2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST Total</span>
                <span className="font-mono tabular-nums">{formatINR(effectiveGst, 2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Final Payable</span>
                <span className="font-mono tabular-nums">{formatINR(grandTotal, 2)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={cart.length === 0 || submitting}
              onClick={handleCheckout}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? 'Processing Sale...' : `Complete Sale · ${formatINR(grandTotal, 2)}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {salesHistory.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Receipt}
                title="No sales recorded yet"
                description="Complete a transaction in the Billing Register to generate GST invoices."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Customer</th>
                    <th className="px-4 py-3 text-left font-semibold">Payment</th>
                    <th className="px-4 py-3 text-right font-semibold">GST</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesHistory.map((s) => (
                    <tr key={s._id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {s.invoiceNumber}
                        {s.isDemoData && <span className="ml-2 text-[10px] text-slate-400">DEMO</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateIN(s.saleDate)}</td>
                      <td className="px-4 py-3 text-slate-800">{s.customerName}</td>
                      <td className="px-4 py-3">
                        <StatusTag tone="info" label={s.paymentMethod} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {formatINR(s.gstAmount, 2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                        {formatINR(s.totalAmount, 2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => viewInvoice(s._id)}
                          className="text-blue-700 hover:underline font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* GST Invoice Modal */}
      <Modal
        open={invoiceModalOpen}
        title={`Tax Invoice · ${activeInvoice?.sale.invoiceNumber || ''}`}
        subtitle={
          activeInvoice
            ? `${formatDateIN(activeInvoice.sale.saleDate)} · Payment: ${activeInvoice.sale.paymentMethod}`
            : undefined
        }
        onClose={() => setInvoiceModalOpen(false)}
      >
        {activeInvoice && (
          <div className="space-y-4 text-xs">
            <div className="flex justify-between text-slate-600">
              <div>
                <p className="font-semibold text-slate-900">Billed To: {activeInvoice.sale.customerName}</p>
                {activeInvoice.sale.customerPhone && <p>Phone: {activeInvoice.sale.customerPhone}</p>}
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium no-print"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Invoice
              </button>
            </div>

            <table className="w-full border-t border-b border-slate-200">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="py-2 px-2 text-left">Item</th>
                  <th className="py-2 px-2 text-right">Qty</th>
                  <th className="py-2 px-2 text-right">Rate</th>
                  <th className="py-2 px-2 text-right">GST</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeInvoice.items.map((it) => (
                  <tr key={it._id}>
                    <td className="py-2 px-2">
                      <p className="font-medium text-slate-900">{it.productName}</p>
                      <p className="text-[11px] font-mono text-slate-500">{it.sku}</p>
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">{it.quantity}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">{formatINR(it.unitPrice, 2)}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">{formatINR(it.gstAmount, 2)}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold">
                      {formatINR(it.lineTotal, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-col items-end space-y-1 text-slate-700">
              <div>Subtotal: <span className="font-mono">{formatINR(activeInvoice.sale.subtotal, 2)}</span></div>
              <div>Discount: <span className="font-mono">-{formatINR(activeInvoice.sale.discountAmount, 2)}</span></div>
              <div>Total GST: <span className="font-mono">{formatINR(activeInvoice.sale.gstAmount, 2)}</span></div>
              <div className="text-sm font-bold text-slate-900 pt-1">
                Grand Total: <span className="font-mono">{formatINR(activeInvoice.sale.totalAmount, 2)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
