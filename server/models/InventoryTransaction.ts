import mongoose, { Schema, Document, Types } from 'mongoose';

export type InventoryTransactionType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'ADJUSTMENT'
  | 'SALE'
  | 'DAMAGE'
  | 'RETURN'
  | 'PO_RECEIPT';

export interface IInventoryTransaction extends Document {
  product: Types.ObjectId;
  type: InventoryTransactionType;
  quantityChange: number;
  previousStock: number;
  newStock: number;
  unitCost: number;
  referenceType?: 'Sale' | 'PurchaseOrder' | 'Manual';
  referenceId?: string;
  reason?: string;
  performedBy?: Types.ObjectId;
  transactionDate: Date;
  isDemoData: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryTransactionSchema = new Schema<IInventoryTransaction>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    type: {
      type: String,
      enum: ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'SALE', 'DAMAGE', 'RETURN', 'PO_RECEIPT'],
      required: true,
      index: true,
    },
    quantityChange: { type: Number, required: true },
    previousStock: { type: Number, required: true, min: 0 },
    newStock: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    referenceType: { type: String, enum: ['Sale', 'PurchaseOrder', 'Manual'], default: 'Manual' },
    referenceId: { type: String, trim: true },
    reason: { type: String, trim: true, maxlength: 400 },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    transactionDate: { type: Date, default: Date.now, index: true },
    isDemoData: { type: Boolean, default: false },
  },
  { timestamps: true }
);

InventoryTransactionSchema.index({ transactionDate: -1 });
InventoryTransactionSchema.index({ product: 1, transactionDate: -1 });

export const InventoryTransaction =
  mongoose.models.InventoryTransaction ||
  mongoose.model<IInventoryTransaction>('InventoryTransaction', InventoryTransactionSchema);
