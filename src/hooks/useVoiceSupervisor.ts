// useVoiceSupervisor - React Hook for VoiceSupervisor
// Provides reactive state management around the singleton VoiceSupervisor
//
// Usage:
// const { start, stop, status, currentSpeaker, ... } = useVoiceSupervisor(config);
// <button onClick={start}>Start</button>  // MUST be user gesture

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  VoiceSupervisor,
  getVoiceSupervisor,
  destroyVoiceSupervisor,
  SupervisorStatus,
  Participant,
} from '../lib/VoiceSupervisor';
import type { LanguageCode } from '../types/translator';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceSupervisorConfig {
  languageA: {
    code: LanguageCode;
    name: string;
  };
  languageB: {
    code: LanguageCode;
    name: string;
  };
  autoListen?: boolean;
  continuousMode?: boolean;
  speechRate?: number;
}

export interface TranslationEntry {
  id: string;
  timestamp: number;
  speaker: Participant;
  original: string;
  translated: string;
}

export interface UseVoiceSupervisorReturn {
  // Status
  status: SupervisorStatus;
  currentSpeaker: Participant | null;
  isActive: boolean;
  isUnlocked: boolean;

  // Data
  partialTranscript: string;
  history: TranslationEntry[];
  lastTranslation: TranslationEntry | null;
  audioLevel: number;

  // Errors
  error: string | null;

  // Actions
  start: () => Promise<void>;
  stop: () => void;
  forceStop: () => void;
  clearError: () => void;
  clearHistory: () => void;

  // Browser support
  isSupported: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useVoiceSupervisor(config: VoiceSupervisorConfig): UseVoiceSupervisorReturn {
  // ========== STATE ==========
  const [status, setStatus] = useState<SupervisorStatus>('IDLE');
  const [currentSpeaker, setCurrentSpeaker] = useState<Participant | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [history, setHistory] = useState<TranslationEntry[]>([]);
  const [lastTranslation, setLastTranslation] = useState<TranslationEntry | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  // ========== REFS ==========
  const supervisorRef = useRef<VoiceSupervisor | null>(null);
  const idCounterRef = useRef(0);

  // ========== HYDRATION SAFETY ==========
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // ========== BROWSER SUPPORT ==========
  const isSupported = hasMounted && typeof window !== 'undefined' && !!(
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) &&
    window.speechSynthesis
  );

  // ========== INITIALIZE SUPERVISOR ==========
  useEffect(() => {
    if (!hasMounted || !isSupported) return;

    const supervisor = getVoiceSupervisor({
      languageA: config.languageA.code,
      languageB: config.languageB.code,
      autoListen: config.autoListen ?? true,
      continuousMode: config.continuousMode ?? true,
      speechRate: config.speechRate ?? 1,

      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      },

      onSpeakerChange: (speaker) => {
        setCurrentSpeaker(speaker);
      },

      onTranscript: (text, isFinal) => {
        if (isFinal) {
          setPartialTranscript('');
        } else {
          setPartialTranscript(text);
        }
      },

      onTranslation: (original, translated, speaker) => {
        const entry: TranslationEntry = {
          id: `trans-${Date.now()}-${++idCounterRef.current}`,
          timestamp: Date.now(),
          speaker,
          original,
          translated,
        };

        setHistory(prev => [...prev, entry]);
        setLastTranslation(entry);
        setPartialTranscript('');
      },

      onError: (errorMsg, recoverable) => {
        console.error('[useVoiceSupervisor] Error:', errorMsg);
        setError(errorMsg);

        // Auto-clear recoverable errors
        if (recoverable) {
          setTimeout(() => setError(null), 5000);
        }
      },

      onAudioLevel: (level) => {
        setAudioLevel(level);
      },
    });

    supervisorRef.current = supervisor;
    setIsUnlocked(supervisor.isUnlocked());

    return () => {
      // Don't destroy on unmount - singleton persists
      // Only destroy on explicit destroyVoiceSupervisor() call
    };
  }, [
    hasMounted,
    isSupported,
    config.languageA.code,
    config.languageB.code,
    config.autoListen,
    config.continuousMode,
    config.speechRate,
  ]);

  // ========== ACTIONS ==========

  /**
   * Start the voice conversation.
   * MUST be called from a user gesture (button click).
   */
  const start = useCallback(async () => {
    if (!supervisorRef.current) {
      setError('Voice system not initialized');
      return;
    }

    setError(null);

    const success = await supervisorRef.current.start('A');

    if (success) {
      setIsUnlocked(true);
    }
  }, []);

  /**
   * Stop the voice conversation gracefully.
   */
  const stop = useCallback(() => {
    if (supervisorRef.current) {
      supervisorRef.current.stop();
    }
    setPartialTranscript('');
  }, []);

  /**
   * Force stop speech immediately (<200ms).
   */
  const forceStop = useCallback(() => {
    if (supervisorRef.current) {
      supervisorRef.current.forceStopSpeech();
    }
  }, []);

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear translation history.
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setLastTranslation(null);
  }, []);

  // ========== CLEANUP ON UNMOUNT ==========
  useEffect(() => {
    return () => {
      // Stop but don't destroy - allows re-mount without re-init
      if (supervisorRef.current) {
        supervisorRef.current.stop();
      }
    };
  }, []);

  // ========== RETURN ==========
  return {
    // Status
    status,
    currentSpeaker,
    isActive: status !== 'IDLE',
    isUnlocked,

    // Data
    partialTranscript,
    history,
    lastTranslation,
    audioLevel,

    // Errors
    error,

    // Actions
    start,
    stop,
    forceStop,
    clearError,
    clearHistory,

    // Browser support
    isSupported,
  };
}

// ============================================================================
// CLEANUP HELPER
// ============================================================================

/**
 * Call this when you want to fully destroy the supervisor
 * (e.g., on logout or app cleanup)
 */
export function cleanupVoiceSupervisor(): void {
  destroyVoiceSupervisor();
}

export default useVoiceSupervisor;
