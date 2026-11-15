import mongoose, { Schema, Document, Types } from 'mongoose';

export type RecommendationUrgency = 'Critical' | 'High' | 'Medium' | 'Low';
export type RecommendationStatus = 'Pending' | 'Approved' | 'Rejected' | 'Converted';

export interface IReorderRecommendation extends Document {
  product: Types.ObjectId;
  supplier: Types.ObjectId;
  currentStock: number;
  avgDailyDemand: number;
  demandStdDev: number;
  forecastedDemand30d: number;
  safetyStock: number;
  reorderPoint: number;
  eoq: number;
  recommendedOrderQty: number;
  estimatedOrderCost: number;
  leadTimeDays: number;
  serviceLevel: number;
  stockoutRiskPct: number;
  urgency: RecommendationUrgency;
  status: RecommendationStatus;
  purchaseOrder?: Types.ObjectId;
  formulaBreakdown: Record<string, unknown>;
  generatedAt: Date;
  actionedBy?: Types.ObjectId;
  actionedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReorderRecommendationSchema = new Schema<IReorderRecommendation>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    currentStock: { type: Number, required: true, min: 0 },
    avgDailyDemand: { type: Number, required: true, min: 0 },
    demandStdDev: { type: Number, required: true, min: 0 },
    forecastedDemand30d: { type: Number, required: true, min: 0 },
    safetyStock: { type: Number, required: true, min: 0 },
    reorderPoint: { type: Number, required: true, min: 0 },
    eoq: { type: Number, required: true, min: 0 },
    recommendedOrderQty: { type: Number, required: true, min: 0 },
    estimatedOrderCost: { type: Number, required: true, min: 0 },
    leadTimeDays: { type: Number, required: true, min: 1 },
    serviceLevel: { type: Number, required: true, min: 80, max: 99.9 },
    stockoutRiskPct: { type: Number, required: true, min: 0, max: 100 },
    urgency: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], required: true, index: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Converted'],
      default: 'Pending',
      index: true,
    },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    formulaBreakdown: { type: Schema.Types.Mixed, default: {} },
    generatedAt: { type: Date, default: Date.now },
    actionedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    actionedAt: { type: Date },
  },
  { timestamps: true }
);

ReorderRecommendationSchema.index({ status: 1, urgency: 1 });

export const ReorderRecommendation =
  mongoose.models.ReorderRecommendation ||
  mongoose.model<IReorderRecommendation>('ReorderRecommendation', ReorderRecommendationSchema);
