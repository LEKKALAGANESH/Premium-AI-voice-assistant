// 2026 Standard: Context Menu Hook for Conversation Management
// Handles dropdown state, click-outside, ESC key, and focus management

import { useState, useCallback, useEffect, useRef } from 'react';

export interface ContextMenuState {
  isOpen: boolean;
  activeId: string | null;
  position: { top: number; left: number } | null;
}

export interface UseContextMenuReturn {
  state: ContextMenuState;
  openMenu: (id: string, anchorRect: DOMRect) => void;
  closeMenu: () => void;
  isMenuOpen: (id: string) => boolean;
  triggerRef: React.RefObject<HTMLButtonElement>;
  menuRef: React.RefObject<HTMLDivElement>;
}

export const useContextMenu = (): UseContextMenuReturn => {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    activeId: null,
    position: null,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Open menu at anchor position
  const openMenu = useCallback((id: string, anchorRect: DOMRect) => {
    // Store the trigger button for focus restoration
    lastTriggerRef.current = document.activeElement as HTMLButtonElement;

    // Calculate position (below and aligned to right edge of anchor)
    const position = {
      top: anchorRect.bottom + 4,
      left: anchorRect.right - 180, // Menu width ~180px, align to right
    };

    // Ensure menu doesn't overflow viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position if overflowing
    if (position.left < 8) {
      position.left = 8;
    }
    if (position.left + 180 > viewportWidth - 8) {
      position.left = viewportWidth - 188;
    }

    // Adjust vertical position if overflowing (show above instead)
    if (position.top + 200 > viewportHeight) {
      position.top = anchorRect.top - 204;
    }

    setState({
      isOpen: true,
      activeId: id,
      position,
    });
  }, []);

  // Close menu and restore focus
  const closeMenu = useCallback(() => {
    setState({
      isOpen: false,
      activeId: null,
      position: null,
    });

    // Restore focus to the trigger button
    if (lastTriggerRef.current) {
      setTimeout(() => {
        lastTriggerRef.current?.focus();
      }, 0);
    }
  }, []);

  // Check if a specific menu is open
  const isMenuOpen = useCallback((id: string) => {
    return state.isOpen && state.activeId === id;
  }, [state.isOpen, state.activeId]);

  // Click outside handler
  useEffect(() => {
    if (!state.isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is outside both menu and trigger
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        closeMenu();
      }
    };

    // Delay to prevent immediate close on open click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [state.isOpen, closeMenu]);

  // ESC key handler
  useEffect(() => {
    if (!state.isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.isOpen, closeMenu]);

  // Focus first menu item when opened
  useEffect(() => {
    if (state.isOpen && menuRef.current) {
      const firstFocusable = menuRef.current.querySelector(
        'button, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;

      if (firstFocusable) {
        setTimeout(() => {
          firstFocusable.focus();
        }, 50);
      }
    }
  }, [state.isOpen]);

  return {
    state,
    openMenu,
    closeMenu,
    isMenuOpen,
    triggerRef,
    menuRef,
  };
};

export default useContextMenu;
