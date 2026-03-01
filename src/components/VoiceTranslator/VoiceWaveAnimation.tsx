// VoiceWaveAnimation - 2026 Standard Visual Feedback Component
// Animated indicators for voice mediator states

import React, { memo } from 'react';
import { motion } from 'motion/react';
import { clsx } from 'clsx';
import type { MediatorState, Participant } from '../../types/translator';

interface VoiceWaveAnimationProps {
  state: MediatorState;
  currentSpeaker: Participant | null;
  className?: string;
}

/**
 * Pulsing microphone indicator for listening state
 */
const PulsingMic = memo(({ speaker }: { speaker: Participant }) => {
  const colorClass = speaker === 'A' ? 'bg-blue-500' : 'bg-emerald-500';

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse rings */}
      <motion.div
        className={clsx('absolute rounded-full', colorClass, 'opacity-20')}
        initial={{ width: 80, height: 80 }}
        animate={{
          width: [80, 140, 80],
          height: [80, 140, 80],
          opacity: [0.2, 0, 0.2],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className={clsx('absolute rounded-full', colorClass, 'opacity-30')}
        initial={{ width: 80, height: 80 }}
        animate={{
          width: [80, 120, 80],
          height: [80, 120, 80],
          opacity: [0.3, 0, 0.3],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.5,
        }}
      />

      {/* Inner circle with microphone icon */}
      <motion.div
        className={clsx(
          'relative flex items-center justify-center rounded-full w-20 h-20',
          colorClass
        )}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <svg
          className="w-8 h-8 text-white"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      </motion.div>
    </div>
  );
});

PulsingMic.displayName = 'PulsingMic';

/**
 * Sound wave animation for speaking state
 */
const SoundWaves = memo(({ speaker }: { speaker: Participant }) => {
  const colorClass = speaker === 'A' ? 'bg-blue-500' : 'bg-emerald-500';
  const bars = [0, 1, 2, 3, 4];

  return (
    <div className="relative flex items-center justify-center">
      {/* Central speaker icon */}
      <motion.div
        className={clsx(
          'relative flex items-center justify-center rounded-full w-20 h-20',
          colorClass
        )}
      >
        <svg
          className="w-8 h-8 text-white"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      </motion.div>

      {/* Sound wave bars */}
      <div className="absolute flex items-center gap-1 left-full ml-4">
        {bars.map((i) => (
          <motion.div
            key={i}
            className={clsx('w-1 rounded-full', colorClass)}
            animate={{
              height: [12, 32, 20, 28, 12],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.1,
            }}
          />
        ))}
      </div>

      {/* Mirror sound wave bars on left */}
      <div className="absolute flex items-center gap-1 right-full mr-4">
        {bars.map((i) => (
          <motion.div
            key={i}
            className={clsx('w-1 rounded-full', colorClass)}
            animate={{
              height: [12, 28, 20, 32, 12],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    </div>
  );
});

SoundWaves.displayName = 'SoundWaves';

/**
 * Processing spinner animation
 */
const ProcessingSpinner = memo(() => (
  <div className="relative flex items-center justify-center">
    <motion.div
      className="w-20 h-20 rounded-full border-4 border-zinc-200 dark:border-zinc-700 border-t-brand-500"
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
    <div className="absolute">
      <svg
        className="w-8 h-8 text-brand-500"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
      </svg>
    </div>
  </div>
));

ProcessingSpinner.displayName = 'ProcessingSpinner';

/**
 * Idle state indicator
 */
const IdleIndicator = memo(() => (
  <div className="relative flex items-center justify-center">
    <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
      <svg
        className="w-8 h-8 text-zinc-400 dark:text-zinc-500"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
      </svg>
    </div>
  </div>
));

IdleIndicator.displayName = 'IdleIndicator';

/**
 * Error indicator
 */
const ErrorIndicator = memo(() => (
  <div className="relative flex items-center justify-center">
    <motion.div
      className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"
      animate={{ scale: [1, 1.02, 1] }}
      transition={{ duration: 1, repeat: Infinity }}
    >
      <svg
        className="w-8 h-8 text-red-500 dark:text-red-400"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
    </motion.div>
  </div>
));

ErrorIndicator.displayName = 'ErrorIndicator';

/**
 * Main VoiceWaveAnimation component
 * Renders appropriate animation based on mediator state
 */
export const VoiceWaveAnimation = memo(function VoiceWaveAnimation({
  state,
  currentSpeaker,
  className,
}: VoiceWaveAnimationProps) {
  const renderAnimation = () => {
    switch (state) {
      case 'listening_a':
        return <PulsingMic speaker="A" />;
      case 'listening_b':
        return <PulsingMic speaker="B" />;
      case 'processing':
        return <ProcessingSpinner />;
      case 'speaking_a':
        return <SoundWaves speaker="A" />;
      case 'speaking_b':
        return <SoundWaves speaker="B" />;
      case 'error':
        return <ErrorIndicator />;
      case 'idle':
      default:
        return <IdleIndicator />;
    }
  };

  return (
    <div className={clsx('flex items-center justify-center h-32', className)}>
      {renderAnimation()}
    </div>
  );
});

export default VoiceWaveAnimation;
