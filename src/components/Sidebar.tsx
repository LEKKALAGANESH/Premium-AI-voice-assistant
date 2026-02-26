// 2026 Standard: Restructured Sidebar with Top Row Controls
// Hierarchy: [Toggle + Search] -> [+ New Chat] -> Conversations -> [Settings]

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Conversation } from '../types';
import { Menu, Search, Plus, Settings, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConversationItem from './ConversationItem';

interface SidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onPin: (id: string) => void;
  onToggle: () => void;
  onOpenSettings: () => void;
  isMobile: boolean;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchClear: () => void;
}

// Sort conversations: Pinned first, then by updatedAt desc
const sortConversations = (conversations: Conversation[]): Conversation[] => {
  return [...conversations].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });
};

// Format helpers
const formatConversationAsText = (conv: Conversation): string => {
  let output = `${conv.title}\n${'='.repeat(conv.title.length)}\n\n`;
  conv.messages.forEach((msg) => {
    output += `${msg.role === 'user' ? 'You' : 'VoxAI'}:\n${msg.content}\n\n`;
  });
  return output;
};

const formatConversationAsMarkdown = (conv: Conversation): string => {
  let output = `# ${conv.title}\n\n*Exported from VoxAI on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
  conv.messages.forEach((msg) => {
    output += `### ${msg.role === 'user' ? '**You**' : '**VoxAI**'}\n\n${msg.content}\n\n`;
  });
  return output;
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const Sidebar = ({
  conversations,
  currentId,
  collapsed,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onPin,
  onToggle,
  onOpenSettings,
  isMobile,
  isMobileOpen,
  onMobileClose,
  searchQuery,
  onSearchChange,
  onSearchClear,
}: SidebarProps) => {
  const sidebarRef = useRef<HTMLElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const sortedConversations = useMemo(() => sortConversations(conversations), [conversations]);

  // Focus management
  useEffect(() => {
    if (isMobile && isMobileOpen && firstFocusableRef.current) {
      setTimeout(() => firstFocusableRef.current?.focus(), 100);
    }
  }, [isMobile, isMobileOpen]);

  useEffect(() => {
    if (!isMobileOpen && isMobile) setOpenMenuId(null);
  }, [isMobileOpen, isMobile]);

  // ESC to close search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        onSearchClear();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, onSearchClear]);

  // Focus search input
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleSelect = useCallback((id: string) => {
    onSelect(id);
    setOpenMenuId(null);
    if (isMobile) onMobileClose();
  }, [onSelect, isMobile, onMobileClose]);

  const handleOpenSettings = useCallback(() => {
    onOpenSettings();
    setOpenMenuId(null);
    if (isMobile) onMobileClose();
  }, [onOpenSettings, isMobile, onMobileClose]);

  const handleShare = useCallback((conv: Conversation, format: 'text' | 'markdown' | 'txt') => {
    const sanitizedTitle = conv.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    switch (format) {
      case 'text':
        navigator.clipboard.writeText(formatConversationAsText(conv));
        break;
      case 'markdown':
        downloadFile(formatConversationAsMarkdown(conv), `${sanitizedTitle}.md`, 'text/markdown');
        break;
      case 'txt':
        downloadFile(formatConversationAsText(conv), `${sanitizedTitle}.txt`, 'text/plain');
        break;
    }
  }, []);

  const handleSearchToggle = useCallback(() => {
    if (isSearchOpen) {
      setIsSearchOpen(false);
      onSearchClear();
    } else {
      setIsSearchOpen(true);
    }
  }, [isSearchOpen, onSearchClear]);

  const handleNewChat = useCallback(() => {
    onCreate();
    setOpenMenuId(null);
    if (isMobile) onMobileClose();
  }, [onCreate, isMobile, onMobileClose]);

  const iconSize = { width: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)', height: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)' };

  // Sidebar content with new hierarchy
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* TOP ROW: Toggle (left) + Search (right) */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: 'var(--vox-space-3)' }}
      >
        <button
          ref={firstFocusableRef}
          onClick={isMobile ? onMobileClose : onToggle}
          className="flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          style={{
            padding: 'var(--vox-space-2)',
            borderRadius: 'var(--vox-radius-md)',
            minWidth: 'var(--vox-touch-min)',
            minHeight: 'var(--vox-touch-min)',
          }}
          aria-label={isMobile ? 'Close sidebar' : (collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
        >
          {isMobile ? (
            <X style={iconSize} />
          ) : collapsed ? (
            <ChevronRight style={iconSize} />
          ) : (
            <Menu style={iconSize} />
          )}
        </button>

        {(!collapsed || isMobile) && (
          <button
            onClick={handleSearchToggle}
            className={`flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${isSearchOpen ? 'bg-zinc-200 dark:bg-zinc-800' : ''}`}
            style={{
              padding: 'var(--vox-space-2)',
              borderRadius: 'var(--vox-radius-md)',
              minWidth: 'var(--vox-touch-min)',
              minHeight: 'var(--vox-touch-min)',
            }}
            aria-label={isSearchOpen ? 'Close search' : 'Search conversations'}
          >
            {isSearchOpen ? <X style={iconSize} /> : <Search style={iconSize} />}
          </button>
        )}
      </div>

      {/* SEARCH INPUT (expandable) */}
      <AnimatePresence>
        {isSearchOpen && (!collapsed || isMobile) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden flex-shrink-0"
            style={{ padding: '0 var(--vox-space-3)' }}
          >
            <div className="relative" style={{ marginBottom: 'var(--vox-space-2)' }}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search chats..."
                className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 outline-none"
                style={{
                  padding: 'var(--vox-space-2) var(--vox-space-3)',
                  borderRadius: 'var(--vox-radius-md)',
                  fontSize: 'var(--vox-text-sm)',
                }}
              />
              {searchQuery && (
                <button
                  onClick={onSearchClear}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  aria-label="Clear search"
                >
                  <X style={{ width: '14px', height: '14px' }} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NEW CHAT BUTTON */}
      {(!collapsed || isMobile) && (
        <div className="flex-shrink-0" style={{ padding: '0 var(--vox-space-3)', marginBottom: 'var(--vox-space-3)' }}>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            style={{
              gap: 'var(--vox-space-2)',
              padding: 'var(--vox-space-3)',
              borderRadius: 'var(--vox-radius-lg)',
              minHeight: 'var(--vox-touch-min)',
            }}
            aria-label="New Chat"
          >
            <Plus style={iconSize} />
            <span className="font-medium" style={{ fontSize: 'var(--vox-text-sm)' }}>New Chat</span>
          </button>
        </div>
      )}

      {/* Collapsed: Icon-only new chat */}
      {collapsed && !isMobile && (
        <div className="flex-shrink-0 flex justify-center" style={{ marginBottom: 'var(--vox-space-3)' }}>
          <button
            onClick={handleNewChat}
            className="flex items-center justify-center bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            style={{
              padding: 'var(--vox-space-3)',
              borderRadius: 'var(--vox-radius-lg)',
              minWidth: 'var(--vox-touch-min)',
              minHeight: 'var(--vox-touch-min)',
            }}
            aria-label="New Chat"
          >
            <Plus style={iconSize} />
          </button>
        </div>
      )}

      {/* CONVERSATIONS LIST */}
      <div
        className="flex-1 overflow-y-auto vox-ghost-scroll"
        style={{ padding: '0 var(--vox-space-3)' }}
      >
        {searchQuery && (!collapsed || isMobile) && (
          <div
            className="text-zinc-500 dark:text-zinc-400"
            style={{ fontSize: 'var(--vox-text-xs)', padding: 'var(--vox-space-2)', marginBottom: 'var(--vox-space-2)' }}
          >
            {sortedConversations.length > 0
              ? `${sortedConversations.length} result${sortedConversations.length !== 1 ? 's' : ''}`
              : 'No results'}
          </div>
        )}

        <div className="space-y-1">
          {sortedConversations.length > 0 ? (
            sortedConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={currentId === conv.id}
                isCollapsed={collapsed && !isMobile}
                isMobile={isMobile}
                onSelect={() => handleSelect(conv.id)}
                onRename={(newTitle) => onRename(conv.id, newTitle)}
                onPin={() => onPin(conv.id)}
                onDelete={() => onDelete(conv.id)}
                onShare={(format) => handleShare(conv, format)}
                openMenuId={openMenuId}
                onMenuOpen={setOpenMenuId}
                onMenuClose={() => setOpenMenuId(null)}
              />
            ))
          ) : !searchQuery && (
            <div
              className="text-zinc-400 dark:text-zinc-600 text-center"
              style={{ fontSize: 'var(--vox-text-sm)', padding: 'var(--vox-space-8) 0' }}
            >
              {collapsed && !isMobile ? '' : 'No conversations yet'}
            </div>
          )}
        </div>
      </div>

      {/* SETTINGS BUTTON - Anchored to bottom */}
      <div className="flex-shrink-0" style={{ padding: 'var(--vox-space-3)' }}>
        <button
          onClick={handleOpenSettings}
          className={`flex items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors ${collapsed && !isMobile ? 'justify-center w-full' : 'w-full'}`}
          style={{
            gap: 'var(--vox-space-3)',
            padding: 'var(--vox-space-3)',
            borderRadius: 'var(--vox-radius-lg)',
            minHeight: 'var(--vox-touch-min)',
          }}
          aria-label="Settings"
        >
          <Settings style={iconSize} />
          {(!collapsed || isMobile) && (
            <span className="font-medium" style={{ fontSize: 'var(--vox-text-sm)' }}>Settings</span>
          )}
        </button>
      </div>
    </div>
  );

  // Mobile drawer
  if (isMobile) {
    return (
      <>
        <button
          onClick={onToggle}
          className="vox-mobile-toggle"
          aria-label="Open sidebar menu"
          aria-expanded={isMobileOpen}
          style={{
            position: 'fixed',
            top: 'var(--vox-space-4)',
            left: 'var(--vox-space-4)',
            zIndex: 60,
            display: isMobileOpen ? 'none' : 'flex',
          }}
        >
          <Menu style={{ width: 'clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)', height: 'clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)' }} />
        </button>

        <AnimatePresence>
          {isMobileOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onMobileClose}
              className="vox-sidebar-backdrop"
              aria-hidden="true"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isMobileOpen && (
            <motion.aside
              ref={sidebarRef}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 left-0 bg-zinc-50 dark:bg-zinc-950 flex flex-col"
              style={{ width: 'var(--vox-sidebar-expanded)', zIndex: 50 }}
              role="dialog"
              aria-modal="true"
              aria-label="Sidebar navigation"
            >
              {sidebarContent}
            </motion.aside>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Desktop sidebar
  return (
    <aside
      ref={sidebarRef}
      className="h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col transition-all duration-300"
      style={{
        width: collapsed ? 'var(--vox-sidebar-collapsed)' : 'var(--vox-sidebar-expanded)',
        zIndex: 40,
      }}
    >
      {sidebarContent}
    </aside>
  );
};

export default Sidebar;
