import React, { useEffect, useState, useCallback } from 'react';
import { Database, Save, Shield, UserCheck, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useConfirm } from '../context/ConfirmContext.tsx';
import { StatusTag } from '../components/ui.tsx';
import { SeedExecutionResponse, SeedStatusResponse, UserRole } from '../types/index.ts';

interface AdminUserRow {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  storeLocation?: string;
}

const COLLECTION_LABELS: Array<{ key: keyof SeedStatusResponse['collections']; label: string }> = [
  { key: 'users', label: 'Users' },
  { key: 'categories', label: 'Categories' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'products', label: 'Products' },
  { key: 'sales', label: 'Sales' },
  { key: 'saleItems', label: 'Sale Items' },
  { key: 'inventoryTransactions', label: 'Inventory Tx' },
  { key: 'purchaseOrders', label: 'Purchase Orders' },
  { key: 'purchaseOrderItems', label: 'PO Items' },
  { key: 'seasonalEvents', label: 'Seasonal Events' },
  { key: 'reorderRecommendations', label: 'Recommendations' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'demandForecasts', label: 'Demand Forecasts' },
];

export function SettingsPage() {
  const { user, refreshUser, hasRole, dbHealth } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    storeLocation: user?.storeLocation || '',
    defaultServiceLevel: user?.settings?.defaultServiceLevel ?? 95,
    defaultOrderingCost: user?.settings?.defaultOrderingCost ?? 500,
    defaultHoldingCostPct: user?.settings?.defaultHoldingCostPct ?? 20,
  });
  const [saving, setSaving] = useState(false);

  const [usersList, setUsersList] = useState<AdminUserRow[]>([]);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [newUser, setNewUser] = useState<{ name: string; email: string; password: string; role: UserRole }>({
    name: '',
    email: '',
    password: '',
    role: 'Staff',
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [seedStatus, setSeedStatus] = useState<SeedStatusResponse | null>(null);
  const [loadingSeedStatus, setLoadingSeedStatus] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    totalInserted?: number;
  } | null>(null);

  const loadSeedStatus = useCallback(async () => {
    setLoadingSeedStatus(true);
    try {
      const res = await apiFetch<SeedStatusResponse>('/api/seed/status');
      setSeedStatus(res);
    } catch {
      // ignore if disconnected
    } finally {
      setLoadingSeedStatus(false);
    }
  }, []);

  const loadAdminUsers = useCallback(async () => {
    if (!hasRole('Admin')) return;
    try {
      const res = await apiFetch<{ users: AdminUserRow[] }>('/api/auth/users');
      setUsersList(res.users);
    } catch {
      // ignore
    }
  }, [hasRole]);

  useEffect(() => {
    loadAdminUsers();
    loadSeedStatus();
  }, [loadAdminUsers, loadSeedStatus]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          storeLocation: form.storeLocation,
          settings: {
            defaultServiceLevel: form.defaultServiceLevel,
            defaultOrderingCost: form.defaultOrderingCost,
            defaultHoldingCostPct: form.defaultHoldingCostPct,
          },
        }),
      });
      await refreshUser();
      addToast({ type: 'success', title: 'Settings saved' });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Unable to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRoleUpdate = async (id: string, role: UserRole, isActive: boolean) => {
    const target = usersList.find((u) => u._id === id);
    if (target && target.isActive && !isActive) {
      const ok = await confirm({
        title: `Disable ${target.name}?`,
        message: 'They will be signed out and unable to log in until re-enabled.',
        confirmLabel: 'Disable user',
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      await apiFetch(`/api/auth/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role, isActive }),
      });
      addToast({ type: 'success', title: 'User permissions updated' });
      await loadAdminUsers();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Update failed',
        message: err instanceof Error ? err.message : 'Could not update user',
      });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) {
      addToast({ type: 'error', title: 'Passwords do not match' });
      return;
    }
    setPwSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      addToast({ type: 'success', title: 'Password updated' });
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      addToast({ type: 'error', title: 'Could not change password', message: err instanceof Error ? err.message : undefined });
    } finally {
      setPwSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    try {
      await apiFetch('/api/auth/users', { method: 'POST', body: JSON.stringify(newUser) });
      addToast({ type: 'success', title: 'User created', message: `${newUser.name} can now sign in as ${newUser.role}.` });
      setNewUser({ name: '', email: '', password: '', role: 'Staff' });
      await loadAdminUsers();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not create user', message: err instanceof Error ? err.message : undefined });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleResetDemo = async () => {
    const ok = await confirm({
      title: 'Erase ALL data and reseed demo dataset?',
      message:
        'This permanently deletes every product, sale, purchase order and user in the connected MongoDB database and replaces it with demo data. This cannot be undone.',
      confirmLabel: 'Erase and reseed',
      tone: 'danger',
    });
    if (!ok) return;
    setResettingDemo(true);
    setResetFeedback(null);
    try {
      const res = await apiFetch<SeedExecutionResponse>('/api/seed/reset', { method: 'POST' });
      const countText =
        typeof res.totalInserted === 'number' ? `${res.totalInserted.toLocaleString('en-IN')} records inserted` : 'Demo dataset restored';
      const detailMessage =
        res.message || `${countText} into MongoDB Atlas${res.databaseName ? ` (${res.databaseName})` : ''}.`;
      setResetFeedback({
        type: res.success ? 'success' : 'error',
        title: res.success ? `Seed Reset Complete — ${countText}` : 'Seed Reset Incomplete',
        message: detailMessage,
        totalInserted: res.totalInserted,
      });
      addToast({
        type: res.success ? 'success' : 'error',
        title: res.success ? `Demo dataset reset (${countText})` : 'Demo dataset reset failed',
        message: detailMessage,
      });
      await Promise.all([loadSeedStatus(), loadAdminUsers()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reset demo data';
      setResetFeedback({
        type: 'error',
        title: 'Seed Reset Failed',
        message: msg,
      });
      addToast({
        type: 'error',
        title: 'Reset failed',
        message: msg,
      });
    } finally {
      setResettingDemo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Workspace & System Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Account profile, default optimization parameters, MongoDB Atlas status, and role-based access control
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile & Optimization Defaults */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-4 text-xs"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <UserCheck className="h-4 w-4 text-blue-700" />
            <h2 className="text-sm font-semibold text-slate-900">Profile & Optimization Defaults</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Full Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Store Location</label>
              <input
                value={form.storeLocation}
                onChange={(e) => setForm({ ...form, storeLocation: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Default Service Level (%)</label>
              <input
                type="number"
                step="0.5"
                min="80"
                max="99.9"
                value={form.defaultServiceLevel}
                onChange={(e) => setForm({ ...form, defaultServiceLevel: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Default Ordering Cost (₹)</label>
              <input
                type="number"
                min="1"
                value={form.defaultOrderingCost}
                onChange={(e) => setForm({ ...form, defaultOrderingCost: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Annual Holding Cost (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                value={form.defaultHoldingCostPct}
                onChange={(e) => setForm({ ...form, defaultHoldingCostPct: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>

        {/* Database & Security Summary */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">MongoDB Atlas Connection</h2>
              </div>
              <button
                type="button"
                onClick={loadSeedStatus}
                disabled={loadingSeedStatus}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${loadingSeedStatus ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Status</span>
              <StatusTag tone={dbHealth?.connected ? 'success' : 'danger'} label={dbHealth?.status || 'unknown'} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600 shrink-0">Cluster Host</span>
              <span className="font-mono text-slate-900 truncate">{dbHealth?.host || '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600 shrink-0">Database Name</span>
              <span className="font-mono text-slate-900">{dbHealth?.name || seedStatus?.databaseName || '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600 shrink-0">Sanitized URI</span>
              <span className="font-mono text-[11px] text-slate-700 truncate" title={dbHealth?.sanitizedUri || seedStatus?.sanitizedUri}>
                {dbHealth?.sanitizedUri || seedStatus?.sanitizedUri || '—'}
              </span>
            </div>
            {dbHealth?.usesDefaultTestDb && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 leading-relaxed">
                Active connection uses MongoDB&apos;s default <span className="font-mono font-semibold">&quot;test&quot;</span> database because no database path was appended to <span className="font-mono">MONGODB_URI</span>.
              </p>
            )}

            {seedStatus?.collections && (
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-800">Persisted Collection Counts</span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    Total:{' '}
                    {Object.values(seedStatus.collections)
                      .reduce((sum, n) => sum + n, 0)
                      .toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {COLLECTION_LABELS.map((item) => (
                    <div key={item.key} className="flex items-center justify-between py-0.5 border-b border-slate-100">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {seedStatus.collections[item.key].toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {hasRole('Admin') && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                <Shield className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">Demo Dataset Management (Admin)</h2>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Restore the labeled Indian retail demonstration dataset (55 products, 10 categories, 12 suppliers, 90 days of sales, POs, and seasonal events).
              </p>
              {resetFeedback && (
                <div
                  className={`rounded-lg border px-3 py-2.5 flex items-start gap-2 ${
                    resetFeedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-rose-200 bg-rose-50 text-rose-900'
                  }`}
                >
                  {resetFeedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">{resetFeedback.title}</p>
                    <p className="mt-0.5 leading-relaxed">{resetFeedback.message}</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                disabled={resettingDemo}
                onClick={handleResetDemo}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 disabled:opacity-50"
              >
                {resettingDemo ? 'Restoring Demo Data...' : 'Reset & Reseed Demo Dataset'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Change password (all roles) */}
      <form onSubmit={handleChangePassword} className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Change Password</h2>
        <p className="text-xs text-slate-500 mt-0.5">Use at least 8 characters.</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="password" required autoComplete="current-password" placeholder="Current password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600" />
          <input type="password" required minLength={8} autoComplete="new-password" placeholder="New password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600" />
          <input type="password" required minLength={8} autoComplete="new-password" placeholder="Confirm new password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600" />
        </div>
        <button type="submit" disabled={pwSaving} className="mt-4 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-60">
          {pwSaving ? 'Updating…' : 'Update password'}
        </button>
      </form>

      {/* Admin User Role Management Table */}
      {hasRole('Admin') && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">User Role & Access Management</h2>
          </div>
          <form onSubmit={handleCreateUser} className="px-5 py-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <input required minLength={2} placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600" />
            <input required type="email" placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600" />
            <input required type="password" minLength={6} placeholder="Temporary password" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600" />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600">
              <option value="Staff">Staff</option>
              <option value="Manager">Manager</option>
              <option value="Admin">Admin</option>
            </select>
            <button type="submit" disabled={creatingUser} className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-60">
              {creatingUser ? 'Adding…' : 'Add user'}
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">User</th>
                  <th className="px-4 py-3 text-left font-semibold">Store</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{u.name}</p>
                      <p className="text-[11px] text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.storeLocation || '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleUpdate(u._id, e.target.value as UserRole, u.isActive)}
                        className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Manager">Manager</option>
                        <option value="Staff">Staff</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleRoleUpdate(u._id, u.role, !u.isActive)}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        {u.isActive ? 'Active (Disable)' : 'Disabled (Enable)'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
