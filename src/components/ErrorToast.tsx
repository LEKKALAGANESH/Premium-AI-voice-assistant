// 2026 Premium Error Toast Component
// Beautiful, informative error notifications with recovery actions

import React, { memo, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  MicOff,
  ShieldOff,
  Globe,
  WifiOff,
  VolumeX,
  AlertTriangle,
  XCircle,
  X,
  RefreshCw,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { VoxError, ErrorSeverity } from '../types/errors';

// Icon mapping
const ICON_MAP = {
  'mic-off': MicOff,
  'shield-off': ShieldOff,
  'globe-off': Globe,
  'wifi-off': WifiOff,
  'volume-x': VolumeX,
  'alert-triangle': AlertTriangle,
  'x-circle': XCircle,
} as const;

// Severity color schemes
const SEVERITY_STYLES: Record<ErrorSeverity, {
  bg: string;
  border: string;
  icon: string;
  title: string;
  text: string;
  button: string;
  buttonHover: string;
}> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-500 dark:text-blue-400',
    title: 'text-blue-900 dark:text-blue-100',
    text: 'text-blue-700 dark:text-blue-300',
    button: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
    buttonHover: 'hover:bg-blue-200 dark:hover:bg-blue-800/50',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-500 dark:text-amber-400',
    title: 'text-amber-900 dark:text-amber-100',
    text: 'text-amber-700 dark:text-amber-300',
    button: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
    buttonHover: 'hover:bg-amber-200 dark:hover:bg-amber-800/50',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/50',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-500 dark:text-red-400',
    title: 'text-red-900 dark:text-red-100',
    text: 'text-red-700 dark:text-red-300',
    button: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    buttonHover: 'hover:bg-red-200 dark:hover:bg-red-800/50',
  },
  critical: {
    bg: 'bg-red-100 dark:bg-red-950/70',
    border: 'border-red-300 dark:border-red-700',
    icon: 'text-red-600 dark:text-red-400',
    title: 'text-red-900 dark:text-red-100',
    text: 'text-red-800 dark:text-red-200',
    button: 'bg-red-200 dark:bg-red-800/50 text-red-800 dark:text-red-200',
    buttonHover: 'hover:bg-red-300 dark:hover:bg-red-700/50',
  },
};

// Auto-dismiss durations by severity
const AUTO_DISMISS_MS: Record<ErrorSeverity, number> = {
  info: 4000,
  warning: 6000,
  error: 8000,
  critical: 0, // Don't auto-dismiss critical errors
};

interface ErrorToastProps {
  error: VoxError;
  onDismiss: () => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

const ErrorToast = memo(({ error, onDismiss, onRetry, onOpenSettings }: ErrorToastProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [progress, setProgress] = useState(100);

  const styles = SEVERITY_STYLES[error.severity];
  const IconComponent = ICON_MAP[error.icon] || AlertTriangle;
  const autoDismissMs = AUTO_DISMISS_MS[error.severity];

  // Auto-dismiss timer with progress
  useEffect(() => {
    if (autoDismissMs === 0) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / autoDismissMs) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [autoDismissMs, onDismiss]);

  // Handle recovery action
  const handleAction = useCallback(() => {
    if (!error.recoveryAction) return;

    switch (error.recoveryAction.action) {
      case 'retry':
        onRetry?.();
        onDismiss();
        break;
      case 'settings':
        onOpenSettings?.();
        onDismiss();
        break;
      case 'refresh':
        window.location.reload();
        break;
      case 'dismiss':
      default:
        onDismiss();
        break;
    }
  }, [error.recoveryAction, onRetry, onOpenSettings, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={clsx(
        'relative overflow-hidden rounded-2xl border shadow-lg',
        styles.bg,
        styles.border
      )}
      style={{ maxWidth: '400px', width: '100%' }}
      role="alert"
      aria-live="assertive"
    >
      {/* Progress bar for auto-dismiss */}
      {autoDismissMs > 0 && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-black/5 dark:bg-white/5">
          <motion.div
            className={clsx('h-full', styles.icon.replace('text-', 'bg-'))}
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.05 }}
          />
        </div>
      )}

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={clsx(
              'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
              styles.button
            )}
          >
            <IconComponent className={clsx('w-5 h-5', styles.icon)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className={clsx('font-semibold text-sm', styles.title)}>
              {error.title}
            </h3>
            <p className={clsx('text-sm mt-0.5', styles.text)}>
              {error.message}
            </p>

            {/* Expandable suggestion */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className={clsx(
                    'mt-3 p-3 rounded-lg text-xs',
                    'bg-black/5 dark:bg-white/5',
                    styles.text
                  )}>
                    <span className="font-medium">Suggestion: </span>
                    {error.suggestion}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3">
              {/* Toggle details */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  styles.button,
                  styles.buttonHover
                )}
              >
                {isExpanded ? 'Hide' : 'Show'} details
                <ChevronRight
                  className={clsx(
                    'w-3 h-3 transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
              </button>

              {/* Recovery action */}
              {error.recoveryAction && (
                <button
                  onClick={handleAction}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    error.severity === 'critical'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100'
                  )}
                >
                  {error.recoveryAction.action === 'retry' && (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {error.recoveryAction.action === 'settings' && (
                    <Settings className="w-3 h-3" />
                  )}
                  {error.recoveryAction.label}
                </button>
              )}
            </div>
          </div>

          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            className={clsx(
              'shrink-0 p-1.5 rounded-lg transition-colors',
              'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300',
              'hover:bg-black/5 dark:hover:bg-white/5'
            )}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
});

ErrorToast.displayName = 'ErrorToast';

// === ERROR TOAST CONTAINER ===
// Manages multiple stacked toasts

interface ErrorToastContainerProps {
  errors: Array<VoxError & { id: string }>;
  onDismiss: (id: string) => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

export const ErrorToastContainer = memo(({
  errors,
  onDismiss,
  onRetry,
  onOpenSettings,
}: ErrorToastContainerProps) => {
  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-3"
      style={{ maxWidth: '400px', width: 'calc(100vw - 2rem)' }}
    >
      <AnimatePresence mode="popLayout">
        {errors.map((error) => (
          <ErrorToast
            key={error.id}
            error={error}
            onDismiss={() => onDismiss(error.id)}
            onRetry={onRetry}
            onOpenSettings={onOpenSettings}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});

ErrorToastContainer.displayName = 'ErrorToastContainer';

export default ErrorToast;
