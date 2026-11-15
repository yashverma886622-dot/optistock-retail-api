import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'NetBanking' | 'Credit';

export interface ISale extends Document {
  invoiceNumber: string;
  clientRequestId?: string;
  customerName: string;
  customerPhone?: string;
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'Paid' | 'Pending' | 'Refunded';
  cashier?: Types.ObjectId;
  notes?: string;
  saleDate: Date;
  isDemoData: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    invoiceNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    clientRequestId: { type: String, trim: true, maxlength: 100 },
    customerName: { type: String, required: true, default: 'Walk-in Customer', trim: true },
    customerPhone: { type: String, trim: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    gstAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'NetBanking', 'Credit'],
      required: true,
      default: 'UPI',
    },
    paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Refunded'], default: 'Paid' },
    cashier: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, maxlength: 500 },
    saleDate: { type: Date, default: Date.now, index: true },
    isDemoData: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SaleSchema.index(
  { clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } }
);
SaleSchema.index({ saleDate: -1 });
SaleSchema.index({ paymentMethod: 1, saleDate: -1 });

export const Sale = mongoose.models.Sale || mongoose.model<ISale>('Sale', SaleSchema);
