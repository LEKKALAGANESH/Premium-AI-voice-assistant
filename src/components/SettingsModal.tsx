// 2026 Standard: Settings Modal with Global Scale Controller
// Fluid design system integration for 320px-4K displays

import React, { useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Moon, Sun, Monitor, Download, Upload, RotateCcw, ZoomIn, ZoomOut, Accessibility, Focus } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (settings: Partial<AppSettings>) => void;
  onReset: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

// Scale presets for quick selection
const SCALE_PRESETS = [
  { value: 0.8, label: 'Compact', description: 'Smaller UI elements' },
  { value: 0.9, label: 'Small', description: 'Slightly reduced' },
  { value: 1.0, label: 'Default', description: 'Standard size' },
  { value: 1.1, label: 'Large', description: 'Slightly larger' },
  { value: 1.2, label: 'XL', description: 'Enhanced visibility' },
  { value: 1.4, label: 'Max', description: 'Maximum accessibility' },
];

const SettingsModal = ({
  isOpen,
  onClose,
  settings,
  onUpdate,
  onReset,
  onExport,
  onImport
}: SettingsModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Current scale display
  const currentScaleLabel = useMemo(() => {
    const preset = SCALE_PRESETS.find(p => Math.abs(p.value - (settings.uiScale ?? 1)) < 0.05);
    return preset?.label || `${Math.round((settings.uiScale ?? 1) * 100)}%`;
  }, [settings.uiScale]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();

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
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      setTimeout(() => {
        const first = modalRef.current?.querySelector('button');
        first?.focus();
      }, 100);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
  };

  // Handle scale increment/decrement
  const adjustScale = (delta: number) => {
    const currentScale = settings.uiScale ?? 1;
    const newScale = Math.max(0.8, Math.min(1.4, currentScale + delta));
    onUpdate({ uiScale: Math.round(newScale * 10) / 10 });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />
          <div
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            style={{ padding: 'var(--vox-space-4)' }}
          >
            <motion.div
              ref={modalRef}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-zinc-900 w-full shadow-2xl overflow-hidden pointer-events-auto vox-border-thin border-zinc-200 dark:border-zinc-800 flex flex-col"
              style={{
                maxWidth: 'var(--vox-modal-max-width)',
                borderRadius: 'var(--vox-radius-2xl)',
                maxHeight: '90vh',
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
            >
              {/* Header */}
              <div
                className="vox-border-thin border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0"
                style={{ padding: 'var(--vox-space-6)' }}
              >
                <h2
                  id="settings-title"
                  className="font-bold vox-text-xl"
                  style={{ fontSize: 'var(--vox-text-xl)' }}
                >
                  Settings
                </h2>
                <button
                  onClick={onClose}
                  className="hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors vox-touch-target flex items-center justify-center"
                  style={{
                    padding: 'var(--vox-space-2)',
                    borderRadius: 'var(--vox-radius-lg)',
                    minWidth: 'var(--vox-touch-min)',
                    minHeight: 'var(--vox-touch-min)',
                  }}
                  aria-label="Close settings"
                >
                  <X style={{ width: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)', height: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)' }} />
                </button>
              </div>

              <div
                className="overflow-y-auto flex-1 custom-scrollbar"
                style={{ padding: 'var(--vox-space-6)' }}
              >
                <div className="space-y-8">
                  {/* === ACCESSIBILITY & DISPLAY SCALE === */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Accessibility className="w-4 h-4 text-brand-500" />
                      <h3
                        className="font-semibold text-zinc-400 uppercase tracking-wider vox-text-xs"
                        style={{ fontSize: 'var(--vox-text-xs)' }}
                      >
                        Display Scale
                      </h3>
                    </div>

                    {/* Scale Preview */}
                    <div
                      className="bg-zinc-50 dark:bg-zinc-800 mb-4"
                      style={{
                        padding: 'var(--vox-space-4)',
                        borderRadius: 'var(--vox-radius-xl)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="vox-text-sm font-medium" style={{ fontSize: 'var(--vox-text-sm)' }}>
                          UI Scale
                        </span>
                        <span
                          className="font-mono text-brand-600 dark:text-brand-400 vox-text-sm"
                          style={{ fontSize: 'var(--vox-text-sm)' }}
                        >
                          {currentScaleLabel} ({Math.round((settings.uiScale ?? 1) * 100)}%)
                        </span>
                      </div>

                      {/* Scale Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => adjustScale(-0.1)}
                          disabled={(settings.uiScale ?? 1) <= 0.8}
                          className={clsx(
                            'flex items-center justify-center vox-touch-target transition-all',
                            (settings.uiScale ?? 1) <= 0.8
                              ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
                              : 'bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
                          )}
                          style={{
                            padding: 'var(--vox-space-2)',
                            borderRadius: 'var(--vox-radius-md)',
                            minWidth: 'var(--vox-touch-min)',
                            minHeight: 'var(--vox-touch-min)',
                          }}
                          aria-label="Decrease UI scale"
                        >
                          <ZoomOut style={{ width: 'clamp(1rem, 1.125vw + 0.375rem, 1.125rem)', height: 'clamp(1rem, 1.125vw + 0.375rem, 1.125rem)' }} />
                        </button>

                        <input
                          type="range"
                          min="0.8"
                          max="1.4"
                          step="0.1"
                          value={settings.uiScale ?? 1}
                          onChange={(e) => onUpdate({ uiScale: parseFloat(e.target.value) })}
                          className="flex-1 accent-brand-500"
                          style={{ minHeight: 'var(--vox-touch-min)' }}
                          aria-label="UI scale slider"
                        />

                        <button
                          onClick={() => adjustScale(0.1)}
                          disabled={(settings.uiScale ?? 1) >= 1.4}
                          className={clsx(
                            'flex items-center justify-center vox-touch-target transition-all',
                            (settings.uiScale ?? 1) >= 1.4
                              ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
                              : 'bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300'
                          )}
                          style={{
                            padding: 'var(--vox-space-2)',
                            borderRadius: 'var(--vox-radius-md)',
                            minWidth: 'var(--vox-touch-min)',
                            minHeight: 'var(--vox-touch-min)',
                          }}
                          aria-label="Increase UI scale"
                        >
                          <ZoomIn style={{ width: 'clamp(1rem, 1.125vw + 0.375rem, 1.125rem)', height: 'clamp(1rem, 1.125vw + 0.375rem, 1.125rem)' }} />
                        </button>
                      </div>

                      {/* Scale Presets */}
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        {SCALE_PRESETS.slice(0, 3).map((preset) => (
                          <button
                            key={preset.value}
                            onClick={() => onUpdate({ uiScale: preset.value })}
                            className={clsx(
                              'flex flex-col items-center transition-all vox-touch-target vox-border-thin',
                              Math.abs((settings.uiScale ?? 1) - preset.value) < 0.05
                                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                                : 'border-transparent bg-zinc-100 dark:bg-zinc-700 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                            )}
                            style={{
                              padding: 'var(--vox-space-2)',
                              borderRadius: 'var(--vox-radius-lg)',
                              minHeight: 'var(--vox-touch-min)',
                            }}
                          >
                            <span className="vox-text-xs font-medium" style={{ fontSize: 'var(--vox-text-xs)' }}>
                              {preset.label}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {SCALE_PRESETS.slice(3).map((preset) => (
                          <button
                            key={preset.value}
                            onClick={() => onUpdate({ uiScale: preset.value })}
                            className={clsx(
                              'flex flex-col items-center transition-all vox-touch-target vox-border-thin',
                              Math.abs((settings.uiScale ?? 1) - preset.value) < 0.05
                                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                                : 'border-transparent bg-zinc-100 dark:bg-zinc-700 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                            )}
                            style={{
                              padding: 'var(--vox-space-2)',
                              borderRadius: 'var(--vox-radius-lg)',
                              minHeight: 'var(--vox-touch-min)',
                            }}
                          >
                            <span className="vox-text-xs font-medium" style={{ fontSize: 'var(--vox-text-xs)' }}>
                              {preset.label}
                            </span>
                          </button>
                        ))}
                      </div>

                      <p
                        className="text-zinc-400 dark:text-zinc-500 mt-3 vox-text-xs"
                        style={{ fontSize: 'var(--vox-text-xs)' }}
                      >
                        Adjust UI size for better accessibility. Changes apply immediately.
                      </p>
                    </div>
                  </section>

                  {/* === APPEARANCE === */}
                  <section>
                    <h3
                      className="font-semibold text-zinc-400 uppercase tracking-wider mb-4 vox-text-xs"
                      style={{ fontSize: 'var(--vox-text-xs)' }}
                    >
                      Appearance
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'light', icon: Sun, label: 'Light' },
                        { id: 'dark', icon: Moon, label: 'Dark' },
                        { id: 'system', icon: Monitor, label: 'System' }
                      ].map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => onUpdate({ theme: theme.id as 'light' | 'dark' | 'system' })}
                          className={clsx(
                            'flex flex-col items-center transition-all vox-touch-target vox-border-thin',
                            settings.theme === theme.id
                              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                              : 'border-transparent bg-zinc-50 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                          )}
                          style={{
                            gap: 'var(--vox-space-2)',
                            padding: 'var(--vox-space-3)',
                            borderRadius: 'var(--vox-radius-xl)',
                            minHeight: 'var(--vox-touch-min)',
                          }}
                        >
                          <theme.icon style={{ width: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)', height: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)' }} />
                          <span className="font-medium vox-text-xs" style={{ fontSize: 'var(--vox-text-xs)' }}>
                            {theme.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* 2026: Zen Focus Mode Toggle */}
                    <div
                      className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 mt-4"
                      style={{
                        padding: 'var(--vox-space-4)',
                        borderRadius: 'var(--vox-radius-xl)',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Focus className="w-5 h-5 text-brand-500" />
                        <div>
                          <p className="font-medium vox-text-sm" style={{ fontSize: 'var(--vox-text-sm)' }}>
                            Zen Focus Mode
                          </p>
                          <p className="text-zinc-500 vox-text-xs" style={{ fontSize: 'var(--vox-text-xs)' }}>
                            Hide sidebar, center chat perfectly
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => onUpdate({ focusMode: !settings.focusMode })}
                        className={clsx(
                          "relative rounded-full transition-colors vox-touch-target",
                          settings.focusMode ? "bg-brand-500" : "bg-zinc-300 dark:bg-zinc-600"
                        )}
                        style={{
                          width: 'clamp(2.75rem, 3vw + 1rem, 3rem)',
                          height: 'clamp(1.5rem, 1.75vw + 0.5rem, 1.75rem)',
                        }}
                        role="switch"
                        aria-checked={settings.focusMode}
                        aria-label="Toggle focus mode"
                      >
                        <div
                          className="absolute bg-white rounded-full transition-all"
                          style={{
                            top: '2px',
                            width: 'clamp(1.125rem, 1.25vw + 0.375rem, 1.25rem)',
                            height: 'clamp(1.125rem, 1.25vw + 0.375rem, 1.25rem)',
                            left: settings.focusMode ? 'calc(100% - clamp(1.25rem, 1.375vw + 0.375rem, 1.375rem))' : '2px',
                          }}
                        />
                      </button>
                    </div>
                  </section>

                  {/* === VOICE SELECTION === */}
                  <section>
                    <h3
                      className="font-semibold text-zinc-400 uppercase tracking-wider mb-4 vox-text-xs"
                      style={{ fontSize: 'var(--vox-text-xs)' }}
                    >
                      Voice Selection
                    </h3>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {[
                        'Charon', 'Puck', 'Kore', 'Fenrir',
                        'Zephyr', 'Aoede', 'Erebus', 'Nyx'
                      ].map((voice) => (
                        <button
                          key={voice}
                          onClick={() => onUpdate({ voiceName: voice })}
                          className={clsx(
                            'flex items-center font-medium transition-all vox-touch-target vox-border-thin',
                            settings.voiceName === voice
                              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                              : 'border-transparent bg-zinc-50 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                          )}
                          style={{
                            gap: 'var(--vox-space-3)',
                            padding: 'var(--vox-space-3) var(--vox-space-4)',
                            borderRadius: 'var(--vox-radius-xl)',
                            fontSize: 'var(--vox-text-sm)',
                            minHeight: 'var(--vox-touch-min)',
                          }}
                        >
                          <div className={clsx(
                            "w-2 h-2 rounded-full",
                            settings.voiceName === voice ? "bg-brand-500" : "bg-zinc-300 dark:bg-zinc-600"
                          )} />
                          {voice}
                        </button>
                      ))}
                    </div>

                    {/* Voice Settings */}
                    <div className="space-y-4">
                      {/* Whisper Mode */}
                      <div
                        className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800"
                        style={{
                          padding: 'var(--vox-space-4)',
                          borderRadius: 'var(--vox-radius-xl)',
                        }}
                      >
                        <div>
                          <p className="font-medium vox-text-sm" style={{ fontSize: 'var(--vox-text-sm)' }}>
                            Whisper Mode
                          </p>
                          <p className="text-zinc-500 vox-text-xs" style={{ fontSize: 'var(--vox-text-xs)' }}>
                            Reduced volume and slower pace
                          </p>
                        </div>
                        <button
                          onClick={() => onUpdate({ whisperMode: !settings.whisperMode })}
                          className={clsx(
                            "relative rounded-full transition-colors vox-touch-target",
                            settings.whisperMode ? "bg-brand-500" : "bg-zinc-300 dark:bg-zinc-600"
                          )}
                          style={{
                            width: 'clamp(2.75rem, 3vw + 1rem, 3rem)',
                            height: 'clamp(1.5rem, 1.75vw + 0.5rem, 1.75rem)',
                          }}
                          role="switch"
                          aria-checked={settings.whisperMode}
                          aria-label="Toggle whisper mode"
                        >
                          <div
                            className="absolute bg-white rounded-full transition-all"
                            style={{
                              top: '2px',
                              width: 'clamp(1.125rem, 1.25vw + 0.375rem, 1.25rem)',
                              height: 'clamp(1.125rem, 1.25vw + 0.375rem, 1.25rem)',
                              left: settings.whisperMode ? 'calc(100% - clamp(1.25rem, 1.375vw + 0.375rem, 1.375rem))' : '2px',
                            }}
                          />
                        </button>
                      </div>

                      {/* Speech Rate */}
                      <div
                        className="bg-zinc-50 dark:bg-zinc-800"
                        style={{
                          padding: 'var(--vox-space-4)',
                          borderRadius: 'var(--vox-radius-xl)',
                        }}
                      >
                        <div className="flex justify-between mb-2">
                          <p className="font-medium vox-text-sm" style={{ fontSize: 'var(--vox-text-sm)' }}>
                            Speech Rate
                          </p>
                          <span className="font-mono vox-text-xs" style={{ fontSize: 'var(--vox-text-xs)' }}>
                            {settings.speechRate}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          value={settings.speechRate}
                          onChange={(e) => onUpdate({ speechRate: parseFloat(e.target.value) })}
                          className="w-full accent-brand-500"
                          style={{ minHeight: 'var(--vox-touch-min)' }}
                          aria-label="Speech rate slider"
                        />
                      </div>
                    </div>
                  </section>

                  {/* === DATA MANAGEMENT === */}
                  <section>
                    <h3
                      className="font-semibold text-zinc-400 uppercase tracking-wider mb-4 vox-text-xs"
                      style={{ fontSize: 'var(--vox-text-xs)' }}
                    >
                      Data Management
                    </h3>
                    <div className="space-y-2">
                      <button
                        onClick={onExport}
                        className="w-full flex items-center bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all font-medium vox-touch-target"
                        style={{
                          gap: 'var(--vox-space-3)',
                          padding: 'var(--vox-space-3) var(--vox-space-4)',
                          borderRadius: 'var(--vox-radius-xl)',
                          fontSize: 'var(--vox-text-sm)',
                          minHeight: 'var(--vox-touch-min)',
                        }}
                      >
                        <Download style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
                        Export Conversations (JSON)
                      </button>
                      <label
                        className="w-full flex items-center bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all font-medium cursor-pointer vox-touch-target"
                        style={{
                          gap: 'var(--vox-space-3)',
                          padding: 'var(--vox-space-3) var(--vox-space-4)',
                          borderRadius: 'var(--vox-radius-xl)',
                          fontSize: 'var(--vox-text-sm)',
                          minHeight: 'var(--vox-touch-min)',
                        }}
                      >
                        <Upload style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
                        Import Conversations
                        <input type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                      </label>
                      <button
                        onClick={onReset}
                        className="w-full flex items-center bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all font-medium vox-touch-target"
                        style={{
                          gap: 'var(--vox-space-3)',
                          padding: 'var(--vox-space-3) var(--vox-space-4)',
                          borderRadius: 'var(--vox-radius-xl)',
                          fontSize: 'var(--vox-text-sm)',
                          minHeight: 'var(--vox-touch-min)',
                        }}
                      >
                        <RotateCcw style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }} />
                        Reset Application
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// Helper for clsx in this file
const clsx = (...classes: (string | boolean | undefined | null)[]) => classes.filter(Boolean).join(' ');

export default SettingsModal;
