import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../lib/api.ts';
import { DbHealth, UserProfile, UserRole } from '../types/index.ts';

interface AuthContextValue {
  user: UserProfile | null;
  dbHealth: DbHealth | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    storeLocation?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  checkHealth: () => Promise<DbHealth>;
  reconnectDb: () => Promise<DbHealth>;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = useCallback(async (): Promise<DbHealth> => {
    const res = await apiFetch<{ ok: boolean; database: DbHealth }>('/api/health');
    setDbHealth(res.database);
    return res.database;
  }, []);

  const reconnectDb = useCallback(async (): Promise<DbHealth> => {
    const res = await apiFetch<{ ok: boolean; database: DbHealth }>('/api/health/reconnect', {
      method: 'POST',
    });
    setDbHealth(res.database);
    return res.database;
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setStoredToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const health = await checkHealth();
        if (health.connected) {
          await refreshUser();
        }
      } catch {
        setDbHealth({
          connected: false,
          status: 'error',
          message: 'Unable to reach backend API server.',
          lastCheckedAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [checkHealth, refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    storeLocation?: string;
  }) => {
    const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
  };

  const hasRole = (...roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        dbHealth,
        loading,
        login,
        register,
        logout,
        refreshUser,
        checkHealth,
        reconnectDb,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
