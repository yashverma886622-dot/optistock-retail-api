import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  category: Types.ObjectId;
  brand: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  gstRate: number;
  currentStock: number;
  minStock: number;
  maxStock: number;
  reorderLevel: number;
  supplier: Types.ObjectId;
  leadTimeDays: number;
  expiryDate?: Date | null;
  orderingCost: number;
  holdingCostRate: number;
  serviceLevel: number;
  minOrderQuantity: number;
  isDemoData: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    barcode: { type: String, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    brand: { type: String, required: true, trim: true, maxlength: 100 },
    unit: { type: String, required: true, default: 'pcs', trim: true },
    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 12, min: 0, max: 28 },
    currentStock: { type: Number, required: true, default: 0, min: 0 },
    minStock: { type: Number, required: true, default: 10, min: 0 },
    maxStock: { type: Number, required: true, default: 200, min: 1 },
    reorderLevel: { type: Number, required: true, default: 20, min: 0 },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    leadTimeDays: { type: Number, required: true, default: 5, min: 1, max: 180 },
    expiryDate: { type: Date, default: null },
    orderingCost: { type: Number, default: 500, min: 1 },
    holdingCostRate: { type: Number, default: 0.2, min: 0.01, max: 1 },
    serviceLevel: { type: Number, default: 95, min: 80, max: 99.9 },
    minOrderQuantity: { type: Number, default: 10, min: 1 },
    isDemoData: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ProductSchema.index({ name: 'text', sku: 'text', brand: 'text', barcode: 'text' });
ProductSchema.index({ currentStock: 1, reorderLevel: 1 });
ProductSchema.index({ expiryDate: 1 });
ProductSchema.index({ isActive: 1, category: 1 });

export const Product = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
