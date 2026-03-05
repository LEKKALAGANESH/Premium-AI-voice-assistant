// TurnIndicator - 100/100 Production-Ready Turn-Taking UI Component
// High-contrast explicit "Your Turn" indicator with full accessibility
// Synced with aria-live status announcements

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  Mic,
  Volume2,
  AlertTriangle,
  Wifi,
  WifiOff,
  VolumeX,
  Users,
  Loader2,
} from 'lucide-react';
import type { MediatorState, Participant } from '../types/translator';

// ============================================================================
// TYPES
// ============================================================================

export interface TurnIndicatorProps {
  state: MediatorState;
  currentSpeaker: Participant | null;
  isActive: boolean;
  isBotSpeaking: boolean;
  isMicLocked: boolean;

  // Ghost Flaw Warnings
  isLowVolume: boolean;
  isDoubleTalk: boolean;
  isNetworkError: boolean;

  // Language names
  languageA: string;
  languageB: string;

  // Callbacks for dismissing warnings
  onDismissLowVolume?: () => void;
  onDismissDoubleTalk?: () => void;

  className?: string;
}

// ============================================================================
// PULSE ANIMATION COMPONENT
// ============================================================================

const PulsingDot = memo(function PulsingDot({
  color,
  size = 'md',
}: {
  color: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  return (
    <span className="relative flex items-center justify-center">
      <motion.span
        className={clsx(sizes[size], 'rounded-full absolute', color)}
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.7, 0.3, 0.7],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <span className={clsx(sizes[size], 'rounded-full relative', color)} />
    </span>
  );
});

// ============================================================================
// WARNING TOAST COMPONENT
// ============================================================================

interface WarningToastProps {
  icon: React.ReactNode;
  message: string;
  description?: string;
  variant: 'warning' | 'error' | 'info';
  onDismiss?: () => void;
}

const WarningToast = memo(function WarningToast({
  icon,
  message,
  description,
  variant,
  onDismiss,
}: WarningToastProps) {
  const variantStyles = {
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-900/30',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-800 dark:text-amber-200',
      desc: 'text-amber-600 dark:text-amber-400',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-900/30',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      desc: 'text-red-600 dark:text-red-400',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/30',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
      desc: 'text-blue-600 dark:text-blue-400',
    },
  };

  const styles = variantStyles[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg',
        styles.bg,
        styles.border
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className={styles.text}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm font-semibold', styles.text)}>{message}</p>
        {description && (
          <p className={clsx('text-xs mt-0.5', styles.desc)}>{description}</p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={clsx(
            'p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10',
            'transition-colors',
            styles.text
          )}
          aria-label="Dismiss warning"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </motion.div>
  );
});

// ============================================================================
// MAIN TURN INDICATOR COMPONENT
// ============================================================================

export const TurnIndicator = memo(function TurnIndicator({
  state,
  currentSpeaker,
  isActive,
  isBotSpeaking,
  isMicLocked,
  isLowVolume,
  isDoubleTalk,
  isNetworkError,
  languageA,
  languageB,
  onDismissLowVolume,
  onDismissDoubleTalk,
  className,
}: TurnIndicatorProps) {
  // Don't render if not active
  if (!isActive) return null;

  // Determine current language and colors
  const currentLanguage = currentSpeaker === 'A' ? languageA : languageB;
  const nextLanguage = currentSpeaker === 'A' ? languageB : languageA;

  const isListening = state === 'listening_a' || state === 'listening_b';
  const isSpeaking = state === 'speaking_a' || state === 'speaking_b';
  const isProcessing = state === 'processing';

  // Color schemes
  const speakerAColors = {
    bg: 'bg-gradient-to-r from-blue-500 to-blue-600',
    dot: 'bg-blue-300',
    text: 'text-white',
    ring: 'ring-blue-400/50',
  };

  const speakerBColors = {
    bg: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    dot: 'bg-emerald-300',
    text: 'text-white',
    ring: 'ring-emerald-400/50',
  };

  const colors = currentSpeaker === 'A' ? speakerAColors : speakerBColors;

  // Generate status message for screen readers
  const getAriaMessage = (): string => {
    if (isNetworkError) return 'Network error. Please check your connection.';
    if (isDoubleTalk) return 'Multiple voices detected. Please speak one at a time.';
    if (isLowVolume) return 'Voice too quiet. Please speak louder.';
    if (isBotSpeaking) return `Speaking translation to ${nextLanguage} speaker.`;
    if (isProcessing) return 'Translating your speech...';
    if (isListening) return `${currentLanguage} speaker, it is your turn to speak.`;
    return '';
  };

  return (
    <div className={clsx('flex flex-col items-center gap-3', className)}>
      {/* Screen Reader Status Announcer */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {getAriaMessage()}
      </div>

      {/* Warning Toasts */}
      <AnimatePresence mode="sync">
        {/* Network Error Warning */}
        {isNetworkError && (
          <WarningToast
            key="network-error"
            icon={<WifiOff className="w-5 h-5" />}
            message="Connection Lost"
            description="Please check your internet and retry."
            variant="error"
          />
        )}

        {/* Double-Talk Warning */}
        {isDoubleTalk && !isNetworkError && (
          <WarningToast
            key="double-talk"
            icon={<Users className="w-5 h-5" />}
            message="Multiple Voices Detected"
            description="Please speak one at a time."
            variant="warning"
            onDismiss={onDismissDoubleTalk}
          />
        )}

        {/* Low Volume Warning */}
        {isLowVolume && !isDoubleTalk && !isNetworkError && (
          <WarningToast
            key="low-volume"
            icon={<VolumeX className="w-5 h-5" />}
            message="Voice Too Quiet"
            description="Try speaking louder or moving closer."
            variant="info"
            onDismiss={onDismissLowVolume}
          />
        )}
      </AnimatePresence>

      {/* Main Turn Indicator Banner */}
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className={clsx(
          'flex items-center gap-4 px-6 py-4 rounded-2xl shadow-xl',
          'backdrop-blur-sm',
          colors.bg,
          'ring-4',
          colors.ring
        )}
      >
        {/* Status Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/20">
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, rotate: 0 }}
                animate={{ opacity: 1, rotate: 360 }}
                exit={{ opacity: 0 }}
                transition={{ rotate: { duration: 1, repeat: Infinity, ease: 'linear' } }}
              >
                <Loader2 className="w-6 h-6 text-white" />
              </motion.div>
            ) : isBotSpeaking ? (
              <motion.div
                key="speaking"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <Volume2 className="w-6 h-6 text-white" />
              </motion.div>
            ) : isMicLocked ? (
              <motion.div
                key="locked"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <VolumeX className="w-6 h-6 text-white/70" />
              </motion.div>
            ) : (
              <motion.div
                key="listening"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <Mic className="w-6 h-6 text-white" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Text Content */}
        <div className="flex flex-col">
          {/* Speaker Label */}
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-xs font-medium uppercase tracking-wide">
              {currentSpeaker === 'A' ? 'Person A' : 'Person B'}
            </span>
            {isListening && !isMicLocked && (
              <PulsingDot color={colors.dot} size="sm" />
            )}
          </div>

          {/* Main Status Text */}
          <motion.p
            key={state + String(isBotSpeaking)}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={clsx('text-lg font-bold', colors.text)}
          >
            {isProcessing ? (
              'Translating...'
            ) : isBotSpeaking ? (
              `Speaking to ${nextLanguage} speaker`
            ) : isMicLocked ? (
              'Please wait...'
            ) : (
              <>
                <span className="text-white/90">{currentLanguage}</span>
                {' - '}
                <span className="underline underline-offset-2 decoration-2 decoration-white/50">
                  Your Turn!
                </span>
              </>
            )}
          </motion.p>

          {/* Instruction Subtext */}
          {isListening && !isMicLocked && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-white/70 text-xs mt-1"
            >
              Speak now, I'm listening...
            </motion.p>
          )}
        </div>

        {/* Recording Indicator */}
        {isListening && !isMicLocked && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20">
            <motion.div
              className="w-2.5 h-2.5 rounded-full bg-red-400"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-white text-xs font-medium">REC</span>
          </div>
        )}
      </motion.div>

      {/* Next Speaker Preview (when bot is speaking) */}
      <AnimatePresence>
        {isBotSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-zinc-100 dark:bg-zinc-800',
              'text-zinc-600 dark:text-zinc-400 text-sm'
            )}
          >
            <span>Next:</span>
            <span className="font-semibold">
              {nextLanguage === languageA ? 'Person A' : 'Person B'}
            </span>
            <span>({nextLanguage})</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default TurnIndicator;
