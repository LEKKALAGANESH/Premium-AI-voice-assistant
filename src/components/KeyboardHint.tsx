// 2026 Standard: Keyboard Shortcut Hint Component
// Shows keyboard shortcut only on hover - zero space when not hovered
// Fast rendering with CSS-only visibility toggle

import React from 'react';

interface KeyboardHintProps {
  shortcut: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

/**
 * KeyboardHint - Displays keyboard shortcut on hover
 *
 * Usage:
 * <div className="group relative">
 *   <button>Click me</button>
 *   <KeyboardHint shortcut="⌘N" position="bottom" />
 * </div>
 *
 * The parent must have "group relative" classes for hover detection and positioning.
 */
export const KeyboardHint: React.FC<KeyboardHintProps> = ({
  shortcut,
  position = 'bottom',
  className = '',
}) => {
  // Position styles based on direction
  const positionStyles: Record<string, React.CSSProperties> = {
    top: {
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginBottom: '4px',
    },
    bottom: {
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginTop: '4px',
    },
    left: {
      right: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      marginRight: '4px',
    },
    right: {
      left: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      marginLeft: '4px',
    },
  };

  return (
    <span
      className={`
        absolute z-50 pointer-events-none
        opacity-0 group-hover:opacity-100
        scale-95 group-hover:scale-100
        transition-all duration-150 ease-out
        bg-zinc-800 dark:bg-zinc-200
        text-zinc-100 dark:text-zinc-900
        font-mono font-medium
        whitespace-nowrap
        shadow-lg
        ${className}
      `}
      style={{
        ...positionStyles[position],
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '11px',
        letterSpacing: '0.02em',
      }}
      aria-hidden="true"
    >
      {shortcut}
    </span>
  );
};

/**
 * InlineKeyboardHint - Shows shortcut inline, only visible on parent hover
 * More compact, designed to appear next to text labels
 */
export const InlineKeyboardHint: React.FC<{
  shortcut: string;
  className?: string;
}> = ({ shortcut, className = '' }) => {
  return (
    <span
      className={`
        ml-auto
        opacity-0 group-hover:opacity-60
        transition-opacity duration-150
        font-mono text-zinc-400 dark:text-zinc-500
        ${className}
      `}
      style={{
        fontSize: '10px',
        letterSpacing: '0.02em',
      }}
      aria-hidden="true"
    >
      {shortcut}
    </span>
  );
};

export default KeyboardHint;
