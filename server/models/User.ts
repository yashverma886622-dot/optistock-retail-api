import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'Admin' | 'Manager' | 'Staff';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  storeLocation?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  settings: {
    defaultServiceLevel: number;
    defaultOrderingCost: number;
    defaultHoldingCostPct: number;
    lowStockAlertThresholdPct: number;
    currency: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Manager', 'Staff'], default: 'Staff', required: true },
    phone: { type: String, trim: true },
    storeLocation: { type: String, trim: true, default: 'Mumbai Flagship Store' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    settings: {
      defaultServiceLevel: { type: Number, default: 95, min: 80, max: 99.9 },
      defaultOrderingCost: { type: Number, default: 500, min: 1 },
      defaultHoldingCostPct: { type: Number, default: 20, min: 1, max: 100 },
      lowStockAlertThresholdPct: { type: Number, default: 100, min: 50, max: 200 },
      currency: { type: String, default: 'INR' },
    },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1, isActive: 1 });

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
