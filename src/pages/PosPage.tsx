
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
      setError('');
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
  const discountRatio = subtotal > 0 ? appliedCartDiscount / subtotal : 0;
  const effectiveGst = totalGst * (1 - discountRatio);
  const grandTotal = Math.max(0, subtotal - appliedCartDiscount + effectiveGst);

  const handleCheckout = async () => {
    if (cart.length === 0 || submitting) return;

    setSubmitting(true);

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
    <div className="min-w-0 space-y-4 sm:space-y-5">
      {/* Page heading and tabs */}
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Point of Sale (POS)
          </h1>
          <p className="mt-1 max-w-2xl break-words text-xs leading-relaxed text-slate-500 sm:text-sm">
            Live billing in INR (₹) with GST calculation, atomic stock deduction, and printable invoices
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-slate-200/70 p-1 sm:flex sm:w-auto">
          <button
            type="button"
            onClick={() => setTab('register')}
            className={`min-h-10 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
              tab === 'register'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Billing Register
          </button>

          <button
            type="button"
            onClick={() => setTab('history')}
            className={`min-h-10 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
              tab === 'history'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sales History
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadProducts} />}

      {tab === 'register' ? (
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-12 lg:gap-6">
          {/* Product catalog */}
          <div className="min-w-0 space-y-3 lg:col-span-7 lg:space-y-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name, SKU, or barcode..."
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            {products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No products found. Try another search.
              </div>
            ) : (
              <div className="grid max-h-[520px] min-w-0 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:max-h-[650px]">
                {products.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => addToCart(p)}
                    disabled={p.currentStock <= 0}
                    className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-blue-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-55 sm:p-3.5"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <p className="line-clamp-2 min-w-0 break-words text-xs font-semibold text-slate-900">
                          {p.name}
                        </p>

                        <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-blue-700">
                          {formatINR(p.sellingPrice)}
                        </span>
                      </div>

                      <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                        {p.sku} · GST {p.gstRate}%
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px]">
                      <span className={p.currentStock <= 0 ? 'font-semibold text-rose-700' : 'text-slate-600'}>
                        Stock: <strong className="font-mono tabular-nums">{p.currentStock}</strong> {p.unit}
                      </span>

                      <span className="shrink-0 font-semibold text-blue-700">+ Add</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Billing cart */}
          <div className="pos-cart-panel min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-5 lg:col-span-5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <ShoppingCart className="h-4 w-4 shrink-0 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">Current Invoice</h2>
              </div>

              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {cart.length} line(s)
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs leading-relaxed text-slate-500 sm:py-10">
                Select products from the catalog to build an invoice.
              </div>
            ) : (
              <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.product._id} className="flex min-w-0 flex-col gap-2 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-slate-900">
                        {item.product.name}
                      </p>

                      <p className="mt-0.5 break-words font-mono text-[11px] text-slate-500">
                        {formatINR(item.product.sellingPrice)} × {item.quantity} · GST {item.product.gstRate}%
                      </p>
                    </div>

                    <div className="pos-cart-controls flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discountPercent}
                          onChange={(e) => updateItemDiscount(item.product._id, Number(e.target.value))}
                          title="Line discount %"
                          aria-label={`Discount percentage for ${item.product.name}`}
                          className="min-h-9 w-14 rounded border border-slate-200 px-1.5 text-right font-mono text-xs"
                        />
                        <span className="text-[10px] text-slate-400">%</span>
                      </div>

                      <button
                        type="button"
                        aria-label={`Decrease ${item.product.name} quantity`}
                        onClick={() => updateCartQty(item.product._id, item.quantity - 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>

                      <span className="w-6 text-center font-mono font-semibold tabular-nums">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        aria-label={`Increase ${item.product.name} quantity`}
                        onClick={() => updateCartQty(item.product._id, item.quantity + 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        aria-label={`Remove ${item.product.name}`}
                        onClick={() => updateCartQty(item.product._id, 0)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Customer and payment details */}
            <div className="pos-cart-fields grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 text-xs sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1 block font-medium text-slate-700">Customer Name</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="min-h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                />
              </div>

              <div className="min-w-0">
                <label className="mb-1 block font-medium text-slate-700">Phone (Optional)</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+91..."
                  className="min-h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                />
              </div>

              <div className="min-w-0">
                <label className="mb-1 block font-medium text-slate-700">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="min-h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="NetBanking">NetBanking</option>
                  <option value="Credit">Store Credit</option>
                </select>
              </div>

              <div className="min-w-0">
                <label className="mb-1 block font-medium text-slate-700">Bill Discount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={cartDiscount}
                  onChange={(e) => setCartDiscount(Number(e.target.value))}
                  className="min-h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-sm"
                />
              </div>
            </div>

            {/* Price summary */}
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:p-3.5">
              <div className="flex justify-between gap-3 text-slate-600">
                <span>Taxable Subtotal</span>
                <span className="shrink-0 font-mono tabular-nums">{formatINR(subtotal, 2)}</span>
              </div>

              <div className="flex justify-between gap-3 text-slate-600">
                <span>Bill Discount</span>
                <span className="shrink-0 font-mono tabular-nums text-emerald-700">
                  -{formatINR(appliedCartDiscount, 2)}
                </span>
              </div>

              <div className="flex justify-between gap-3 text-slate-600">
                <span>GST Total</span>
                <span className="shrink-0 font-mono tabular-nums">{formatINR(effectiveGst, 2)}</span>
              </div>

              <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                <span>Final Payable</span>
                <span className="shrink-0 font-mono tabular-nums">{formatINR(grandTotal, 2)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={cart.length === 0 || submitting}
              onClick={handleCheckout}
              className="min-h-11 w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? 'Processing Sale...' : `Complete Sale · ${formatINR(grandTotal, 2)}`}
            </button>
          </div>
        </div>
      ) : (
        /* Sales history */
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {salesHistory.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                icon={Receipt}
                title="No sales recorded yet"
                description="Complete a transaction in the Billing Register to generate GST invoices."
              />
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
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

                      <td className="px-4 py-3 text-slate-600">
                        {formatDateIN(s.saleDate)}
                      </td>

                      <td className="px-4 py-3 text-slate-800">
                        {s.customerName}
                      </td>

                      <td className="px-4 py-3">
                        <StatusTag tone="info" label={s.paymentMethod} />
                      </td>

                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {formatINR(s.gstAmount, 2)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-slate-900">
                        {formatINR(s.totalAmount, 2)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => viewInvoice(s._id)}
                          className="min-h-8 font-medium text-blue-700 hover:underline"
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
          <div className="min-w-0 space-y-4 text-xs">
            <div className="flex flex-col gap-3 text-slate-600 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-semibold text-slate-900">
                  Billed To: {activeInvoice.sale.customerName}
                </p>

                {activeInvoice.sale.customerPhone && (
                  <p className="mt-1 break-all">Phone: {activeInvoice.sale.customerPhone}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="no-print inline-flex min-h-9 w-fit shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Invoice
              </button>
            </div>

            <div className="w-full overflow-x-auto rounded-lg border-y border-slate-200">
              <table className="w-full min-w-[480px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Rate</th>
                    <th className="px-2 py-2 text-right">GST</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {activeInvoice.items.map((it) => (
                    <tr key={it._id}>
                      <td className="max-w-[180px] px-2 py-2">
                        <p className="break-words font-medium text-slate-900">{it.productName}</p>
                        <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{it.sku}</p>
                      </td>

                      <td className="px-2 py-2 text-right font-mono tabular-nums">{it.quantity}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{formatINR(it.unitPrice, 2)}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{formatINR(it.gstAmount, 2)}</td>
                      <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums">{formatINR(it.lineTotal, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-end space-y-2 text-right text-slate-700">
              <div>
                Subtotal: <span className="font-mono">{formatINR(activeInvoice.sale.subtotal, 2)}</span>
              </div>

              <div>
                Discount: <span className="font-mono">-{formatINR(activeInvoice.sale.discountAmount, 2)}</span>
              </div>

              <div>
                Total GST: <span className="font-mono">{formatINR(activeInvoice.sale.gstAmount, 2)}</span>
              </div>

              <div className="border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                Grand Total: <span className="font-mono">{formatINR(activeInvoice.sale.totalAmount, 2)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
