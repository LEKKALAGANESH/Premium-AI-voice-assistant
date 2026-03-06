// VoiceBotButton.tsx - Ultra-Low Latency Voice Bot Control
// Single button with instant state transitions:
// - IDLE: Tap to start session
// - LISTENING: Tap to INSTANTLY commit (Sparkle appears immediately)
// - THINKING: Shows sparkle + "Still thinking..." after 3s
// - SPEAKING: Tap to interrupt and return to listening
// - ERROR: Shows error state

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoiceBot } from '../hooks/useVoiceBot';
import { StatusIcon, stateColors, stateLabels } from './StatusIcon';

// ============================================================================
// TYPES
// ============================================================================

interface VoiceBotButtonProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
}

// ============================================================================
// SIZE CONFIG
// ============================================================================

const sizeConfig = {
  sm: { button: 'w-12 h-12', icon: 20, ring: 'w-14 h-14' },
  md: { button: 'w-16 h-16', icon: 28, ring: 'w-20 h-20' },
  lg: { button: 'w-20 h-20', icon: 36, ring: 'w-24 h-24' },
};

// ============================================================================
// COMPONENT
// ============================================================================

export const VoiceBotButton: React.FC<VoiceBotButtonProps> = ({
  size = 'md',
  className = '',
  onTranscript,
  onResponse,
}) => {
  const {
    state,
    isSessionActive,
    isThinkingLong,
    transcript,
    currentSentence,
    error,
    startSession,
    commitAndSend,
    endSession,
    interruptSpeaking,
  } = useVoiceBot({
    onTranscript,
    onResponse,
  });

  const config = sizeConfig[size];

  // ========== BUTTON CLICK HANDLER ==========
  const handleClick = () => {
    switch (state) {
      case 'IDLE':
        startSession();
        break;

      case 'LISTENING':
        // INSTANT transition to THINKING
        commitAndSend();
        break;

      case 'THINKING':
        // Do nothing - waiting for AI
        break;

      case 'SPEAKING':
        interruptSpeaking();
        break;

      case 'ERROR':
        startSession();
        break;
    }
  };

  // ========== LONG PRESS TO END SESSION ==========
  const handleLongPress = () => {
    if (isSessionActive) {
      endSession();
    }
  };

  // ========== RING COLOR ==========
  const ringColor = {
    IDLE: 'border-gray-300',
    LISTENING: 'border-blue-400',
    THINKING: isThinkingLong ? 'border-orange-400' : 'border-purple-400',
    SPEAKING: 'border-green-400',
    ERROR: 'border-red-400',
  }[state];

  // ========== BUTTON BG COLOR ==========
  const bgColor = {
    IDLE: 'bg-white hover:bg-gray-50',
    LISTENING: 'bg-blue-50 hover:bg-blue-100',
    THINKING: isThinkingLong ? 'bg-orange-50' : 'bg-purple-50',
    SPEAKING: 'bg-green-50 hover:bg-green-100',
    ERROR: 'bg-red-50 hover:bg-red-100',
  }[state];

  // ========== DYNAMIC LABEL ==========
  const getLabel = () => {
    if (state === 'THINKING' && isThinkingLong) {
      return 'Still thinking...';
    }
    return stateLabels[state];
  };

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {/* Main Button with Ring */}
      <div className="relative flex items-center justify-center">
        {/* Pulsing Ring */}
        {isSessionActive && (
          <motion.div
            className={`absolute ${config.ring} rounded-full border-2 ${ringColor}`}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.6, 0.3, 0.6],
            }}
            transition={{
              duration: isThinkingLong ? 1 : 2, // Faster pulse when thinking long
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Secondary ring for "Still thinking..." effect */}
        <AnimatePresence>
          {isThinkingLong && (
            <motion.div
              className="absolute rounded-full border-2 border-orange-300"
              style={{ width: `${parseInt(config.ring.split('-')[1]) * 4 + 16}px`, height: `${parseInt(config.ring.split('-')[1]) * 4 + 16}px` }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 0.1, 0.4],
              }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </AnimatePresence>

        {/* Main Button */}
        <motion.button
          onClick={handleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            handleLongPress();
          }}
          className={`
            relative z-10
            ${config.button}
            rounded-full
            ${bgColor}
            ${isThinkingLong ? 'text-orange-500' : stateColors[state]}
            shadow-lg
            border border-gray-200
            flex items-center justify-center
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
            ${state === 'THINKING' ? 'cursor-wait' : 'cursor-pointer'}
          `}
          whileTap={{ scale: 0.95 }}
          disabled={state === 'THINKING'}
          aria-label={getLabel()}
        >
          <StatusIcon state={state} size={config.icon} />
        </motion.button>
      </div>

      {/* Status Label with animation */}
      <AnimatePresence mode="wait">
        <motion.span
          key={`${state}-${isThinkingLong}`}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className={`text-sm font-medium ${isThinkingLong ? 'text-orange-500' : stateColors[state]}`}
        >
          {getLabel()}
        </motion.span>
      </AnimatePresence>

      {/* Transcript Display (when listening) */}
      <AnimatePresence>
        {state === 'LISTENING' && transcript && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="max-w-xs text-center"
          >
            <p className="text-sm text-gray-600 italic">"{transcript}"</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current Sentence (when speaking) */}
      <AnimatePresence>
        {state === 'SPEAKING' && currentSentence && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="max-w-xs text-center"
          >
            <p className="text-sm text-green-600">"{currentSentence}"</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-xs text-center"
          >
            <p className="text-sm text-red-500">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint Text */}
      {isSessionActive && state === 'LISTENING' && !transcript && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-gray-400"
        >
          Tap to send • Hold to end
        </motion.p>
      )}
    </div>
  );
};

export default VoiceBotButton;
