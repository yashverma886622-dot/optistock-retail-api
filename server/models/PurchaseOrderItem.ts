import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPurchaseOrderItem extends Document {
  purchaseOrder: Types.ObjectId;
  product: Types.ObjectId;
  sku: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  gstRate: number;
  lineTotal: number;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseOrderItemSchema = new Schema<IPurchaseOrderItem>(
  {
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku: { type: String, required: true },
    productName: { type: String, required: true },
    orderedQuantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 12, min: 0, max: 28 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

PurchaseOrderItemSchema.index({ purchaseOrder: 1, product: 1 }, { unique: true });

export const PurchaseOrderItem =
  mongoose.models.PurchaseOrderItem ||
  mongoose.model<IPurchaseOrderItem>('PurchaseOrderItem', PurchaseOrderItemSchema);
