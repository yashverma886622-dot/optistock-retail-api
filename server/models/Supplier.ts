import mongoose, { Schema, Document } from 'mongoose';

export type SupplierStatus = 'Active' | 'Inactive' | 'On Hold';

export interface ISupplier extends Document {
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  gstin?: string;
  averageLeadTimeDays: number;
  leadTimeStdDevDays: number;
  paymentTerms: string;
  status: SupplierStatus;
  rating: number;
  isDemoData: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    contactPerson: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 25 },
    email: { type: String, required: true, lowercase: true, trim: true },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    gstin: { type: String, uppercase: true, trim: true, sparse: true },
    averageLeadTimeDays: { type: Number, required: true, default: 5, min: 1, max: 180 },
    leadTimeStdDevDays: { type: Number, default: 1, min: 0, max: 60 },
    paymentTerms: { type: String, default: 'Net 30', trim: true },
    status: { type: String, enum: ['Active', 'Inactive', 'On Hold'], default: 'Active' },
    rating: { type: Number, default: 4.2, min: 1, max: 5 },
    isDemoData: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SupplierSchema.index({ name: 'text', contactPerson: 'text', city: 'text' });
SupplierSchema.index({ status: 1 });

export const Supplier = mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', SupplierSchema);
