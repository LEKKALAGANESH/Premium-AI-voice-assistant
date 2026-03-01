// VoiceTranslator - 2026 Standard Main Component
// Real-time bilingual voice mediation interface
// Enhanced with comprehensive error handling and recovery

import React, { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  Play,
  Square,
  ArrowLeftRight,
  Trash2,
  Moon,
  Sun,
  Volume2,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Wifi,
  Mic,
  Chrome,
  RotateCcw,
} from 'lucide-react';

import { useVoiceMediator } from '../../hooks/useVoiceMediator';
import { TranslatorErrorBoundary } from './TranslatorErrorBoundary';
import { VoiceWaveAnimation } from './VoiceWaveAnimation';
import { LanguageSelector } from './LanguageSelector';
import { TranslationHistory } from './TranslationHistory';
import type { LanguageConfig, MediatorState } from '../../types/translator';

interface VoiceTranslatorProps {
  theme: 'light' | 'dark' | 'system';
  onThemeToggle: () => void;
  onBack?: () => void;
  className?: string;
}

/**
 * Get status message based on mediator state
 */
const getStatusMessage = (state: MediatorState): string => {
  switch (state) {
    case 'idle':
      return 'Ready to translate';
    case 'listening_a':
      return 'Listening to Person A...';
    case 'listening_b':
      return 'Listening to Person B...';
    case 'processing':
      return 'Translating...';
    case 'speaking_a':
      return 'Speaking to Person A...';
    case 'speaking_b':
      return 'Speaking to Person B...';
    case 'error':
      return 'An error occurred';
    default:
      return '';
  }
};

/**
 * Get status color based on mediator state
 */
const getStatusColor = (state: MediatorState): string => {
  switch (state) {
    case 'listening_a':
    case 'speaking_a':
      return 'text-blue-500';
    case 'listening_b':
    case 'speaking_b':
      return 'text-emerald-500';
    case 'processing':
      return 'text-brand-500';
    case 'error':
      return 'text-red-500';
    default:
      return 'text-zinc-400';
  }
};

/**
 * Browser Compatibility Warning Component
 */
const BrowserCompatibilityWarning = memo(function BrowserCompatibilityWarning({
  compatibility,
  onBack,
}: {
  compatibility: { speechRecognition: boolean; speechSynthesis: boolean; mediaDevices: boolean };
  onBack?: () => void;
}) {
  const issues: string[] = [];
  if (!compatibility.speechRecognition) issues.push('Speech Recognition');
  if (!compatibility.speechSynthesis) issues.push('Speech Synthesis');
  if (!compatibility.mediaDevices) issues.push('Microphone Access');

  return (
    <div className="h-full w-full flex items-center justify-center bg-white dark:bg-zinc-950 p-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <Chrome className="w-8 h-8 text-orange-500" />
        </div>

        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Browser Not Fully Supported
        </h2>

        <p className="text-zinc-600 dark:text-zinc-400 mb-4">
          Your browser is missing the following features required for voice translation:
        </p>

        <ul className="text-left bg-zinc-100 dark:bg-zinc-800 rounded-xl p-4 mb-6">
          {issues.map((issue) => (
            <li key={issue} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 py-1">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              {issue}
            </li>
          ))}
        </ul>

        <p className="text-sm text-zinc-500 mb-6">
          Please use <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Safari</strong> for the best experience.
        </p>

        {onBack && (
          <button
            onClick={onBack}
            className={clsx(
              'flex items-center justify-center gap-2 px-6 py-3 rounded-xl mx-auto',
              'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
              'hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors'
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        )}
      </div>
    </div>
  );
});

/**
 * Enhanced Error Display Component
 */
const ErrorDisplay = memo(function ErrorDisplay({
  error,
  errorDetails,
  onRetry,
  onDismiss,
  onReset,
}: {
  error: string;
  errorDetails: { code: string; recoverable: boolean; retryable: boolean } | null;
  onRetry: () => void;
  onDismiss: () => void;
  onReset: () => void;
}) {
  const isNetworkError = errorDetails?.code.includes('NETWORK') || errorDetails?.code.includes('TIMEOUT');
  const isMicError = errorDetails?.code.includes('MICROPHONE') || errorDetails?.code.includes('PERMISSION');

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className="mt-4 w-full max-w-md"
    >
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
        {/* Error icon and message */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {isNetworkError ? (
              <Wifi className="w-5 h-5 text-red-500" />
            ) : isMicError ? (
              <Mic className="w-5 h-5 text-red-500" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-500" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {error}
            </p>
            {errorDetails && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Error code: {errorDetails.code}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-red-200 dark:border-red-800">
          {errorDetails?.retryable && (
            <button
              onClick={onRetry}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
                'hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors'
              )}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}

          <button
            onClick={onReset}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
              'hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors'
            )}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            onClick={onDismiss}
            className={clsx(
              'ml-auto px-3 py-1.5 rounded-lg text-xs font-medium',
              'text-red-600 dark:text-red-400',
              'hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors'
            )}
          >
            Dismiss
          </button>
        </div>
      </div>
    </motion.div>
  );
});

/**
 * Inner Voice Translator Component (wrapped by error boundary)
 */
const VoiceTranslatorInner = memo(function VoiceTranslatorInner({
  theme,
  onThemeToggle,
  onBack,
  className,
}: VoiceTranslatorProps) {
  const mediator = useVoiceMediator();

  // Check browser compatibility first
  if (!mediator.browserCompatibility.fullySupported) {
    return (
      <BrowserCompatibilityWarning
        compatibility={mediator.browserCompatibility}
        onBack={onBack}
      />
    );
  }

  // Handle language selection
  const handleLanguageASelect = useCallback(
    (language: LanguageConfig) => {
      mediator.updateConfig({ languageA: language });
    },
    [mediator]
  );

  const handleLanguageBSelect = useCallback(
    (language: LanguageConfig) => {
      mediator.updateConfig({ languageB: language });
    },
    [mediator]
  );

  // Handle swap languages
  const handleSwapLanguages = useCallback(() => {
    mediator.updateConfig({
      languageA: mediator.config.languageB,
      languageB: mediator.config.languageA,
    });
  }, [mediator]);

  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div
      className={clsx(
        'flex flex-col h-full bg-white dark:bg-zinc-950',
        className
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                'hover:bg-zinc-100 dark:hover:bg-zinc-800',
                'text-zinc-600 dark:text-zinc-400'
              )}
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Voice Translator
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Real-time bilingual mediation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={onThemeToggle}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              'hover:bg-zinc-100 dark:hover:bg-zinc-800',
              'text-zinc-600 dark:text-zinc-400'
            )}
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>

          {/* Clear history */}
          <button
            onClick={mediator.clearHistory}
            disabled={mediator.history.length === 0}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              'hover:bg-zinc-100 dark:hover:bg-zinc-800',
              'text-zinc-600 dark:text-zinc-400',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="Clear history"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Language selectors */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <LanguageSelector
                participant="A"
                selectedLanguage={mediator.config.languageA}
                onSelect={handleLanguageASelect}
                disabled={mediator.isActive}
              />
            </div>

            {/* Swap button */}
            <button
              onClick={handleSwapLanguages}
              disabled={mediator.isActive}
              className={clsx(
                'p-3 rounded-xl transition-all duration-200',
                'bg-zinc-100 dark:bg-zinc-800',
                'hover:bg-zinc-200 dark:hover:bg-zinc-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'mt-6'
              )}
              aria-label="Swap languages"
            >
              <ArrowLeftRight className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            </button>

            <div className="flex-1">
              <LanguageSelector
                participant="B"
                selectedLanguage={mediator.config.languageB}
                onSelect={handleLanguageBSelect}
                disabled={mediator.isActive}
              />
            </div>
          </div>
        </div>

        {/* Voice animation and status */}
        <div className="py-6 px-4 flex flex-col items-center border-b border-zinc-100 dark:border-zinc-800">
          <VoiceWaveAnimation
            state={mediator.state}
            currentSpeaker={mediator.currentSpeaker}
          />

          {/* Status message */}
          <motion.p
            key={mediator.state}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              'mt-4 text-sm font-medium',
              getStatusColor(mediator.state)
            )}
          >
            {getStatusMessage(mediator.state)}
          </motion.p>

          {/* Partial transcript */}
          <AnimatePresence>
            {mediator.partialTranscript && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg max-w-md"
              >
                <p className="text-sm text-zinc-600 dark:text-zinc-400 italic">
                  "{mediator.partialTranscript}"
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Enhanced error display */}
          <AnimatePresence>
            {mediator.error && (
              <ErrorDisplay
                error={mediator.error}
                errorDetails={mediator.errorDetails}
                onRetry={mediator.retry}
                onDismiss={mediator.clearError}
                onReset={mediator.resetSession}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Translation history */}
        <div className="flex-1 overflow-hidden">
          <TranslationHistory
            history={mediator.history}
            className="h-full p-4"
          />
        </div>
      </div>

      {/* Control bar */}
      <footer className="p-4 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-center gap-4">
          {/* Switch speaker button (only when active) */}
          <AnimatePresence>
            {mediator.isActive && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={mediator.switchSpeaker}
                className={clsx(
                  'px-4 py-3 rounded-xl transition-colors',
                  'bg-zinc-100 dark:bg-zinc-800',
                  'hover:bg-zinc-200 dark:hover:bg-zinc-700',
                  'text-zinc-700 dark:text-zinc-300',
                  'font-medium text-sm'
                )}
              >
                Switch Speaker
              </motion.button>
            )}
          </AnimatePresence>

          {/* Main start/stop button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={mediator.isActive ? mediator.stop : mediator.start}
            disabled={
              mediator.isStarting ||
              mediator.voicesLoading ||
              (mediator.state === 'error' && !mediator.errorDetails?.recoverable)
            }
            className={clsx(
              'flex items-center gap-3 px-8 py-4 rounded-2xl',
              'font-semibold text-white transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              mediator.isActive
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-brand-500 hover:bg-brand-600'
            )}
            style={{ minWidth: '180px' }}
          >
            {mediator.isStarting || mediator.voicesLoading ? (
              <>
                <motion.div
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                {mediator.voicesLoading ? 'Loading Voices...' : 'Starting...'}
              </>
            ) : mediator.isActive ? (
              <>
                <Square className="w-5 h-5" />
                Stop Session
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Start Session
              </>
            )}
          </motion.button>

          {/* Volume indicator (when active) */}
          <AnimatePresence>
            {mediator.isActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={clsx(
                  'p-3 rounded-xl',
                  'bg-zinc-100 dark:bg-zinc-800',
                  'text-zinc-600 dark:text-zinc-400'
                )}
                aria-label="Audio active"
              >
                <Volume2 className="w-5 h-5" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Instructions */}
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-3">
          {mediator.isActive
            ? 'Speak naturally. The translator will automatically switch between speakers.'
            : mediator.state === 'error'
            ? 'Please resolve the error above to continue.'
            : 'Press Start to begin. Person A speaks first.'}
        </p>
      </footer>
    </div>
  );
});

/**
 * Main VoiceTranslator Component with Error Boundary
 */
export const VoiceTranslator = memo(function VoiceTranslator(props: VoiceTranslatorProps) {
  return (
    <TranslatorErrorBoundary onBack={props.onBack}>
      <VoiceTranslatorInner {...props} />
    </TranslatorErrorBoundary>
  );
});

export default VoiceTranslator;
