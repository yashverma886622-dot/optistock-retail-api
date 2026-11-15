import mongoose, { Schema, Document, Types } from 'mongoose';

export type ForecastMethod = 'SMA' | 'WMA' | 'EXPONENTIAL_SMOOTHING' | 'TREND_SEASONAL';

export interface IDemandForecast extends Document {
  product: Types.ObjectId;
  horizonDays: number;
  method: ForecastMethod;
  historicalDaysUsed: number;
  isPreliminary: boolean;
  forecastTotal: number;
  avgDailyForecast: number;
  confidenceLow: number;
  confidenceHigh: number;
  metrics: {
    mae: number | null;
    rmse: number | null;
    mape: number | null;
    wape: number | null;
    backtestSampleSize: number;
  };
  dailySeries: Array<{
    date: string;
    forecast: number;
    lower: number;
    upper: number;
  }>;
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DemandForecastSchema = new Schema<IDemandForecast>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    horizonDays: { type: Number, required: true, enum: [7, 14, 30, 60, 90] },
    method: {
      type: String,
      enum: ['SMA', 'WMA', 'EXPONENTIAL_SMOOTHING', 'TREND_SEASONAL'],
      required: true,
    },
    historicalDaysUsed: { type: Number, required: true, min: 0 },
    isPreliminary: { type: Boolean, default: false },
    forecastTotal: { type: Number, required: true, min: 0 },
    avgDailyForecast: { type: Number, required: true, min: 0 },
    confidenceLow: { type: Number, required: true, min: 0 },
    confidenceHigh: { type: Number, required: true, min: 0 },
    metrics: {
      mae: { type: Number, default: null },
      rmse: { type: Number, default: null },
      mape: { type: Number, default: null },
      wape: { type: Number, default: null },
      backtestSampleSize: { type: Number, default: 0 },
    },
    dailySeries: [
      {
        date: { type: String, required: true },
        forecast: { type: Number, required: true },
        lower: { type: Number, required: true },
        upper: { type: Number, required: true },
      },
    ],
    calculatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DemandForecastSchema.index({ product: 1, horizonDays: 1, method: 1 });

export const DemandForecast =
  mongoose.models.DemandForecast || mongoose.model<IDemandForecast>('DemandForecast', DemandForecastSchema);
