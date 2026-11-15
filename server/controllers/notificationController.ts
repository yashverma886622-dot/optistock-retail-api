import { Response } from 'express';
import { Notification } from '../models/Notification.ts';
import { AuthenticatedRequest } from '../middleware/auth.ts';
import { syncSystemNotifications } from '../services/notificationService.ts';

export async function listNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filterRead = String(req.query.unreadOnly || 'false') === 'true';
  const role = req.user?.role || 'Staff';

  const query: Record<string, unknown> = { targetRoles: role };
  if (filterRead) query.isRead = false;

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).limit(80).lean(),
    Notification.countDocuments({ targetRoles: role, isRead: false }),
  ]);

  res.json({ notifications, unreadCount });
}

export async function markNotificationRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  res.json({ notification });
}

export async function markAllNotificationsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const role = req.user?.role || 'Staff';
  await Notification.updateMany(
    { targetRoles: role, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  res.json({ message: 'All notifications marked as read.' });
}

export async function refreshNotifications(_req: AuthenticatedRequest, res: Response): Promise<void> {
  await syncSystemNotifications();
  res.json({ message: 'System alerts synchronized.' });
}
