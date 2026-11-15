import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { AlertTriangle, TrendingUp, Target, Percent } from 'lucide-react';
import { apiFetch, formatNumber } from '../lib/api.ts';
import { Category, Product } from '../types/index.ts';
import { ErrorBanner, KpiCard, StatusTag } from '../components/ui.tsx';

interface ForecastResponse {
  scope: 'product' | 'category' | 'store';
  forecast: {
    method: string;
    horizonDays: number;
    historicalDaysUsed: number;
    activeSalesDays: number;
    isPreliminary: boolean;
    preliminaryReason?: string;
    avgDailyHistorical: number;
    demandStdDev: number;
    avgDailyForecast: number;
    forecastTotal: number;
    confidenceLow: number;
    confidenceHigh: number;
    trendSlopePerDay: number;
    metrics: {
      mae: number | null;
      rmse: number | null;
      mape: number | null;
      wape: number | null;
      backtestSampleSize: number;
    };
    historicalSeries: Array<{ date: string; quantity: number }>;
    dailySeries: Array<{ date: string; forecast: number; lower: number; upper: number; seasonalMultiplier: number }>;
  };
  modelComparison: Array<{
    method: string;
    forecastTotal: number;
    avgDailyForecast: number;
    metrics: { mae: number | null; rmse: number | null; mape: number | null; wape: number | null };
    isPreliminary: boolean;
  }>;
}

const METHOD_LABELS: Record<string, string> = {
  SMA: 'Simple Moving Average (SMA)',
  WMA: 'Weighted Moving Average (WMA)',
  EXPONENTIAL_SMOOTHING: 'Exponential Smoothing (SES)',
  TREND_SEASONAL: 'Trend + Seasonal Adjustment',
};

export function ForecastingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [scope, setScope] = useState<'product' | 'category'>('product');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [horizon, setHorizon] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [method, setMethod] = useState('TREND_SEASONAL');

  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ products: Product[] }>('/api/products?limit=100'),
      apiFetch<{ categories: Category[] }>('/api/categories'),
    ])
      .then(([pRes, cRes]) => {
        setProducts(pRes.products);
        setCategories(cRes.categories);
        if (pRes.products.length > 0) {
          setSelectedProduct(pRes.products[0]._id);
        }
      })
      .catch(() => {});
  }, []);

  const loadForecast = useCallback(async () => {
    if (scope === 'product' && !selectedProduct) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        horizon: String(horizon),
        method,
      });
      if (scope === 'product') params.set('productId', selectedProduct);
      else params.set('categoryId', selectedCategory);

      const res = await apiFetch<ForecastResponse>(`/api/forecasts?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate forecast');
    } finally {
      setLoading(false);
    }
  }, [scope, selectedProduct, selectedCategory, horizon, method]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  const combinedChartData = data
    ? [
        ...data.forecast.historicalSeries.slice(-45).map((h) => ({
          date: h.date,
          actual: h.quantity,
          forecast: null as number | null,
          band: null as [number, number] | null,
        })),
        ...data.forecast.dailySeries.map((f) => ({
          date: f.date,
          actual: null as number | null,
          forecast: f.forecast,
          band: [f.lower, f.upper] as [number, number],
        })),
      ]
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Statistical Demand Forecasting</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Real historical sales backtesting with SMA, WMA, Exponential Smoothing, and Trend + Seasonal Adjustment
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <div>
          <label className="block font-medium text-slate-600 mb-1">Forecast Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'product' | 'category')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
          >
            <option value="product">Product-wise Forecast</option>
            <option value="category">Category / Store-wide</option>
          </select>
        </div>

        {scope === 'product' ? (
          <div className="lg:col-span-2">
            <label className="block font-medium text-slate-600 mb-1">Select Product</label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
            >
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="lg:col-span-2">
            <label className="block font-medium text-slate-600 mb-1">Select Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
            >
              <option value="all">All Store Categories (Aggregate)</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block font-medium text-slate-600 mb-1">Forecast Horizon</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value) as typeof horizon)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
          >
            <option value={7}>7 Days</option>
            <option value={14}>14 Days</option>
            <option value={30}>30 Days</option>
            <option value={60}>60 Days</option>
            <option value={90}>90 Days</option>
          </select>
        </div>

        <div>
          <label className="block font-medium text-slate-600 mb-1">Statistical Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
          >
            <option value="TREND_SEASONAL">Trend + Seasonal</option>
            <option value="EXPONENTIAL_SMOOTHING">Exponential Smoothing</option>
            <option value="WMA">Weighted Moving Avg</option>
            <option value="SMA">Simple Moving Avg</option>
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadForecast} />}

      {data && (
        <>
          {data.forecast.isPreliminary && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Preliminary Forecast Notice</p>
                <p className="mt-0.5">{data.forecast.preliminaryReason}</p>
              </div>
            </div>
          )}

          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              label={`Forecasted Demand (${horizon}d)`}
              value={`${formatNumber(data.forecast.forecastTotal, 1)} units`}
              subtext={`95% CI: ${formatNumber(data.forecast.confidenceLow, 0)} – ${formatNumber(data.forecast.confidenceHigh, 0)}`}
              tone="blue"
            />
            <KpiCard
              label="Avg Daily Forecast"
          icon={TrendingUp}
              value={`${formatNumber(data.forecast.avgDailyForecast, 2)} / day`}
              subtext={`Hist. mean: ${formatNumber(data.forecast.avgDailyHistorical, 2)} / day`}
            />
            <KpiCard
              label="Backtest MAE"
          icon={Target}
              value={data.forecast.metrics.mae !== null ? `${data.forecast.metrics.mae}` : 'N/A'}
              subtext={`Holdout sample: ${data.forecast.metrics.backtestSampleSize} days`}
            />
            <KpiCard
              label="Backtest RMSE"
          icon={Target}
              value={data.forecast.metrics.rmse !== null ? `${data.forecast.metrics.rmse}` : 'N/A'}
              subtext={`Demand σ: ${data.forecast.demandStdDev}`}
            />
            <KpiCard
              label="WAPE / MAPE"
          icon={Percent}
              value={
                data.forecast.metrics.wape !== null
                  ? `${data.forecast.metrics.wape}%`
                  : 'N/A'
              }
              subtext={
                data.forecast.metrics.mape !== null
                  ? `MAPE: ${data.forecast.metrics.mape}%`
                  : 'Insufficient positive days'
              }
            />
          </div>

          {/* Forecast Chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-700" />
                  Historical Actuals vs {METHOD_LABELS[data.forecast.method]}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Last 45 days actual demand + next {horizon} days forecast with 95% confidence envelope
                </p>
              </div>
              <StatusTag
                tone={data.forecast.isPreliminary ? 'warning' : 'success'}
                label={data.forecast.isPreliminary ? 'Preliminary' : `${data.forecast.activeSalesDays} Active Days`}
              />
            </div>

            {loading ? (
              <div className="h-80 bg-slate-50 rounded-lg animate-pulse" />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={combinedChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="band"
                      name="95% Confidence Band"
                      stroke="none"
                      fill="#bfdbfe"
                      fillOpacity={0.45}
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Historical Actual"
                      stroke="#0f172a"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      name="Forecasted Demand"
                      stroke="#1d4ed8"
                      strokeWidth={2.5}
                      strokeDasharray="5 3"
                      dot={false}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Model Comparison Table (Real Holdout Backtesting) */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Model Accuracy Backtesting Comparison ({horizon}-Day Horizon)
              </h2>
              <p className="text-xs text-slate-500">
                Computed dynamically via walk-forward holdout validation on historical sales records
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Forecasting Model</th>
                    <th className="px-4 py-3 text-right font-semibold">Projected {horizon}d Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Avg Daily</th>
                    <th className="px-4 py-3 text-right font-semibold">MAE</th>
                    <th className="px-4 py-3 text-right font-semibold">RMSE</th>
                    <th className="px-4 py-3 text-right font-semibold">MAPE</th>
                    <th className="px-4 py-3 text-right font-semibold">WAPE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.modelComparison.map((m) => (
                    <tr
                      key={m.method}
                      className={m.method === method ? 'bg-blue-50/50 font-medium' : 'hover:bg-slate-50'}
                    >
                      <td className="px-4 py-3 text-slate-900">
                        {METHOD_LABELS[m.method] || m.method}
                        {m.method === method && (
                          <span className="ml-2 text-[11px] font-semibold text-blue-700">(Active)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatNumber(m.forecastTotal, 1)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatNumber(m.avgDailyForecast, 2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {m.metrics.mae ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {m.metrics.rmse ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {m.metrics.mape !== null ? `${m.metrics.mape}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {m.metrics.wape !== null ? `${m.metrics.wape}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
