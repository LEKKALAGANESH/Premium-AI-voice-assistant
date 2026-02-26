// 2026 Pro-Active Voice UX: Voice Agent with State Machine Pattern
// REFACTORED: Surgical Lifecycle Repair - Mic Timer, TTS Autoplay, Loop Reset Protocol
// Implements: Formal state transitions, sync engine integration, Smart-Silence capture
// Version: 2.2.0 - Voice Lifecycle Stability Overhaul

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { VoiceState, AppSettings, FailedMessage, InputMode } from '../types';
import { voiceService, SpeechResult } from '../services/voice';
import { useVoiceCapture, CaptureResult, CaptureState } from './useVoiceCapture';

// ============================================================================
// 2026 VOICE LIFECYCLE: State Machine Definition
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

// Valid state transitions
const STATE_TRANSITIONS: Record<VoiceState, StateAction['type'][]> = {
  idle: ['START_LISTENING', 'START_SPEAKING', 'ERROR'],
  listening: ['STOP_LISTENING', 'START_PROCESSING', 'INTERRUPT', 'ERROR', 'RESET'],
  processing: ['START_SPEAKING', 'ERROR', 'RESET'],
  speaking: ['FINISH_SPEAKING', 'INTERRUPT', 'START_LISTENING', 'ERROR'],
  error: ['RESET', 'START_LISTENING'],
};

// ============================================================================
// 2026 MIC TIMER: High-Resolution Duration Tracking
// ============================================================================
// Format: MM:SS (e.g., 00:05, 01:23)
// Updates every 1000ms while listening
// Resets to 00:00 on stop or cleanup
// ============================================================================

function formatMicDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// 2026 TTS LIFECYCLE: Web Speech API Initialization
// ============================================================================
// Pre-initialize voices on module load
// AudioContext resume on user gesture
// Utterance event binding for state control
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
      // Prefer English voices
      ttsPreferredVoice = voices.find(v => v.lang.startsWith('en') && v.localService)
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0];
      ttsVoicesInitialized = true;
      console.log('[VoiceAgent] TTS voices initialized:', voices.length, 'voices available');
    }
  };

  // Load immediately if available
  loadVoices();

  // Also listen for voiceschanged event (Chrome loads voices async)
  synth.addEventListener('voiceschanged', loadVoices, { once: true });
}

// Initialize on module load
if (typeof window !== 'undefined') {
  initializeTTSVoices();
}

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
  // 2026 VOICE LIFECYCLE: New mic timer and audio state props
  micDuration: string;         // Formatted MM:SS duration
  micDurationSeconds: number;  // Raw seconds for progress calculations
  isAudioReady: boolean;       // True if TTS audio is initialized
  isTTSSpeaking: boolean;      // True if Web Speech TTS is actively playing
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  interrupt: () => void;
  setError: (err: string | null) => void;
  setInputMode: (mode: InputMode) => void;
  retryFailed: () => void;
  clearFailedMessage: () => void;
  dispatch: (action: StateAction) => void;
  // 2026 VOICE LIFECYCLE: Audio wake-up for autoplay policy
  wakeUpAudio: () => Promise<boolean>;
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

  // ============================================================================
  // 2026 MIC TIMER: Real-time duration tracking state
  // ============================================================================
  const [micDurationSeconds, setMicDurationSeconds] = useState(0);
  const micTimerRef = useRef<number | null>(null);
  const micStartTimeRef = useRef<number>(0);

  // ============================================================================
  // 2026 TTS STATE: Web Speech API tracking
  // ============================================================================
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsCompletionCallbackRef = useRef<(() => void) | null>(null);

  // === 2026: SMART-SILENCE VOICE CAPTURE ===
  const voiceCapture = useVoiceCapture({
    onInterimUpdate: (text) => {
      setPartialTranscript(text);
      onTranscript(text, false, voiceCapture.confidence);
    },
    onFinalSubmit: (result: CaptureResult) => {
      // ============================================================================
      // 2026 MIC TIMER: Stop timer when transcript is submitted
      // ============================================================================
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
    onError: (err) => {
      // Stop mic timer on error
      if (micTimerRef.current) {
        window.clearInterval(micTimerRef.current);
        micTimerRef.current = null;
      }
      setMicDurationSeconds(0);

      dispatch({ type: 'ERROR', payload: err });
    },
    onStateChange: (captureState) => {
      // Sync capture state to voice state
      if (captureState === 'IDLE' && stateRef.current === 'listening') {
        // ============================================================================
        // 2026 MIC TIMER: Reset timer when returning to IDLE
        // ============================================================================
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
        // Stop timer when processing starts
        if (micTimerRef.current) {
          window.clearInterval(micTimerRef.current);
          micTimerRef.current = null;
        }
        // Keep the last duration displayed briefly, then reset
        setTimeout(() => setMicDurationSeconds(0), 500);

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
  const micDuration = useMemo(() => formatMicDuration(micDurationSeconds), [micDurationSeconds]);

  // ============================================================================
  // 2026 MIC TIMER: Start/Stop/Reset functions
  // ============================================================================

  const startMicTimer = useCallback(() => {
    // Clear any existing timer
    if (micTimerRef.current) {
      window.clearInterval(micTimerRef.current);
    }

    // Record start time with high precision
    micStartTimeRef.current = performance.now();
    setMicDurationSeconds(0);

    // Update every 1000ms
    micTimerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((performance.now() - micStartTimeRef.current) / 1000);
      setMicDurationSeconds(elapsed);
    }, 1000);

    console.log('[VoiceAgent] Mic timer started');
  }, []);

  const stopMicTimer = useCallback(() => {
    if (micTimerRef.current) {
      window.clearInterval(micTimerRef.current);
      micTimerRef.current = null;
    }
    // Reset to 00:00
    setMicDurationSeconds(0);
    micStartTimeRef.current = 0;
    console.log('[VoiceAgent] Mic timer stopped and reset');
  }, []);

  // ============================================================================
  // 2026 TTS LIFECYCLE: Audio Wake-Up Protocol
  // ============================================================================
  // Must be called from a user gesture to satisfy browser autoplay policies
  // Resumes AudioContext and initializes speechSynthesis
  // ============================================================================

  const wakeUpAudio = useCallback(async (): Promise<boolean> => {
    try {
      // 1. Initialize voice service AudioContext
      const voiceServiceReady = await voiceService.initializeAudio();

      // 2. Wake up speechSynthesis (required for some browsers)
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        // Cancel any pending speech
        window.speechSynthesis.cancel();

        // Force voices to load
        if (!ttsVoicesInitialized) {
          initializeTTSVoices();
        }

        // Create a silent utterance to "prime" the synthesis engine
        const silentUtterance = new SpeechSynthesisUtterance('');
        silentUtterance.volume = 0;
        window.speechSynthesis.speak(silentUtterance);
      }

      setIsAudioReady(true);
      console.log('[VoiceAgent] Audio wake-up complete');
      return voiceServiceReady;
    } catch (err) {
      console.error('[VoiceAgent] Audio wake-up failed:', err);
      setIsAudioReady(false);
      return false;
    }
  }, []);

  // ============================================================================
  // 2026 TTS LIFECYCLE: Strict Cleanup - Cancel All Speech
  // ============================================================================

  const cancelAllTTS = useCallback(() => {
    // Cancel Web Speech API
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Clear active utterance reference
    activeUtteranceRef.current = null;
    setIsTTSSpeaking(false);

    // Clear completion callback
    ttsCompletionCallbackRef.current = null;

    console.log('[VoiceAgent] All TTS cancelled');
  }, []);

  // === CLEANUP (Extended with timer and TTS cleanup) ===
  const cleanup = useCallback(() => {
    // Stop voice service
    voiceService.cleanup();

    // Stop mic timer
    stopMicTimer();

    // Cancel all TTS
    cancelAllTTS();

    // Clear VAD interval
    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    // Reset all state
    setInputMode('idle');
    setVadProgress(0);
    setPartialTranscript('');
    setCurrentSpokenWordIndex(-1);
    setWordsBuffer([]);
    speakingRef.current = false;
    interruptedRef.current = false;
    transcriptRef.current = '';
  }, [stopMicTimer, cancelAllTTS]);

  // === INTERRUPT (Barge-in with full TTS cancellation) ===
  const interrupt = useCallback(() => {
    console.log('[VoiceAgent] Interrupt triggered - cancelling all audio');
    interruptedRef.current = true;

    // Stop voice service TTS
    voiceService.stopSpeaking();

    // Cancel Web Speech API TTS
    cancelAllTTS();

    // Stop mic timer
    stopMicTimer();

    // Full cleanup
    cleanup();

    dispatch({ type: 'INTERRUPT' });
  }, [cleanup, dispatch, cancelAllTTS, stopMicTimer]);

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

  // ============================================================================
  // 2026 ERROR RESILIENCE: Permission Guard with clear error states
  // ============================================================================
  const onErrorCallback = useCallback((err: Error) => {
    // Stop mic timer on error
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

    // ============================================================================
    // PERMISSION GUARD: Log clear warning and transition to ERROR state
    // ============================================================================
    if (err.message === 'MIC_PERMISSION_DENIED' || err.message === 'not-allowed') {
      console.warn(
        '[VoiceAgent] PERMISSION DENIED: Microphone access was denied by the user.\n' +
        'The SuperButton will display ERROR state with red glow.\n' +
        'User action required: Grant microphone permission in browser settings.'
      );
    }

    dispatch({ type: 'ERROR', payload: errorMessage });
    setInputMode('idle');
  }, [dispatch, stopMicTimer]);

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
      cancelAllTTS(); // 2026: Also cancel Web Speech TTS
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

    // ============================================================================
    // 2026 MIC TIMER: Start high-resolution timer the microsecond recognition starts
    // ============================================================================
    startMicTimer();

    // 2026: Use Smart-Silence capture engine
    voiceCapture.startCapture();

    dispatch({ type: 'START_LISTENING' });
  }, [dispatch, voiceCapture, startMicTimer, cancelAllTTS]);

  // === STOP LISTENING (Manual stop with Smart-Silence) ===
  const stopListening = useCallback(() => {
    if (stateRef.current !== 'listening') return;

    // ============================================================================
    // 2026 MIC TIMER: Stop and reset timer on manual stop
    // ============================================================================
    stopMicTimer();

    // 2026: Stop capture (will submit if valid transcript exists)
    voiceCapture.stopCapture();

    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    setInputMode('idle');
  }, [voiceCapture, stopMicTimer]);

  // ============================================================================
  // 2026 SPEAK: TTS with Loop Reset Protocol
  // ============================================================================
  // - Uses utterance.onstart for 'Speaking' state
  // - Uses utterance.onend for final reset to 'idle'
  // - Ensures mic is ready again after response
  // - Falls back to Web Speech API if primary TTS fails
  // ============================================================================

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

      // ============================================================================
      // 2026 MIC TIMER: Ensure timer is stopped when speaking starts
      // ============================================================================
      stopMicTimer();

      try {
        // Setup word buffer for sync
        const words = text.split(/\s+/).filter(w => w.length > 0);
        setWordsBuffer(words);

        const currentSettings = settingsRef.current;

        // Try primary TTS service first
        let usedFallback = false;
        try {
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
        } catch (primaryErr) {
          console.warn('[VoiceAgent] Primary TTS failed, trying Web Speech fallback:', primaryErr);
          usedFallback = true;

          // ============================================================================
          // 2026 FALLBACK: Web Speech API with proper lifecycle binding
          // ============================================================================
          await new Promise<void>((resolve, reject) => {
            if (typeof window === 'undefined' || !window.speechSynthesis) {
              reject(new Error('Web Speech API not supported'));
              return;
            }

            const synth = window.speechSynthesis;

            // Cancel any existing speech
            synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            activeUtteranceRef.current = utterance;

            // Apply voice settings
            if (ttsPreferredVoice) {
              utterance.voice = ttsPreferredVoice;
            }
            utterance.rate = currentSettings.speechRate || 1;
            utterance.volume = currentSettings.whisperMode ? 0.4 : 1;

            // ============================================================================
            // CRITICAL: utterance.onstart - Set state to 'Speaking'
            // ============================================================================
            utterance.onstart = () => {
              console.log('[VoiceAgent] Web Speech TTS started');
              setIsTTSSpeaking(true);
              // State already set to 'speaking' above
            };

            // ============================================================================
            // CRITICAL: utterance.onend - Trigger final reset (Loop Reset Protocol)
            // ============================================================================
            utterance.onend = () => {
              console.log('[VoiceAgent] Web Speech TTS ended');
              setIsTTSSpeaking(false);
              activeUtteranceRef.current = null;
              resolve();
            };

            utterance.onerror = (event) => {
              console.error('[VoiceAgent] Web Speech TTS error:', event.error);
              setIsTTSSpeaking(false);
              activeUtteranceRef.current = null;

              // Don't reject for 'interrupted' errors (intentional barge-in)
              if (event.error === 'interrupted') {
                resolve();
              } else {
                reject(new Error(`TTS Error: ${event.error}`));
              }
            };

            // Word boundary events for sync (if supported)
            utterance.onboundary = (event) => {
              if (event.name === 'word' && !interruptedRef.current) {
                const wordIndex = Math.min(
                  Math.floor(event.charIndex / (text.length / words.length)),
                  words.length - 1
                );
                setCurrentSpokenWordIndex(wordIndex);
                onSyncWordChangeRef.current?.(wordIndex, words[wordIndex] || '');
              }
            };

            // Speak the utterance
            synth.speak(utterance);
          });
        }

        // ============================================================================
        // LOOP RESET PROTOCOL: Clean finish only if not interrupted
        // ============================================================================
        if (speakingRef.current && !interruptedRef.current) {
          console.log('[VoiceAgent] Speech complete - transitioning to IDLE');

          // Explicitly reset to idle state
          dispatch({ type: 'FINISH_SPEAKING' });
          setInputMode('idle');

          // ============================================================================
          // CRITICAL: Ensure previous SpeechRecognition is fully aborted
          // ============================================================================
          // The voiceCapture hook handles its own cleanup, but we ensure
          // the voice service recognition is also cleaned up
          voiceService.stopListening();
        }

        // Reset word tracking
        setCurrentSpokenWordIndex(-1);
        setWordsBuffer([]);
        speakingRef.current = false;
        setIsTTSSpeaking(false);

      } catch (err: unknown) {
        speakingRef.current = false;
        setIsTTSSpeaking(false);

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
    [dispatch, stopMicTimer]
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

  // ============================================================================
  // 2026 LIFECYCLE: Visibility, Focus, and Global Cleanup
  // ============================================================================

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

    // ============================================================================
    // STRICT MEMORY CLEANUP: Prevent 'Ghost Voices' and duplicate listeners
    // ============================================================================
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);

      // Cancel all voice service operations
      voiceService.cleanup();

      // Clear VAD interval
      if (vadIntervalRef.current) {
        window.clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }

      // ============================================================================
      // 2026 CRITICAL: Stop mic timer to prevent stale interval callbacks
      // ============================================================================
      if (micTimerRef.current) {
        window.clearInterval(micTimerRef.current);
        micTimerRef.current = null;
      }

      // ============================================================================
      // 2026 CRITICAL: Cancel all speechSynthesis to prevent ghost voices
      // ============================================================================
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      activeUtteranceRef.current = null;

      console.log('[VoiceAgent] Global cleanup complete - no ghost voices');
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
    // 2026 VOICE LIFECYCLE: New mic timer and audio state
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
    // 2026 VOICE LIFECYCLE: Audio wake-up for autoplay policy
    wakeUpAudio,
  };
};

export default useVoiceAgent;
