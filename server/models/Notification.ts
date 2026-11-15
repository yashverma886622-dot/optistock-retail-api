import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType =
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'PO_UPDATE'
  | 'DELAYED_DELIVERY'
  | 'EXPIRING_SOON'
  | 'REORDER_ALERT';

export interface INotification extends Document {
  type: NotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  entityType?: 'Product' | 'PurchaseOrder' | 'Recommendation';
  entityId?: string;
  dedupeKey?: string;
  isRead: boolean;
  readAt?: Date;
  targetRoles: Array<'Admin' | 'Manager' | 'Staff'>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    type: {
      type: String,
      enum: ['LOW_STOCK', 'OUT_OF_STOCK', 'PO_UPDATE', 'DELAYED_DELIVERY', 'EXPIRING_SOON', 'REORDER_ALERT'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 600 },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
    entityType: { type: String, enum: ['Product', 'PurchaseOrder', 'Recommendation'] },
    entityId: { type: String },
    dedupeKey: { type: String, unique: true, sparse: true },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    targetRoles: {
      type: [String],
      enum: ['Admin', 'Manager', 'Staff'],
      default: ['Admin', 'Manager', 'Staff'],
    },
  },
  { timestamps: true }
);

NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ isRead: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
