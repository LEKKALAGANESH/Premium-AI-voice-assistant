// useVoiceMediatorBot.ts - React Hook for VoiceMediatorService Singleton
// Thin wrapper that syncs singleton state with React
// Service lifecycle exists OUTSIDE React to prevent cleanup loops

import { useState, useEffect, useRef, useCallback } from 'react';
import voiceMediatorService, {
  destroyVoiceMediatorService,
  type MediatorState,
  type Participant,
  type LanguageConfig,
} from '../lib/VoiceMediatorService';

// ============================================================================
// TYPES
// ============================================================================

export interface TranslationEntry {
  id: string;
  speaker: Participant;
  original: string;
  translated: string;
  timestamp: number;
}

export interface VoiceMediatorBotConfig {
  languageA: LanguageConfig;
  languageB: LanguageConfig;
}

export interface VoiceMediatorBotReturn {
  // FSM State
  state: MediatorState;
  currentSpeaker: Participant | null;

  // UI State
  isInitialized: boolean;
  isActive: boolean;
  partialTranscript: string;
  history: TranslationEntry[];
  audioLevel: number;
  error: string | null;

  // Actions
  initialize: () => Promise<boolean>;
  startListening: (speaker: Participant) => void;
  stop: () => void;
  clearError: () => void;
  clearHistory: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useVoiceMediatorBot(config: VoiceMediatorBotConfig): VoiceMediatorBotReturn {
  // React state (synced from singleton service)
  const [state, setState] = useState<MediatorState>('UNINITIALIZED');
  const [currentSpeaker, setCurrentSpeaker] = useState<Participant | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [history, setHistory] = useState<TranslationEntry[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs for lifecycle management
  const isMountedRef = useRef(true);
  const configuredRef = useRef(false);

  // ========== CONFIGURE SERVICE ON MOUNT ==========

  useEffect(() => {
    isMountedRef.current = true;

    // Only configure once per mount
    if (!configuredRef.current) {
      voiceMediatorService.configure({
        languageA: config.languageA,
        languageB: config.languageB,

        // State change callback - sync to React
        onStateChange: (newState, speaker) => {
          if (!isMountedRef.current) return;
          setState(newState);
          setCurrentSpeaker(speaker);
        },

        // Transcript callback (interim results)
        onTranscript: (text, isFinal) => {
          if (!isMountedRef.current) return;
          if (!isFinal) {
            setPartialTranscript(text);
          } else {
            setPartialTranscript('');
          }
        },

        // Translation callback - add to history
        onTranslation: (original, translated, speaker) => {
          if (!isMountedRef.current) return;
          setPartialTranscript('');

          const entry: TranslationEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            speaker,
            original,
            translated,
            timestamp: Date.now(),
          };

          setHistory((prev) => [...prev, entry]);
        },

        // Error callback
        onError: (errorMsg) => {
          if (!isMountedRef.current) return;
          setError(errorMsg);
        },

        // Audio level callback
        onAudioLevel: (level) => {
          if (!isMountedRef.current) return;
          setAudioLevel(level);
        },
      });

      configuredRef.current = true;
      console.log('[useVoiceMediatorBot] Service configured');
    }

    // Sync initial state from service
    setState(voiceMediatorService.getState());
    setCurrentSpeaker(voiceMediatorService.getCurrentSpeaker());
    setIsInitialized(voiceMediatorService.isInitialized());

    // Cleanup on unmount - BUT don't destroy the singleton!
    // The service persists across mounts to prevent audio bugs
    return () => {
      isMountedRef.current = false;
      console.log('[useVoiceMediatorBot] Hook unmounted (service persists)');
    };
  }, [config.languageA, config.languageB]);

  // ========== ACTIONS ==========

  const initialize = useCallback(async (): Promise<boolean> => {
    console.log('[useVoiceMediatorBot] Initializing...');
    const success = await voiceMediatorService.initialize();

    if (isMountedRef.current) {
      setIsInitialized(success);
      setState(voiceMediatorService.getState());
    }

    return success;
  }, []);

  const startListening = useCallback((speaker: Participant) => {
    console.log('[useVoiceMediatorBot] Start listening:', speaker);
    voiceMediatorService.startListening(speaker);
  }, []);

  const stop = useCallback(() => {
    console.log('[useVoiceMediatorBot] Stop');
    voiceMediatorService.stop();
    setPartialTranscript('');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  // ========== DERIVED STATE ==========

  const isActive = state !== 'UNINITIALIZED' && state !== 'IDLE' && state !== 'ERROR';

  // ========== RETURN ==========

  return {
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
  };
}

// ============================================================================
// CLEANUP FUNCTION (call on app unmount only)
// ============================================================================

export function cleanupVoiceMediatorBot(): void {
  destroyVoiceMediatorService();
}

export default useVoiceMediatorBot;
