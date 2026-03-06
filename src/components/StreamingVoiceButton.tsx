// StreamingVoiceButton.tsx - Ultra-Low Latency Voice Button with Morphing UI
// Version 1.0.0
//
// UI Morphing States:
// - IDLE: Static waveform icon (gray)
// - LISTENING: Pulsing waveform with audio level (green)
// - THINKING: Morphing sparkle animation (orange/yellow)
// - SPEAKING: Sound waves emanating (blue)
// - ERROR: Warning icon with pulse (red)
//
// Key Features:
// - Instant state transitions
// - "Still thinking..." label after 3 seconds
// - Tap-to-interrupt when speaking
// - Long-press to end session

'use client';

import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStreamingVoiceBot, VoiceMode } from '../hooks/useStreamingVoiceBot';
import { VoiceModeIcon, VoiceIconMode } from './VoiceModeIcon';

// ============================================================================
// TYPES
// ============================================================================

interface StreamingVoiceButtonProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTranscript?: boolean;
  showStats?: boolean;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
}

// ============================================================================
// MODE MAPPING
// ============================================================================

const modeToIconMode: Record<VoiceMode, VoiceIconMode> = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ERROR: 'error',
};

const modeLabels: Record<VoiceMode, string> = {
  IDLE: 'Tap to start',
  LISTENING: 'Listening...',
  THINKING: 'Thinking...',
  SPEAKING: 'Speaking...',
  ERROR: 'Try again',
};

const modeColors: Record<VoiceMode, string> = {
  IDLE: 'text-gray-500',
  LISTENING: 'text-green-500',
  THINKING: 'text-amber-500',
  SPEAKING: 'text-blue-500',
  ERROR: 'text-red-500',
};

// ============================================================================
// SIZE CONFIG
// ============================================================================

const sizeConfig = {
  sm: { button: 'w-16 h-16', label: 'text-xs' },
  md: { button: 'w-20 h-20', label: 'text-sm' },
  lg: { button: 'w-24 h-24', label: 'text-base' },
  xl: { button: 'w-32 h-32', label: 'text-lg' },
};

// ============================================================================
// COMPONENT
// ============================================================================

export const StreamingVoiceButton: React.FC<StreamingVoiceButtonProps> = ({
  size = 'lg',
  className = '',
  showTranscript = true,
  showStats = false,
  onTranscript,
  onResponse,
}) => {
  const {
    mode,
    isSessionActive,
    isThinkingLong,
    transcript,
    currentSentence,
    fullResponse,
    queueLength,
    error,
    stats,
    startSession,
    commitAndSend,
    endSession,
    interruptSpeaking,
  } = useStreamingVoiceBot({
    onTranscript,
    onResponse,
  });

  const config = sizeConfig[size];

  // ========== CLICK HANDLER ==========
  const handleClick = useCallback(() => {
    switch (mode) {
      case 'IDLE':
        startSession();
        break;

      case 'LISTENING':
        // INSTANT: Commit and show sparkle immediately
        commitAndSend();
        break;

      case 'THINKING':
        // Do nothing while thinking
        break;

      case 'SPEAKING':
        // Interrupt and return to listening
        interruptSpeaking();
        break;

      case 'ERROR':
        // Retry - start new session
        startSession();
        break;
    }
  }, [mode, startSession, commitAndSend, interruptSpeaking]);

  // ========== LONG PRESS (End Session) ==========
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = useCallback(() => {
    if (!isSessionActive) return;

    longPressTimerRef.current = setTimeout(() => {
      endSession();
      longPressTimerRef.current = null;
    }, 800); // 800ms for long press
  }, [isSessionActive, endSession]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // ========== DYNAMIC LABEL ==========
  const getLabel = () => {
    if (mode === 'THINKING' && isThinkingLong) {
      return 'Still thinking...';
    }
    if (mode === 'SPEAKING' && queueLength > 0) {
      return `Speaking... (${queueLength + 1} left)`;
    }
    return modeLabels[mode];
  };

  // ========== ICON MODE ==========
  const iconMode = modeToIconMode[mode];

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* Main Button */}
      <motion.button
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`
          relative
          ${config.button}
          rounded-full
          bg-white dark:bg-gray-900
          shadow-xl
          border-2 border-gray-200 dark:border-gray-700
          flex items-center justify-center
          transition-all duration-200
          focus:outline-none focus:ring-4 focus:ring-offset-2
          ${mode === 'LISTENING' ? 'focus:ring-green-300' : ''}
          ${mode === 'THINKING' ? 'focus:ring-amber-300' : ''}
          ${mode === 'SPEAKING' ? 'focus:ring-blue-300' : ''}
          ${mode === 'ERROR' ? 'focus:ring-red-300' : ''}
          ${mode === 'THINKING' ? 'cursor-wait' : 'cursor-pointer'}
        `}
        whileHover={{ scale: mode === 'THINKING' ? 1 : 1.05 }}
        whileTap={{ scale: mode === 'THINKING' ? 1 : 0.95 }}
        disabled={mode === 'THINKING'}
        aria-label={getLabel()}
        aria-busy={mode === 'THINKING' || mode === 'SPEAKING'}
      >
        {/* The Morphing Icon */}
        <VoiceModeIcon
          mode={iconMode}
          size={size}
          showBackground={false}
        />

        {/* Pulsing ring when active */}
        {isSessionActive && (
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{
              borderColor:
                mode === 'LISTENING' ? '#22c55e' :
                mode === 'THINKING' ? '#f59e0b' :
                mode === 'SPEAKING' ? '#3b82f6' : '#71717a',
            }}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.6, 0.2, 0.6],
            }}
            transition={{
              duration: isThinkingLong ? 0.8 : 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Extra ring for "Still thinking..." effect */}
        <AnimatePresence>
          {isThinkingLong && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-orange-400"
              initial={{ scale: 1, opacity: 0 }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 0, 0.4],
              }}
              exit={{ scale: 1, opacity: 0 }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </AnimatePresence>
      </motion.button>

      {/* Status Label */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${mode}-${isThinkingLong}`}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
          className="text-center"
        >
          <span className={`${config.label} font-medium ${modeColors[mode]}`}>
            {getLabel()}
          </span>
        </motion.div>
      </AnimatePresence>

      {/* Transcript Display (when listening) */}
      {showTranscript && (
        <AnimatePresence>
          {mode === 'LISTENING' && transcript && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="max-w-xs text-center"
            >
              <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                "{transcript}"
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Current Sentence (when speaking) */}
      {showTranscript && (
        <AnimatePresence>
          {mode === 'SPEAKING' && currentSentence && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="max-w-xs text-center"
            >
              <p className="text-sm text-blue-600 dark:text-blue-400">
                "{currentSentence}"
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-xs text-center"
          >
            <p className="text-sm text-red-500">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint Text */}
      {isSessionActive && mode === 'LISTENING' && !transcript && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-gray-400"
        >
          Tap to send • Hold to end
        </motion.p>
      )}

      {/* Stats Display (optional) */}
      {showStats && isSessionActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-gray-400 text-center space-y-1"
        >
          <div>Turns: {stats.turnCount}</div>
          <div>Heartbeats: {stats.heartbeatCount}</div>
          {stats.avgLatency > 0 && (
            <div>Avg Latency: {stats.avgLatency}ms</div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default StreamingVoiceButton;
