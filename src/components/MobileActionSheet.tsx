// 2026 Standard: Mobile Action Sheet for Conversation Context Menu
// Bottom sheet pattern for better thumb-reach accessibility

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin, PinOff, Pencil, Share2, Trash2, Copy, FileText, Download } from 'lucide-react';

export interface ActionSheetAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  variant?: 'default' | 'danger';
  onClick: () => void;
}

interface MobileActionSheetProps {
  isOpen: boolean;
  title?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}

const MobileActionSheet: React.FC<MobileActionSheetProps> = ({
  isOpen,
  title,
  actions,
  onClose,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Handle ESC key and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Focus first action
    setTimeout(() => {
      const firstButton = sheetRef.current?.querySelector('button[data-action]') as HTMLElement;
      firstButton?.focus();
    }, 100);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const sheetContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
            aria-hidden="true"
          />

          {/* Bottom Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed inset-x-0 bottom-0 bg-white dark:bg-zinc-900 z-[100] shadow-2xl"
            style={{
              borderTopLeftRadius: 'var(--vox-radius-2xl)',
              borderTopRightRadius: 'var(--vox-radius-2xl)',
              maxHeight: '80vh',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Action menu"
          >
            {/* Drag Handle */}
            <div
              className="flex justify-center"
              style={{ padding: 'var(--vox-space-3)' }}
            >
              <div
                className="bg-zinc-300 dark:bg-zinc-600 rounded-full"
                style={{ width: '2.5rem', height: '0.25rem' }}
              />
            </div>

            {/* Header */}
            {title && (
              <div
                className="flex items-center justify-between vox-border-thin border-b border-zinc-100 dark:border-zinc-800"
                style={{ padding: '0 var(--vox-space-4) var(--vox-space-3)' }}
              >
                <h3
                  className="font-medium text-zinc-500 dark:text-zinc-400 vox-text-sm truncate"
                  style={{ fontSize: 'var(--vox-text-sm)', maxWidth: 'calc(100% - 3rem)' }}
                >
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors vox-touch-target flex items-center justify-center"
                  style={{
                    padding: 'var(--vox-space-2)',
                    borderRadius: 'var(--vox-radius-md)',
                    minWidth: 'var(--vox-touch-min)',
                    minHeight: 'var(--vox-touch-min)',
                  }}
                  aria-label="Close menu"
                >
                  <X style={{ width: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)', height: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)' }} />
                </button>
              </div>
            )}

            {/* Actions */}
            <div
              className="overflow-y-auto"
              style={{ padding: 'var(--vox-space-2)' }}
            >
              {actions.map((action) => (
                <button
                  key={action.id}
                  data-action={action.id}
                  onClick={() => {
                    action.onClick();
                    onClose();
                  }}
                  className={`w-full flex items-center transition-colors vox-touch-target ${
                    action.variant === 'danger'
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  style={{
                    gap: 'var(--vox-space-4)',
                    padding: 'var(--vox-space-4)',
                    borderRadius: 'var(--vox-radius-lg)',
                    minHeight: 'var(--vox-touch-min)',
                  }}
                >
                  <span
                    className="shrink-0"
                    style={{ width: 'clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)', height: 'clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)' }}
                  >
                    {action.icon}
                  </span>
                  <span
                    className="font-medium vox-text-base"
                    style={{ fontSize: 'var(--vox-text-base)' }}
                  >
                    {action.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Cancel Button */}
            <div
              className="vox-border-thin border-t border-zinc-100 dark:border-zinc-800"
              style={{ padding: 'var(--vox-space-3)' }}
            >
              <button
                onClick={onClose}
                className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium transition-colors vox-touch-target"
                style={{
                  padding: 'var(--vox-space-4)',
                  borderRadius: 'var(--vox-radius-lg)',
                  fontSize: 'var(--vox-text-base)',
                  minHeight: 'var(--vox-touch-min)',
                }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(sheetContent, document.body);
};

export default MobileActionSheet;

// Export action icons for convenience
export const ActionIcons = {
  Pin: <Pin className="w-full h-full" />,
  Unpin: <PinOff className="w-full h-full" />,
  Rename: <Pencil className="w-full h-full" />,
  Share: <Share2 className="w-full h-full" />,
  CopyText: <Copy className="w-full h-full" />,
  ExportMd: <FileText className="w-full h-full" />,
  Download: <Download className="w-full h-full" />,
  Delete: <Trash2 className="w-full h-full" />,
};
