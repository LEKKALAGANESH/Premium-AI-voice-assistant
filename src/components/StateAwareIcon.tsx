// StateAwareIcon.tsx - Dynamic Voice/Thinking/Speaking Icon Component
// Provides visual feedback based on voice agent state
//
// States:
// - IDLE: Static Voice Icon
// - LISTENING: Pulsing Voice Waveform Icon
// - THINKING: Spinning/Morphing Sparkle Icon
// - SPEAKING: Animated Sound Waves

'use client';

import React, { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import type { VoiceState } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type IconState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface StateAwareIconProps {
  state: VoiceState | IconState;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  audioLevel?: number; // 0-1 for waveform visualization
  color?: string; // Custom color override
}

// Size configurations
const SIZE_CONFIG = {
  sm: { icon: 20, container: 40 },
  md: { icon: 28, container: 56 },
  lg: { icon: 36, container: 72 },
  xl: { icon: 48, container: 96 },
};

// ============================================================================
// IDLE ICON - Static Voice/Waveform
// ============================================================================

const IdleIcon = memo(function IdleIcon({
  size,
  color = 'currentColor',
}: {
  size: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Voice waveform bars */}
      <rect x="4" y="10" width="2" height="4" rx="1" fill={color} />
      <rect x="8" y="7" width="2" height="10" rx="1" fill={color} />
      <rect x="12" y="5" width="2" height="14" rx="1" fill={color} />
      <rect x="16" y="7" width="2" height="10" rx="1" fill={color} />
      <rect x="20" y="10" width="2" height="4" rx="1" fill={color} />
    </svg>
  );
});

// ============================================================================
// LISTENING ICON - Pulsing Voice Waveform
// ============================================================================

const ListeningIcon = memo(function ListeningIcon({
  size,
  color = 'currentColor',
  audioLevel = 0.5,
}: {
  size: number;
  color?: string;
  audioLevel?: number;
}) {
  // Animate bars based on audio level
  const barHeights = useMemo(() => {
    const base = [4, 10, 14, 10, 4];
    return base.map((h, i) => {
      const variation = Math.sin(Date.now() / 150 + i * 0.8) * 3;
      return Math.max(3, Math.min(16, h + audioLevel * 4 + variation));
    });
  }, [audioLevel]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Animated waveform bars */}
      {[4, 8, 12, 16, 20].map((x, i) => (
        <motion.rect
          key={i}
          x={x - 1}
          width="2"
          rx="1"
          fill={color}
          animate={{
            y: 12 - barHeights[i] / 2,
            height: barHeights[i],
          }}
          transition={{
            duration: 0.15,
            ease: 'easeOut',
          }}
        />
      ))}
    </svg>
  );
});

// Alternative Listening Icon with pulse effect
const ListeningPulseIcon = memo(function ListeningPulseIcon({
  size,
  color = 'currentColor',
}: {
  size: number;
  color?: string;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Pulse rings */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ border: `2px solid ${color}` }}
        animate={{
          scale: [1, 1.5, 1.5],
          opacity: [0.6, 0, 0],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ border: `2px solid ${color}` }}
        animate={{
          scale: [1, 1.3, 1.3],
          opacity: [0.4, 0, 0],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeOut',
          delay: 0.3,
        }}
      />

      {/* Center waveform icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10"
      >
        {[4, 8, 12, 16, 20].map((x, i) => (
          <motion.rect
            key={i}
            x={x - 1}
            width="2"
            rx="1"
            fill={color}
            animate={{
              y: [10, 6, 10],
              height: [4, 12, 4],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.1,
            }}
          />
        ))}
      </svg>
    </div>
  );
});

// ============================================================================
// THINKING ICON - Spinning/Morphing Sparkle
// ============================================================================

const ThinkingIcon = memo(function ThinkingIcon({
  size,
  color = 'currentColor',
}: {
  size: number;
  color?: string;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer rotating ring */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Sparkle points */}
          {[0, 60, 120, 180, 240, 300].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const cx = 12 + Math.cos(rad) * 9;
            const cy = 12 + Math.sin(rad) * 9;
            return (
              <motion.circle
                key={i}
                cx={cx}
                cy={cy}
                r={1.5}
                fill={color}
                animate={{
                  r: [1, 2, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            );
          })}
        </svg>
      </motion.div>

      {/* Center sparkle/brain icon */}
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0"
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {/* 4-point sparkle */}
        <motion.path
          d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9L12 2Z"
          fill={color}
          animate={{
            d: [
              'M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9L12 2Z',
              'M12 4L14 9.5L20 12L14 14.5L12 20L10 14.5L4 12L10 9.5L12 4Z',
              'M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9L12 2Z',
            ],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.svg>
    </div>
  );
});

// Alternative: AI Brain thinking icon
const ThinkingBrainIcon = memo(function ThinkingBrainIcon({
  size,
  color = 'currentColor',
}: {
  size: number;
  color?: string;
}) {
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={{ rotate: [0, 5, -5, 0] }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Simplified brain outline */}
        <motion.path
          d="M12 4C8 4 5 7 5 10C5 12 6 14 8 15V18C8 19 9 20 10 20H14C15 20 16 19 16 18V15C18 14 19 12 19 10C19 7 16 4 12 4Z"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          animate={{
            pathLength: [0, 1, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Neural activity dots */}
        {[
          { cx: 9, cy: 9 },
          { cx: 12, cy: 8 },
          { cx: 15, cy: 9 },
          { cx: 10, cy: 12 },
          { cx: 14, cy: 12 },
        ].map((pos, i) => (
          <motion.circle
            key={i}
            cx={pos.cx}
            cy={pos.cy}
            r={1}
            fill={color}
            animate={{
              r: [0.5, 1.5, 0.5],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </svg>
    </motion.div>
  );
});

// ============================================================================
// SPEAKING ICON - Animated Sound Waves
// ============================================================================

const SpeakingIcon = memo(function SpeakingIcon({
  size,
  color = 'currentColor',
}: {
  size: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Speaker cone */}
      <path
        d="M11 5L6 9H2V15H6L11 19V5Z"
        fill={color}
      />

      {/* Animated sound waves */}
      <motion.path
        d="M15.54 8.46C16.48 9.4 17 10.67 17 12C17 13.33 16.48 14.6 15.54 15.54"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        animate={{
          opacity: [0, 1, 0],
          pathLength: [0, 1, 1],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />
      <motion.path
        d="M18.07 5.93C19.91 7.77 21 10.32 21 13C21 15.68 19.91 18.23 18.07 20.07"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        animate={{
          opacity: [0, 1, 0],
          pathLength: [0, 1, 1],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'easeOut',
          delay: 0.3,
        }}
      />
    </svg>
  );
});

// Alternative: Waveform speaking icon
const SpeakingWaveIcon = memo(function SpeakingWaveIcon({
  size,
  color = 'currentColor',
}: {
  size: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Waveform bars emanating outward */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.rect
          key={i}
          x={4 + i * 4}
          width="2"
          rx="1"
          fill={color}
          animate={{
            y: [10, 4, 10],
            height: [4, 16, 4],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.08,
          }}
        />
      ))}
    </svg>
  );
});

// ============================================================================
// ERROR ICON - Static with subtle pulse
// ============================================================================

const ErrorIcon = memo(function ErrorIcon({
  size,
  color = '#ef4444',
}: {
  size: number;
  color?: string;
}) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={{
        scale: [1, 1.05, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {/* Warning triangle */}
      <path
        d="M12 2L2 22H22L12 2Z"
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Exclamation */}
      <line x1="12" y1="9" x2="12" y2="13" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill={color} />
    </motion.svg>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const StateAwareIcon = memo(function StateAwareIcon({
  state,
  size = 'md',
  className,
  audioLevel = 0.5,
  color,
}: StateAwareIconProps) {
  const { icon: iconSize, container: containerSize } = SIZE_CONFIG[size];

  // Default colors based on state
  const defaultColors: Record<IconState, string> = {
    idle: '#71717a', // zinc-500
    listening: '#22c55e', // green-500
    processing: '#f59e0b', // amber-500
    speaking: '#3b82f6', // blue-500
    error: '#ef4444', // red-500
  };

  const normalizedState: IconState = state as IconState;
  const iconColor = color || defaultColors[normalizedState] || defaultColors.idle;

  return (
    <div
      className={clsx(
        'relative flex items-center justify-center',
        className
      )}
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Background glow effect */}
      <AnimatePresence>
        {(normalizedState === 'listening' || normalizedState === 'speaking') && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: iconColor }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0.1, 0.2, 0.1],
              scale: [0.9, 1.1, 0.9],
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
      </AnimatePresence>

      {/* Icon container with transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={normalizedState}
          initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative z-10"
        >
          {normalizedState === 'idle' && (
            <IdleIcon size={iconSize} color={iconColor} />
          )}
          {normalizedState === 'listening' && (
            <ListeningPulseIcon size={iconSize} color={iconColor} />
          )}
          {normalizedState === 'processing' && (
            <ThinkingIcon size={iconSize} color={iconColor} />
          )}
          {normalizedState === 'speaking' && (
            <SpeakingIcon size={iconSize} color={iconColor} />
          )}
          {normalizedState === 'error' && (
            <ErrorIcon size={iconSize} color={iconColor} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Screen reader status */}
      <span className="sr-only">
        {normalizedState === 'idle' && 'Ready'}
        {normalizedState === 'listening' && 'Listening'}
        {normalizedState === 'processing' && 'Thinking'}
        {normalizedState === 'speaking' && 'Speaking'}
        {normalizedState === 'error' && 'Error'}
      </span>
    </div>
  );
});

// ============================================================================
// ALTERNATIVE: CIRCULAR STATE ICON WITH PROGRESS RING
// ============================================================================

export interface CircularStateIconProps extends StateAwareIconProps {
  progress?: number; // 0-100 for processing progress
}

export const CircularStateIcon = memo(function CircularStateIcon({
  state,
  size = 'md',
  className,
  audioLevel = 0.5,
  color,
  progress = 0,
}: CircularStateIconProps) {
  const { icon: iconSize, container: containerSize } = SIZE_CONFIG[size];
  const strokeWidth = size === 'sm' ? 2 : size === 'md' ? 3 : 4;
  const radius = (containerSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const normalizedState: IconState = state as IconState;

  const defaultColors: Record<IconState, string> = {
    idle: '#71717a',
    listening: '#22c55e',
    processing: '#f59e0b',
    speaking: '#3b82f6',
    error: '#ef4444',
  };

  const iconColor = color || defaultColors[normalizedState] || defaultColors.idle;

  return (
    <div
      className={clsx('relative flex items-center justify-center', className)}
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Progress ring */}
      <svg
        className="absolute inset-0 -rotate-90"
        width={containerSize}
        height={containerSize}
      >
        {/* Background circle */}
        <circle
          cx={containerSize / 2}
          cy={containerSize / 2}
          r={radius}
          fill="none"
          stroke={iconColor}
          strokeWidth={strokeWidth}
          strokeOpacity={0.2}
        />

        {/* Progress circle (only in processing state) */}
        {normalizedState === 'processing' && (
          <motion.circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius}
            fill="none"
            stroke={iconColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{
              strokeDashoffset: [circumference, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        )}

        {/* Listening pulse circle */}
        {normalizedState === 'listening' && (
          <motion.circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius}
            fill="none"
            stroke={iconColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            animate={{
              strokeOpacity: [0.3, 0.8, 0.3],
              r: [radius - 2, radius + 2, radius - 2],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Speaking wave circle */}
        {normalizedState === 'speaking' && (
          <motion.circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius}
            fill="none"
            stroke={iconColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
            animate={{
              rotate: [0, 360],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{ transformOrigin: 'center' }}
          />
        )}
      </svg>

      {/* Center icon */}
      <AnimatePresence mode="wait">
        <motion.div
          key={normalizedState}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.15 }}
        >
          {normalizedState === 'idle' && (
            <IdleIcon size={iconSize * 0.6} color={iconColor} />
          )}
          {normalizedState === 'listening' && (
            <ListeningIcon size={iconSize * 0.6} color={iconColor} audioLevel={audioLevel} />
          )}
          {normalizedState === 'processing' && (
            <ThinkingBrainIcon size={iconSize * 0.6} color={iconColor} />
          )}
          {normalizedState === 'speaking' && (
            <SpeakingWaveIcon size={iconSize * 0.6} color={iconColor} />
          )}
          {normalizedState === 'error' && (
            <ErrorIcon size={iconSize * 0.6} color={iconColor} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

export default StateAwareIcon;
