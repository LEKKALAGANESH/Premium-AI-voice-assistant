// VoiceModeIcon.tsx - Morphing State Icon with Smooth Transitions
// Seamlessly morphs between:
// - Voice Waveform (Idle/Listening)
// - Sparkle (Thinking)
// - Sound Waves (Speaking)
//
// Uses framer-motion for smooth SVG path morphing

'use client';

import React, { memo, useMemo } from 'react';
import { motion, AnimatePresence, Variants } from 'motion/react';
import { clsx } from 'clsx';

// ============================================================================
// TYPES
// ============================================================================

export type VoiceIconMode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceModeIconProps {
  mode: VoiceIconMode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  audioLevel?: number;
  className?: string;
  primaryColor?: string;
  secondaryColor?: string;
  showBackground?: boolean;
}

const SIZE_MAP = {
  sm: { icon: 24, container: 48 },
  md: { icon: 32, container: 64 },
  lg: { icon: 40, container: 80 },
  xl: { icon: 56, container: 112 },
};

const MODE_COLORS: Record<VoiceIconMode, { primary: string; secondary: string; glow: string }> = {
  idle: { primary: '#71717a', secondary: '#a1a1aa', glow: 'rgba(113, 113, 122, 0.3)' },
  listening: { primary: '#22c55e', secondary: '#4ade80', glow: 'rgba(34, 197, 94, 0.4)' },
  thinking: { primary: '#f59e0b', secondary: '#fbbf24', glow: 'rgba(245, 158, 11, 0.4)' },
  speaking: { primary: '#3b82f6', secondary: '#60a5fa', glow: 'rgba(59, 130, 246, 0.4)' },
  error: { primary: '#ef4444', secondary: '#f87171', glow: 'rgba(239, 68, 68, 0.4)' },
};

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const iconVariants: Variants = {
  initial: { opacity: 0, scale: 0.5, rotate: -180 },
  animate: { opacity: 1, scale: 1, rotate: 0 },
  exit: { opacity: 0, scale: 0.5, rotate: 180 },
};

const pulseVariants: Variants = {
  idle: { scale: 1, opacity: 0.3 },
  active: {
    scale: [1, 1.2, 1],
    opacity: [0.3, 0.6, 0.3],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
  },
};

const glowVariants: Variants = {
  idle: { scale: 0.8, opacity: 0 },
  active: {
    scale: [1, 1.3, 1],
    opacity: [0.2, 0.4, 0.2],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
};

// ============================================================================
// IDLE VOICE ICON (Static Waveform)
// ============================================================================

const IdleVoiceIcon = memo(function IdleVoiceIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  const barWidths = [0.12, 0.12, 0.12, 0.12, 0.12];
  const barHeights = [0.25, 0.45, 0.65, 0.45, 0.25];

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {barWidths.map((w, i) => {
        const x = 4 + i * 4;
        const height = barHeights[i] * 16;
        const y = 12 - height / 2;

        return (
          <motion.rect
            key={i}
            x={x}
            y={y}
            width={2.5}
            height={height}
            rx={1.25}
            fill={color}
            initial={{ height: 4, y: 10 }}
            animate={{ height, y }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          />
        );
      })}
    </svg>
  );
});

// ============================================================================
// LISTENING ICON (Animated Pulsing Waveform)
// ============================================================================

const ListeningIcon = memo(function ListeningIcon({
  size,
  color,
  secondaryColor,
  audioLevel = 0.5,
}: {
  size: number;
  color: string;
  secondaryColor: string;
  audioLevel?: number;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Pulse rings */}
      {[1, 2].map((ring) => (
        <motion.div
          key={ring}
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: color }}
          animate={{
            scale: [1, 1.4 + ring * 0.2],
            opacity: [0.6, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: ring * 0.3,
            ease: 'easeOut',
          }}
        />
      ))}

      {/* Center waveform */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="relative z-10"
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const baseHeight = [4, 8, 12, 8, 4][i];
          const dynamicHeight = baseHeight + audioLevel * 4;

          return (
            <motion.rect
              key={i}
              x={4 + i * 4}
              width={2.5}
              rx={1.25}
              fill={i % 2 === 0 ? color : secondaryColor}
              animate={{
                y: 12 - dynamicHeight / 2,
                height: dynamicHeight,
              }}
              transition={{
                duration: 0.15,
                ease: 'easeOut',
              }}
            />
          );
        })}
      </svg>
    </div>
  );
});

// ============================================================================
// THINKING ICON (Morphing Sparkle)
// ============================================================================

const ThinkingSparkleIcon = memo(function ThinkingSparkleIcon({
  size,
  color,
  secondaryColor,
}: {
  size: number;
  color: string;
  secondaryColor: string;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Rotating outer particles */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      >
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const distance = size * 0.4;
          const x = size / 2 + Math.cos(rad) * distance - 3;
          const y = size / 2 + Math.sin(rad) * distance - 3;

          return (
            <motion.div
              key={angle}
              className="absolute rounded-full"
              style={{
                left: x,
                top: y,
                width: 6,
                height: 6,
                backgroundColor: angle % 90 === 0 ? color : secondaryColor,
              }}
              animate={{
                scale: [0.5, 1, 0.5],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: angle / 360,
              }}
            />
          );
        })}
      </motion.div>

      {/* Center morphing sparkle */}
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="absolute inset-0"
        animate={{ scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* 4-point sparkle that morphs */}
        <motion.path
          fill={color}
          animate={{
            d: [
              // Compact sparkle
              'M12 4L13 10L18 12L13 14L12 20L11 14L6 12L11 10L12 4Z',
              // Expanded sparkle
              'M12 2L14 9L22 12L14 15L12 22L10 15L2 12L10 9L12 2Z',
              // Rotated sparkle
              'M12 3L13.5 9.5L20 12L13.5 14.5L12 21L10.5 14.5L4 12L10.5 9.5L12 3Z',
              // Back to compact
              'M12 4L13 10L18 12L13 14L12 20L11 14L6 12L11 10L12 4Z',
            ],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Inner glow */}
        <motion.circle
          cx={12}
          cy={12}
          fill={secondaryColor}
          animate={{
            r: [2, 4, 2],
            opacity: [0.8, 0.4, 0.8],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.svg>
    </div>
  );
});

// ============================================================================
// SPEAKING ICON (Sound Waves)
// ============================================================================

const SpeakingWaveIcon = memo(function SpeakingWaveIcon({
  size,
  color,
  secondaryColor,
}: {
  size: number;
  color: string;
  secondaryColor: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Speaker body */}
      <motion.path
        d="M11 5L6 9H2V15H6L11 19V5Z"
        fill={color}
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Animated sound waves */}
      <motion.path
        d="M15.54 8.46C16.48 9.4 17 10.67 17 12C17 13.33 16.48 14.6 15.54 15.54"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        animate={{
          pathLength: [0, 1, 1, 0],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.path
        d="M18.07 5.93C19.91 7.77 21 10.32 21 12C21 13.68 19.91 16.23 18.07 18.07"
        stroke={secondaryColor}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        animate={{
          pathLength: [0, 1, 1, 0],
          opacity: [0, 0.7, 0.7, 0],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.2,
        }}
      />

      {/* Extra wave for emphasis */}
      <motion.path
        d="M20 4C22.5 6.5 24 9.5 24 12C24 14.5 22.5 17.5 20 20"
        stroke={secondaryColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        strokeOpacity={0.5}
        animate={{
          pathLength: [0, 1, 1, 0],
          opacity: [0, 0.5, 0.5, 0],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.4,
        }}
      />
    </svg>
  );
});

// ============================================================================
// ERROR ICON
// ============================================================================

const ErrorIcon = memo(function ErrorIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <path
        d="M12 2L2 22H22L12 2Z"
        fill={color}
        fillOpacity={0.15}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <motion.line
        x1={12}
        y1={9}
        x2={12}
        y2={13}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
      <circle cx={12} cy={17} r={1} fill={color} />
    </motion.svg>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const VoiceModeIcon = memo(function VoiceModeIcon({
  mode,
  size = 'md',
  audioLevel = 0.5,
  className,
  primaryColor,
  secondaryColor,
  showBackground = true,
}: VoiceModeIconProps) {
  const { icon: iconSize, container: containerSize } = SIZE_MAP[size];
  const colors = MODE_COLORS[mode];

  const primary = primaryColor || colors.primary;
  const secondary = secondaryColor || colors.secondary;
  const glow = colors.glow;

  const isActive = mode !== 'idle' && mode !== 'error';

  return (
    <div
      className={clsx(
        'relative flex items-center justify-center transition-all duration-300',
        className
      )}
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Background glow */}
      {showBackground && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: glow }}
          variants={glowVariants}
          animate={isActive ? 'active' : 'idle'}
        />
      )}

      {/* Background circle */}
      {showBackground && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: containerSize * 0.85,
            height: containerSize * 0.85,
            backgroundColor: `${primary}15`,
            border: `2px solid ${primary}30`,
          }}
          variants={pulseVariants}
          animate={isActive ? 'active' : 'idle'}
        />
      )}

      {/* Icon with morphing transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          variants={iconVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1], // Custom easing for smooth morph
          }}
          className="relative z-10"
        >
          {mode === 'idle' && (
            <IdleVoiceIcon size={iconSize} color={primary} />
          )}
          {mode === 'listening' && (
            <ListeningIcon
              size={iconSize}
              color={primary}
              secondaryColor={secondary}
              audioLevel={audioLevel}
            />
          )}
          {mode === 'thinking' && (
            <ThinkingSparkleIcon
              size={iconSize}
              color={primary}
              secondaryColor={secondary}
            />
          )}
          {mode === 'speaking' && (
            <SpeakingWaveIcon
              size={iconSize}
              color={primary}
              secondaryColor={secondary}
            />
          )}
          {mode === 'error' && (
            <ErrorIcon size={iconSize} color={primary} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Screen reader */}
      <span className="sr-only">
        {mode === 'idle' && 'Ready'}
        {mode === 'listening' && 'Listening'}
        {mode === 'thinking' && 'Thinking'}
        {mode === 'speaking' && 'Speaking'}
        {mode === 'error' && 'Error'}
      </span>
    </div>
  );
});

// ============================================================================
// COMPACT BUTTON VERSION
// ============================================================================

export interface VoiceModeButtonProps extends VoiceModeIconProps {
  onClick?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  label?: string;
}

export const VoiceModeButton = memo(function VoiceModeButton({
  mode,
  size = 'lg',
  audioLevel,
  onClick,
  onLongPress,
  disabled = false,
  label,
  className,
  ...props
}: VoiceModeButtonProps) {
  const { container: containerSize } = SIZE_MAP[size];
  const colors = MODE_COLORS[mode];

  // Long press detection
  const longPressTimer = React.useRef<number | null>(null);

  const handleMouseDown = () => {
    if (disabled || !onLongPress) return;
    longPressTimer.current = window.setTimeout(() => {
      onLongPress();
      longPressTimer.current = null;
    }, 500);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      onClick?.();
    }
  };

  const handleMouseLeave = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className={clsx(
        'relative flex flex-col items-center justify-center gap-2',
        'rounded-full transition-all duration-200',
        'focus:outline-none focus-visible:ring-4',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      style={{
        width: containerSize + 16,
        height: containerSize + (label ? 32 : 16),
        backgroundColor: `${colors.primary}10`,
        boxShadow: mode !== 'idle' ? `0 0 20px ${colors.glow}` : 'none',
      }}
      aria-label={label || `Voice mode: ${mode}`}
    >
      <VoiceModeIcon
        mode={mode}
        size={size}
        audioLevel={audioLevel}
        showBackground={false}
        {...props}
      />

      {label && (
        <span
          className="text-xs font-medium"
          style={{ color: colors.primary }}
        >
          {label}
        </span>
      )}
    </motion.button>
  );
});

export default VoiceModeIcon;
