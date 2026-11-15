import { Notification } from '../models/Notification.ts';
import { Product } from '../models/Product.ts';
import { PurchaseOrder } from '../models/PurchaseOrder.ts';

async function upsertDedupedNotification(payload: {
  dedupeKey: string;
  type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'PO_UPDATE' | 'DELAYED_DELIVERY' | 'EXPIRING_SOON' | 'REORDER_ALERT';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  entityType?: 'Product' | 'PurchaseOrder' | 'Recommendation';
  entityId?: string;
  targetRoles?: Array<'Admin' | 'Manager' | 'Staff'>;
}) {
  try {
    await Notification.updateOne(
      { dedupeKey: payload.dedupeKey },
      {
        $setOnInsert: {
          type: payload.type,
          title: payload.title,
          message: payload.message,
          severity: payload.severity,
          entityType: payload.entityType,
          entityId: payload.entityId,
          dedupeKey: payload.dedupeKey,
          isRead: false,
          targetRoles: payload.targetRoles || ['Admin', 'Manager', 'Staff'],
        },
      },
      { upsert: true }
    );
  } catch {
    // Duplicate key race condition safely ignored due to unique dedupeKey index
  }
}

export async function syncSystemNotifications(): Promise<void> {
  const todayKey = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [outOfStock, lowStock, expiringProducts, delayedPOs] = await Promise.all([
    Product.find({ isActive: true, currentStock: { $lte: 0 } }).select('name sku currentStock').limit(25),
    Product.find({
      isActive: true,
      currentStock: { $gt: 0 },
      $expr: { $lte: ['$currentStock', '$reorderLevel'] },
    })
      .select('name sku currentStock reorderLevel')
      .limit(30),
    Product.find({
      isActive: true,
      currentStock: { $gt: 0 },
      expiryDate: { $ne: null, $lte: in30Days },
    })
      .select('name sku expiryDate currentStock')
      .limit(20),
    PurchaseOrder.find({
      status: { $in: ['Approved', 'Ordered', 'Partially Received'] },
      expectedDeliveryDate: { $lt: now },
    })
      .select('poNumber expectedDeliveryDate')
      .limit(20),
  ]);

  const tasks: Promise<void>[] = [];

  for (const p of outOfStock) {
    tasks.push(
      upsertDedupedNotification({
        dedupeKey: `OUT_OF_STOCK:${p._id}:${todayKey}`,
        type: 'OUT_OF_STOCK',
        title: `Stockout: ${p.name}`,
        message: `${p.name} (${p.sku}) has 0 units remaining. Immediate replenishment recommended.`,
        severity: 'critical',
        entityType: 'Product',
        entityId: String(p._id),
      })
    );
  }

  for (const p of lowStock) {
    tasks.push(
      upsertDedupedNotification({
        dedupeKey: `LOW_STOCK:${p._id}:${todayKey}`,
        type: 'LOW_STOCK',
        title: `Low Stock Alert: ${p.name}`,
        message: `${p.name} (${p.sku}) is at ${p.currentStock} units (reorder level: ${p.reorderLevel}).`,
        severity: 'warning',
        entityType: 'Product',
        entityId: String(p._id),
      })
    );
  }

  for (const p of expiringProducts) {
    const expStr = p.expiryDate ? new Date(p.expiryDate).toLocaleDateString('en-IN') : 'soon';
    tasks.push(
      upsertDedupedNotification({
        dedupeKey: `EXPIRING:${p._id}:${todayKey}`,
        type: 'EXPIRING_SOON',
        title: `Expiry Watch: ${p.name}`,
        message: `${p.currentStock} units of ${p.name} (${p.sku}) expire on ${expStr}.`,
        severity: 'warning',
        entityType: 'Product',
        entityId: String(p._id),
      })
    );
  }

  for (const po of delayedPOs) {
    const dueStr = new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN');
    tasks.push(
      upsertDedupedNotification({
        dedupeKey: `DELAYED_PO:${po._id}:${todayKey}`,
        type: 'DELAYED_DELIVERY',
        title: `Delayed Purchase Order: ${po.poNumber}`,
        message: `Purchase Order ${po.poNumber} was expected by ${dueStr} and is still pending receipt.`,
        severity: 'warning',
        entityType: 'PurchaseOrder',
        entityId: String(po._id),
        targetRoles: ['Admin', 'Manager'],
      })
    );
  }

  await Promise.all(tasks);
}

export async function createEventNotification(params: {
  dedupeKey: string;
  type: 'PO_UPDATE' | 'REORDER_ALERT' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  entityType?: 'Product' | 'PurchaseOrder' | 'Recommendation';
  entityId?: string;
  targetRoles?: Array<'Admin' | 'Manager' | 'Staff'>;
}) {
  await upsertDedupedNotification(params);
}
