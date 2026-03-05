// VoiceTranslatorV2 - Production Voice Translator using VoiceSupervisor
// Implements Google-grade State Machine with:
// - Audio Unlocker (User-Gesture priming)
// - Zombie Listener Fix
// - 5-second Heartbeat
// - Speech Queue with cancel-before-speak

'use client';

import React, { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  Mic,
  MicOff,
  Volume2,
  Loader2,
  StopCircle,
  RefreshCw,
  Languages,
  AlertTriangle,
} from 'lucide-react';
import { useVoiceSupervisor, cleanupVoiceSupervisor } from '../hooks/useVoiceSupervisor';
import type { LanguageCode } from '../types/translator';

// ============================================================================
// TYPES
// ============================================================================

interface LanguageConfig {
  code: LanguageCode;
  name: string;
}

interface VoiceTranslatorV2Props {
  languageA?: LanguageConfig;
  languageB?: LanguageConfig;
  className?: string;
}

// ============================================================================
// WAVE VISUALIZATION
// ============================================================================

const AudioWave = memo(function AudioWave({
  level,
  isActive,
  color,
}: {
  level: number;
  isActive: boolean;
  color: string;
}) {
  const bars = 5;

  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {Array.from({ length: bars }).map((_, i) => {
        const delay = i * 0.1;
        const height = isActive
          ? Math.max(8, Math.min(32, level * 100 + Math.sin(Date.now() / 200 + i) * 8))
          : 8;

        return (
          <motion.div
            key={i}
            className={clsx('w-1 rounded-full', color)}
            animate={{ height }}
            transition={{
              duration: 0.1,
              delay,
              ease: 'easeOut',
            }}
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
  status,
  speaker,
  languageA,
  languageB,
}: {
  status: string;
  speaker: 'A' | 'B' | null;
  languageA: string;
  languageB: string;
}) {
  const getStatusConfig = () => {
    switch (status) {
      case 'LISTENING':
        return {
          label: `Listening (${speaker === 'A' ? languageA : languageB})`,
          icon: <Mic className="w-4 h-4" />,
          color: 'bg-green-500',
          pulse: true,
        };
      case 'THINKING':
        return {
          label: 'Translating...',
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          color: 'bg-yellow-500',
          pulse: false,
        };
      case 'SPEAKING':
        return {
          label: `Speaking (${speaker === 'A' ? languageB : languageA})`,
          icon: <Volume2 className="w-4 h-4" />,
          color: 'bg-blue-500',
          pulse: true,
        };
      default:
        return {
          label: 'Ready',
          icon: <MicOff className="w-4 h-4" />,
          color: 'bg-zinc-500',
          pulse: false,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <motion.div
      layout
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium',
        config.color
      )}
    >
      {config.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
        </span>
      )}
      {config.icon}
      <span>{config.label}</span>
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
  entry: { speaker: 'A' | 'B'; original: string; translated: string };
  languageA: string;
  languageB: string;
}) {
  const isA = entry.speaker === 'A';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'p-4 rounded-xl',
        isA
          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
          : 'bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={clsx(
            'text-xs font-semibold px-2 py-0.5 rounded',
            isA ? 'bg-blue-200 text-blue-800' : 'bg-emerald-200 text-emerald-800'
          )}
        >
          {isA ? languageA : languageB}
        </span>
      </div>
      <p className="text-zinc-800 dark:text-zinc-200 mb-2">{entry.original}</p>
      <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm italic">
          {entry.translated}
        </p>
      </div>
    </motion.div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VoiceTranslatorV2({
  languageA = { code: 'en-US', name: 'English' },
  languageB = { code: 'es-ES', name: 'Spanish' },
  className,
}: VoiceTranslatorV2Props) {
  const [hasMounted, setHasMounted] = useState(false);

  // Hydration safety
  React.useEffect(() => {
    setHasMounted(true);
    return () => {
      // Cleanup on unmount
      cleanupVoiceSupervisor();
    };
  }, []);

  const {
    status,
    currentSpeaker,
    isActive,
    isUnlocked,
    partialTranscript,
    history,
    audioLevel,
    error,
    start,
    stop,
    forceStop,
    clearError,
    clearHistory,
    isSupported,
  } = useVoiceSupervisor({
    languageA,
    languageB,
    autoListen: true,
    continuousMode: true,
    speechRate: 1,
  });

  // ========== HANDLERS ==========

  const handleStartStop = useCallback(async () => {
    if (isActive) {
      stop();
    } else {
      await start();
    }
  }, [isActive, start, stop]);

  const handleForceStop = useCallback(() => {
    forceStop();
  }, [forceStop]);

  // ========== RENDER ==========

  if (!hasMounted) {
    return (
      <div className={clsx('p-8 text-center', className)}>
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-zinc-400" />
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className={clsx('p-8 text-center', className)}>
        <AlertTriangle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
          Browser Not Supported
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Please use Chrome, Edge, or Safari for voice translation.
        </p>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col gap-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Languages className="w-6 h-6 text-indigo-500" />
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">
            Voice Translator
          </h1>
        </div>

        <StatusBadge
          status={status}
          speaker={currentSpeaker}
          languageA={languageA.name}
          languageB={languageB.name}
        />
      </div>

      {/* Language Pair Display */}
      <div className="flex items-center justify-center gap-4 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
        <div className="text-center">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Person A</div>
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {languageA.name}
          </div>
        </div>
        <div className="text-2xl text-zinc-400">⟷</div>
        <div className="text-center">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Person B</div>
          <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {languageB.name}
          </div>
        </div>
      </div>

      {/* Audio Visualization */}
      <div className="flex justify-center py-4">
        <AudioWave
          level={audioLevel}
          isActive={status === 'LISTENING'}
          color={
            currentSpeaker === 'A'
              ? 'bg-blue-500'
              : currentSpeaker === 'B'
              ? 'bg-emerald-500'
              : 'bg-zinc-400'
          }
        />
      </div>

      {/* Partial Transcript */}
      <AnimatePresence>
        {partialTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center text-zinc-500 dark:text-zinc-400 italic"
          >
            "{partialTranscript}"
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
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-red-700 dark:text-red-300 flex-1">{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 text-sm underline"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Main Start/Stop Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleStartStop}
          className={clsx(
            'flex items-center gap-3 px-8 py-4 rounded-full text-white font-semibold text-lg shadow-lg transition-colors',
            isActive
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-indigo-500 hover:bg-indigo-600'
          )}
        >
          {isActive ? (
            <>
              <StopCircle className="w-6 h-6" />
              Stop
            </>
          ) : (
            <>
              <Mic className="w-6 h-6" />
              Start
            </>
          )}
        </motion.button>

        {/* Force Stop (visible when speaking) */}
        <AnimatePresence>
          {status === 'SPEAKING' && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleForceStop}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-medium"
            >
              <StopCircle className="w-4 h-4" />
              Skip
            </motion.button>
          )}
        </AnimatePresence>

        {/* Clear History */}
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300"
          >
            <RefreshCw className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Instructions */}
      {!isActive && !isUnlocked && (
        <p className="text-center text-zinc-500 dark:text-zinc-400 text-sm">
          Click <strong>Start</strong> to begin voice translation.
          <br />
          Speak in {languageA.name} or {languageB.name} and hear the translation.
        </p>
      )}

      {/* Translation History */}
      {history.length > 0 && (
        <div className="flex flex-col gap-4 mt-4">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            Conversation
          </h2>
          <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
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

      {/* Screen Reader Announcer */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {status === 'LISTENING' && `Listening for ${currentSpeaker === 'A' ? languageA.name : languageB.name} speech`}
        {status === 'THINKING' && 'Translating your speech'}
        {status === 'SPEAKING' && 'Speaking translation'}
      </div>
    </div>
  );
}

export default VoiceTranslatorV2;
