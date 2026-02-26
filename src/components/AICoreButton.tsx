/**
 * AICoreButton.tsx
 * 2026 Standard: Minimalist Geometric AI Core Button
 *
 * Visual Concept: Solid circular base with glowing center dot and outer breathing ring
 * States: IDLE (breathing) → LISTENING (pulsing ring) → PROCESSING (halo rotation) → ERROR (red warning glow)
 *
 * PROHIBITION: No microphone icons, no waveform bars - pure geometric AI identity
 */

import React, { useCallback, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { VoiceState } from '../types';

// === ANIMATION CONFIGURATION ===

// Breathing animation config for IDLE state
const idleBreathingConfig = {
  scale: [1, 1.08, 1],
  opacity: [0.7, 1, 0.7],
};

const idleBreathingTransition = {
  duration: 3,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

// Pulsing config for LISTENING state
const listeningPulseConfig = {
  scale: [1, 1.15, 1],
  opacity: [0.6, 1, 0.6],
};

const listeningPulseTransition = {
  duration: 0.8,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

// Processing rotation transition
const processingRotationTransition = {
  duration: 1.5,
  repeat: Infinity,
  ease: 'linear' as const,
};

// Error glow config
const errorGlowConfig = {
  scale: [1, 1.05, 1],
  opacity: [0.5, 1, 0.5],
  boxShadow: [
    '0 0 0 0 rgba(239, 68, 68, 0)',
    '0 0 20px 4px rgba(239, 68, 68, 0.4)',
    '0 0 0 0 rgba(239, 68, 68, 0)',
  ],
};

const errorGlowTransition = {
  duration: 1.2,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

// Spring transition for morphing
const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
};

interface AICoreButtonProps {
  state: VoiceState;
  onClick: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  progress?: number; // VAD countdown (0-100)
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

  // Tooltip text based on state
  const tooltip = {
    idle: 'Tap to speak',
    listening: 'Tap to end',
    processing: 'Processing...',
    speaking: 'Tap to interrupt',
    error: hasRetry ? 'Tap to retry' : 'Tap to reset',
  }[state];

  // WCAG aria-live announcement
  const ariaLive = {
    idle: 'AI Core ready for voice input',
    listening: 'Listening - tap to finish',
    processing: 'Processing your request',
    speaking: 'AI speaking - tap to interrupt',
    error: hasRetry ? 'Error - tap to retry' : 'Error occurred',
  }[state];

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

  // Progress ring calculations
  const size = 48;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

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

      {/* SVG Container for rings and halos */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <defs>
          {/* Gradient for listening state */}
          <linearGradient id="ai-core-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>

          {/* Processing gradient */}
          <linearGradient id="ai-processing-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="33%" stopColor="#16a34a" />
            <stop offset="66%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="ai-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background ring - always visible */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-200 dark:text-zinc-700"
        />

        {/* LISTENING: Progress ring */}
        {state === 'listening' && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#ai-core-gradient)"
            strokeWidth={strokeWidth + 1}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.1, ease: 'linear' as const }}
            style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
            filter="url(#ai-glow)"
          />
        )}

        {/* PROCESSING: Rotating halo segments */}
        {state === 'processing' && (
          <motion.g
            animate={{ rotate: 360 }}
            transition={processingRotationTransition}
            style={{ transformOrigin: 'center' }}
          >
            {[0, 90, 180, 270].map((angle) => (
              <circle
                key={angle}
                cx={size / 2 + Math.cos((angle * Math.PI) / 180) * radius}
                cy={size / 2 + Math.sin((angle * Math.PI) / 180) * radius}
                r={3}
                fill="url(#ai-core-gradient)"
                opacity={angle === 0 ? 1 : 0.3 + (angle / 360) * 0.4}
              />
            ))}
          </motion.g>
        )}

        {/* ERROR: Warning glow ring */}
        {state === 'error' && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#ef4444"
            strokeWidth={strokeWidth}
            animate={errorGlowConfig}
            transition={errorGlowTransition}
          />
        )}
      </svg>

      {/* Main Button */}
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
          'relative w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500',
          {
            'bg-zinc-100 dark:bg-zinc-800': state === 'idle',
            'bg-brand-500': state === 'listening',
            'bg-zinc-900 dark:bg-zinc-100': state === 'processing',
            'bg-red-500': state === 'speaking' || (state === 'error' && hasRetry),
            'bg-red-100 dark:bg-red-900/50': state === 'error' && !hasRetry,
          },
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* AI Core Visual - Center Dot + Outer Ring Animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={state}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={springTransition}
            className="relative flex items-center justify-center"
          >
            {/* IDLE: Breathing core */}
            {state === 'idle' && (
              <motion.div
                animate={idleBreathingConfig}
                transition={idleBreathingTransition}
                className="relative"
              >
                {/* Outer ring */}
                <div className="w-6 h-6 rounded-full border-2 border-zinc-400 dark:border-zinc-500 flex items-center justify-center">
                  {/* Center dot */}
                  <motion.div
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.6, 1, 0.6]
                    }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }}
                    className="w-2 h-2 rounded-full bg-zinc-500 dark:bg-zinc-400"
                  />
                </div>
              </motion.div>
            )}

            {/* LISTENING: Pulsing active ring */}
            {state === 'listening' && (
              <motion.div
                animate={listeningPulseConfig}
                transition={listeningPulseTransition}
                className="relative"
              >
                {/* Outer pulsing ring */}
                <div className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center">
                  {/* Glowing center */}
                  <motion.div
                    animate={{
                      scale: [1, 1.5, 1],
                      boxShadow: [
                        '0 0 4px 1px rgba(255,255,255,0.3)',
                        '0 0 12px 3px rgba(255,255,255,0.6)',
                        '0 0 4px 1px rgba(255,255,255,0.3)',
                      ]
                    }}
                    transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' as const }}
                    className="w-2.5 h-2.5 rounded-full bg-white"
                  />
                </div>
              </motion.div>
            )}

            {/* PROCESSING: Rotating segments */}
            {state === 'processing' && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={processingRotationTransition}
                className="relative w-6 h-6"
              >
                {/* Orbital dots */}
                {[0, 120, 240].map((angle, i) => (
                  <motion.div
                    key={angle}
                    className="absolute w-1.5 h-1.5 rounded-full"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `rotate(${angle}deg) translateY(-10px) translateX(-50%)`,
                      backgroundColor: i === 0 ? '#22c55e' : 'rgba(34, 197, 94, 0.4)',
                    }}
                    animate={{
                      opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
                {/* Center dot */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-zinc-100 dark:bg-zinc-900" />
              </motion.div>
            )}

            {/* SPEAKING: Stop indicator */}
            {state === 'speaking' && (
              <motion.div
                animate={{ scale: [1, 0.9, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="w-4 h-4 rounded-sm bg-white"
              />
            )}

            {/* ERROR: Warning indicator */}
            {state === 'error' && (
              <motion.div
                animate={hasRetry ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1, repeat: Infinity }}
                className="flex flex-col items-center justify-center"
              >
                {hasRetry ? (
                  // Retry arrow
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  // Warning triangle
                  <div className="w-5 h-5 flex items-center justify-center">
                    <span className="text-red-600 dark:text-red-400 font-bold text-lg">!</span>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.button>
    </div>
  );
};

export default AICoreButton;
