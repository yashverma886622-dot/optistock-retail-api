import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISaleItem extends Document {
  sale: Types.ObjectId;
  product: Types.ObjectId;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountPercent: number;
  gstRate: number;
  gstAmount: number;
  lineTotal: number;
  saleDate: Date;
  isDemoData: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SaleItemSchema = new Schema<ISaleItem>(
  {
    sale: { type: Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    gstRate: { type: Number, default: 12, min: 0, max: 28 },
    gstAmount: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    saleDate: { type: Date, default: Date.now, index: true },
    isDemoData: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SaleItemSchema.index({ product: 1, saleDate: -1 });

export const SaleItem = mongoose.models.SaleItem || mongoose.model<ISaleItem>('SaleItem', SaleItemSchema);
