// VoiceMediatorBot.tsx - FSM-Based Bilingual Voice Mediator UI
// Uses VoiceMediatorService singleton for bulletproof voice handling
//
// Architecture:
// 1. All voice operations happen in singleton (outside React lifecycle)
// 2. React only renders state - no voice cleanup in useEffect
// 3. User click initializes AudioContext (browser requirement)
// 4. FSM prevents invalid state transitions

'use client';

import React, { useState, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  Mic,
  MicOff,
  Volume2,
  Loader2,
  StopCircle,
  Play,
  Languages,
  AlertTriangle,
  RefreshCw,
  X,
  Sparkles,
} from 'lucide-react';
import { useVoiceMediatorBot, cleanupVoiceMediatorBot, type TranslationEntry } from '../hooks/useVoiceMediatorBot';
import type { MediatorState, Participant, LanguageConfig } from '../lib/VoiceMediatorService';

// ============================================================================
// PROPS
// ============================================================================

interface VoiceMediatorBotProps {
  languageA?: LanguageConfig;
  languageB?: LanguageConfig;
  className?: string;
}

// ============================================================================
// FSM STATE DISPLAY CONFIG
// ============================================================================

interface StateDisplayConfig {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  pulse: boolean;
}

const getStateConfig = (
  state: MediatorState,
  speaker: Participant | null,
  langA: string,
  langB: string
): StateDisplayConfig => {
  switch (state) {
    case 'UNINITIALIZED':
      return {
        label: 'Tap to Start',
        icon: <Play className="w-5 h-5" />,
        color: 'text-zinc-500',
        bgColor: 'bg-zinc-100 dark:bg-zinc-800',
        borderColor: 'border-zinc-300 dark:border-zinc-600',
        pulse: false,
      };

    case 'IDLE':
      return {
        label: 'Ready',
        icon: <MicOff className="w-5 h-5" />,
        color: 'text-zinc-600 dark:text-zinc-400',
        bgColor: 'bg-zinc-100 dark:bg-zinc-800',
        borderColor: 'border-zinc-300 dark:border-zinc-600',
        pulse: false,
      };

    case 'LISTENING_A':
      return {
        label: `Listening (${langA})`,
        icon: <Mic className="w-5 h-5" />,
        color: 'text-blue-700 dark:text-blue-300',
        bgColor: 'bg-blue-50 dark:bg-blue-900/30',
        borderColor: 'border-blue-400 dark:border-blue-600',
        pulse: true,
      };

    case 'LISTENING_B':
      return {
        label: `Listening (${langB})`,
        icon: <Mic className="w-5 h-5" />,
        color: 'text-emerald-700 dark:text-emerald-300',
        bgColor: 'bg-emerald-50 dark:bg-emerald-900/30',
        borderColor: 'border-emerald-400 dark:border-emerald-600',
        pulse: true,
      };

    case 'TRANSLATING':
      return {
        label: 'Translating...',
        icon: <Loader2 className="w-5 h-5 animate-spin" />,
        color: 'text-amber-700 dark:text-amber-300',
        bgColor: 'bg-amber-50 dark:bg-amber-900/30',
        borderColor: 'border-amber-400 dark:border-amber-600',
        pulse: false,
      };

    case 'SPEAKING_A':
      return {
        label: `Speaking (${langA})`,
        icon: <Volume2 className="w-5 h-5" />,
        color: 'text-blue-700 dark:text-blue-300',
        bgColor: 'bg-blue-50 dark:bg-blue-900/30',
        borderColor: 'border-blue-400 dark:border-blue-600',
        pulse: true,
      };

    case 'SPEAKING_B':
      return {
        label: `Speaking (${langB})`,
        icon: <Volume2 className="w-5 h-5" />,
        color: 'text-emerald-700 dark:text-emerald-300',
        bgColor: 'bg-emerald-50 dark:bg-emerald-900/30',
        borderColor: 'border-emerald-400 dark:border-emerald-600',
        pulse: true,
      };

    case 'ERROR':
      return {
        label: 'Error',
        icon: <AlertTriangle className="w-5 h-5" />,
        color: 'text-red-700 dark:text-red-300',
        bgColor: 'bg-red-50 dark:bg-red-900/30',
        borderColor: 'border-red-400 dark:border-red-600',
        pulse: false,
      };

    default:
      return {
        label: 'Unknown',
        icon: <MicOff className="w-5 h-5" />,
        color: 'text-zinc-500',
        bgColor: 'bg-zinc-100 dark:bg-zinc-800',
        borderColor: 'border-zinc-300 dark:border-zinc-600',
        pulse: false,
      };
  }
};

// ============================================================================
// AUDIO VISUALIZATION
// ============================================================================

const AudioWaveform = memo(function AudioWaveform({
  level,
  isActive,
  speaker,
}: {
  level: number;
  isActive: boolean;
  speaker: Participant | null;
}) {
  const bars = 7;
  const color = speaker === 'A' ? 'bg-blue-500' : speaker === 'B' ? 'bg-emerald-500' : 'bg-zinc-400';

  return (
    <div className="flex items-center justify-center gap-1 h-12">
      {Array.from({ length: bars }).map((_, i) => {
        const offset = Math.sin((i / bars) * Math.PI);
        const height = isActive
          ? Math.max(12, Math.min(48, level * 150 * offset + 12))
          : 12;

        return (
          <motion.div
            key={i}
            className={clsx('w-1.5 rounded-full', color)}
            animate={{ height }}
            transition={{ duration: 0.08, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
});

// ============================================================================
// STATUS BADGE
// ============================================================================

const StatusBadge = memo(function StatusBadge({
  config,
}: {
  config: StateDisplayConfig;
}) {
  return (
    <motion.div
      layout
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-full border-2 font-medium',
        config.bgColor,
        config.borderColor,
        config.color
      )}
    >
      {config.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {config.icon}
      <span className="text-sm">{config.label}</span>
    </motion.div>
  );
});

// ============================================================================
// TRANSLATION CARD
// ============================================================================

const TranslationCard = memo(function TranslationCard({
  entry,
  languageA,
  languageB,
}: {
  entry: TranslationEntry;
  languageA: string;
  languageB: string;
}) {
  const isA = entry.speaker === 'A';
  const sourceLang = isA ? languageA : languageB;
  const targetLang = isA ? languageB : languageA;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={clsx(
        'p-4 rounded-xl border-l-4',
        isA
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
          : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500'
      )}
    >
      {/* Speaker Badge */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={clsx(
            'text-xs font-bold px-2 py-1 rounded',
            isA
              ? 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
              : 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200'
          )}
        >
          {isA ? 'Person A' : 'Person B'} ({sourceLang})
        </span>
      </div>

      {/* Original Text */}
      <p className="text-zinc-800 dark:text-zinc-200 text-lg font-medium mb-3">
        "{entry.original}"
      </p>

      {/* Translation */}
      <div className="flex items-start gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-700">
        <Sparkles className="w-4 h-4 text-amber-500 mt-1 flex-shrink-0" />
        <div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
            {targetLang}
          </span>
          <p className="text-zinc-600 dark:text-zinc-300 italic">
            "{entry.translated}"
          </p>
        </div>
      </div>
    </motion.div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VoiceMediatorBot({
  languageA = { code: 'en-US', name: 'English' },
  languageB = { code: 'es-ES', name: 'Spanish' },
  className,
}: VoiceMediatorBotProps) {
  const [hasMounted, setHasMounted] = useState(false);

  // Connect to singleton service via hook
  const {
    state,
    currentSpeaker,
    isInitialized,
    isActive,
    partialTranscript,
    history,
    audioLevel,
    error,
    initialize,
    startListening,
    stop,
    clearError,
    clearHistory,
  } = useVoiceMediatorBot({
    languageA,
    languageB,
  });

  // Hydration safety
  React.useEffect(() => {
    setHasMounted(true);
    return () => {
      // Only cleanup on full app unmount
      // cleanupVoiceMediatorBot(); // Uncomment if needed
    };
  }, []);

  // Get display config for current state
  const stateConfig = useMemo(
    () => getStateConfig(state, currentSpeaker, languageA.name, languageB.name),
    [state, currentSpeaker, languageA.name, languageB.name]
  );

  // ========== HANDLERS ==========

  // Main button click - initializes on first click, then toggles
  const handleMainButtonClick = useCallback(async () => {
    if (!isInitialized) {
      // First click: Initialize audio (user gesture required)
      const success = await initialize();
      if (success) {
        // Immediately start listening to Person A
        startListening('A');
      }
    } else if (isActive) {
      // Stop the session
      stop();
    } else {
      // Resume listening (start with Person A)
      startListening('A');
    }
  }, [isInitialized, isActive, initialize, startListening, stop]);

  // Switch to other speaker
  const handleSwitchSpeaker = useCallback(() => {
    const nextSpeaker: Participant = currentSpeaker === 'A' ? 'B' : 'A';
    stop();
    setTimeout(() => startListening(nextSpeaker), 100);
  }, [currentSpeaker, stop, startListening]);

  // ========== RENDER ==========

  if (!hasMounted) {
    return (
      <div className={clsx('p-8 flex items-center justify-center', className)}>
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col gap-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
            <Languages className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">
              Voice Mediator
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Real-time bilingual translation
            </p>
          </div>
        </div>

        <StatusBadge config={stateConfig} />
      </div>

      {/* Language Pair Display */}
      <div className="flex items-center justify-center gap-6 py-6 bg-gradient-to-r from-blue-50 via-white to-emerald-50 dark:from-blue-900/20 dark:via-zinc-900 dark:to-emerald-900/20 rounded-2xl border border-zinc-200 dark:border-zinc-700">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <span className="text-xl font-bold text-blue-600 dark:text-blue-400">A</span>
          </div>
          <div className="text-lg font-semibold text-blue-700 dark:text-blue-300">
            {languageA.name}
          </div>
          <div className="text-xs text-zinc-500">{languageA.code}</div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="text-2xl text-zinc-400">⟷</div>
          <span className="text-xs text-zinc-400">Translating</span>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">B</span>
          </div>
          <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
            {languageB.name}
          </div>
          <div className="text-xs text-zinc-500">{languageB.code}</div>
        </div>
      </div>

      {/* Audio Visualization */}
      <div className="flex justify-center py-4">
        <AudioWaveform
          level={audioLevel}
          isActive={state === 'LISTENING_A' || state === 'LISTENING_B'}
          speaker={currentSpeaker}
        />
      </div>

      {/* Partial Transcript */}
      <AnimatePresence mode="wait">
        {partialTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center px-6 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl"
          >
            <span className="text-zinc-600 dark:text-zinc-400 italic">
              "{partialTranscript}"
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"
          >
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-red-700 dark:text-red-300 flex-1 text-sm">{error}</span>
            <button
              onClick={clearError}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-800/50 rounded-lg transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4 text-red-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Main Button */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleMainButtonClick}
          className={clsx(
            'flex items-center gap-3 px-8 py-4 rounded-2xl text-white font-bold text-lg shadow-xl transition-all',
            isActive
              ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
              : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700'
          )}
        >
          {isActive ? (
            <>
              <StopCircle className="w-6 h-6" />
              Stop
            </>
          ) : !isInitialized ? (
            <>
              <Play className="w-6 h-6" />
              Start Session
            </>
          ) : (
            <>
              <Mic className="w-6 h-6" />
              Resume
            </>
          )}
        </motion.button>

        {/* Switch Speaker Button (visible when listening) */}
        <AnimatePresence>
          {(state === 'LISTENING_A' || state === 'LISTENING_B') && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSwitchSpeaker}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-colors',
                currentSpeaker === 'A'
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300'
              )}
            >
              <RefreshCw className="w-4 h-4" />
              Switch to {currentSpeaker === 'A' ? 'B' : 'A'}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Clear History Button */}
        {history.length > 0 && !isActive && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Instructions */}
      {!isInitialized && (
        <p className="text-center text-zinc-500 dark:text-zinc-400 text-sm px-4">
          Click <strong>Start Session</strong> to begin.{' '}
          Person A speaks in {languageA.name}, Person B speaks in {languageB.name}.
          <br />
          The bot will translate and speak each message to the other person.
        </p>
      )}

      {/* Current Turn Indicator */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={clsx(
              'text-center py-3 px-6 rounded-xl font-medium',
              currentSpeaker === 'A'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
            )}
          >
            {state === 'TRANSLATING' ? (
              'Processing translation...'
            ) : state === 'SPEAKING_A' || state === 'SPEAKING_B' ? (
              `Speaking to Person ${currentSpeaker === 'A' ? 'B' : 'A'}...`
            ) : (
              `Person ${currentSpeaker} - Your turn to speak!`
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Translation History */}
      {history.length > 0 && (
        <div className="flex flex-col gap-4 mt-2">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Conversation
          </h2>
          <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-2">
            {history.map((entry) => (
              <TranslationCard
                key={entry.id}
                entry={entry}
                languageA={languageA.name}
                languageB={languageB.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* Screen Reader Status */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {state === 'LISTENING_A' && `Listening for ${languageA.name} speech from Person A`}
        {state === 'LISTENING_B' && `Listening for ${languageB.name} speech from Person B`}
        {state === 'TRANSLATING' && 'Translating your speech'}
        {state === 'SPEAKING_A' && `Speaking translation in ${languageA.name}`}
        {state === 'SPEAKING_B' && `Speaking translation in ${languageB.name}`}
        {error && `Error: ${error}`}
      </div>
    </div>
  );
}

export default VoiceMediatorBot;
