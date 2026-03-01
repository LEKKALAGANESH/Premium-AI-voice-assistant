// 2026 Standard: Global Keyboard Shortcuts System
// Fast, non-blocking shortcuts with platform-aware modifier keys
// Shortcuts only active when not typing in input fields

import { useEffect, useCallback, useMemo } from 'react';

export interface ShortcutAction {
  key: string;
  ctrl?: boolean;  // Ctrl on Windows/Linux, Cmd on Mac
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  disabled?: boolean;
}

export interface KeyboardShortcutsConfig {
  onNewChat?: () => void;
  onOpenSettings?: () => void;
  onToggleSidebar?: () => void;
  onToggleFocusMode?: () => void;
  onOpenSearch?: () => void;
  onOpenTranslator?: () => void;
  onToggleSpeakResponses?: () => void;
  // Flags to disable specific shortcuts
  disabled?: {
    newChat?: boolean;
    settings?: boolean;
    sidebar?: boolean;
    focusMode?: boolean;
    search?: boolean;
    translator?: boolean;
    speakResponses?: boolean;
  };
}

// Detect if running on Mac
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// Get display string for modifier key
export const getModifierKey = (): string => isMac ? '⌘' : 'Ctrl';

// Format shortcut for display (e.g., "⌘N" or "Ctrl+N")
export const formatShortcut = (key: string, ctrl = false, shift = false, alt = false): string => {
  const parts: string[] = [];
  if (ctrl) parts.push(getModifierKey());
  if (alt) parts.push(isMac ? '⌥' : 'Alt');
  if (shift) parts.push(isMac ? '⇧' : 'Shift');
  parts.push(key.toUpperCase());
  return isMac ? parts.join('') : parts.join('+');
};

// Predefined shortcut configurations
export const SHORTCUTS = {
  NEW_CHAT: { key: 'n', ctrl: true, display: () => formatShortcut('n', true) },
  SETTINGS: { key: ',', ctrl: true, display: () => formatShortcut(',', true) },
  TOGGLE_SIDEBAR: { key: 'b', ctrl: true, display: () => formatShortcut('b', true) },
  FOCUS_MODE: { key: '.', ctrl: true, display: () => formatShortcut('.', true) },
  SEARCH: { key: 'k', ctrl: true, display: () => formatShortcut('k', true) },
  TRANSLATOR: { key: 't', ctrl: true, shift: true, display: () => formatShortcut('t', true, true) },
  SPEAK_RESPONSES: { key: 'm', ctrl: true, display: () => formatShortcut('m', true) },
} as const;

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const {
    onNewChat,
    onOpenSettings,
    onToggleSidebar,
    onToggleFocusMode,
    onOpenSearch,
    onOpenTranslator,
    onToggleSpeakResponses,
    disabled = {},
  } = config;

  // Build shortcut actions array
  const shortcuts = useMemo<ShortcutAction[]>(() => [
    {
      key: 'n',
      ctrl: true,
      action: () => onNewChat?.(),
      description: 'New Chat',
      disabled: disabled.newChat || !onNewChat,
    },
    {
      key: ',',
      ctrl: true,
      action: () => onOpenSettings?.(),
      description: 'Open Settings',
      disabled: disabled.settings || !onOpenSettings,
    },
    {
      key: 'b',
      ctrl: true,
      action: () => onToggleSidebar?.(),
      description: 'Toggle Sidebar',
      disabled: disabled.sidebar || !onToggleSidebar,
    },
    {
      key: '.',
      ctrl: true,
      action: () => onToggleFocusMode?.(),
      description: 'Toggle Focus Mode',
      disabled: disabled.focusMode || !onToggleFocusMode,
    },
    {
      key: 'k',
      ctrl: true,
      action: () => onOpenSearch?.(),
      description: 'Search Conversations',
      disabled: disabled.search || !onOpenSearch,
    },
    {
      key: 't',
      ctrl: true,
      shift: true,
      action: () => onOpenTranslator?.(),
      description: 'Open Translator',
      disabled: disabled.translator || !onOpenTranslator,
    },
    {
      key: 'm',
      ctrl: true,
      action: () => onToggleSpeakResponses?.(),
      description: 'Toggle Speak Responses',
      disabled: disabled.speakResponses || !onToggleSpeakResponses,
    },
  ], [onNewChat, onOpenSettings, onToggleSidebar, onToggleFocusMode, onOpenSearch, onOpenTranslator, onToggleSpeakResponses, disabled]);

  // Check if event target is an input element
  const isInputElement = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target.isContentEditable
    );
  }, []);

  // Handle keydown events
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip if typing in an input field (unless it's a global shortcut we want to capture)
    // For most shortcuts, we skip when in input
    // But for some like Escape or specific combos, we might want to allow

    const modifierKey = isMac ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();

    // Find matching shortcut
    for (const shortcut of shortcuts) {
      if (shortcut.disabled) continue;

      const ctrlMatch = shortcut.ctrl ? modifierKey : !modifierKey;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;
      const keyMatch = key === shortcut.key.toLowerCase();

      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        // For shortcuts with modifiers, always trigger (even in inputs)
        // This allows quick navigation without leaving the input
        if (shortcut.ctrl || shortcut.alt) {
          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          return;
        }

        // For shortcuts without modifiers, only trigger outside inputs
        if (!isInputElement(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          return;
        }
      }
    }
  }, [shortcuts, isInputElement]);

  // Attach global listener
  useEffect(() => {
    // Use capture phase for faster response
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  return { shortcuts, SHORTCUTS };
}

export default useKeyboardShortcuts;
