// StatusIcon.tsx - Morphing Voice State Icon
// Transitions smoothly between states:
// - IDLE: Mic outline (inactive)
// - LISTENING: Animated mic with sound waves
// - THINKING: Morphing sparkle animation (AI processing)
// - SPEAKING: Animated waveform
// - ERROR: Alert icon

'use client';

import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import type { VoiceState } from '../hooks/useVoiceBot';

// ============================================================================
// TYPES
// ============================================================================

interface StatusIconProps {
  state: VoiceState;
  size?: number;
  className?: string;
}

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.8, opacity: 0 },
};

const pulseVariants: Variants = {
  animate: {
    scale: [1, 1.15, 1],
    opacity: [0.7, 1, 0.7],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

const waveVariants: Variants = {
  animate: (i: number) => ({
    scaleY: [1, 1.8, 0.6, 1.4, 1],
    transition: {
      duration: 0.8,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: i * 0.1,
    },
  }),
};

const sparkleRotate: Variants = {
  animate: {
    rotate: [0, 180, 360],
    scale: [1, 1.1, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

const sparklePulse: Variants = {
  animate: {
    opacity: [0.6, 1, 0.6],
    scale: [0.9, 1.1, 0.9],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ============================================================================
// ICON COMPONENTS
// ============================================================================

/** Idle State: Simple mic outline */
const IdleIcon: React.FC<{ size: number }> = ({ size }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    variants={containerVariants}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </motion.svg>
);

/** Listening State: Mic with animated sound waves */
const ListeningIcon: React.FC<{ size: number }> = ({ size }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    variants={containerVariants}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    {/* Mic body */}
    <motion.path
      d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
      fill="currentColor"
      fillOpacity={0.2}
      variants={pulseVariants}
      animate="animate"
    />
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />

    {/* Sound waves */}
    <motion.path
      d="M5 9a9 9 0 0 0 0 6"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{
        pathLength: [0, 1, 0],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
    <motion.path
      d="M19 9a9 9 0 0 1 0 6"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{
        pathLength: [0, 1, 0],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 0.2,
      }}
    />
  </motion.svg>
);

/** Thinking State: Morphing sparkle (AI processing) */
const ThinkingIcon: React.FC<{ size: number }> = ({ size }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    variants={containerVariants}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    {/* Main sparkle - rotating */}
    <motion.g variants={sparkleRotate} animate="animate">
      {/* 4-point star */}
      <motion.path
        d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9L12 2Z"
        fill="currentColor"
        fillOpacity={0.3}
        variants={sparklePulse}
        animate="animate"
      />
      <path d="M12 2L13.5 9L20 12L13.5 15L12 22L10.5 15L4 12L10.5 9L12 2Z" />
    </motion.g>

    {/* Small sparkles around */}
    <motion.circle
      cx="5"
      cy="5"
      r="1"
      fill="currentColor"
      animate={{
        scale: [0, 1, 0],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 1.2,
        repeat: Infinity,
        delay: 0,
      }}
    />
    <motion.circle
      cx="19"
      cy="5"
      r="1"
      fill="currentColor"
      animate={{
        scale: [0, 1, 0],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 1.2,
        repeat: Infinity,
        delay: 0.4,
      }}
    />
    <motion.circle
      cx="19"
      cy="19"
      r="1"
      fill="currentColor"
      animate={{
        scale: [0, 1, 0],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 1.2,
        repeat: Infinity,
        delay: 0.8,
      }}
    />
    <motion.circle
      cx="5"
      cy="19"
      r="1"
      fill="currentColor"
      animate={{
        scale: [0, 1, 0],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 1.2,
        repeat: Infinity,
        delay: 1.2,
      }}
    />
  </motion.svg>
);

/** Speaking State: Animated waveform */
const SpeakingIcon: React.FC<{ size: number }> = ({ size }) => {
  const barCount = 5;
  const barWidth = 2;
  const gap = 2;
  const totalWidth = barCount * barWidth + (barCount - 1) * gap;
  const startX = (24 - totalWidth) / 2;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0"
      variants={containerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {[...Array(barCount)].map((_, i) => (
        <motion.rect
          key={i}
          x={startX + i * (barWidth + gap)}
          y={8}
          width={barWidth}
          height={8}
          rx={1}
          fill="currentColor"
          custom={i}
          variants={waveVariants}
          animate="animate"
          style={{ originY: 0.5 }}
        />
      ))}
    </motion.svg>
  );
};

/** Error State: Alert icon */
const ErrorIcon: React.FC<{ size: number }> = ({ size }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    variants={containerVariants}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    <motion.path
      d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
      fill="currentColor"
      fillOpacity={0.2}
      animate={{
        fillOpacity: [0.2, 0.4, 0.2],
      }}
      transition={{
        duration: 1,
        repeat: Infinity,
      }}
    />
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" x2="12" y1="9" y2="13" />
    <line x1="12" x2="12.01" y1="17" y2="17" />
  </motion.svg>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const StatusIcon: React.FC<StatusIconProps> = ({
  state,
  size = 24,
  className = '',
}) => {
  const renderIcon = () => {
    switch (state) {
      case 'IDLE':
        return <IdleIcon key="idle" size={size} />;
      case 'LISTENING':
        return <ListeningIcon key="listening" size={size} />;
      case 'THINKING':
        return <ThinkingIcon key="thinking" size={size} />;
      case 'SPEAKING':
        return <SpeakingIcon key="speaking" size={size} />;
      case 'ERROR':
        return <ErrorIcon key="error" size={size} />;
      default:
        return <IdleIcon key="default" size={size} />;
    }
  };

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <AnimatePresence mode="wait">
        {renderIcon()}
      </AnimatePresence>
    </div>
  );
};

// ============================================================================
// STATE-SPECIFIC COLORS (for reference/usage in parent)
// ============================================================================

export const stateColors: Record<VoiceState, string> = {
  IDLE: 'text-gray-400',
  LISTENING: 'text-blue-500',
  THINKING: 'text-purple-500',
  SPEAKING: 'text-green-500',
  ERROR: 'text-red-500',
};

export const stateLabels: Record<VoiceState, string> = {
  IDLE: 'Tap to start',
  LISTENING: 'Listening...',
  THINKING: 'Thinking...',
  SPEAKING: 'Speaking...',
  ERROR: 'Error occurred',
};

export default StatusIcon;
