// 2026 Pro-Active Voice UX: Voice Agent with State Machine Pattern
// REFACTORED: Surgical Lifecycle Repair - Fixed Infinite Cleanup Loop
// Version: 2.4.0 - Loop-Back Fix for One-Shot Idle Bug
//
// KEY FIXES:
// 1. useRef for VoiceService - survives re-renders, no dependency array issues
// 2. sessionActive guard - prevents cleanup during active session
// 3. isCleaningUp guard - prevents recursive cleanup loops
// 4. Proper audio unlock sequence on startSession
// 5. NEW: isConversationActive ref - keeps session alive across speak cycles
// 6. NEW: Auto-restart recognition on utterance.onend (Loop-Back)
// 7. NEW: Voice Unlocker on first interaction

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { VoiceState, AppSettings, FailedMessage, InputMode } from '../types';
import { voiceService, SpeechResult } from '../services/voice';
import { useVoiceCapture, CaptureResult, CaptureState } from './useVoiceCapture';
import { VoxError, mapErrorToVoxError } from '../types/errors';
import { voiceStateMachine, formatMicDuration } from '../lib/voiceStateMachine';
import type { StateAction } from '../lib/voiceStateMachine';

// ============================================================================
// LANGUAGE DETECTION (Lightweight heuristic for UI color theming)
// ============================================================================

const LANG_PATTERNS: [RegExp, string][] = [
  [/[\u0900-\u097F]/, 'hi'],     // Hindi (Devanagari)
  [/[\u0C00-\u0C7F]/, 'te'],     // Telugu
  [/[\u0B80-\u0BFF]/, 'ta'],     // Tamil
  [/[\u00C0-\u024F]/, 'fr'],     // French/Spanish accented chars (rough)
  [/[\u4E00-\u9FFF]/, 'zh'],     // Chinese
  [/[\u3040-\u309F\u30A0-\u30FF]/, 'ja'], // Japanese
  [/[\uAC00-\uD7AF]/, 'ko'],     // Korean
  [/[\u0600-\u06FF]/, 'ar'],     // Arabic
];

function detectLanguageFromText(text: string): string {
  for (const [pattern, lang] of LANG_PATTERNS) {
    if (pattern.test(text)) return lang;
  }
  return 'en';
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

// ============================================================================
// INTERFACES
// ============================================================================

interface VoiceAgentProps {
  settings: AppSettings;
  onTranscript: (text: string, isFinal: boolean, confidence: number) => void;
  onResponseStart: () => void;
  onResponseComplete: (text: string) => void;
  onSyncWordChange?: (index: number, word: string) => void;
  onInterrupt?: () => void;
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
  isConversationActive: boolean;
  detectedLang: string;
  keepAliveActive: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  beginSpeaking: () => void;
  finishSpeaking: () => void;
  interrupt: () => void;
  endConversation: () => void;
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
  onInterrupt,
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
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [detectedLang, setDetectedLang] = useState('en');

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
  const startListeningFnRef = useRef<(() => void) | null>(null);

  // ============================================================================
  // LOOP-BACK FIX: Conversation persistence ref
  // This ref stays TRUE during the entire conversation session
  // Used by utterance.onend to decide whether to auto-restart recognition
  // ============================================================================
  const isConversationActiveRef = useRef(false);
  const loopBackDelayMs = 300; // Echo prevention delay before restarting mic
  const recognitionRestartTimeoutRef = useRef<number | null>(null);

  // Keep-alive: pulse heartbeat when no speech detected for 10s
  const [keepAliveActive, setKeepAliveActive] = useState(false);
  const keepAliveTimerRef = useRef<number | null>(null);

  // === SMART-SILENCE VOICE CAPTURE (World-wide Native Language) ===
  const voiceCapture = useVoiceCapture({
    // Dynamic language: empty = auto-detect, or use last detected language for continuity
    lang: detectedLang === 'en' ? '' : '',  // Auto-detect for all languages
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

      // Detect language from transcript for UI theming
      const lang = detectLanguageFromText(result.transcript);
      setDetectedLang(lang);

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

  // Keep-alive heartbeat: pulse after 10s of silence during listening
  useEffect(() => {
    if (keepAliveTimerRef.current) {
      window.clearTimeout(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    if (state === 'listening' && isConversationActive) {
      keepAliveTimerRef.current = window.setTimeout(() => {
        if (isMountedRef.current) setKeepAliveActive(true);
        // Auto-clear after 2s pulse
        setTimeout(() => {
          if (isMountedRef.current) setKeepAliveActive(false);
        }, 2000);
      }, 10000);
    } else {
      setKeepAliveActive(false);
    }
    return () => {
      if (keepAliveTimerRef.current) {
        window.clearTimeout(keepAliveTimerRef.current);
      }
    };
  }, [state, isConversationActive]);

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

      // 2. Wake up speechSynthesis - VOICE UNLOCKER
      // This keeps the audio channel open for the entire session
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        // VOX RECOVERY: Cancel stale speech, then resume if paused
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

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

        // VOX RECOVERY: Use space ' ' — empty string '' corrupts Chrome's speech engine,
        // causing all subsequent speaks to be silent.
        // This MUST happen on user gesture to satisfy browser autoplay policy.
        const unlocker = new SpeechSynthesisUtterance(' ');
        unlocker.volume = 0.01; // Near-silent but non-zero to activate audio path
        unlocker.rate = 10;     // Fastest to complete quickly
        (window as any).__voiceAgentUnlocker = unlocker;

        window.speechSynthesis.speak(unlocker);

        // VOX RECOVERY: Wait for the unlocker to complete naturally.
        // Do NOT cancel() after — that kills the audio unlock before it takes effect.
        await new Promise<void>(resolve => {
          const timeout = setTimeout(() => {
            console.log('[VoiceAgent] Voice Unlocker timeout (500ms) — proceeding');
            resolve();
          }, 500);
          unlocker.onend = () => {
            clearTimeout(timeout);
            console.log('[VoiceAgent] ✅ Voice Unlocker completed - audio channel open');
            (window as any).__voiceAgentUnlocker = null;
            resolve();
          };
          unlocker.onerror = () => {
            clearTimeout(timeout);
            console.warn('[VoiceAgent] Voice Unlocker error — proceeding anyway');
            (window as any).__voiceAgentUnlocker = null;
            resolve();
          };
        });
      }

      // 3. Pre-warm API connection (Zero-Wait Engine: eliminate cold start)
      try {
        fetch('/api/ai/chat-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warmup: true }),
        }).catch(() => {});
      } catch {}

      // 4. Mark session AND conversation as active
      sessionActiveRef.current = true;
      isConversationActiveRef.current = true;

      if (isMountedRef.current) {
        setIsAudioReady(true);
        setIsConversationActive(true);
      }

      console.log('[VoiceAgent] 🎉 Audio wake-up complete! Conversation loop enabled.');
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
  // STREAMING SPEECH CONTROL (Used by useAppLogic for streaming voice flow)
  // These let the app logic drive the state machine during streaming TTS,
  // bypassing the monolithic speak() method.
  // ============================================================================

  /** Signal that streaming TTS has started (updates UI to speaking state). */
  const beginSpeaking = useCallback(() => {
    console.log('[VoiceAgent] 🔊 beginSpeaking — transitioning to SPEAKING state');
    dispatch({ type: 'START_SPEAKING' });
    speakingRef.current = true;
    interruptedRef.current = false;
    stopMicTimer();
    if (isMountedRef.current) setIsTTSSpeaking(true);
  }, [dispatch, stopMicTimer]);

  /** Signal that all streaming TTS is done. Handles loop-back if active. */
  const finishSpeaking = useCallback(() => {
    console.log('[VoiceAgent] ✅ finishSpeaking — all TTS done, transitioning to IDLE');
    speakingRef.current = false;
    if (isMountedRef.current) {
      setCurrentSpokenWordIndex(-1);
      setWordsBuffer([]);
      setIsTTSSpeaking(false);
    }

    dispatch({ type: 'FINISH_SPEAKING' });

    if (isConversationActiveRef.current && isMountedRef.current && !interruptedRef.current) {
      // Loop-back: echo prevention delay before restarting mic
      if (recognitionRestartTimeoutRef.current) {
        window.clearTimeout(recognitionRestartTimeoutRef.current);
      }
      recognitionRestartTimeoutRef.current = window.setTimeout(() => {
        if (isConversationActiveRef.current && isMountedRef.current && !interruptedRef.current) {
          startListeningFnRef.current?.();
        }
        recognitionRestartTimeoutRef.current = null;
      }, loopBackDelayMs);
    } else {
      setInputMode('idle');
    }
  }, [dispatch]);

  // ============================================================================
  // INTERRUPT (Barge-in) & END CONVERSATION
  // ============================================================================

  const onInterruptRef = useRef(onInterrupt);
  useEffect(() => { onInterruptRef.current = onInterrupt; }, [onInterrupt]);

  const interrupt = useCallback(() => {
    console.log('[VoiceAgent] 🛑 Interrupt triggered');
    interruptedRef.current = true;

    // CRITICAL: Abort active stream in useAppLogic (barge-in)
    onInterruptRef.current?.();

    // CRITICAL: Stop the conversation loop
    isConversationActiveRef.current = false;
    if (isMountedRef.current) setIsConversationActive(false);

    // Clear any pending restart timeout
    if (recognitionRestartTimeoutRef.current) {
      window.clearTimeout(recognitionRestartTimeoutRef.current);
      recognitionRestartTimeoutRef.current = null;
    }

    voiceService.stopSpeaking();
    cancelAllTTS();
    stopMicTimer();
    cleanup();
    dispatch({ type: 'INTERRUPT' });
  }, [cleanup, dispatch, cancelAllTTS, stopMicTimer]);

  // End conversation without interrupting current speech
  const endConversation = useCallback(() => {
    console.log('[VoiceAgent] 🏁 Ending conversation loop');
    isConversationActiveRef.current = false;
    if (isMountedRef.current) setIsConversationActive(false);

    if (recognitionRestartTimeoutRef.current) {
      window.clearTimeout(recognitionRestartTimeoutRef.current);
      recognitionRestartTimeoutRef.current = null;
    }
  }, []);

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

    // AUTO-RESUME: Activate conversation loop on first listen
    // This enables the LISTENING → THINKING → SPEAKING → LISTENING cycle
    if (!isConversationActiveRef.current) {
      console.log('[VoiceAgent] 🔄 Activating conversation loop');
      sessionActiveRef.current = true;
      isConversationActiveRef.current = true;
      interruptedRef.current = false;
      if (isMountedRef.current) setIsConversationActive(true);
      // Fire-and-forget audio priming (we're already in a user gesture context)
      wakeUpAudio().catch(() => {});
    }

    setError(null);
    transcriptRef.current = '';
    setPartialTranscript('');
    setVadProgress(0);
    setTranscriptConfidence(1);
    setInputMode('voice');

    startMicTimer();
    voiceCapture.startCapture();
    dispatch({ type: 'START_LISTENING' });

    console.log('[VoiceAgent] ✅ Listening started');
  }, [dispatch, voiceCapture, startMicTimer, cancelAllTTS, setError, wakeUpAudio]);

  // Keep ref in sync so finishSpeaking can call startListening without circular deps
  startListeningFnRef.current = startListening;

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

            // ================================================================
            // LOOP-BACK FIX: Auto-restart recognition if conversation active
            // This is the CRITICAL fix for the One-Shot Idle bug
            // ================================================================
            if (isConversationActiveRef.current && !interruptedRef.current && isMountedRef.current) {
              console.log('[VoiceAgent] 🔄 Loop-back: Scheduling recognition restart...');

              // Clear any existing restart timeout
              if (recognitionRestartTimeoutRef.current) {
                window.clearTimeout(recognitionRestartTimeoutRef.current);
              }

              // Echo prevention delay before restarting mic
              recognitionRestartTimeoutRef.current = window.setTimeout(() => {
                if (isConversationActiveRef.current && isMountedRef.current && !interruptedRef.current) {
                  console.log('[VoiceAgent] 🎤 Loop-back: Restarting recognition');
                  // Don't resolve yet - let the loop continue
                  // The listening will handle the next cycle
                }
                recognitionRestartTimeoutRef.current = null;
              }, loopBackDelayMs);
            }

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
        console.log('[VoiceAgent] ✅ Speech complete');

        // ================================================================
        // LOOP-BACK FIX: Check if conversation should continue
        // ================================================================
        if (isConversationActiveRef.current) {
          console.log('[VoiceAgent] 🔄 Conversation active - auto-restarting listening');

          // Clear pending restart timeout
          if (recognitionRestartTimeoutRef.current) {
            window.clearTimeout(recognitionRestartTimeoutRef.current);
            recognitionRestartTimeoutRef.current = null;
          }

          // Transition to idle momentarily, then restart
          dispatch({ type: 'FINISH_SPEAKING' });

          // Echo prevention delay before restarting microphone
          recognitionRestartTimeoutRef.current = window.setTimeout(() => {
            if (isConversationActiveRef.current && isMountedRef.current && !interruptedRef.current) {
              console.log('[VoiceAgent] 🎤 Loop-back: Starting new listening cycle');
              startListening();
            }
            recognitionRestartTimeoutRef.current = null;
          }, loopBackDelayMs);

        } else {
          // No loop-back, just go to idle
          console.log('[VoiceAgent] ⏹️ Conversation ended - transitioning to IDLE');
          dispatch({ type: 'FINISH_SPEAKING' });
          setInputMode('idle');
          voiceService.stopListening();
        }
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
  }, [dispatch, stopMicTimer, startListening]);

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
      isConversationActiveRef.current = false;

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
      if (recognitionRestartTimeoutRef.current) {
        window.clearTimeout(recognitionRestartTimeoutRef.current);
        recognitionRestartTimeoutRef.current = null;
      }

      // Cancel all speech
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      activeUtteranceRef.current = null;
      (window as any).__voiceAgentUtterance = null;
      (window as any).__voiceAgentPrimer = null;
      (window as any).__voiceAgentUnlocker = null;

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
    isConversationActive,
    detectedLang,
    keepAliveActive,
    startListening,
    stopListening,
    speak,
    beginSpeaking,
    finishSpeaking,
    interrupt,
    endConversation, // NEW: End loop without interrupting
    setError,
    setInputMode,
    retryFailed,
    clearFailedMessage,
    dispatch,
    wakeUpAudio,
  };
};

export default useVoiceAgent;
