import mongoose, { Schema, Document, Types } from 'mongoose';

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Ordered'
  | 'Partially Received'
  | 'Received'
  | 'Cancelled';

export interface IReceiptLogEntry {
  receiptId: string;
  receivedAt: Date;
  receivedBy?: Types.ObjectId;
  notes?: string;
  items: Array<{
    product: Types.ObjectId;
    quantityReceived: number;
  }>;
}

export interface IPurchaseOrder extends Document {
  poNumber: string;
  supplier: Types.ObjectId;
  status: PurchaseOrderStatus;
  orderDate: Date;
  expectedDeliveryDate: Date;
  receivedDate?: Date;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  notes?: string;
  createdBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  receiptLog: IReceiptLogEntry[];
  processedReceiptIds: string[];
  isDemoData: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    poNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    status: {
      type: String,
      enum: ['Draft', 'Pending Approval', 'Approved', 'Ordered', 'Partially Received', 'Received', 'Cancelled'],
      default: 'Draft',
      index: true,
    },
    orderDate: { type: Date, default: Date.now },
    expectedDeliveryDate: { type: Date, required: true },
    receivedDate: { type: Date },
    subtotal: { type: Number, required: true, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receiptLog: [
      {
        receiptId: { type: String, required: true },
        receivedAt: { type: Date, default: Date.now },
        receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        notes: { type: String },
        items: [
          {
            product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
            quantityReceived: { type: Number, required: true, min: 1 },
          },
        ],
      },
    ],
    processedReceiptIds: [{ type: String }],
    isDemoData: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PurchaseOrderSchema.index({ createdAt: -1 });
PurchaseOrderSchema.index({ status: 1, expectedDeliveryDate: 1 });

export const PurchaseOrder =
  mongoose.models.PurchaseOrder || mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema);
