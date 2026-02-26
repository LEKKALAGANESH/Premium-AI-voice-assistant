import React, { useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Loader2, AlertCircle, X } from 'lucide-react';
import { clsx } from 'clsx';
import { VoiceState } from '../types';
import CountdownRing from './CountdownRing';

interface ActionBtnProps {
  state: VoiceState;
  onClick: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  progress?: number; // VAD countdown ring (0-100)
  silenceProgress?: number; // Smart-Silence countdown (0-100)
  isSilenceCountdown?: boolean; // Whether in stable silence state
  disabled?: boolean;
  hasRetry?: boolean; // 2026: Show retry glow for failed messages
  onRetry?: () => void; // 2026: Retry callback
}

// 2026 Standard: Waveform bars component for listening state
const WaveformBars = () => (
  <div className="flex items-center gap-[2px]" aria-hidden="true">
    {[0, 0.1, 0.2].map((delay, i) => (
      <motion.div
        key={i}
        animate={{ height: [6, 18, 6] }}
        transition={{
          repeat: Infinity,
          duration: 0.5,
          delay,
          ease: 'easeInOut',
        }}
        className="w-[3px] bg-white rounded-full"
      />
    ))}
  </div>
);

// 2026 Standard: Morphing icon component with spring physics
const MorphingIcon = ({
  state,
  hasRetry,
}: {
  state: VoiceState;
  hasRetry?: boolean;
}) => {
  const springTransition = {
    type: 'spring' as const,
    stiffness: 500,
    damping: 30,
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.5, rotate: 30 }}
        transition={springTransition}
        className="flex items-center justify-center"
      >
        {state === 'idle' && (
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <Mic className="w-6 h-6" />
          </motion.div>
        )}

        {state === 'listening' && (
          <div className="flex items-center gap-1.5">
            <WaveformBars />
            <span className="text-[10px] font-bold tracking-tight uppercase">
              End
            </span>
          </div>
        )}

        {state === 'processing' && (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
          >
            <Loader2 className="w-6 h-6 animate-spin" />
          </motion.div>
        )}

        {state === 'speaking' && <X className="w-6 h-6" strokeWidth={2.5} />}

        {state === 'error' && (
          <motion.div
            animate={hasRetry ? { scale: [1, 1.1, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
          >
            <AlertCircle className="w-6 h-6" />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

const ActionBtn = ({
  state,
  onClick,
  onLongPressStart,
  onLongPressEnd,
  progress = 0,
  silenceProgress = 0,
  isSilenceCountdown = false,
  disabled,
  hasRetry,
  onRetry,
}: ActionBtnProps) => {
  const buttonId = useId();

  // 2026 Standard: Intelligent hover tooltips
  const tooltip = {
    idle: 'Tap to speak',
    listening: 'Tap to end',
    processing: 'Thinking...',
    speaking: 'Tap to interrupt',
    error: hasRetry ? 'Tap to retry' : 'Tap to reset',
  }[state];

  // WCAG 2.2: Aria-live announcement text
  const ariaLive = {
    idle: 'Voice input ready',
    listening: 'Listening for speech',
    processing: 'Processing your request',
    speaking: 'AI is speaking, tap to interrupt',
    error: hasRetry ? 'Error occurred, tap to retry' : 'Error occurred',
  }[state];

  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isLongPress = React.useRef(false);

  const handlePointerDown = useCallback(() => {
    if (state !== 'idle') return;
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPressStart?.();
    }, 500); // 2026: Push-to-talk threshold
  }, [state, onLongPressStart]);

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isLongPress.current) {
      onLongPressEnd?.();
      isLongPress.current = false;
    } else {
      // 2026: Error state with retry
      if (state === 'error' && hasRetry && onRetry) {
        onRetry();
      } else {
        onClick();
      }
    }
  }, [onClick, onLongPressEnd, state, hasRetry, onRetry]);

  const handlePointerCancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    isLongPress.current = false;
  }, []);

  // Keyboard accessibility
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (state === 'error' && hasRetry && onRetry) {
          onRetry();
        } else {
          onClick();
        }
      }
    },
    [onClick, state, hasRetry, onRetry]
  );

  return (
    <div className="relative group flex items-center justify-center shrink-0">
      {/* 2026: Intelligent Hover Tooltip (no permanent labels) - FLAT: no shadow */}
      <div
        role="tooltip"
        id={`${buttonId}-tooltip`}
        className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-bold uppercase tracking-wider rounded-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50"
      >
        {tooltip}
      </div>

      {/* WCAG 2.2: Aria-live region for screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {ariaLive}
      </div>

      {/* 2026: Smart-Silence Countdown Ring */}
      <CountdownRing
        progress={isSilenceCountdown ? silenceProgress : progress}
        isActive={state === 'listening'}
        isStableSilence={isSilenceCountdown}
        size={64}
        strokeWidth={3}
      />

      {/* 2026: Retry glow ring for error state */}
      {state === 'error' && hasRetry && (
        <svg
          className="absolute inset-0 -rotate-90 w-full h-full pointer-events-none"
          viewBox="0 0 64 64"
          aria-hidden="true"
        >
          <motion.circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-red-500"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
          />
        </svg>
      )}

      {/* 2026: Morphing Super-Button - FLAT: no shadows */}
      <motion.button
        id={buttonId}
        aria-label={tooltip}
        aria-describedby={`${buttonId}-tooltip`}
        aria-busy={state === 'processing'}
        aria-pressed={state === 'listening'}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        whileHover={{ scale: disabled ? 1 : 1.05 }}
        whileTap={{ scale: disabled ? 1 : 0.95 }}
        className={clsx(
          'relative w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500',
          {
            'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700':
              state === 'idle',
            'bg-brand-500 text-white': state === 'listening',
            'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900':
              state === 'processing',
            'bg-red-500 text-white hover:bg-red-600': state === 'speaking',
            'bg-red-200 dark:bg-red-900/50 text-red-600 dark:text-red-400':
              state === 'error' && !hasRetry,
            'bg-red-500 text-white animate-pulse': state === 'error' && hasRetry,
          },
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <MorphingIcon state={state} hasRetry={hasRetry} />
      </motion.button>
    </div>
  );
};

export default ActionBtn;
