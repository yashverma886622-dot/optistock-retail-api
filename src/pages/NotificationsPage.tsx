import { useEffect, useState, useCallback } from 'react';
import { Bell, Check, CheckCheck, RefreshCw } from 'lucide-react';
import { apiFetch, formatDateIN } from '../lib/api.ts';
import { NotificationItem } from '../types/index.ts';
import { EmptyState, ErrorBanner, SkeletonRows, StatusTag } from '../components/ui.tsx';
import { useToast } from '../context/ToastContext.tsx';

export function NotificationsPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>(
        `/api/notifications?unreadOnly=${unreadOnly}`
      );
      setItems(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleSync = async () => {
    try {
      await apiFetch('/api/notifications/sync', { method: 'POST' });
      addToast({ type: 'info', title: 'Alerts synchronized' });
      await loadNotifications();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Sync failed',
        message: err instanceof Error ? err.message : 'Could not sync alerts',
      });
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      await loadNotifications();
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      addToast({ type: 'success', title: 'All notifications marked as read' });
      await loadNotifications();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Notification Center</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {unreadCount} unread alert(s) · Deduplicated monitoring for stockouts, low stock, expiry, and delayed deliveries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Alerts
          </button>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark All Read
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setUnreadOnly(false)}
          className={`px-3 py-1.5 rounded-lg border font-medium ${
            !unreadOnly ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-200'
          }`}
        >
          All History
        </button>
        <button
          type="button"
          onClick={() => setUnreadOnly(true)}
          className={`px-3 py-1.5 rounded-lg border font-medium ${
            unreadOnly ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-200'
          }`}
        >
          Unread Only ({unreadCount})
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadNotifications} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <SkeletonRows rows={6} cols={4} />
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Bell}
              title="No notifications in this view"
              description="System alerts appear here when SKUs drop below reorder levels, expire soon, or purchase orders change status."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((n) => (
              <div
                key={n._id}
                className={`p-4 flex items-start justify-between gap-4 text-xs ${
                  n.isRead ? 'bg-white' : 'bg-blue-50/40'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag
                      tone={n.severity === 'critical' ? 'danger' : n.severity === 'warning' ? 'warning' : 'info'}
                      label={n.type.replace(/_/g, ' ')}
                    />
                    <span className="font-semibold text-slate-900">{n.title}</span>
                    <span className="text-slate-400">· {formatDateIN(n.createdAt)}</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{n.message}</p>
                </div>
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n._id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
