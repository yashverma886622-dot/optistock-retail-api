
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/* Status tag */
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
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${styles[tone]}`}>
      {tone === 'success' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
      {tone === 'warning' && <AlertTriangle className="h-3 w-3 shrink-0" />}
      {tone === 'danger' && <XCircle className="h-3 w-3 shrink-0" />}
      {tone === 'info' && <Info className="h-3 w-3 shrink-0" />}
      <span>{label}</span>
    </span>
  );
}

/* Animated counter */
export function AnimatedNumber({
  value,
  duration = 0.9,
}: {
  value: string;
  duration?: number;
}) {
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

    const decimals = numberPart.includes('.')
      ? numberPart.split('.')[1].length
      : 0;

    const indian = /\d{1,2},\d{2},\d{3}/.test(numberPart);

    const fmt = new Intl.NumberFormat(indian ? 'en-IN' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: numberPart.includes(','),
    });

    const controls = animate(previous.current, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        setDisplay(`${prefix}${fmt.format(latest)}${suffix}`);
      },
      onComplete: () => {
        previous.current = target;
        setDisplay(value);
      },
    });

    return () => controls.stop();
  }, [value, duration, reduce]);

  return <>{display}</>;
}

/* KPI card */
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
      className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 sm:p-4 transition-shadow hover:shadow-[var(--shadow-lift)]"
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accent[tone]} to-transparent`} />

      <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-500">
            {label}
          </p>
          <p className={`mt-1.5 break-words text-xl font-bold tracking-tight tabular-nums sm:text-2xl ${valueColors[tone]}`}>
            <AnimatedNumber value={value} />
          </p>
        </div>

        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${chipColors[tone]}`}>
            <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          </span>
        )}
      </div>

      {subtext && (
        <p className="mt-1.5 break-words text-xs text-slate-500">
          {subtext}
        </p>
      )}
    </motion.div>
  );
}

/* Page header */
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
    <div className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 break-words text-sm text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}

/* Skeletons */
export function SkeletonRows({
  rows = 6,
  cols = 6,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="divide-y divide-slate-100" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="flex min-w-0 items-center gap-3 overflow-hidden px-3 py-3.5 sm:gap-4 sm:px-4">
          {Array.from({ length: cols }).map((__, cIdx) => (
            <div
              key={cIdx}
              className="skeleton-shimmer h-3.5 min-w-0 flex-1 rounded-md"
              style={{
                maxWidth: cIdx === 0 ? '180px' : undefined,
                animationDelay: `${rIdx * 60}ms`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <div className="skeleton-shimmer h-3 w-24 max-w-full rounded" />
          <div className="skeleton-shimmer mt-3 h-7 w-32 max-w-full rounded" />
          <div className="skeleton-shimmer mt-3 h-3 w-40 max-w-full rounded" />
        </div>
      ))}
    </div>
  );
}

/* Empty state */
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-gradient-to-b from-blue-50/50 to-white px-4 py-10 text-center sm:px-6 sm:py-14">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
        <Icon className="h-6 w-6" />
      </div>

      <h3 className="text-sm font-semibold text-slate-900">
        {title}
      </h3>

      <p className="mt-1 max-w-md break-words text-xs leading-relaxed text-slate-500">
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 min-h-10 max-w-full whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* Error banner */
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
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-rose-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4"
    >
      <div className="flex min-w-0 items-start gap-2.5 text-sm">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <span className="min-w-0 break-words">{message}</span>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-9 shrink-0 self-start whitespace-nowrap rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 sm:self-auto"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/* Modal */
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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-2 backdrop-blur-[2px] sm:items-center sm:p-4"
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
            className={`my-2 w-full min-w-0 ${maxWidth} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:my-6`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-3.5 sm:gap-4 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <h2 className="break-words text-base font-semibold text-slate-900">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 break-words text-xs text-slate-500">
                    {subtitle}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(100dvh-100px)] overflow-y-auto p-3 sm:max-h-[78vh] sm:p-5">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
