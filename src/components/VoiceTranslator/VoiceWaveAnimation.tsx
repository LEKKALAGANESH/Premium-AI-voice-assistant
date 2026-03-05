// VoiceWaveAnimation - 2026 Premium Visual Feedback Component
// Enhanced with wave bars, pulse rings, and integrated stop button design
// For Voice Translator bilingual mediation interface

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { Mic, Square, Loader2, AlertTriangle, Volume2 } from 'lucide-react';
import type { MediatorState, Participant } from '../../types/translator';

interface VoiceWaveAnimationProps {
  state: MediatorState;
  currentSpeaker: Participant | null;
  className?: string;
  onStop?: () => void;
  showStopButton?: boolean;
}

// === WAVE BARS COMPONENT ===
interface WaveBarsProps {
  isActive: boolean;
  color: string;
  position: 'left' | 'right';
}

const WaveBars = memo(function WaveBars({ isActive, color, position }: WaveBarsProps) {
  const bars = [0, 1, 2, 3, 4];
  const baseDelays = position === 'left'
    ? [0.1, 0.2, 0.15, 0.25, 0.05]
    : [0.05, 0.25, 0.15, 0.2, 0.1];

  return (
    <div
      className={clsx(
        'flex items-center gap-1',
        position === 'left' ? 'mr-4' : 'ml-4'
      )}
    >
      {bars.map((i) => (
        <motion.div
          key={i}
          className={clsx('w-1 rounded-full', color)}
          animate={isActive ? {
            height: [12, 32, 20, 28, 16, 24, 12],
          } : {
            height: 8,
          }}
          transition={isActive ? {
            duration: 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: baseDelays[i],
          } : {
            duration: 0.2,
          }}
          style={{ height: 8 }}
        />
      ))}
    </div>
  );
});

// === PULSE RINGS COMPONENT ===
interface PulseRingsProps {
  isActive: boolean;
  color: string;
}

const PulseRings = memo(function PulseRings({ isActive, color }: PulseRingsProps) {
  if (!isActive) return null;

  return (
    <>
      <motion.div
        className={clsx('absolute rounded-full', color)}
        initial={{ width: 80, height: 80, opacity: 0.3 }}
        animate={{
          width: [80, 140, 80],
          height: [80, 140, 80],
          opacity: [0.3, 0, 0.3],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />
      <motion.div
        className={clsx('absolute rounded-full', color)}
        initial={{ width: 80, height: 80, opacity: 0.4 }}
        animate={{
          width: [80, 120, 80],
          height: [80, 120, 80],
          opacity: [0.4, 0, 0.4],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeOut',
          delay: 0.5,
        }}
      />
    </>
  );
});

// === MAIN COMPONENT ===
export const VoiceWaveAnimation = memo(function VoiceWaveAnimation({
  state,
  currentSpeaker,
  className,
  onStop,
  showStopButton = true,
}: VoiceWaveAnimationProps) {

  // Determine colors based on speaker
  const speakerColor = currentSpeaker === 'A' ? 'blue' : 'emerald';

  const bgColorClass = {
    A: 'bg-blue-500',
    B: 'bg-emerald-500',
  }[currentSpeaker || 'A'];

  const pulseColorClass = {
    A: 'bg-blue-500/30',
    B: 'bg-emerald-500/30',
  }[currentSpeaker || 'A'];

  const waveColorClass = {
    A: 'bg-blue-400 dark:bg-blue-300',
    B: 'bg-emerald-400 dark:bg-emerald-300',
  }[currentSpeaker || 'A'];

  // Determine active states
  const isListening = state === 'listening_a' || state === 'listening_b';
  const isSpeaking = state === 'speaking_a' || state === 'speaking_b';
  const isProcessing = state === 'processing';
  const isError = state === 'error';
  const isIdle = state === 'idle';
  const isActive = isListening || isSpeaking;

  const renderContent = () => {
    // IDLE STATE
    if (isIdle) {
      return (
        <div className="relative flex items-center justify-center">
          <motion.div
            className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-lg"
            animate={{
              scale: [1, 1.03, 1],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <Mic className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
          </motion.div>
        </div>
      );
    }

    // ERROR STATE
    if (isError) {
      return (
        <div className="relative flex items-center justify-center">
          <motion.div
            className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shadow-lg"
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <AlertTriangle className="w-8 h-8 text-red-500 dark:text-red-400" />
          </motion.div>
        </div>
      );
    }

    // PROCESSING STATE
    if (isProcessing) {
      return (
        <div className="relative flex items-center justify-center">
          <motion.div
            className="w-20 h-20 rounded-full border-4 border-zinc-200 dark:border-zinc-700 border-t-brand-500 flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          <div className="absolute">
            <Loader2 className="w-8 h-8 text-brand-500 animate-pulse" />
          </div>
        </div>
      );
    }

    // LISTENING STATE - with integrated stop button
    if (isListening) {
      return (
        <div className="relative flex items-center justify-center">
          {/* Pulse rings */}
          <PulseRings isActive={true} color={pulseColorClass} />

          {/* Wave bars - left */}
          <WaveBars isActive={true} color={waveColorClass} position="left" />

          {/* Main button with stop icon */}
          <motion.button
            onClick={onStop}
            className={clsx(
              'relative flex items-center justify-center rounded-full w-20 h-20 shadow-lg',
              'transition-colors cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              bgColorClass,
              currentSpeaker === 'A'
                ? 'hover:bg-blue-600 focus:ring-blue-500'
                : 'hover:bg-emerald-600 focus:ring-emerald-500'
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Stop listening"
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.8, 1, 0.8],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              {showStopButton ? (
                <Square className="w-8 h-8 text-white fill-white" />
              ) : (
                <Mic className="w-8 h-8 text-white" />
              )}
            </motion.div>
          </motion.button>

          {/* Wave bars - right */}
          <WaveBars isActive={true} color={waveColorClass} position="right" />

          {/* Recording indicator */}
          <motion.div
            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 border-2 border-white dark:border-zinc-900"
            animate={{
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
            }}
          />
        </div>
      );
    }

    // SPEAKING STATE - with integrated stop button
    if (isSpeaking) {
      return (
        <div className="relative flex items-center justify-center">
          {/* Pulse rings (subtle for speaking) */}
          <PulseRings isActive={true} color={pulseColorClass} />

          {/* Wave bars - left */}
          <WaveBars isActive={true} color={waveColorClass} position="left" />

          {/* Main button with stop icon */}
          <motion.button
            onClick={onStop}
            className={clsx(
              'relative flex items-center justify-center rounded-full w-20 h-20 shadow-lg',
              'transition-colors cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              bgColorClass,
              currentSpeaker === 'A'
                ? 'hover:bg-blue-600 focus:ring-blue-500'
                : 'hover:bg-emerald-600 focus:ring-emerald-500'
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Stop speaking"
          >
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              {showStopButton ? (
                <Square className="w-8 h-8 text-white fill-white" />
              ) : (
                <Volume2 className="w-8 h-8 text-white" />
              )}
            </motion.div>
          </motion.button>

          {/* Wave bars - right */}
          <WaveBars isActive={true} color={waveColorClass} position="right" />
        </div>
      );
    }

    return null;
  };

  return (
    <div className={clsx('flex items-center justify-center h-32', className)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

export default VoiceWaveAnimation;
