// VoiceInterface - 2026 Premium Voice Control Component
// Features: Visual wave indicator, integrated Stop button, Light/Dark theme support
// Designed for Bilingual Mediator Voice Bot

import React, { memo, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { Square, Mic, Volume2, VolumeX, AlertCircle, Loader2 } from 'lucide-react';
import type { VoiceControlState } from '../hooks/useVoiceControl';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface VoiceInterfaceProps {
  /** Current voice control state */
  state: VoiceControlState;
  /** Current transcript (final) */
  transcript?: string;
  /** Interim/partial transcript */
  interimTranscript?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Whether TTS is muted */
  isMuted?: boolean;
  /** Silence countdown progress (0-100) */
  silenceProgress?: number;
  /** Whether in silence countdown */
  isSilenceCountdown?: boolean;
  /** Error message if any */
  error?: string | null;
  /** Callback when start listening is requested */
  onStartListening?: () => void;
  /** Callback when stop is requested (stops everything) */
  onStop?: () => void;
  /** Callback when mute is toggled */
  onToggleMute?: () => void;
  /** Callback to clear error */
  onClearError?: () => void;
  /** Optional additional className */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show status text */
  showStatus?: boolean;
  /** Show transcript */
  showTranscript?: boolean;
  /** Show mute button */
  showMuteButton?: boolean;
  /** Compact mode (only shows the main button) */
  compact?: boolean;
}

// ============================================================================
// STATUS MESSAGES
// ============================================================================

const STATUS_MESSAGES: Record<VoiceControlState, string> = {
  idle: 'Tap to speak',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
  error: 'Error occurred',
};

// ============================================================================
// SIZE CONFIGURATIONS
// ============================================================================

const SIZE_CONFIG = {
  sm: {
    container: 'w-20 h-20',
    innerCircle: 'w-14 h-14',
    icon: 'w-6 h-6',
    stopIcon: 'w-4 h-4',
    bars: { width: 'w-0.5', gap: 'gap-0.5' },
    pulseSize: [80, 120],
  },
  md: {
    container: 'w-28 h-28',
    innerCircle: 'w-20 h-20',
    icon: 'w-8 h-8',
    stopIcon: 'w-5 h-5',
    bars: { width: 'w-1', gap: 'gap-1' },
    pulseSize: [112, 168],
  },
  lg: {
    container: 'w-36 h-36',
    innerCircle: 'w-24 h-24',
    icon: 'w-10 h-10',
    stopIcon: 'w-6 h-6',
    bars: { width: 'w-1.5', gap: 'gap-1.5' },
    pulseSize: [144, 216],
  },
};

// ============================================================================
// WAVE BARS COMPONENT
// ============================================================================

interface WaveBarsProps {
  isActive: boolean;
  size: 'sm' | 'md' | 'lg';
  color: string;
}

const WaveBars = memo(function WaveBars({ isActive, size, color }: WaveBarsProps) {
  const config = SIZE_CONFIG[size];
  const bars = [0, 1, 2, 3, 4];

  return (
    <div className={clsx('flex items-center justify-center', config.bars.gap)}>
      {bars.map((i) => (
        <motion.div
          key={i}
          className={clsx(config.bars.width, 'rounded-full', color)}
          animate={isActive ? {
            height: [12, 28, 20, 32, 16, 24, 12],
          } : {
            height: 12,
          }}
          transition={isActive ? {
            duration: 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.1,
          } : {
            duration: 0.2,
          }}
          style={{ height: 12 }}
        />
      ))}
    </div>
  );
});

// ============================================================================
// PULSE RINGS COMPONENT (for listening state)
// ============================================================================

interface PulseRingsProps {
  isActive: boolean;
  size: 'sm' | 'md' | 'lg';
}

const PulseRings = memo(function PulseRings({ isActive, size }: PulseRingsProps) {
  const config = SIZE_CONFIG[size];
  const [minSize, maxSize] = config.pulseSize;

  if (!isActive) return null;

  return (
    <>
      {/* Outer pulse ring */}
      <motion.div
        className="absolute rounded-full bg-brand-500/20 dark:bg-brand-400/20"
        initial={{ width: minSize, height: minSize }}
        animate={{
          width: [minSize, maxSize, minSize],
          height: [minSize, maxSize, minSize],
          opacity: [0.3, 0, 0.3],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      {/* Inner pulse ring */}
      <motion.div
        className="absolute rounded-full bg-brand-500/30 dark:bg-brand-400/30"
        initial={{ width: minSize, height: minSize }}
        animate={{
          width: [minSize, maxSize * 0.85, minSize],
          height: [minSize, maxSize * 0.85, minSize],
          opacity: [0.4, 0, 0.4],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.4,
        }}
      />
    </>
  );
});

// ============================================================================
// SILENCE COUNTDOWN RING
// ============================================================================

interface SilenceRingProps {
  progress: number;
  size: 'sm' | 'md' | 'lg';
}

const SilenceRing = memo(function SilenceRing({ progress, size }: SilenceRingProps) {
  const config = SIZE_CONFIG[size];
  const radius = size === 'sm' ? 36 : size === 'md' ? 50 : 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      className="absolute -rotate-90"
      width={radius * 2 + 8}
      height={radius * 2 + 8}
      viewBox={`0 0 ${radius * 2 + 8} ${radius * 2 + 8}`}
    >
      {/* Background ring */}
      <circle
        cx={radius + 4}
        cy={radius + 4}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        className="text-zinc-200 dark:text-zinc-700"
      />
      {/* Progress ring */}
      <circle
        cx={radius + 4}
        cy={radius + 4}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className="text-amber-500 dark:text-amber-400 transition-all duration-100"
      />
    </svg>
  );
});

// ============================================================================
// MAIN VOICE INTERFACE COMPONENT
// ============================================================================

export const VoiceInterface = memo(function VoiceInterface({
  state,
  transcript = '',
  interimTranscript = '',
  confidence = 1,
  isMuted = false,
  silenceProgress = 0,
  isSilenceCountdown = false,
  error = null,
  onStartListening,
  onStop,
  onToggleMute,
  onClearError,
  className,
  size = 'md',
  showStatus = true,
  showTranscript = true,
  showMuteButton = true,
  compact = false,
}: VoiceInterfaceProps) {
  const config = SIZE_CONFIG[size];

  // Derived states
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isProcessing = state === 'processing';
  const isIdle = state === 'idle';
  const isError = state === 'error';
  const isActive = isListening || isSpeaking || isProcessing;

  // Handle main button click
  const handleMainClick = useCallback(() => {
    if (isActive) {
      // Stop everything when active
      onStop?.();
    } else if (isError) {
      // Clear error and potentially retry
      onClearError?.();
    } else {
      // Start listening when idle
      onStartListening?.();
    }
  }, [isActive, isError, onStop, onClearError, onStartListening]);

  // Get status message
  const statusMessage = useMemo(() => {
    if (error) return error;
    return STATUS_MESSAGES[state];
  }, [state, error]);

  // Get button colors based on state
  const buttonColors = useMemo(() => {
    if (isError) {
      return 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500';
    }
    if (isListening) {
      return 'bg-brand-500 hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400';
    }
    if (isSpeaking) {
      return 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400';
    }
    if (isProcessing) {
      return 'bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400';
    }
    return 'bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600';
  }, [isError, isListening, isSpeaking, isProcessing]);

  // Get icon color
  const iconColor = useMemo(() => {
    if (isIdle) return 'text-zinc-600 dark:text-zinc-300';
    return 'text-white';
  }, [isIdle]);

  // Display transcript
  const displayTranscript = interimTranscript || transcript;
  const isLowConfidence = confidence < 0.7;

  return (
    <div className={clsx('flex flex-col items-center', className)}>
      {/* Main Voice Button Container */}
      <div className={clsx('relative flex items-center justify-center', config.container)}>
        {/* Pulse rings (listening state) */}
        <PulseRings isActive={isListening} size={size} />

        {/* Silence countdown ring */}
        {isSilenceCountdown && (
          <SilenceRing progress={silenceProgress} size={size} />
        )}

        {/* Main Button with Stop functionality */}
        <motion.button
          onClick={handleMainClick}
          className={clsx(
            'relative flex items-center justify-center rounded-full shadow-lg',
            'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
            'focus:ring-brand-500 dark:focus:ring-offset-zinc-900',
            config.innerCircle,
            buttonColors
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={isActive ? 'Stop' : 'Start listening'}
        >
          <AnimatePresence mode="wait">
            {/* STOP BUTTON - Shown when active (listening, speaking, processing) */}
            {isActive && !isProcessing && (
              <motion.div
                key="stop"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                <Square className={clsx(config.stopIcon, 'text-white fill-white')} />
              </motion.div>
            )}

            {/* PROCESSING SPINNER */}
            {isProcessing && (
              <motion.div
                key="processing"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, rotate: 360 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  scale: { duration: 0.15 },
                  rotate: { duration: 1, repeat: Infinity, ease: 'linear' },
                }}
                className="flex items-center justify-center"
              >
                <Loader2 className={clsx(config.icon, 'text-white')} />
              </motion.div>
            )}

            {/* IDLE STATE - Microphone icon */}
            {isIdle && (
              <motion.div
                key="idle"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                <Mic className={clsx(config.icon, iconColor)} />
              </motion.div>
            )}

            {/* ERROR STATE - Alert icon */}
            {isError && (
              <motion.div
                key="error"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                <AlertCircle className={clsx(config.icon, 'text-white')} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Wave bars on sides (when speaking) */}
        {isSpeaking && !compact && (
          <>
            <div className="absolute left-0 -translate-x-full pr-2">
              <WaveBars isActive={true} size={size} color="bg-emerald-500 dark:bg-emerald-400" />
            </div>
            <div className="absolute right-0 translate-x-full pl-2">
              <WaveBars isActive={true} size={size} color="bg-emerald-500 dark:bg-emerald-400" />
            </div>
          </>
        )}

        {/* Wave bars on sides (when listening) */}
        {isListening && !compact && (
          <>
            <div className="absolute left-0 -translate-x-full pr-2">
              <WaveBars isActive={true} size={size} color="bg-brand-500 dark:bg-brand-400" />
            </div>
            <div className="absolute right-0 translate-x-full pl-2">
              <WaveBars isActive={true} size={size} color="bg-brand-500 dark:bg-brand-400" />
            </div>
          </>
        )}
      </div>

      {/* Status Text */}
      {showStatus && !compact && (
        <motion.p
          key={state}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={clsx(
            'mt-4 text-sm font-medium text-center',
            isError ? 'text-red-500 dark:text-red-400' :
            isListening ? 'text-brand-600 dark:text-brand-400' :
            isSpeaking ? 'text-emerald-600 dark:text-emerald-400' :
            isProcessing ? 'text-amber-600 dark:text-amber-400' :
            'text-zinc-500 dark:text-zinc-400'
          )}
        >
          {statusMessage}
        </motion.p>
      )}

      {/* Transcript Display */}
      {showTranscript && !compact && displayTranscript && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={clsx(
              'mt-3 px-4 py-2 rounded-xl max-w-sm text-center',
              isLowConfidence
                ? 'bg-amber-100 dark:bg-amber-900/30'
                : 'bg-zinc-100 dark:bg-zinc-800'
            )}
          >
            <p
              className={clsx(
                'text-sm',
                interimTranscript ? 'italic text-zinc-500 dark:text-zinc-400' :
                isLowConfidence ? 'text-amber-700 dark:text-amber-300' :
                'text-zinc-700 dark:text-zinc-300'
              )}
            >
              "{displayTranscript}"
            </p>
            {isLowConfidence && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Low confidence - please speak clearly
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Mute Button */}
      {showMuteButton && !compact && (
        <motion.button
          onClick={onToggleMute}
          className={clsx(
            'mt-4 p-2 rounded-lg transition-colors',
            'hover:bg-zinc-100 dark:hover:bg-zinc-800',
            isMuted ? 'text-red-500 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={isMuted ? 'Unmute bot voice' : 'Mute bot voice'}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </motion.button>
      )}

      {/* Help Text */}
      {!compact && (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 text-center max-w-xs">
          {isActive
            ? 'Click the stop button to end the session'
            : 'Click to start speaking. The bot will translate your speech.'}
        </p>
      )}
    </div>
  );
});

// ============================================================================
// COMPACT VOICE BUTTON (For use in headers/toolbars)
// ============================================================================

export interface CompactVoiceButtonProps {
  state: VoiceControlState;
  onStartListening?: () => void;
  onStop?: () => void;
  className?: string;
}

export const CompactVoiceButton = memo(function CompactVoiceButton({
  state,
  onStartListening,
  onStop,
  className,
}: CompactVoiceButtonProps) {
  const isActive = state === 'listening' || state === 'speaking' || state === 'processing';
  const isError = state === 'error';

  const handleClick = useCallback(() => {
    if (isActive) {
      onStop?.();
    } else {
      onStartListening?.();
    }
  }, [isActive, onStop, onStartListening]);

  return (
    <motion.button
      onClick={handleClick}
      className={clsx(
        'relative p-2 rounded-lg transition-colors',
        isActive ? 'bg-brand-500 text-white' :
        isError ? 'bg-red-500 text-white' :
        'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700',
        className
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={isActive ? 'Stop' : 'Start listening'}
    >
      <AnimatePresence mode="wait">
        {isActive ? (
          <motion.div
            key="stop"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Square className="w-5 h-5 fill-current" />
          </motion.div>
        ) : (
          <motion.div
            key="mic"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Mic className="w-5 h-5" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active indicator dot */}
      {isActive && (
        <motion.span
          className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
});

export default VoiceInterface;
