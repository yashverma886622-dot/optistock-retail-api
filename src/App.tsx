import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { ConfirmProvider } from './context/ConfirmContext.tsx';
import { DatabaseSetupGate } from './components/DatabaseSetupGate.tsx';
import { AppShell } from './components/AppShell.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ProductsPage } from './pages/ProductsPage.tsx';
import { InventoryPage } from './pages/InventoryPage.tsx';
import { PosPage } from './pages/PosPage.tsx';
import { ForecastingPage } from './pages/ForecastingPage.tsx';
import { OptimizationPage } from './pages/OptimizationPage.tsx';
import { RecommendationsPage } from './pages/RecommendationsPage.tsx';
import { SeasonalPage } from './pages/SeasonalPage.tsx';
import { SuppliersPage } from './pages/SuppliersPage.tsx';
import { PurchaseOrdersPage } from './pages/PurchaseOrdersPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { UserRole } from './types/index.ts';

function RoleRoute({
  roles,
  children,
}: {
  roles?: UserRole[];
  children: React.ReactNode;
}) {
  const { user, hasRole } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !hasRole(...roles)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="font-semibold">Access Restricted</h2>
        <p className="mt-1 text-xs">
          Your account role ({user.role}) does not have permission to access this module. Required: {roles.join(' or ')}.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { user, dbHealth, loading, reconnectDb } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-11 w-11 mx-auto rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 text-white font-bold text-sm flex items-center justify-center shadow-lg animate-pulse">
            OS
          </div>
          <p className="text-xs text-slate-500">Connecting to OptiStock Retail...</p>
        </div>
      </div>
    );
  }

  if (dbHealth && !dbHealth.connected) {
    return <DatabaseSetupGate dbHealth={dbHealth} onRetry={reconnectDb} />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route
          path="/forecasting"
          element={
            <RoleRoute roles={['Admin', 'Manager']}>
              <ForecastingPage />
            </RoleRoute>
          }
        />
        <Route
          path="/optimization"
          element={
            <RoleRoute roles={['Admin', 'Manager']}>
              <OptimizationPage />
            </RoleRoute>
          }
        />
        <Route
          path="/recommendations"
          element={
            <RoleRoute roles={['Admin', 'Manager']}>
              <RecommendationsPage />
            </RoleRoute>
          }
        />
        <Route
          path="/seasonal"
          element={
            <RoleRoute roles={['Admin', 'Manager']}>
              <SeasonalPage />
            </RoleRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <RoleRoute roles={['Admin', 'Manager']}>
              <SuppliersPage />
            </RoleRoute>
          }
        />
        <Route
          path="/purchase-orders"
          element={
            <RoleRoute roles={['Admin', 'Manager']}>
              <PurchaseOrdersPage />
            </RoleRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <RoleRoute roles={['Admin', 'Manager']}>
              <ReportsPage />
            </RoleRoute>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
