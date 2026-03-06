// ModeSelector: Compact inline mode switcher with floating dropdown
// Positioned inside the input bar, left of the Voice/Send button
// One-thumb friendly: tap icon to open, tap mode to select + auto-close

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, GraduationCap, Languages, BookOpen, Code, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { VoxMode, MODE_ORDER, MODES } from '../lib/modes';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  sparkles: Sparkles,
  'graduation-cap': GraduationCap,
  languages: Languages,
  'book-open': BookOpen,
  code: Code,
};

interface ModeSelectorProps {
  activeMode: VoxMode;
  onModeChange: (mode: VoxMode) => void;
  disabled?: boolean;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ activeMode, onModeChange, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeConfig = MODES[activeMode];
  const ActiveIcon = ICON_MAP[activeConfig.icon] || Sparkles;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleSelect = useCallback((mode: VoxMode) => {
    onModeChange(mode);
    setIsOpen(false);
  }, [onModeChange]);

  return (
    <div ref={containerRef} className="relative shrink-0 flex items-center justify-center">
      {/* Trigger Button: Shows current mode icon */}
      <button
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        disabled={disabled}
        aria-label={`Current mode: ${activeConfig.label}. Click to change.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={clsx(
          'vox-mode-trigger flex items-center justify-center rounded-full transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          'hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60',
          isOpen && 'bg-zinc-200/80 dark:bg-zinc-700/80',
          disabled && 'opacity-40 cursor-not-allowed'
        )}
        style={{
          width: '36px',
          height: '36px',
          minWidth: '36px',
        }}
      >
        <ActiveIcon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
      </button>

      {/* Floating Dropdown: Opens upward from the input bar */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="vox-mode-dropdown absolute z-50"
            style={{
              bottom: 'calc(100% + 8px)',
              right: 0,
              minWidth: '180px',
            }}
            role="listbox"
            aria-label="Select AI mode"
          >
            <div
              className="vox-mode-dropdown-inner rounded-xl overflow-hidden"
              style={{
                padding: '4px',
                borderRadius: 'var(--vox-radius-xl)',
              }}
            >
              {MODE_ORDER.map((modeId) => {
                const mode = MODES[modeId];
                const Icon = ICON_MAP[mode.icon];
                const isActive = activeMode === modeId;

                return (
                  <button
                    key={modeId}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelect(modeId)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                      isActive
                        ? 'bg-brand-500 text-white'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    )}
                  >
                    {Icon && (
                      <Icon className={clsx(
                        'w-4 h-4 shrink-0',
                        isActive ? 'text-white' : 'text-zinc-400 dark:text-zinc-500'
                      )} />
                    )}
                    <div className="flex flex-col items-start min-w-0">
                      <span className="text-sm font-medium leading-tight">{mode.label}</span>
                      <span className={clsx(
                        'text-xs leading-tight truncate',
                        isActive ? 'text-white/70' : 'text-zinc-400 dark:text-zinc-500'
                      )}>
                        {mode.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ModeSelector;
