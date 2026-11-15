import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISeasonalEvent extends Document {
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  demandMultiplier: number;
  affectedCategories: Types.ObjectId[];
  description?: string;
  year: number;
  isRecurring: boolean;
  isActive: boolean;
  isDemoData: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SeasonalEventSchema = new Schema<ISeasonalEvent>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },
    demandMultiplier: { type: Number, required: true, default: 1.35, min: 0.5, max: 5 },
    affectedCategories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    description: { type: String, trim: true, maxlength: 500 },
    year: { type: Number, required: true },
    isRecurring: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isDemoData: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SeasonalEventSchema.index({ startDate: 1, endDate: 1 });

export const SeasonalEvent =
  mongoose.models.SeasonalEvent || mongoose.model<ISeasonalEvent>('SeasonalEvent', SeasonalEventSchema);
