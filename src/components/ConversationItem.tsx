// 2026 Standard: Conversation Item with Contextual Action Menu
// Features: Pin, Inline Rename, Share (Copy/MD/TXT), Safe Delete

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Conversation } from '../types';
import { MoreVertical, Pin, PinOff, Pencil, Share2, Trash2, Copy, FileText, Download, Check } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import MobileActionSheet, { ActionSheetAction } from './MobileActionSheet';
import ConfirmationModal from './ConfirmationModal';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  isCollapsed: boolean;
  isMobile: boolean;
  onSelect: () => void;
  onRename: (newTitle: string) => void;
  onPin: () => void;
  onDelete: () => void;
  onShare: (format: 'text' | 'markdown' | 'txt') => void;
  // Menu state management (single menu open at a time)
  openMenuId: string | null;
  onMenuOpen: (id: string) => void;
  onMenuClose: () => void;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  isCollapsed,
  isMobile,
  onSelect,
  onRename,
  onPin,
  onDelete,
  onShare,
  openMenuId,
  onMenuOpen,
  onMenuClose,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  const isMenuOpen = openMenuId === conversation.id;

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Handle click outside for menu
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(target)
      ) {
        onMenuClose();
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onMenuClose();
        menuButtonRef.current?.focus();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isMenuOpen, onMenuClose]);

  // Handle menu open with position calculation
  const handleMenuOpen = useCallback(() => {
    if (menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const menuWidth = 180;
      const menuHeight = 200;

      let left = rect.right - menuWidth;
      let top = rect.bottom + 4;

      // Viewport bounds check
      if (left < 8) left = 8;
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (top + menuHeight > window.innerHeight - 8) {
        top = rect.top - menuHeight - 4;
      }

      setMenuPosition({ top, left });
      onMenuOpen(conversation.id);
    }
  }, [conversation.id, onMenuOpen]);

  // Handle rename submission
  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(trimmed);
    } else {
      setRenameValue(conversation.title);
    }
    setIsRenaming(false);
  }, [renameValue, conversation.title, onRename]);

  // Handle rename cancel
  const handleRenameCancel = useCallback(() => {
    setRenameValue(conversation.title);
    setIsRenaming(false);
  }, [conversation.title]);

  // Handle rename key events
  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleRenameCancel();
    }
  }, [handleRenameSubmit, handleRenameCancel]);

  // Handle title hover for tooltip
  const handleTitleHover = useCallback(() => {
    if (titleRef.current && itemRef.current) {
      // Check if text is truncated
      const isOverflowing = titleRef.current.scrollWidth > titleRef.current.clientWidth;
      if (isOverflowing) {
        const rect = itemRef.current.getBoundingClientRect();
        setTooltipPosition({
          top: rect.top + rect.height / 2,
          left: rect.right + 8, // 8px gap from sidebar
        });
        setShowTooltip(true);
      }
    }
  }, []);

  const handleTitleLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  // Copy to clipboard with feedback
  const handleCopyText = useCallback(async () => {
    try {
      await onShare('text');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      onMenuClose();
    } catch {
      console.error('Failed to copy');
    }
  }, [onShare, onMenuClose]);

  // Mobile action sheet actions
  const mobileActions: ActionSheetAction[] = [
    {
      id: 'pin',
      label: conversation.isPinned ? 'Unpin' : 'Pin to Top',
      icon: conversation.isPinned ? <PinOff className="w-full h-full" /> : <Pin className="w-full h-full" />,
      onClick: () => { onPin(); onMenuClose(); },
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Pencil className="w-full h-full" />,
      onClick: () => { setIsRenaming(true); onMenuClose(); },
    },
    {
      id: 'copy',
      label: 'Copy as Text',
      icon: <Copy className="w-full h-full" />,
      onClick: handleCopyText,
    },
    {
      id: 'export-md',
      label: 'Export as Markdown',
      icon: <FileText className="w-full h-full" />,
      onClick: () => { onShare('markdown'); onMenuClose(); },
    },
    {
      id: 'download',
      label: 'Download as .txt',
      icon: <Download className="w-full h-full" />,
      onClick: () => { onShare('txt'); onMenuClose(); },
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className="w-full h-full" />,
      variant: 'danger' as const,
      onClick: () => { setShowDeleteConfirm(true); onMenuClose(); },
    },
  ];

  // Dropdown menu (portal for overflow safety)
  const dropdownMenu = isMenuOpen && !isMobile && menuPosition && createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.1 }}
      className="fixed bg-white dark:bg-zinc-900 shadow-xl vox-border-thin border-zinc-200 dark:border-zinc-800 overflow-hidden"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
        width: '11rem',
        borderRadius: 'var(--vox-radius-xl)',
        zIndex: 100,
      }}
      role="menu"
      aria-label="Conversation actions"
    >
      {/* Pin/Unpin */}
      <button
        onClick={() => { onPin(); onMenuClose(); }}
        className="w-full flex items-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        style={{ gap: 'var(--vox-space-3)', padding: 'var(--vox-space-3)' }}
        role="menuitem"
      >
        {conversation.isPinned ? (
          <PinOff style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
        ) : (
          <Pin style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
        )}
        <span className="vox-text-sm" style={{ fontSize: 'var(--vox-text-sm)' }}>
          {conversation.isPinned ? 'Unpin' : 'Pin to Top'}
        </span>
      </button>

      {/* Rename */}
      <button
        onClick={() => { setIsRenaming(true); onMenuClose(); }}
        className="w-full flex items-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        style={{ gap: 'var(--vox-space-3)', padding: 'var(--vox-space-3)' }}
        role="menuitem"
      >
        <Pencil style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
        <span className="vox-text-sm" style={{ fontSize: 'var(--vox-text-sm)' }}>Rename</span>
      </button>

      {/* Share submenu trigger */}
      <div className="relative">
        <button
          onClick={() => setShowShareMenu(!showShareMenu)}
          className="w-full flex items-center justify-between text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          style={{ gap: 'var(--vox-space-3)', padding: 'var(--vox-space-3)' }}
          role="menuitem"
          aria-expanded={showShareMenu}
        >
          <div className="flex items-center" style={{ gap: 'var(--vox-space-3)' }}>
            <Share2 style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
            <span className="vox-text-sm" style={{ fontSize: 'var(--vox-text-sm)' }}>Share</span>
          </div>
          <span className="text-zinc-400 vox-text-xs" style={{ fontSize: 'var(--vox-text-xs)' }}>▶</span>
        </button>

        {/* Share submenu */}
        <AnimatePresence>
          {showShareMenu && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              className="bg-zinc-50 dark:bg-zinc-800/50"
              style={{ padding: 'var(--vox-space-1) 0' }}
            >
              <button
                onClick={handleCopyText}
                className="w-full flex items-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                style={{ gap: 'var(--vox-space-3)', padding: 'var(--vox-space-2) var(--vox-space-3) var(--vox-space-2) var(--vox-space-6)' }}
                role="menuitem"
              >
                {copySuccess ? (
                  <Check style={{ width: 'clamp(0.75rem, 0.875vw + 0.25rem, 0.875rem)', height: 'clamp(0.75rem, 0.875vw + 0.25rem, 0.875rem)' }} className="text-green-500" />
                ) : (
                  <Copy style={{ width: 'clamp(0.75rem, 0.875vw + 0.25rem, 0.875rem)', height: 'clamp(0.75rem, 0.875vw + 0.25rem, 0.875rem)' }} />
                )}
                <span className="vox-text-xs" style={{ fontSize: 'var(--vox-text-xs)' }}>
                  {copySuccess ? 'Copied!' : 'Copy as Text'}
                </span>
              </button>
              <button
                onClick={() => { onShare('markdown'); onMenuClose(); }}
                className="w-full flex items-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                style={{ gap: 'var(--vox-space-3)', padding: 'var(--vox-space-2) var(--vox-space-3) var(--vox-space-2) var(--vox-space-6)' }}
                role="menuitem"
              >
                <FileText style={{ width: 'clamp(0.75rem, 0.875vw + 0.25rem, 0.875rem)', height: 'clamp(0.75rem, 0.875vw + 0.25rem, 0.875rem)' }} />
                <span className="vox-text-xs" style={{ fontSize: 'var(--vox-text-xs)' }}>Export as .md</span>
              </button>
              <button
                onClick={() => { onShare('txt'); onMenuClose(); }}
                className="w-full flex items-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                style={{ gap: 'var(--vox-space-3)', padding: 'var(--vox-space-2) var(--vox-space-3) var(--vox-space-2) var(--vox-space-6)' }}
                role="menuitem"
              >
                <Download style={{ width: 'clamp(0.75rem, 0.875vw + 0.25rem, 0.875rem)', height: 'clamp(0.75rem, 0.875vw + 0.25rem, 0.875rem)' }} />
                <span className="vox-text-xs" style={{ fontSize: 'var(--vox-text-xs)' }}>Download as .txt</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <div className="vox-border-thin border-t border-zinc-100 dark:border-zinc-800" style={{ margin: 'var(--vox-space-1) 0' }} />

      {/* Delete */}
      <button
        onClick={() => { setShowDeleteConfirm(true); onMenuClose(); }}
        className="w-full flex items-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        style={{ gap: 'var(--vox-space-3)', padding: 'var(--vox-space-3)' }}
        role="menuitem"
      >
        <Trash2 style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
        <span className="vox-text-sm" style={{ fontSize: 'var(--vox-text-sm)' }}>Delete</span>
      </button>
    </motion.div>,
    document.body
  );

  // Tooltip portal
  const titleTooltip = showTooltip && tooltipPosition && createPortal(
    <div
      className="fixed bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 rounded-lg shadow-lg z-[200] pointer-events-none"
      style={{
        top: tooltipPosition.top,
        left: tooltipPosition.left,
        transform: 'translateY(-50%)',
        maxWidth: '300px',
        fontSize: 'var(--vox-text-sm)',
        whiteSpace: 'nowrap',
      }}
    >
      {conversation.title}
    </div>,
    document.body
  );

  return (
    <>
      <div ref={itemRef} className="group relative">
        {/* Main conversation button */}
        <button
          onClick={isRenaming ? undefined : onSelect}
          onMouseEnter={handleTitleHover}
          onMouseLeave={handleTitleLeave}
          className={twMerge(
            'w-full flex items-center transition-all vox-touch-target',
            isActive
              ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium'
              : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900',
            isCollapsed && !isMobile && 'justify-center',
            isRenaming && 'pointer-events-none'
          )}
          style={{
            padding: 'var(--vox-space-3)',
            paddingRight: !isCollapsed || isMobile ? 'var(--vox-space-8)' : undefined,
            borderRadius: 'var(--vox-radius-lg)',
            minHeight: 'var(--vox-touch-min)',
          }}
          aria-label={isRenaming ? undefined : `Select conversation: ${conversation.title}`}
          disabled={isRenaming}
        >
          {/* Pin indicator (small, inline) */}
          {conversation.isPinned && (
            <Pin
              className="shrink-0 text-brand-500 mr-2"
              style={{ width: '0.75rem', height: '0.75rem' }}
            />
          )}

          {/* Title or Rename Input */}
          {(!isCollapsed || isMobile) && (
            isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                className="flex-1 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white vox-text-sm vox-border-thin border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                style={{
                  fontSize: 'var(--vox-text-sm)',
                  padding: 'var(--vox-space-1) var(--vox-space-2)',
                  borderRadius: 'var(--vox-radius-md)',
                  minWidth: 0,
                }}
                aria-label="Rename conversation"
              />
            ) : (
              <span
                ref={titleRef}
                className="truncate flex-1 text-left vox-text-sm"
                style={{ fontSize: 'var(--vox-text-sm)' }}
              >
                {conversation.title}
              </span>
            )
          )}
        </button>

        {/* Context Menu Button (3-dots) */}
        {(!isCollapsed || isMobile) && !isRenaming && (
          <button
            ref={menuButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              if (isMenuOpen) {
                onMenuClose();
              } else {
                handleMenuOpen();
              }
            }}
            className={twMerge(
              'absolute right-1 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all vox-touch-target flex items-center justify-center',
              isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
            )}
            style={{
              padding: 'var(--vox-space-1)',
              borderRadius: 'var(--vox-radius-md)',
              minWidth: 'calc(var(--vox-touch-min) * 0.8)',
              minHeight: 'calc(var(--vox-touch-min) * 0.8)',
            }}
            aria-label="Open conversation menu"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <MoreVertical style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
          </button>
        )}
      </div>

      {/* Desktop Dropdown Menu (Portal) */}
      <AnimatePresence>
        {dropdownMenu}
      </AnimatePresence>

      {/* Title Tooltip (Portal) */}
      {titleTooltip}

      {/* Mobile Action Sheet */}
      <MobileActionSheet
        isOpen={isMenuOpen && isMobile}
        title={conversation.title}
        actions={mobileActions}
        onClose={onMenuClose}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete Conversation"
        message="Are you sure you want to delete"
        highlightText={conversation.title}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          onDelete();
          setShowDeleteConfirm(false);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
};

export default ConversationItem;
