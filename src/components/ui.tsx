import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Status tag                                                          */
/* ------------------------------------------------------------------ */
export function StatusTag({
  tone,
  label,
}: {
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  label: string;
}) {
  const styles: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ${styles[tone]}`}
    >
      {tone === 'success' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
      {tone === 'warning' && <AlertTriangle className="h-3 w-3 shrink-0" />}
      {tone === 'danger' && <XCircle className="h-3 w-3 shrink-0" />}
      {tone === 'info' && <Info className="h-3 w-3 shrink-0" />}
      <span>{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Animated counter                                                    */
/* ------------------------------------------------------------------ */

/**
 * Animates the numeric part of an already-formatted display string (for example "₹1,24,500",
 * "42", "12.5%"). The prefix, suffix, grouping style and decimals are preserved, and the exact
 * original string is shown once the animation completes, so the final value is never altered.
 */
export function AnimatedNumber({ value, duration = 0.9 }: { value: string; duration?: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const previous = useRef(0);

  useEffect(() => {
    const match = value.match(/^(\D*?)(-?[\d,]+(?:\.\d+)?)(.*)$/s);
    if (!match || reduce) {
      setDisplay(value);
      return;
    }
    const [, prefix, numberPart, suffix] = match;
    const target = Number(numberPart.replace(/,/g, ''));
    if (!Number.isFinite(target)) {
      setDisplay(value);
      return;
    }
    const decimals = numberPart.includes('.') ? numberPart.split('.')[1].length : 0;
    // Preserve the Indian digit grouping when the source string used it (e.g. 1,24,500)
    const indian = /\d{1,2},\d{2},\d{3}/.test(numberPart);
    const fmt = new Intl.NumberFormat(indian ? 'en-IN' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: numberPart.includes(','),
    });

    const controls = animate(previous.current, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(`${prefix}${fmt.format(latest)}${suffix}`),
      onComplete: () => {
        previous.current = target;
        setDisplay(value);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <>{display}</>;
}

/* ------------------------------------------------------------------ */
/* KPI card                                                            */
/* ------------------------------------------------------------------ */
export function KpiCard({
  label,
  value,
  subtext,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string;
  subtext?: string;
  tone?: 'default' | 'warning' | 'danger' | 'blue';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueColors: Record<string, string> = {
    default: 'text-slate-900',
    warning: 'text-amber-700',
    danger: 'text-rose-700',
    blue: 'text-blue-700',
  };
  const chipColors: Record<string, string> = {
    default: 'bg-slate-100 text-slate-600',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  const accent: Record<string, string> = {
    default: 'from-slate-300',
    warning: 'from-amber-400',
    danger: 'from-rose-500',
    blue: 'from-blue-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 hover:shadow-[var(--shadow-lift)] transition-shadow"
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accent[tone]} to-transparent`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          <p className={`mt-1.5 text-2xl font-bold tracking-tight tabular-nums ${valueColors[tone]}`}>
            <AnimatedNumber value={value} />
          </p>
        </div>
        {Icon && (
          <span className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${chipColors[tone]}`}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      {subtext && <p className="mt-1.5 text-xs text-slate-500 truncate">{subtext}</p>}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */
export function SkeletonRows({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-100" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((__, cIdx) => (
            <div
              key={cIdx}
              className="h-3.5 rounded-md flex-1 skeleton-shimmer"
              style={{ maxWidth: cIdx === 0 ? '180px' : undefined, animationDelay: `${rIdx * 60}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-3 w-24 rounded skeleton-shimmer" />
          <div className="h-7 w-32 rounded mt-3 skeleton-shimmer" />
          <div className="h-3 w-40 rounded mt-3 skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty / error states                                                */
/* ------------------------------------------------------------------ */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 border border-dashed border-blue-200 rounded-xl bg-gradient-to-b from-blue-50/50 to-white">
      <div className="h-12 w-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-md leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900"
    >
      <div className="flex items-center gap-2.5 text-sm">
        <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-rose-200 text-rose-800 hover:bg-rose-100 whitespace-nowrap shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */
export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  // Escape to close + lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal"
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className={`w-full ${maxWidth} rounded-2xl bg-white border border-slate-200 shadow-2xl my-6`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 max-h-[78vh] overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
