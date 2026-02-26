// 2026 Standard: Mobile Sidebar Hook with Slide-over Drawer Pattern
// Handles responsive sidebar behavior across 320px to 4K displays

import { useState, useEffect, useCallback, useMemo } from 'react';

interface MobileSidebarState {
  isMobile: boolean;
  isOpen: boolean;
  shouldShowBackdrop: boolean;
}

interface UseMobileSidebarReturn {
  isMobile: boolean;
  isOpen: boolean;
  shouldShowBackdrop: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

// Mobile breakpoint threshold (768px matches Tailwind md:)
const MOBILE_BREAKPOINT = 768;

export const useMobileSidebar = (
  desktopCollapsed: boolean,
  onDesktopToggle: () => void
): UseMobileSidebarReturn => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect viewport size and update mobile state
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);

      // Close mobile sidebar if resizing to desktop
      if (!mobile && mobileOpen) {
        setMobileOpen(false);
      }
    };

    // Initial check
    checkMobile();

    // Listen for resize with debounce for performance
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkMobile, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [mobileOpen]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };

    if (isMobile && mobileOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isMobile, mobileOpen]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobile, mobileOpen]);

  const openSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen(true);
    }
  }, [isMobile]);

  const closeSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen(false);
    }
  }, [isMobile]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen(prev => !prev);
    } else {
      // On desktop, use the push/minimize pattern
      onDesktopToggle();
    }
  }, [isMobile, onDesktopToggle]);

  // Compute derived state
  const state = useMemo<MobileSidebarState>(() => ({
    isMobile,
    isOpen: isMobile ? mobileOpen : !desktopCollapsed,
    shouldShowBackdrop: isMobile && mobileOpen,
  }), [isMobile, mobileOpen, desktopCollapsed]);

  return {
    ...state,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  };
};

export default useMobileSidebar;
