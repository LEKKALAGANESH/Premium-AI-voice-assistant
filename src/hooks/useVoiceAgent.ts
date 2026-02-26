// 2026 Pro-Active Voice UX: Voice Agent with State Machine Pattern
// Implements: Formal state transitions, sync engine integration, Smart-Silence capture

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { VoiceState, AppSettings, FailedMessage, InputMode } from '../types';
import { voiceService, SpeechResult } from '../services/voice';
import { useVoiceCapture, CaptureResult, CaptureState } from './useVoiceCapture';

// === STATE MACHINE DEFINITION ===
type StateAction =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'START_PROCESSING' }
  | { type: 'START_SPEAKING' }
  | { type: 'FINISH_SPEAKING' }
  | { type: 'INTERRUPT' }
  | { type: 'ERROR'; payload: string }
  | { type: 'RESET' };

// Valid state transitions
const STATE_TRANSITIONS: Record<VoiceState, StateAction['type'][]> = {
  idle: ['START_LISTENING', 'START_SPEAKING', 'ERROR'],
  listening: ['STOP_LISTENING', 'START_PROCESSING', 'INTERRUPT', 'ERROR', 'RESET'],
  processing: ['START_SPEAKING', 'ERROR', 'RESET'],
  speaking: ['FINISH_SPEAKING', 'INTERRUPT', 'START_LISTENING', 'ERROR'],
  error: ['RESET', 'START_LISTENING'],
};

// State machine reducer
function voiceStateMachine(state: VoiceState, action: StateAction): VoiceState {
  const validTransitions = STATE_TRANSITIONS[state];

  // Guard: Check if transition is valid
  if (!validTransitions.includes(action.type)) {
    console.warn(`[VoiceStateMachine] Invalid transition: ${state} -> ${action.type}`);
    return state;
  }

  switch (action.type) {
    case 'START_LISTENING':
      return 'listening';
    case 'STOP_LISTENING':
      return 'processing';
    case 'START_PROCESSING':
      return 'processing';
    case 'START_SPEAKING':
      return 'speaking';
    case 'FINISH_SPEAKING':
      return 'idle';
    case 'INTERRUPT':
      return 'idle';
    case 'ERROR':
      return 'error';
    case 'RESET':
      return 'idle';
    default:
      return state;
  }
}

// === INTERFACES ===
interface VoiceAgentProps {
  settings: AppSettings;
  onTranscript: (text: string, isFinal: boolean, confidence: number) => void;
  onResponseStart: () => void;
  onResponseComplete: (text: string) => void;
  onSyncWordChange?: (index: number, word: string) => void;
}

interface VoiceAgentReturn {
  state: VoiceState;
  inputMode: InputMode;
  error: string | null;
  partialTranscript: string;
  vadProgress: number;
  currentSpokenWordIndex: number;
  transcriptConfidence: number;
  failedMessage: FailedMessage | null;
  wordsBuffer: string[];
  isLowConfidence: boolean;
  isSpeaking: boolean;
  // 2026: Smart-Silence capture props
  silenceProgress: number;
  isSilenceCountdown: boolean;
  captureState: CaptureState;
  fullTranscript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  interrupt: () => void;
  setError: (err: string | null) => void;
  setInputMode: (mode: InputMode) => void;
  retryFailed: () => void;
  clearFailedMessage: () => void;
  dispatch: (action: StateAction) => void;
}

// === HOOK ===
export const useVoiceAgent = ({
  settings,
  onTranscript,
  onResponseStart,
  onResponseComplete,
  onSyncWordChange,
}: VoiceAgentProps): VoiceAgentReturn => {
  // === STATE MACHINE STATE ===
  const [state, setStateRaw] = useState<VoiceState>('idle');
  const [inputMode, setInputMode] = useState<InputMode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [vadProgress, setVadProgress] = useState(0);
  const [currentSpokenWordIndex, setCurrentSpokenWordIndex] = useState(-1);

  // 2026: Enhanced state
  const [transcriptConfidence, setTranscriptConfidence] = useState(1);
  const [failedMessage, setFailedMessage] = useState<FailedMessage | null>(null);
  const [wordsBuffer, setWordsBuffer] = useState<string[]>([]);

  // === 2026: SMART-SILENCE VOICE CAPTURE ===
  const voiceCapture = useVoiceCapture({
    onInterimUpdate: (text) => {
      setPartialTranscript(text);
      onTranscript(text, false, voiceCapture.confidence);
    },
    onFinalSubmit: (result: CaptureResult) => {
      setTranscriptConfidence(result.confidence);
      transcriptRef.current = result.transcript;
      onTranscript(result.transcript, true, result.confidence);
      onResponseComplete(result.transcript);
    },
    onError: (err) => {
      dispatch({ type: 'ERROR', payload: err });
    },
    onStateChange: (captureState) => {
      // Sync capture state to voice state
      if (captureState === 'IDLE' && stateRef.current === 'listening') {
        dispatch({ type: 'RESET' });
      } else if (captureState === 'LISTENING' || captureState === 'CAPTURING' || captureState === 'STABLE_SILENCE') {
        if (stateRef.current === 'idle' || stateRef.current === 'error') {
          dispatch({ type: 'START_LISTENING' });
        }
      } else if (captureState === 'SUBMITTING') {
        dispatch({ type: 'START_PROCESSING' });
      }
    },
  });

  // === REFS (avoid stale closures) ===
  const stateRef = useRef<VoiceState>('idle');
  const transcriptRef = useRef('');
  const vadIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const speakingRef = useRef(false);
  const interruptedRef = useRef(false);
  const failedMessageRef = useRef<FailedMessage | null>(null);
  const settingsRef = useRef(settings);
  const onSyncWordChangeRef = useRef(onSyncWordChange);

  // === STATE MACHINE DISPATCH ===
  const dispatch = useCallback((action: StateAction) => {
    setStateRaw(prev => {
      const nextState = voiceStateMachine(prev, action);
      stateRef.current = nextState;
      return nextState;
    });

    // Handle side effects based on action type
    if (action.type === 'ERROR' && 'payload' in action) {
      setError(action.payload);
    }
    if (action.type === 'RESET') {
      setError(null);
      setInputMode('idle');
    }
  }, []);

  // Keep refs in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    failedMessageRef.current = failedMessage;
  }, [failedMessage]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    onSyncWordChangeRef.current = onSyncWordChange;
  }, [onSyncWordChange]);

  // === DERIVED STATE ===
  const LOW_CONFIDENCE_THRESHOLD = 0.7;
  const isLowConfidence = transcriptConfidence < LOW_CONFIDENCE_THRESHOLD;
  const isSpeaking = useMemo(() => state === 'speaking', [state]);

  // === CLEANUP ===
  const cleanup = useCallback(() => {
    voiceService.cleanup();
    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    setInputMode('idle');
    setVadProgress(0);
    setPartialTranscript('');
    setCurrentSpokenWordIndex(-1);
    setWordsBuffer([]);
    speakingRef.current = false;
    interruptedRef.current = false;
    transcriptRef.current = '';
  }, []);

  // === INTERRUPT (Barge-in) ===
  const interrupt = useCallback(() => {
    interruptedRef.current = true;
    voiceService.stopSpeaking();
    cleanup();
    dispatch({ type: 'INTERRUPT' });
  }, [cleanup, dispatch]);

  // === VOICE SERVICE CALLBACKS ===
  const onResultCallback = useCallback((result: SpeechResult) => {
    transcriptRef.current = result.transcript;
    setPartialTranscript(result.transcript);
    setTranscriptConfidence(result.confidence);
    onTranscript(result.transcript, result.isFinal, result.confidence);
    startTimeRef.current = Date.now();
    setVadProgress(0);
  }, [onTranscript]);

  const onEndCallback = useCallback(() => {
    // Recognition ended naturally
  }, []);

  const onErrorCallback = useCallback((err: Error) => {
    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    const errorMessages: Record<string, string> = {
      SPEECH_RECOGNITION_NOT_SUPPORTED: 'Voice input not supported in this browser',
      MIC_PERMISSION_DENIED: 'Microphone access denied',
      NETWORK_ERROR: 'Network error - check your connection',
    };

    dispatch({ type: 'ERROR', payload: errorMessages[err.message] || err.message });
    setInputMode('idle');
  }, [dispatch]);

  const onSilenceCallback = useCallback(() => {
    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    if (transcriptRef.current.trim()) {
      dispatch({ type: 'START_PROCESSING' });
      setInputMode('idle');
      voiceService.stopListening();
      const confidence = voiceService.getLastConfidence();
      onTranscript(transcriptRef.current, true, confidence);
      onResponseComplete(transcriptRef.current);
    } else {
      cleanup();
      dispatch({ type: 'RESET' });
    }
  }, [onTranscript, onResponseComplete, cleanup, dispatch]);

  // === START LISTENING (Using Smart-Silence Capture) ===
  const startListening = useCallback(() => {
    const currentState = stateRef.current;

    // Barge-in: interrupt if speaking
    if (currentState === 'speaking') {
      voiceService.stopSpeaking();
      speakingRef.current = false;
      interruptedRef.current = true;
      dispatch({ type: 'INTERRUPT' });
    }

    // Only start from valid states
    if (currentState !== 'idle' && currentState !== 'error') return;

    setError(null);
    transcriptRef.current = '';
    setPartialTranscript('');
    setVadProgress(0);
    setTranscriptConfidence(1);
    startTimeRef.current = Date.now();
    setInputMode('voice');

    // 2026: Use Smart-Silence capture engine
    voiceCapture.startCapture();

    dispatch({ type: 'START_LISTENING' });
  }, [dispatch, voiceCapture]);

  // === STOP LISTENING (Manual stop with Smart-Silence) ===
  const stopListening = useCallback(() => {
    if (stateRef.current !== 'listening') return;

    // 2026: Stop capture (will submit if valid transcript exists)
    voiceCapture.stopCapture();

    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    setInputMode('idle');
  }, [voiceCapture]);

  // === SPEAK (with sync engine integration) ===
  const speak = useCallback(
    async (text: string) => {
      // Guard: Can only speak from idle or processing
      if (stateRef.current !== 'idle' && stateRef.current !== 'processing') {
        console.warn('[VoiceAgent] Cannot speak from state:', stateRef.current);
        return;
      }

      dispatch({ type: 'START_SPEAKING' });
      setCurrentSpokenWordIndex(0);
      speakingRef.current = true;
      interruptedRef.current = false;

      try {
        // Setup word buffer for sync
        const words = text.split(/\s+/).filter(w => w.length > 0);
        setWordsBuffer(words);

        const currentSettings = settingsRef.current;

        // Start TTS
        const speakPromise = voiceService.speak(
          text,
          currentSettings.voiceName,
          currentSettings.whisperMode
        );

        // Word sync loop - estimate word duration from speech rate
        const baseDuration = 350; // ms per word at normal speed
        const wordDuration = baseDuration / (currentSettings.speechRate || 1);

        // Sync word highlighting with estimated TTS timing
        for (let i = 0; i < words.length; i++) {
          if (interruptedRef.current || !speakingRef.current) break;

          setCurrentSpokenWordIndex(i);
          onSyncWordChangeRef.current?.(i, words[i]);

          await new Promise(resolve => setTimeout(resolve, wordDuration));
        }

        // Wait for TTS to complete
        await speakPromise;

        // Clean finish if not interrupted
        if (speakingRef.current && !interruptedRef.current) {
          dispatch({ type: 'FINISH_SPEAKING' });
          setInputMode('idle');
        }

        setCurrentSpokenWordIndex(-1);
        setWordsBuffer([]);
        speakingRef.current = false;
      } catch (err: unknown) {
        speakingRef.current = false;

        if (!interruptedRef.current) {
          // Save for retry
          const currentFailed = failedMessageRef.current;
          setFailedMessage({
            text,
            retryCount: (currentFailed?.retryCount || 0) + 1,
            timestamp: Date.now(),
          });

          dispatch({
            type: 'ERROR',
            payload: err instanceof Error ? err.message : 'Playback failed'
          });
          setInputMode('idle');
        }
      }
    },
    [dispatch]
  );

  // === RETRY FAILED ===
  const retryFailed = useCallback(() => {
    const failed = failedMessageRef.current;
    if (!failed) return;

    setFailedMessage(null);
    setError(null);
    dispatch({ type: 'RESET' });
    speak(failed.text);
  }, [speak, dispatch]);

  // === CLEAR FAILED ===
  const clearFailedMessage = useCallback(() => {
    setFailedMessage(null);
    setError(null);
    if (stateRef.current === 'error') {
      dispatch({ type: 'RESET' });
    }
  }, [dispatch]);

  // === LIFECYCLE ===
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && stateRef.current === 'listening') {
        stopListening();
      }
    };

    const handleBlur = () => {
      if (stateRef.current === 'listening') {
        stopListening();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      voiceService.cleanup();
      if (vadIntervalRef.current) {
        window.clearInterval(vadIntervalRef.current);
      }
    };
  }, [stopListening]);

  return {
    state,
    inputMode,
    error: error || voiceCapture.error,
    partialTranscript: voiceCapture.fullTranscript || partialTranscript,
    vadProgress,
    currentSpokenWordIndex,
    transcriptConfidence: voiceCapture.confidence || transcriptConfidence,
    failedMessage,
    wordsBuffer,
    isLowConfidence,
    isSpeaking,
    // 2026: Smart-Silence capture props
    silenceProgress: voiceCapture.silenceProgress,
    isSilenceCountdown: voiceCapture.isSilenceCountdown,
    captureState: voiceCapture.captureState,
    fullTranscript: voiceCapture.fullTranscript,
    interimTranscript: voiceCapture.interimTranscript,
    startListening,
    stopListening,
    speak,
    interrupt,
    setError,
    setInputMode,
    retryFailed,
    clearFailedMessage,
    dispatch,
  };
};

export default useVoiceAgent;
