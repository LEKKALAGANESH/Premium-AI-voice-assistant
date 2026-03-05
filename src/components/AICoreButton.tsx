/**
 * AICoreButton.tsx
 * 2026 Premium: Voice Control Button with Wave Animation & Integrated Stop
 *
 * Visual Concept:
 * - IDLE: Microphone icon with breathing animation
 * - LISTENING: Pulsing rings + wave bars + STOP button (■) in center
 * - SPEAKING: Sound wave bars + STOP button (■) in center
 * - PROCESSING: Spinner animation
 * - ERROR: Red warning with retry option
 *
 * CRITICAL: Stop button is always visible and centered when active
 */

import React, { useCallback, useId, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { Mic, Square, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { VoiceState } from '../types';

// === ANIMATION CONFIGURATION ===

// Breathing animation for IDLE state
const idleBreathingConfig = {
  scale: [1, 1.05, 1],
  opacity: [0.8, 1, 0.8],
};

const idleBreathingTransition = {
  duration: 2.5,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

// Pulsing config for LISTENING state
const listeningPulseConfig = {
  scale: [1, 1.12, 1],
  opacity: [0.5, 0.8, 0.5],
};

const listeningPulseTransition = {
  duration: 1,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

// Spring transition for morphing
const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
};

// === WAVE BARS COMPONENT ===
interface WaveBarsProps {
  isActive: boolean;
  color: string;
  position: 'left' | 'right';
}

const WaveBars: React.FC<WaveBarsProps> = ({ isActive, color, position }) => {
  const bars = [0, 1, 2, 3, 4];
  const baseDelays = position === 'left' ? [0.1, 0.2, 0.15, 0.25, 0.05] : [0.05, 0.25, 0.15, 0.2, 0.1];

  return (
    <div
      className={clsx(
        'absolute flex items-center gap-0.5',
        position === 'left' ? 'right-full mr-2' : 'left-full ml-2'
      )}
    >
      {bars.map((i) => (
        <motion.div
          key={i}
          className={clsx('w-0.5 rounded-full', color)}
          animate={isActive ? {
            height: [8, 20, 14, 24, 10, 18, 8],
          } : {
            height: 4,
          }}
          transition={isActive ? {
            duration: 0.7,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: baseDelays[i],
          } : {
            duration: 0.2,
          }}
          style={{ height: 4 }}
        />
      ))}
    </div>
  );
};

// === PULSE RINGS COMPONENT ===
interface PulseRingsProps {
  isActive: boolean;
  color: string;
}

const PulseRings: React.FC<PulseRingsProps> = ({ isActive, color }) => {
  if (!isActive) return null;

  return (
    <>
      {/* Outer pulse ring */}
      <motion.div
        className={clsx('absolute rounded-full', color)}
        initial={{ width: 48, height: 48, opacity: 0.3 }}
        animate={{
          width: [48, 72, 48],
          height: [48, 72, 48],
          opacity: [0.3, 0, 0.3],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />
      {/* Inner pulse ring */}
      <motion.div
        className={clsx('absolute rounded-full', color)}
        initial={{ width: 48, height: 48, opacity: 0.4 }}
        animate={{
          width: [48, 64, 48],
          height: [48, 64, 48],
          opacity: [0.4, 0, 0.4],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeOut',
          delay: 0.3,
        }}
      />
    </>
  );
};

// === SILENCE COUNTDOWN RING ===
interface SilenceRingProps {
  progress: number;
  isActive: boolean;
}

const SilenceRing: React.FC<SilenceRingProps> = ({ progress, isActive }) => {
  if (!isActive || progress === 0) return null;

  const size = 52;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      className="absolute -rotate-90 pointer-events-none"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-zinc-200 dark:text-zinc-700"
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className="text-amber-500 dark:text-amber-400 transition-all duration-100"
      />
    </svg>
  );
};

// === MAIN COMPONENT ===
interface AICoreButtonProps {
  state: VoiceState;
  onClick: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  progress?: number; // Silence countdown progress (0-100)
  silenceProgress?: number;
  isSilenceCountdown?: boolean;
  disabled?: boolean;
  hasRetry?: boolean;
  onRetry?: () => void;
}

const AICoreButton: React.FC<AICoreButtonProps> = ({
  state,
  onClick,
  onLongPressStart,
  onLongPressEnd,
  progress = 0,
  disabled,
  hasRetry,
  onRetry,
}) => {
  const buttonId = useId();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  // Derived states
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isProcessing = state === 'processing';
  const isIdle = state === 'idle';
  const isError = state === 'error';
  const isActive = isListening || isSpeaking;

  // Tooltip text based on state
  const tooltip = useMemo(() => ({
    idle: 'Tap to speak',
    listening: 'Tap to stop',
    processing: 'Processing...',
    speaking: 'Tap to stop',
    error: hasRetry ? 'Tap to retry' : 'Tap to reset',
  }[state]), [state, hasRetry]);

  // WCAG aria-live announcement
  const ariaLive = useMemo(() => ({
    idle: 'Voice input ready',
    listening: 'Listening - tap the stop button to end',
    processing: 'Processing your request',
    speaking: 'Speaking - tap to stop',
    error: hasRetry ? 'Error - tap to retry' : 'Error occurred',
  }[state]), [state, hasRetry]);

  // Long-press handling for push-to-talk
  const handlePointerDown = useCallback(() => {
    if (state !== 'idle' || disabled) return;
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPressStart?.();
    }, 500);
  }, [state, disabled, onLongPressStart]);

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isLongPress.current) {
      onLongPressEnd?.();
      isLongPress.current = false;
    } else {
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

  // Button background color
  const buttonBgClass = useMemo(() => {
    if (isError) return 'bg-red-500 hover:bg-red-600';
    if (isListening) return 'bg-brand-500 hover:bg-brand-600';
    if (isSpeaking) return 'bg-emerald-500 hover:bg-emerald-600';
    if (isProcessing) return 'bg-amber-500 hover:bg-amber-600';
    return 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700';
  }, [isError, isListening, isSpeaking, isProcessing]);

  // Icon color
  const iconColorClass = useMemo(() => {
    if (isIdle) return 'text-zinc-600 dark:text-zinc-300';
    return 'text-white';
  }, [isIdle]);

  // Wave bar colors
  const waveBarColor = useMemo(() => {
    if (isListening) return 'bg-brand-400 dark:bg-brand-300';
    if (isSpeaking) return 'bg-emerald-400 dark:bg-emerald-300';
    return 'bg-zinc-400';
  }, [isListening, isSpeaking]);

  // Pulse ring colors
  const pulseRingColor = useMemo(() => {
    if (isListening) return 'bg-brand-500/30 dark:bg-brand-400/30';
    if (isSpeaking) return 'bg-emerald-500/30 dark:bg-emerald-400/30';
    return 'bg-zinc-400/30';
  }, [isListening, isSpeaking]);

  return (
    <div className="relative flex items-center justify-center shrink-0 group">
      {/* Tooltip */}
      <div
        role="tooltip"
        id={`${buttonId}-tooltip`}
        className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-bold uppercase tracking-wider rounded-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50"
      >
        {tooltip}
      </div>

      {/* WCAG aria-live region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {ariaLive}
      </div>

      {/* Pulse rings (listening/speaking states) */}
      <PulseRings isActive={isActive} color={pulseRingColor} />

      {/* Silence countdown ring */}
      <SilenceRing progress={progress} isActive={isListening} />

      {/* Wave bars (left side) */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
          >
            <WaveBars isActive={true} color={waveBarColor} position="left" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Button */}
      <motion.button
        id={buttonId}
        aria-label={tooltip}
        aria-describedby={`${buttonId}-tooltip`}
        aria-busy={isProcessing}
        aria-pressed={isListening}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        whileHover={{ scale: disabled ? 1 : 1.05 }}
        whileTap={{ scale: disabled ? 1 : 0.92 }}
        className={clsx(
          'relative w-12 h-12 rounded-full flex items-center justify-center',
          'transition-colors duration-200 shadow-lg',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500',
          'dark:focus-visible:ring-offset-zinc-900',
          buttonBgClass,
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <AnimatePresence mode="wait">
          {/* IDLE: Microphone icon with breathing animation */}
          {isIdle && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={springTransition}
            >
              <motion.div
                animate={idleBreathingConfig}
                transition={idleBreathingTransition}
              >
                <Mic className={clsx('w-5 h-5', iconColorClass)} />
              </motion.div>
            </motion.div>
          )}

          {/* LISTENING: Stop button (■) - clearly visible */}
          {isListening && (
            <motion.div
              key="listening"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={springTransition}
            >
              <motion.div
                animate={listeningPulseConfig}
                transition={listeningPulseTransition}
              >
                <Square className="w-5 h-5 text-white fill-white" />
              </motion.div>
            </motion.div>
          )}

          {/* SPEAKING: Stop button (■) */}
          {isSpeaking && (
            <motion.div
              key="speaking"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={springTransition}
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Square className="w-5 h-5 text-white fill-white" />
              </motion.div>
            </motion.div>
          )}

          {/* PROCESSING: Spinner */}
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1, rotate: 360 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{
                opacity: springTransition,
                scale: springTransition,
                rotate: {
                  duration: 1,
                  repeat: Infinity,
                  ease: 'linear',
                },
              }}
            >
              <Loader2 className="w-5 h-5 text-white" />
            </motion.div>
          )}

          {/* ERROR: Warning or Retry icon */}
          {isError && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={springTransition}
            >
              {hasRetry ? (
                <motion.div
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                >
                  <RotateCcw className="w-5 h-5 text-white" />
                </motion.div>
              ) : (
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <AlertTriangle className="w-5 h-5 text-white" />
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Wave bars (right side) */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <WaveBars isActive={true} color={waveBarColor} position="right" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status indicator dot for active states */}
      {isActive && (
        <motion.div
          className={clsx(
            'absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900',
            isListening ? 'bg-red-500' : 'bg-red-500'
          )}
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </div>
  );
};

export default AICoreButton;
