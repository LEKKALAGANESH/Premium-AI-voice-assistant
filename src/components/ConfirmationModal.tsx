// 2026 Standard: Confirmation Modal for Safe Delete Operations
// WCAG 2.2 compliant with focus trap and keyboard navigation

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  highlightText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  highlightText,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the cancel button on open (safer default)
    setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 50);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onCancel]);

  // Variant styles
  const variantStyles = {
    danger: {
      icon: 'text-red-500',
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      icon: 'text-amber-500',
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    },
    info: {
      icon: 'text-blue-500',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  };

  const styles = variantStyles[variant];

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none" style={{ padding: 'var(--vox-space-4)' }}>
            <motion.div
              ref={modalRef}
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 400 }}
              className="bg-white dark:bg-zinc-900 w-full shadow-2xl pointer-events-auto vox-border-thin border-zinc-200 dark:border-zinc-800"
              style={{
                maxWidth: 'min(24rem, 90vw)',
                borderRadius: 'var(--vox-radius-2xl)',
              }}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirmation-title"
              aria-describedby="confirmation-description"
            >
              {/* Header */}
              <div
                className="flex items-start justify-between"
                style={{ padding: 'var(--vox-space-6)' }}
              >
                <div className="flex items-start" style={{ gap: 'var(--vox-space-4)' }}>
                  <div
                    className={`shrink-0 flex items-center justify-center ${styles.iconBg}`}
                    style={{
                      width: 'clamp(2.5rem, 3vw + 1rem, 3rem)',
                      height: 'clamp(2.5rem, 3vw + 1rem, 3rem)',
                      borderRadius: 'var(--vox-radius-lg)',
                    }}
                  >
                    <AlertTriangle
                      className={styles.icon}
                      style={{ width: 'clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)', height: 'clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)' }}
                    />
                  </div>
                  <div>
                    <h2
                      id="confirmation-title"
                      className="font-semibold text-zinc-900 dark:text-zinc-100 vox-text-lg"
                      style={{ fontSize: 'var(--vox-text-lg)' }}
                    >
                      {title}
                    </h2>
                    <p
                      id="confirmation-description"
                      className="text-zinc-500 dark:text-zinc-400 vox-text-sm"
                      style={{ fontSize: 'var(--vox-text-sm)', marginTop: 'var(--vox-space-1)' }}
                    >
                      {message}
                      {highlightText && (
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {' "'}
                          {highlightText}
                          {'"'}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onCancel}
                  className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors vox-touch-target flex items-center justify-center"
                  style={{
                    padding: 'var(--vox-space-1)',
                    borderRadius: 'var(--vox-radius-md)',
                    minWidth: 'var(--vox-touch-min)',
                    minHeight: 'var(--vox-touch-min)',
                  }}
                  aria-label="Close"
                >
                  <X style={{ width: 'clamp(1rem, 1.125vw + 0.375rem, 1.125rem)', height: 'clamp(1rem, 1.125vw + 0.375rem, 1.125rem)' }} />
                </button>
              </div>

              {/* Actions */}
              <div
                className="flex justify-end vox-border-thin border-t border-zinc-100 dark:border-zinc-800"
                style={{ padding: 'var(--vox-space-4) var(--vox-space-6)', gap: 'var(--vox-space-3)' }}
              >
                <button
                  ref={cancelButtonRef}
                  onClick={onCancel}
                  className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium transition-colors vox-touch-target focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
                  style={{
                    padding: 'var(--vox-space-2) var(--vox-space-4)',
                    borderRadius: 'var(--vox-radius-lg)',
                    fontSize: 'var(--vox-text-sm)',
                    minHeight: 'var(--vox-touch-min)',
                  }}
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  className={`text-white font-medium transition-colors vox-touch-target focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${styles.button}`}
                  style={{
                    padding: 'var(--vox-space-2) var(--vox-space-4)',
                    borderRadius: 'var(--vox-radius-lg)',
                    fontSize: 'var(--vox-text-sm)',
                    minHeight: 'var(--vox-touch-min)',
                  }}
                >
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  // Use portal to render at document root
  return createPortal(modalContent, document.body);
};

export default ConfirmationModal;
