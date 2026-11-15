
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  TrendingUp,
  Sliders,
  Sparkles,
  Calendar,
  Truck,
  ClipboardList,
  BarChart3,
  Bell,
  Settings,
  Search,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { NotificationItem, UserRole } from '../types/index.ts';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const ALL: UserRole[] = ['Admin', 'Manager', 'Staff'];
const MGR: UserRole[] = ['Admin', 'Manager'];

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { to: '/products', label: 'Products', icon: Package, roles: ALL },
      { to: '/inventory', label: 'Inventory', icon: Warehouse, roles: ALL },
      { to: '/pos', label: 'Sales / POS', icon: ShoppingCart, roles: ALL },
    ],
  },
  {
    heading: 'Intelligence',
    items: [
      { to: '/forecasting', label: 'Demand Forecasting', icon: TrendingUp, roles: MGR },
      { to: '/optimization', label: 'Inventory Optimization', icon: Sliders, roles: MGR },
      { to: '/recommendations', label: 'Reorder Recommendations', icon: Sparkles, roles: MGR },
      { to: '/seasonal', label: 'Seasonal Analysis', icon: Calendar, roles: MGR },
    ],
  },
  {
    heading: 'Procurement',
    items: [
      { to: '/suppliers', label: 'Suppliers', icon: Truck, roles: MGR },
      { to: '/purchase-orders', label: 'Purchase Orders', icon: ClipboardList, roles: MGR },
    ],
  },
  {
    heading: 'Insights & System',
    items: [
      { to: '/reports', label: 'Analytics & Reports', icon: BarChart3, roles: MGR },
      { to: '/notifications', label: 'Notifications', icon: Bell, roles: ALL },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ALL },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.to, i.label]))
);

const COLLAPSE_KEY = 'optistock_sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState<NotificationItem[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const menusRef = useRef<HTMLDivElement>(null);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Preference is not saved if storage is unavailable.
      }
      return next;
    });
  };

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{
        notifications: NotificationItem[];
        unreadCount: number;
      }>('/api/notifications');

      setUnreadCount(res.unreadCount);
      setRecentNotifs(res.notifications.slice(0, 5));
    } catch {
      // Ignore notification polling errors.
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, location.pathname]);

  useEffect(() => {
    setNotifOpen(false);
    setProfileOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menusRef.current && !menusRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setProfileOpen(false);
        setMobileOpen(false);
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchQuery.trim()) return;

    navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleMarkRead = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
      });

      await loadNotifications();
    } catch {
      // Ignore notification update errors.
    }
  };

  const currentTitle = ROUTE_TITLES[location.pathname] || 'Workspace';
  const railWidth = collapsed ? 'lg:w-[76px]' : 'lg:w-64';

  return (
    <div className="min-h-screen w-full min-w-0 flex text-slate-900 overflow-x-clip">

      {/* Mobile backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Responsive sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 ${railWidth} bg-white border-r border-slate-200 flex flex-col transition-[transform,width] duration-300 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >

        {/* Logo */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
          <NavLink to="/" className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-blue-800 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-600/30">
              OS
            </div>

            <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="text-sm font-bold text-slate-900 tracking-tight block leading-none truncate">
                OptiStock Retail
              </span>

              <span className="text-[11px] text-slate-500 block mt-1 truncate">
                Inventory Intelligence
              </span>
            </div>
          </NavLink>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-slate-400 hover:text-slate-700 p-2 rounded-lg"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
          aria-label="Primary"
        >
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) =>
              hasRole(...item.roles)
            );

            if (items.length === 0) return null;

            return (
              <div key={group.heading} className="mb-3">
                <p
                  className={`px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 ${
                    collapsed ? 'lg:hidden' : ''
                  }`}
                >
                  {group.heading}
                </p>

                {collapsed && (
                  <div className="hidden lg:block mx-3 mb-2 border-t border-slate-100" />
                )}

                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          `group relative flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                            isActive
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          } ${collapsed ? 'lg:justify-center lg:px-0' : ''}`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <motion.span
                                layoutId="nav-active-bar"
                                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-blue-600"
                                transition={{
                                  type: 'spring',
                                  stiffness: 500,
                                  damping: 36,
                                }}
                              />
                            )}

                            <span className="flex items-center gap-3 min-w-0">
                              <Icon
                                className={`h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110 ${
                                  isActive
                                    ? 'text-blue-600'
                                    : 'text-slate-400 group-hover:text-slate-600'
                                }`}
                              />

                              <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>
                                {item.label}
                              </span>
                            </span>

                            {item.to === '/notifications' && unreadCount > 0 && (
                              <span
                                className={`ml-2 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums rounded-full bg-blue-600 text-white ${
                                  collapsed
                                    ? 'lg:absolute lg:top-0.5 lg:right-2 lg:ml-0 lg:px-1 lg:text-[9px]'
                                    : ''
                                }`}
                              >
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-slate-100 shrink-0 space-y-2">
          <div className={`px-2 py-1 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="text-xs font-semibold text-slate-800 truncate">
              {user?.storeLocation || 'Retail Store'}
            </p>

            <p className="text-[11px] text-slate-500 mt-0.5">
              {user?.role} · INR (₹)
            </p>
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 border border-slate-200"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <ChevronsRight className="h-4 w-4" />
              : <ChevronsLeft className="h-4 w-4" />}

            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main application */}
      <div className="flex-1 flex flex-col min-w-0 w-full">

        {/* Responsive header */}
        <header className="h-16 min-h-16 bg-white/85 backdrop-blur border-b border-slate-200 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">

          <div className="flex items-center gap-3 min-w-0">

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 shrink-0"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-sm min-w-0"
            >
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                OptiStock
              </span>

              <ChevronRight className="h-4 w-4 text-slate-300 hidden sm:inline shrink-0" />

              <span className="font-semibold text-slate-900 truncate">
                {currentTitle}
              </span>
            </nav>
          </div>

          <div
            ref={menusRef}
            className="flex items-center gap-2 sm:gap-3 shrink-0"
          >

            {/* Desktop search */}
            <form
              onSubmit={handleSearchSubmit}
              className="hidden md:block relative"
            >
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />

              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SKU or product… Ctrl K"
                aria-label="Search products"
                className="w-60 lg:w-80 pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </form>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((prev) => !prev);
                  setProfileOpen(false);
                }}
                className="relative p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
                aria-label="Notifications"
                aria-expanded={notifOpen}
              >
                <Bell className="h-4 w-4" />

                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums ring-2 ring-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl z-40 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">
                        Notifications
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          navigate('/notifications');
                        }}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        View all
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {recentNotifs.length === 0 ? (
                        <p className="p-6 text-xs text-slate-500 text-center">
                          You're all caught up.
                        </p>
                      ) : (
                        recentNotifs.map((n) => (
                          <div
                            key={n._id}
                            className={`p-3 text-xs ${
                              n.isRead ? 'bg-white' : 'bg-blue-50/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-900">
                                {n.title}
                              </p>

                              {!n.isRead && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkRead(n._id)}
                                  className="text-blue-700 hover:text-blue-900 p-0.5"
                                  title="Mark as read"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            <p className="text-slate-600 mt-0.5 leading-relaxed">
                              {n.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((prev) => !prev);
                  setNotifOpen(false);
                }}
                aria-expanded={profileOpen}
                className="flex items-center gap-2 pl-1.5 pr-2 sm:pr-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-left"
              >
                <div className="h-7 w-7 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>

                <div className="hidden sm:block min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate max-w-[110px]">
                    {user?.name}
                  </p>

                  <p className="text-[11px] text-slate-500 leading-none">
                    {user?.role}
                  </p>
                </div>
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl z-40 py-1.5"
                  >
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {user?.name}
                      </p>

                      <p className="text-[11px] text-slate-500 truncate">
                        {user?.email}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate('/settings');
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <UserIcon className="h-3.5 w-3.5" />
                      Profile & Settings
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs text-rose-700 hover:bg-rose-50 flex items-center gap-2"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Responsive page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-[1600px] min-w-0 w-full mx-auto overflow-x-clip">
          <motion.div
            className="w-full min-w-0"
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
