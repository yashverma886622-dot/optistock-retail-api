import { useEffect, useState, useCallback } from 'react';
import { BarChart3, Download, FileText, Printer } from 'lucide-react';
import { apiFetch, exportToCSV, exportToPDF } from '../lib/api.ts';
import { Category } from '../types/index.ts';
import { EmptyState, ErrorBanner, SkeletonRows } from '../components/ui.tsx';

const REPORT_OPTIONS = [
  { key: 'sales_performance', label: 'Sales Performance' },
  { key: 'inventory_valuation', label: 'Inventory Valuation' },
  { key: 'stock_movement', label: 'Stock Movement Ledger' },
  { key: 'product_performance', label: 'Product Profitability' },
  { key: 'supplier_performance', label: 'Supplier Performance' },
  { key: 'purchase_orders', label: 'Purchase Orders Summary' },
  { key: 'forecast_accuracy', label: 'Forecast Accuracy Backtest' },
  { key: 'inventory_turnover', label: 'Inventory Turnover & Days Supply' },
  { key: 'dead_stock', label: 'Dead Stock Analysis' },
  { key: 'overstock', label: 'Overstock Capital Analysis' },
  { key: 'stockout_analysis', label: 'Stockout & Reorder Risk Analysis' },
];

export function ReportsPage() {
  const [reportType, setReportType] = useState('sales_performance');
  const [categoryId, setCategoryId] = useState('all');
  const [startDate, setStartDate] = useState(() =>
    new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [categories, setCategories] = useState<Category[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ categories: Category[] }>('/api/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        type: reportType,
        categoryId,
        startDate,
        endDate,
      });
      const res = await apiFetch<{ columns: string[]; rows: Array<Record<string, unknown>> }>(
        `/api/reports?${params.toString()}`
      );
      setColumns(res.columns);
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [reportType, categoryId, startDate, endDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const activeLabel = REPORT_OPTIONS.find((r) => r.key === reportType)?.label || 'Report';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Analytics & Executive Reports</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live MongoDB report builder with CSV, PDF, and print-ready exports
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportToCSV(`optistock-${reportType}`, columns, rows)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() =>
              exportToPDF(
                `OptiStock Retail · ${activeLabel}`,
                `Date Range: ${startDate} to ${endDate}`,
                columns,
                rows,
                `optistock-${reportType}`
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* Report Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs no-print">
        <div>
          <label className="block font-medium text-slate-600 mb-1">Report Module</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
          >
            {REPORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium text-slate-600 mb-1">Category Filter</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium text-slate-600 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block font-medium text-slate-600 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadReport} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{activeLabel}</h2>
          <span className="text-xs text-slate-500 tabular-nums">{rows.length} record(s)</span>
        </div>

        {loading ? (
          <SkeletonRows rows={8} cols={5} />
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={BarChart3}
              title="No records in this report window"
              description="Adjust the date range or category filter to view database records."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {columns.map((col) => {
                      const val = row[col];
                      const isNumeric = typeof val === 'number';
                      return (
                        <td
                          key={col}
                          className={`px-4 py-2.5 whitespace-nowrap ${
                            isNumeric ? 'font-mono tabular-nums text-slate-900' : 'text-slate-700'
                          }`}
                        >
                          {String(val ?? '—')}
                        </td>
                      );
                    })}
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
