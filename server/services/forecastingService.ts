export type ForecastMethodKey = 'SMA' | 'WMA' | 'EXPONENTIAL_SMOOTHING' | 'TREND_SEASONAL';

export interface DailyObservation {
  date: string; // YYYY-MM-DD
  quantity: number;
}

export interface ForecastPoint {
  date: string;
  forecast: number;
  lower: number;
  upper: number;
  seasonalMultiplier: number;
}

export interface BacktestMetrics {
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  wape: number | null;
  backtestSampleSize: number;
}

export interface ForecastResult {
  method: ForecastMethodKey;
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
  metrics: BacktestMetrics;
  historicalSeries: DailyObservation[];
  dailySeries: ForecastPoint[];
}

function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildContinuousSeries(
  sparse: DailyObservation[],
  lookbackDays = 90,
  endDateISO?: string
): DailyObservation[] {
  const end = endDateISO || new Date().toISOString().slice(0, 10);
  const start = addDaysISO(end, -(lookbackDays - 1));
  const map = new Map<string, number>();

  for (const item of sparse) {
    const key = item.date.slice(0, 10);
    map.set(key, (map.get(key) || 0) + Math.max(0, Number(item.quantity) || 0));
  }

  const series: DailyObservation[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    const d = addDaysISO(start, i);
    series.push({ date: d, quantity: map.get(d) || 0 });
  }
  return series;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function computeOLS(values: number[]): { intercept: number; slope: number } {
  const n = values.length;
  if (n <= 1) return { intercept: values[0] || 0, slope: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { intercept: sumY / n, slope: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { intercept, slope };
}

function computeDayOfWeekIndices(series: DailyObservation[]): number[] {
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (const point of series) {
    const dow = new Date(`${point.date}T00:00:00.000Z`).getUTCDay();
    sums[dow] += point.quantity;
    counts[dow] += 1;
  }
  const overallAvg = mean(series.map((s) => s.quantity));
  if (overallAvg <= 0) return new Array(7).fill(1);
  return sums.map((s, idx) => {
    if (counts[idx] === 0) return 1;
    const ratio = s / counts[idx] / overallAvg;
    // Clamp day-of-week index to reasonable retail bounds [0.65, 1.45]
    return Math.min(1.45, Math.max(0.65, ratio));
  });
}

function predictSingleMethod(
  train: DailyObservation[],
  horizon: number,
  method: ForecastMethodKey,
  futureDates: string[],
  seasonalMultipliers?: Record<string, number>
): { predictions: number[]; slope: number } {
  const vals = train.map((d) => d.quantity);
  const n = vals.length;

  if (n === 0) {
    return { predictions: new Array(horizon).fill(0), slope: 0 };
  }

  const window = Math.min(14, Math.max(3, Math.floor(n / 3) || 3));
  const recent = vals.slice(-window);

  if (method === 'SMA') {
    const base = mean(recent);
    return {
      predictions: futureDates.map((d) => {
        const mult = seasonalMultipliers?.[d] ?? 1;
        return Math.max(0, base * mult);
      }),
      slope: 0,
    };
  }

  if (method === 'WMA') {
    let weightSum = 0;
    let weighted = 0;
    recent.forEach((v, idx) => {
      const w = idx + 1;
      weighted += v * w;
      weightSum += w;
    });
    const base = weightSum > 0 ? weighted / weightSum : 0;
    return {
      predictions: futureDates.map((d) => {
        const mult = seasonalMultipliers?.[d] ?? 1;
        return Math.max(0, base * mult);
      }),
      slope: 0,
    };
  }

  if (method === 'EXPONENTIAL_SMOOTHING') {
    const alphas = n >= 14 ? [0.15, 0.25, 0.35, 0.45] : [0.3];
    let bestAlpha = 0.3;
    let bestMSE = Number.POSITIVE_INFINITY;

    for (const alpha of alphas) {
      let level = vals[0];
      let sqErr = 0;
      for (let i = 1; i < n; i++) {
        const err = vals[i] - level;
        sqErr += err * err;
        level = alpha * vals[i] + (1 - alpha) * level;
      }
      const mse = sqErr / Math.max(1, n - 1);
      if (mse < bestMSE) {
        bestMSE = mse;
        bestAlpha = alpha;
      }
    }

    let level = vals[0];
    for (let i = 1; i < n; i++) {
      level = bestAlpha * vals[i] + (1 - bestAlpha) * level;
    }

    return {
      predictions: futureDates.map((d) => {
        const mult = seasonalMultipliers?.[d] ?? 1;
        return Math.max(0, level * mult);
      }),
      slope: 0,
    };
  }

  // TREND_SEASONAL: OLS Trend + Day-of-Week Seasonality + Festival Multipliers
  const { intercept, slope } = computeOLS(vals);
  const dowIndices = n >= 14 ? computeDayOfWeekIndices(train) : new Array(7).fill(1);
  // Dampen slope slightly for long horizons so linear trend doesn't explode unrealistically
  const dampedSlope = Math.max(-mean(vals) * 0.03, Math.min(mean(vals) * 0.03, slope));

  const predictions = futureDates.map((d, hIdx) => {
    const t = n + hIdx;
    const trendVal = Math.max(0, intercept + dampedSlope * t * 0.85);
    const dow = new Date(`${d}T00:00:00.000Z`).getUTCDay();
    const dowMult = dowIndices[dow] ?? 1;
    const eventMult = seasonalMultipliers?.[d] ?? 1;
    return Math.max(0, trendVal * dowMult * eventMult);
  });

  return { predictions, slope: dampedSlope };
}

function calculateBacktestMetrics(
  series: DailyObservation[],
  method: ForecastMethodKey
): BacktestMetrics {
  const n = series.length;
  if (n < 10) {
    return { mae: null, rmse: null, mape: null, wape: null, backtestSampleSize: 0 };
  }

  const testSize = Math.min(14, Math.max(3, Math.floor(n * 0.2)));
  const splitIdx = n - testSize;
  const train = series.slice(0, splitIdx);
  const test = series.slice(splitIdx);

  const testDates = test.map((t) => t.date);
  const { predictions } = predictSingleMethod(train, testSize, method, testDates);

  let absErrSum = 0;
  let sqErrSum = 0;
  let actualSum = 0;
  let pctErrSum = 0;
  let positiveActualCount = 0;

  for (let i = 0; i < test.length; i++) {
    const actual = test[i].quantity;
    const pred = predictions[i];
    const absErr = Math.abs(actual - pred);
    absErrSum += absErr;
    sqErrSum += (actual - pred) ** 2;
    actualSum += actual;
    if (actual > 0) {
      pctErrSum += absErr / actual;
      positiveActualCount += 1;
    }
  }

  const mae = Number((absErrSum / test.length).toFixed(3));
  const rmse = Number(Math.sqrt(sqErrSum / test.length).toFixed(3));
  const mape = positiveActualCount > 0 ? Number(((pctErrSum / positiveActualCount) * 100).toFixed(2)) : null;
  const wape = actualSum > 0 ? Number(((absErrSum / actualSum) * 100).toFixed(2)) : null;

  return {
    mae,
    rmse,
    mape,
    wape,
    backtestSampleSize: test.length,
  };
}

export function generateDemandForecast(params: {
  observations: DailyObservation[];
  horizonDays: 7 | 14 | 30 | 60 | 90;
  method: ForecastMethodKey;
  lookbackDays?: number;
  seasonalMultipliers?: Record<string, number>;
}): ForecastResult {
  const lookback = params.lookbackDays ?? 90;
  const continuous = buildContinuousSeries(params.observations, lookback);
  const activeSalesDays = continuous.filter((d) => d.quantity > 0).length;

  const isPreliminary = activeSalesDays < 5 || continuous.length < 14;
  let preliminaryReason: string | undefined;
  if (activeSalesDays === 0) {
    preliminaryReason = 'No historical sales recorded in lookback window; forecast defaults to zero demand.';
  } else if (activeSalesDays < 5) {
    preliminaryReason = `Only ${activeSalesDays} day(s) with recorded sales. At least 5–14 active days are needed for reliable error bounds.`;
  }

  const vals = continuous.map((d) => d.quantity);
  const avgDailyHistorical = Number(mean(vals).toFixed(3));
  const demandStdDev = Number(stdDev(vals).toFixed(3));

  const lastDate = continuous[continuous.length - 1]?.date || new Date().toISOString().slice(0, 10);
  const futureDates: string[] = [];
  for (let i = 1; i <= params.horizonDays; i++) {
    futureDates.push(addDaysISO(lastDate, i));
  }

  const { predictions, slope } = predictSingleMethod(
    continuous,
    params.horizonDays,
    params.method,
    futureDates,
    params.seasonalMultipliers
  );

  const metrics = calculateBacktestMetrics(continuous, params.method);
  const errorScale = metrics.rmse !== null && metrics.rmse > 0 ? metrics.rmse : demandStdDev;

  const dailySeries: ForecastPoint[] = futureDates.map((date, idx) => {
    const f = predictions[idx];
    const z95 = 1.96;
    // Uncertainty grows mildly with sqrt of step (capped for stability)
    const stepSpread = z95 * errorScale * Math.sqrt(1 + idx * 0.08);
    const lower = Math.max(0, Number((f - stepSpread * 0.55).toFixed(2)));
    const upper = Number((f + stepSpread * 0.55).toFixed(2));
    return {
      date,
      forecast: Number(f.toFixed(2)),
      lower,
      upper,
      seasonalMultiplier: Number((params.seasonalMultipliers?.[date] ?? 1).toFixed(2)),
    };
  });

  const forecastTotal = Number(dailySeries.reduce((acc, p) => acc + p.forecast, 0).toFixed(2));
  const avgDailyForecast = Number((forecastTotal / params.horizonDays).toFixed(3));
  const totalMargin = 1.96 * errorScale * Math.sqrt(params.horizonDays);
  const confidenceLow = Math.max(0, Number((forecastTotal - totalMargin).toFixed(2)));
  const confidenceHigh = Number((forecastTotal + totalMargin).toFixed(2));

  return {
    method: params.method,
    horizonDays: params.horizonDays,
    historicalDaysUsed: continuous.length,
    activeSalesDays,
    isPreliminary,
    preliminaryReason,
    avgDailyHistorical,
    demandStdDev,
    avgDailyForecast,
    forecastTotal,
    confidenceLow,
    confidenceHigh,
    trendSlopePerDay: Number(slope.toFixed(4)),
    metrics,
    historicalSeries: continuous,
    dailySeries,
  };
}
