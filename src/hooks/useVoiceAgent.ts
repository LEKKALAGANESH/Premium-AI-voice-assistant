// 2026 Pro-Active Voice UX: Voice Agent with State Machine Pattern
// REFACTORED: Surgical Lifecycle Repair - Fixed Infinite Cleanup Loop
// Version: 2.3.0 - Root Cause Fix for Silent Bot & Dead Idle
//
// KEY FIXES:
// 1. useRef for VoiceService - survives re-renders, no dependency array issues
// 2. sessionActive guard - prevents cleanup during active session
// 3. isCleaningUp guard - prevents recursive cleanup loops
// 4. Proper audio unlock sequence on startSession

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { VoiceState, AppSettings, FailedMessage, InputMode } from '../types';
import { voiceService, SpeechResult } from '../services/voice';
import { useVoiceCapture, CaptureResult, CaptureState } from './useVoiceCapture';
import { VoxError, mapErrorToVoxError } from '../types/errors';

// ============================================================================
// STATE MACHINE DEFINITION
// ============================================================================

type StateAction =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'START_PROCESSING' }
  | { type: 'START_SPEAKING' }
  | { type: 'FINISH_SPEAKING' }
  | { type: 'INTERRUPT' }
  | { type: 'ERROR'; payload: string }
  | { type: 'RESET' };

const STATE_TRANSITIONS: Record<VoiceState, StateAction['type'][]> = {
  idle: ['START_LISTENING', 'START_SPEAKING', 'ERROR'],
  listening: ['STOP_LISTENING', 'START_PROCESSING', 'INTERRUPT', 'ERROR', 'RESET'],
  processing: ['START_SPEAKING', 'ERROR', 'RESET'],
  speaking: ['FINISH_SPEAKING', 'INTERRUPT', 'START_LISTENING', 'ERROR'],
  error: ['RESET', 'START_LISTENING'],
};

function formatMicDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// TTS VOICE INITIALIZATION (Module-level singleton)
// ============================================================================

let ttsVoicesInitialized = false;
let ttsPreferredVoice: SpeechSynthesisVoice | null = null;

function initializeTTSVoices(): void {
  if (ttsVoicesInitialized || typeof window === 'undefined') return;

  const synth = window.speechSynthesis;
  if (!synth) return;

  const loadVoices = () => {
    const voices = synth.getVoices();
    if (voices.length > 0) {
      ttsPreferredVoice = voices.find(v => v.lang.startsWith('en') && v.localService)
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0];
      ttsVoicesInitialized = true;
      console.log('[VoiceAgent] TTS voices loaded:', voices.length);
    }
  };

  loadVoices();
  synth.addEventListener('voiceschanged', loadVoices, { once: true });
}

if (typeof window !== 'undefined') {
  initializeTTSVoices();
}

// State machine reducer
function voiceStateMachine(state: VoiceState, action: StateAction): VoiceState {
  const validTransitions = STATE_TRANSITIONS[state];

  if (!validTransitions.includes(action.type)) {
    console.warn(`[VoiceStateMachine] Invalid transition: ${state} -> ${action.type}`);
    return state;
  }

  switch (action.type) {
    case 'START_LISTENING': return 'listening';
    case 'STOP_LISTENING': return 'processing';
    case 'START_PROCESSING': return 'processing';
    case 'START_SPEAKING': return 'speaking';
    case 'FINISH_SPEAKING': return 'idle';
    case 'INTERRUPT': return 'idle';
    case 'ERROR': return 'error';
    case 'RESET': return 'idle';
    default: return state;
  }
}

// ============================================================================
// INTERFACES
// ============================================================================

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
  voxError: VoxError | null;
  partialTranscript: string;
  vadProgress: number;
  currentSpokenWordIndex: number;
  transcriptConfidence: number;
  failedMessage: FailedMessage | null;
  wordsBuffer: string[];
  isLowConfidence: boolean;
  isSpeaking: boolean;
  silenceProgress: number;
  isSilenceCountdown: boolean;
  captureState: CaptureState;
  fullTranscript: string;
  interimTranscript: string;
  micDuration: string;
  micDurationSeconds: number;
  isAudioReady: boolean;
  isTTSSpeaking: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  interrupt: () => void;
  setError: (err: string | null, voxError?: VoxError) => void;
  setInputMode: (mode: InputMode) => void;
  retryFailed: () => void;
  clearFailedMessage: () => void;
  dispatch: (action: StateAction) => void;
  wakeUpAudio: () => Promise<boolean>;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export const useVoiceAgent = ({
  settings,
  onTranscript,
  onResponseStart,
  onResponseComplete,
  onSyncWordChange,
}: VoiceAgentProps): VoiceAgentReturn => {
  // === STATE ===
  const [state, setStateRaw] = useState<VoiceState>('idle');
  const [inputMode, setInputMode] = useState<InputMode>('idle');
  const [error, setErrorRaw] = useState<string | null>(null);
  const [voxError, setVoxError] = useState<VoxError | null>(null);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [vadProgress, setVadProgress] = useState(0);
  const [currentSpokenWordIndex, setCurrentSpokenWordIndex] = useState(-1);
  const [transcriptConfidence, setTranscriptConfidence] = useState(1);
  const [failedMessage, setFailedMessage] = useState<FailedMessage | null>(null);
  const [wordsBuffer, setWordsBuffer] = useState<string[]>([]);
  const [micDurationSeconds, setMicDurationSeconds] = useState(0);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false);

  // ============================================================================
  // CRITICAL FIX: useRef for lifecycle guards
  // These prevent the infinite cleanup loop and premature state resets
  // ============================================================================
  const sessionActiveRef = useRef(false);       // True when session is running
  const isCleaningUpRef = useRef(false);        // Prevents recursive cleanup
  const isMountedRef = useRef(true);            // Track component mount state
  const stateRef = useRef<VoiceState>('idle');
  const transcriptRef = useRef('');
  const vadIntervalRef = useRef<number | null>(null);
  const micTimerRef = useRef<number | null>(null);
  const micStartTimeRef = useRef<number>(0);
  const speakingRef = useRef(false);
  const interruptedRef = useRef(false);
  const failedMessageRef = useRef<FailedMessage | null>(null);
  const settingsRef = useRef(settings);
  const onSyncWordChangeRef = useRef(onSyncWordChange);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // === SMART-SILENCE VOICE CAPTURE ===
  const voiceCapture = useVoiceCapture({
    onInterimUpdate: (text) => {
      if (!isMountedRef.current) return;
      setPartialTranscript(text);
      onTranscript(text, false, voiceCapture.confidence);
    },
    onFinalSubmit: (result: CaptureResult) => {
      if (!isMountedRef.current) return;

      // Stop mic timer
      if (micTimerRef.current) {
        window.clearInterval(micTimerRef.current);
        micTimerRef.current = null;
      }
      setMicDurationSeconds(0);

      setTranscriptConfidence(result.confidence);
      transcriptRef.current = result.transcript;
      onTranscript(result.transcript, true, result.confidence);
      onResponseComplete(result.transcript);
    },
    onError: (err, voxErr) => {
      if (!isMountedRef.current) return;

      if (micTimerRef.current) {
        window.clearInterval(micTimerRef.current);
        micTimerRef.current = null;
      }
      setMicDurationSeconds(0);

      if (voxErr) {
        setVoxError(voxErr);
      } else {
        setVoxError(mapErrorToVoxError(err));
      }

      dispatch({ type: 'ERROR', payload: err });
    },
    onStateChange: (captureState) => {
      if (!isMountedRef.current) return;

      if (captureState === 'IDLE' && stateRef.current === 'listening') {
        if (micTimerRef.current) {
          window.clearInterval(micTimerRef.current);
          micTimerRef.current = null;
        }
        setMicDurationSeconds(0);
        dispatch({ type: 'RESET' });
      } else if (captureState === 'LISTENING' || captureState === 'CAPTURING' || captureState === 'STABLE_SILENCE') {
        if (stateRef.current === 'idle' || stateRef.current === 'error') {
          dispatch({ type: 'START_LISTENING' });
        }
      } else if (captureState === 'SUBMITTING') {
        if (micTimerRef.current) {
          window.clearInterval(micTimerRef.current);
          micTimerRef.current = null;
        }
        setTimeout(() => {
          if (isMountedRef.current) setMicDurationSeconds(0);
        }, 500);
        dispatch({ type: 'START_PROCESSING' });
      }
    },
  });

  // === PREMIUM ERROR HANDLER ===
  const setError = useCallback((err: string | null, voxErr?: VoxError) => {
    if (!isMountedRef.current) return;
    setErrorRaw(err);
    if (err === null) {
      setVoxError(null);
    } else if (voxErr) {
      setVoxError(voxErr);
    } else {
      setVoxError(mapErrorToVoxError(err));
    }
  }, []);

  // === STATE MACHINE DISPATCH ===
  const dispatch = useCallback((action: StateAction) => {
    if (!isMountedRef.current) return;

    setStateRaw(prev => {
      const nextState = voiceStateMachine(prev, action);
      stateRef.current = nextState;
      return nextState;
    });

    if (action.type === 'ERROR' && 'payload' in action) {
      setErrorRaw(action.payload);
    }
    if (action.type === 'RESET') {
      setErrorRaw(null);
      setVoxError(null);
      setInputMode('idle');
    }
  }, []);

  // Keep refs in sync
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { failedMessageRef.current = failedMessage; }, [failedMessage]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { onSyncWordChangeRef.current = onSyncWordChange; }, [onSyncWordChange]);

  // === DERIVED STATE ===
  const LOW_CONFIDENCE_THRESHOLD = 0.7;
  const isLowConfidence = transcriptConfidence < LOW_CONFIDENCE_THRESHOLD;
  const isSpeaking = useMemo(() => state === 'speaking', [state]);
  const micDuration = useMemo(() => formatMicDuration(micDurationSeconds), [micDurationSeconds]);

  // ============================================================================
  // MIC TIMER FUNCTIONS
  // ============================================================================

  const startMicTimer = useCallback(() => {
    if (micTimerRef.current) {
      window.clearInterval(micTimerRef.current);
    }
    micStartTimeRef.current = performance.now();
    setMicDurationSeconds(0);

    micTimerRef.current = window.setInterval(() => {
      if (isMountedRef.current) {
        const elapsed = Math.floor((performance.now() - micStartTimeRef.current) / 1000);
        setMicDurationSeconds(elapsed);
      }
    }, 1000);
  }, []);

  const stopMicTimer = useCallback(() => {
    if (micTimerRef.current) {
      window.clearInterval(micTimerRef.current);
      micTimerRef.current = null;
    }
    if (isMountedRef.current) {
      setMicDurationSeconds(0);
    }
    micStartTimeRef.current = 0;
  }, []);

  // ============================================================================
  // AUDIO WAKE-UP PROTOCOL (Must be called from user gesture)
  // ============================================================================

  const wakeUpAudio = useCallback(async (): Promise<boolean> => {
    console.log('[VoiceAgent] 🔊 Starting audio wake-up sequence...');

    try {
      // 1. Initialize voice service AudioContext
      const voiceServiceReady = await voiceService.initializeAudio();
      console.log('[VoiceAgent] ✅ VoiceService audio initialized:', voiceServiceReady);

      // 2. Wake up speechSynthesis
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();

        if (!ttsVoicesInitialized) {
          initializeTTSVoices();
          // Wait for voices to load
          await new Promise<void>(resolve => {
            const check = () => {
              if (ttsVoicesInitialized || window.speechSynthesis.getVoices().length > 0) {
                resolve();
              } else {
                setTimeout(check, 100);
              }
            };
            check();
            setTimeout(resolve, 2000); // Timeout after 2s
          });
        }

        // Speak a silent primer to unlock TTS
        const primer = new SpeechSynthesisUtterance(' ');
        primer.volume = 0.01;
        primer.rate = 10;

        // Store globally to prevent GC
        (window as any).__voiceAgentPrimer = primer;

        primer.onend = () => {
          console.log('[VoiceAgent] ✅ TTS primer completed');
          (window as any).__voiceAgentPrimer = null;
        };

        window.speechSynthesis.speak(primer);

        // Wait a moment then cancel
        await new Promise(resolve => setTimeout(resolve, 100));
        window.speechSynthesis.cancel();
      }

      // 3. Mark session as active
      sessionActiveRef.current = true;

      if (isMountedRef.current) {
        setIsAudioReady(true);
      }

      console.log('[VoiceAgent] 🎉 Audio wake-up complete!');
      return true;
    } catch (err) {
      console.error('[VoiceAgent] ❌ Audio wake-up failed:', err);
      if (isMountedRef.current) {
        setIsAudioReady(false);
      }
      return false;
    }
  }, []);

  // ============================================================================
  // CANCEL ALL TTS
  // ============================================================================

  const cancelAllTTS = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    activeUtteranceRef.current = null;
    if (isMountedRef.current) {
      setIsTTSSpeaking(false);
    }
  }, []);

  // ============================================================================
  // CLEANUP (Guarded to prevent recursive loops)
  // ============================================================================

  const cleanup = useCallback(() => {
    // CRITICAL: Guard against recursive cleanup
    if (isCleaningUpRef.current) {
      console.log('[VoiceAgent] ⚠️ Cleanup already in progress, skipping');
      return;
    }

    // CRITICAL: Don't cleanup during active speaking unless interrupted
    if (stateRef.current === 'speaking' && !interruptedRef.current) {
      console.log('[VoiceAgent] ⚠️ Skipping cleanup - currently speaking');
      return;
    }

    isCleaningUpRef.current = true;
    console.log('[VoiceAgent] 🧹 Cleanup starting...');

    try {
      voiceService.cleanup();
      stopMicTimer();
      cancelAllTTS();

      if (vadIntervalRef.current) {
        window.clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }

      if (isMountedRef.current) {
        setInputMode('idle');
        setVadProgress(0);
        setPartialTranscript('');
        setCurrentSpokenWordIndex(-1);
        setWordsBuffer([]);
      }

      speakingRef.current = false;
      interruptedRef.current = false;
      transcriptRef.current = '';
    } finally {
      isCleaningUpRef.current = false;
      console.log('[VoiceAgent] ✅ Cleanup complete');
    }
  }, [stopMicTimer, cancelAllTTS]);

  // ============================================================================
  // INTERRUPT (Barge-in)
  // ============================================================================

  const interrupt = useCallback(() => {
    console.log('[VoiceAgent] 🛑 Interrupt triggered');
    interruptedRef.current = true;

    voiceService.stopSpeaking();
    cancelAllTTS();
    stopMicTimer();
    cleanup();
    dispatch({ type: 'INTERRUPT' });
  }, [cleanup, dispatch, cancelAllTTS, stopMicTimer]);

  // ============================================================================
  // VOICE SERVICE CALLBACKS
  // ============================================================================

  const onErrorCallback = useCallback((err: Error) => {
    if (!isMountedRef.current) return;

    stopMicTimer();

    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    const errorMessages: Record<string, string> = {
      SPEECH_RECOGNITION_NOT_SUPPORTED: 'Voice input not supported in this browser',
      MIC_PERMISSION_DENIED: 'Microphone access denied',
      NETWORK_ERROR: 'Network error - check your connection',
      'not-allowed': 'Microphone access denied',
      'audio-capture': 'No microphone found',
      'network': 'Network error - check your connection',
    };

    const errorMessage = errorMessages[err.message] || err.message;
    dispatch({ type: 'ERROR', payload: errorMessage });
    setInputMode('idle');
  }, [dispatch, stopMicTimer]);

  // ============================================================================
  // START LISTENING
  // ============================================================================

  const startListening = useCallback(() => {
    const currentState = stateRef.current;
    console.log('[VoiceAgent] 🎤 startListening called, current state:', currentState);

    // Barge-in: interrupt if speaking
    if (currentState === 'speaking') {
      voiceService.stopSpeaking();
      cancelAllTTS();
      speakingRef.current = false;
      interruptedRef.current = true;
      dispatch({ type: 'INTERRUPT' });
    }

    // Only start from valid states
    if (currentState !== 'idle' && currentState !== 'error') {
      console.log('[VoiceAgent] ⚠️ Cannot start listening from state:', currentState);
      return;
    }

    setError(null);
    transcriptRef.current = '';
    setPartialTranscript('');
    setVadProgress(0);
    setTranscriptConfidence(1);
    setInputMode('voice');

    // Mark session as active
    sessionActiveRef.current = true;

    startMicTimer();
    voiceCapture.startCapture();
    dispatch({ type: 'START_LISTENING' });

    console.log('[VoiceAgent] ✅ Listening started');
  }, [dispatch, voiceCapture, startMicTimer, cancelAllTTS, setError]);

  // ============================================================================
  // STOP LISTENING
  // ============================================================================

  const stopListening = useCallback(() => {
    if (stateRef.current !== 'listening') return;

    console.log('[VoiceAgent] ⏹️ stopListening called');
    stopMicTimer();
    voiceCapture.stopCapture();

    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    setInputMode('idle');
  }, [voiceCapture, stopMicTimer]);

  // ============================================================================
  // SPEAK (TTS with proper lifecycle)
  // ============================================================================

  const speak = useCallback(async (text: string) => {
    if (stateRef.current !== 'idle' && stateRef.current !== 'processing') {
      console.warn('[VoiceAgent] Cannot speak from state:', stateRef.current);
      return;
    }

    console.log('[VoiceAgent] 🔊 speak() called with text:', text.substring(0, 50));

    dispatch({ type: 'START_SPEAKING' });
    setCurrentSpokenWordIndex(0);
    speakingRef.current = true;
    interruptedRef.current = false;
    stopMicTimer();

    try {
      const words = text.split(/\s+/).filter(w => w.length > 0);
      setWordsBuffer(words);

      const currentSettings = settingsRef.current;

      // Try primary TTS service
      try {
        console.log('[VoiceAgent] Trying primary TTS...');

        const speakPromise = voiceService.speak(
          text,
          currentSettings.voiceName,
          currentSettings.whisperMode
        );

        const baseDuration = 350;
        const wordDuration = baseDuration / (currentSettings.speechRate || 1);

        for (let i = 0; i < words.length; i++) {
          if (interruptedRef.current || !speakingRef.current) break;
          setCurrentSpokenWordIndex(i);
          onSyncWordChangeRef.current?.(i, words[i]);
          await new Promise(resolve => setTimeout(resolve, wordDuration));
        }

        await speakPromise;
        console.log('[VoiceAgent] ✅ Primary TTS completed');

      } catch (primaryErr) {
        console.warn('[VoiceAgent] Primary TTS failed, using Web Speech fallback:', primaryErr);

        // Fallback to Web Speech API
        await new Promise<void>((resolve, reject) => {
          if (typeof window === 'undefined' || !window.speechSynthesis) {
            reject(new Error('Web Speech API not supported'));
            return;
          }

          const synth = window.speechSynthesis;
          synth.cancel();

          const utterance = new SpeechSynthesisUtterance(text);

          // Store globally to prevent GC
          activeUtteranceRef.current = utterance;
          (window as any).__voiceAgentUtterance = utterance;

          if (ttsPreferredVoice) {
            utterance.voice = ttsPreferredVoice;
          }
          utterance.rate = currentSettings.speechRate || 1;
          utterance.volume = currentSettings.whisperMode ? 0.4 : 1;

          utterance.onstart = () => {
            console.log('[VoiceAgent] 🔊 Web Speech TTS started');
            if (isMountedRef.current) setIsTTSSpeaking(true);
          };

          utterance.onend = () => {
            console.log('[VoiceAgent] ✅ Web Speech TTS ended');
            if (isMountedRef.current) setIsTTSSpeaking(false);
            activeUtteranceRef.current = null;
            (window as any).__voiceAgentUtterance = null;
            resolve();
          };

          utterance.onerror = (event) => {
            console.error('[VoiceAgent] Web Speech TTS error:', event.error);
            if (isMountedRef.current) setIsTTSSpeaking(false);
            activeUtteranceRef.current = null;
            (window as any).__voiceAgentUtterance = null;

            if (event.error === 'interrupted') {
              resolve();
            } else {
              reject(new Error(`TTS Error: ${event.error}`));
            }
          };

          utterance.onboundary = (event) => {
            if (event.name === 'word' && !interruptedRef.current && isMountedRef.current) {
              const wordIndex = Math.min(
                Math.floor(event.charIndex / (text.length / words.length)),
                words.length - 1
              );
              setCurrentSpokenWordIndex(wordIndex);
              onSyncWordChangeRef.current?.(wordIndex, words[wordIndex] || '');
            }
          };

          synth.speak(utterance);
        });
      }

      // Clean finish
      if (speakingRef.current && !interruptedRef.current && isMountedRef.current) {
        console.log('[VoiceAgent] ✅ Speech complete - transitioning to IDLE');
        dispatch({ type: 'FINISH_SPEAKING' });
        setInputMode('idle');
        voiceService.stopListening();
      }

      if (isMountedRef.current) {
        setCurrentSpokenWordIndex(-1);
        setWordsBuffer([]);
      }
      speakingRef.current = false;
      if (isMountedRef.current) setIsTTSSpeaking(false);

    } catch (err: unknown) {
      speakingRef.current = false;
      if (isMountedRef.current) setIsTTSSpeaking(false);

      if (!interruptedRef.current && isMountedRef.current) {
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
  }, [dispatch, stopMicTimer]);

  // ============================================================================
  // RETRY & CLEAR FAILED
  // ============================================================================

  const retryFailed = useCallback(() => {
    const failed = failedMessageRef.current;
    if (!failed) return;

    setFailedMessage(null);
    setError(null);
    dispatch({ type: 'RESET' });
    speak(failed.text);
  }, [speak, dispatch, setError]);

  const clearFailedMessage = useCallback(() => {
    setFailedMessage(null);
    setError(null);
    if (stateRef.current === 'error') {
      dispatch({ type: 'RESET' });
    }
  }, [dispatch, setError]);

  // ============================================================================
  // LIFECYCLE: SINGLE useEffect for cleanup on UNMOUNT ONLY
  // No dependencies that could trigger re-runs!
  // ============================================================================

  useEffect(() => {
    isMountedRef.current = true;
    console.log('[VoiceAgent] 🟢 Component mounted');

    const handleVisibilityChange = () => {
      if (document.hidden && stateRef.current === 'listening') {
        voiceCapture.stopCapture();
      }
    };

    const handleBlur = () => {
      if (stateRef.current === 'listening') {
        voiceCapture.stopCapture();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    // CLEANUP: Only runs on UNMOUNT
    return () => {
      console.log('[VoiceAgent] 🔴 Component unmounting - final cleanup');
      isMountedRef.current = false;
      sessionActiveRef.current = false;

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);

      // Stop all voice operations
      voiceService.cleanup();

      // Clear timers
      if (vadIntervalRef.current) {
        window.clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }
      if (micTimerRef.current) {
        window.clearInterval(micTimerRef.current);
        micTimerRef.current = null;
      }

      // Cancel all speech
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      activeUtteranceRef.current = null;
      (window as any).__voiceAgentUtterance = null;
      (window as any).__voiceAgentPrimer = null;

      console.log('[VoiceAgent] ✅ Final cleanup complete');
    };
  }, []); // CRITICAL: Empty dependency array!

  // === RETURN ===
  const combinedError = error || voiceCapture.error;
  const combinedVoxError = voxError || (voiceCapture.error ? mapErrorToVoxError(voiceCapture.error) : null);

  return {
    state,
    inputMode,
    error: combinedError,
    voxError: combinedVoxError,
    partialTranscript: voiceCapture.fullTranscript || partialTranscript,
    vadProgress,
    currentSpokenWordIndex,
    transcriptConfidence: voiceCapture.confidence || transcriptConfidence,
    failedMessage,
    wordsBuffer,
    isLowConfidence,
    isSpeaking,
    silenceProgress: voiceCapture.silenceProgress,
    isSilenceCountdown: voiceCapture.isSilenceCountdown,
    captureState: voiceCapture.captureState,
    fullTranscript: voiceCapture.fullTranscript,
    interimTranscript: voiceCapture.interimTranscript,
    micDuration,
    micDurationSeconds,
    isAudioReady,
    isTTSSpeaking,
    startListening,
    stopListening,
    speak,
    interrupt,
    setError,
    setInputMode,
    retryFailed,
    clearFailedMessage,
    dispatch,
    wakeUpAudio,
  };
};

export default useVoiceAgent;
