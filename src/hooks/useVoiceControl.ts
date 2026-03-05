// useVoiceControl - 2026 Premium Simplified Voice Control Hook
// Provides a clean, unified API for voice interaction
// Wraps Web Speech API for STT (webkitSpeechRecognition) and TTS (speechSynthesis)
// Designed for Bilingual Mediator Voice Bot

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AppSettings } from '../types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type VoiceControlState =
  | 'idle'           // Ready, not listening or speaking
  | 'listening'      // Actively capturing user speech
  | 'processing'     // Processing/translating speech
  | 'speaking'       // Bot is speaking response
  | 'error';         // Error state

export type BotStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface VoiceControlConfig {
  /** Language for speech recognition (default: 'en-US') */
  recognitionLang?: string;
  /** Language for speech synthesis (default: 'en-US') */
  synthesisLang?: string;
  /** Enable continuous recognition (default: false) */
  continuous?: boolean;
  /** Enable interim results (default: true) */
  interimResults?: boolean;
  /** Speech rate for TTS (0.1 - 10, default: 1) */
  speechRate?: number;
  /** Speech pitch for TTS (0 - 2, default: 1) */
  speechPitch?: number;
  /** Speech volume for TTS (0 - 1, default: 1) */
  speechVolume?: number;
  /** Enable whisper mode (lower volume, slower rate) */
  whisperMode?: boolean;
  /** Enable TTS for bot responses (default: true) */
  speakResponses?: boolean;
  /** Silence timeout in ms before auto-submit (default: 2500) */
  silenceTimeout?: number;
  /** Minimum transcript length to submit (default: 4) */
  minTranscriptLength?: number;
  /** Callback when user finishes speaking */
  onTranscript?: (text: string, confidence: number) => void;
  /** Callback for interim/partial transcripts */
  onInterimTranscript?: (text: string) => void;
  /** Callback when bot starts speaking */
  onSpeakStart?: () => void;
  /** Callback when bot finishes speaking */
  onSpeakEnd?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

export interface VoiceControlReturn {
  // State
  state: VoiceControlState;
  botStatus: BotStatus;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  isIdle: boolean;
  error: string | null;

  // Transcript data
  transcript: string;
  interimTranscript: string;
  confidence: number;

  // TTS state
  isMuted: boolean;

  // Silence countdown
  silenceProgress: number;
  isSilenceCountdown: boolean;

  // Actions
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, lang?: string) => Promise<void>;
  stopSpeaking: () => void;
  stopEverything: () => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  clearError: () => void;
  reset: () => void;

  // Browser support
  isSupported: boolean;
  hasMicPermission: boolean | null;
  requestMicPermission: () => Promise<boolean>;
}

// ============================================================================
// CONFIGURATION DEFAULTS
// ============================================================================

const DEFAULT_CONFIG: Required<VoiceControlConfig> = {
  recognitionLang: 'en-US',
  synthesisLang: 'en-US',
  continuous: false,
  interimResults: true,
  speechRate: 1,
  speechPitch: 1,
  speechVolume: 1,
  whisperMode: false,
  speakResponses: true,
  silenceTimeout: 2500,
  minTranscriptLength: 4,
  onTranscript: () => {},
  onInterimTranscript: () => {},
  onSpeakStart: () => {},
  onSpeakEnd: () => {},
  onError: () => {},
};

// ============================================================================
// BROWSER COMPATIBILITY CHECK
// ============================================================================

const checkBrowserSupport = (): boolean => {
  if (typeof window === 'undefined') return false;

  const hasSpeechRecognition = !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
  const hasSpeechSynthesis = !!window.speechSynthesis;

  return hasSpeechRecognition && hasSpeechSynthesis;
};

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useVoiceControl(config: VoiceControlConfig = {}): VoiceControlReturn {
  // Merge config with defaults
  const cfg = useMemo(() => ({
    ...DEFAULT_CONFIG,
    ...config,
  }), [config]);

  // State
  const [state, setState] = useState<VoiceControlState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [confidence, setConfidence] = useState(1);
  const [isMuted, setIsMuted] = useState(!cfg.speakResponses);
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [isSilenceCountdown, setIsSilenceCountdown] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number>(0);
  const progressIntervalRef = useRef<number | null>(null);
  const transcriptBufferRef = useRef<string>('');
  const isAbortedRef = useRef<boolean>(false);
  const stateRef = useRef<VoiceControlState>('idle');
  const configRef = useRef(cfg);

  // Keep refs in sync
  useEffect(() => {
    configRef.current = cfg;
  }, [cfg]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Browser support check
  const isSupported = useMemo(() => checkBrowserSupport(), []);

  // ============================================================================
  // CLEANUP UTILITIES
  // ============================================================================

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setSilenceProgress(0);
    setIsSilenceCountdown(false);
  }, []);

  const abortRecognition = useCallback(() => {
    if (recognitionRef.current) {
      isAbortedRef.current = true;
      try {
        recognitionRef.current.abort();
      } catch (e) {
        // Ignore abort errors
      }
      recognitionRef.current = null;
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

  // ============================================================================
  // STOP EVERYTHING - CRITICAL FUNCTION
  // ============================================================================
  // This is the master stop function that kills all audio processing
  // User requirement: Must immediately stop recognition + synthesis
  // ============================================================================

  const stopEverything = useCallback(() => {
    // 1. Stop speech recognition
    abortRecognition();

    // 2. Stop speech synthesis (silence the bot)
    cancelSpeech();

    // 3. Clear silence timer
    clearSilenceTimer();

    // 4. Reset all state
    setState('idle');
    setTranscript('');
    setInterimTranscript('');
    transcriptBufferRef.current = '';
    isAbortedRef.current = false;
    setError(null);

    console.log('[VoiceControl] All audio processing stopped');
  }, [abortRecognition, cancelSpeech, clearSilenceTimer]);

  // ============================================================================
  // MICROPHONE PERMISSION
  // ============================================================================

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasMicPermission(false);
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setHasMicPermission(true);
      return true;
    } catch (err) {
      console.warn('[VoiceControl] Microphone permission denied:', err);
      setHasMicPermission(false);
      return false;
    }
  }, []);

  // ============================================================================
  // SILENCE TIMER (Smart-Silence Logic)
  // ============================================================================

  const startSilenceCountdown = useCallback(() => {
    clearSilenceTimer();

    if (stateRef.current !== 'listening') return;

    setIsSilenceCountdown(true);
    silenceStartRef.current = Date.now();

    // Progress update interval for countdown visualization
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - silenceStartRef.current;
      const progress = Math.min((elapsed / configRef.current.silenceTimeout) * 100, 100);
      setSilenceProgress(progress);
    }, 50);

    // The actual submission timer
    silenceTimerRef.current = window.setTimeout(() => {
      clearSilenceTimer();

      const finalTranscript = transcriptBufferRef.current.trim();

      // Min-length filter
      if (finalTranscript.length < configRef.current.minTranscriptLength) {
        console.log(`[VoiceControl] Ignoring short transcript: "${finalTranscript}"`);
        transcriptBufferRef.current = '';
        setTranscript('');
        setInterimTranscript('');
        return;
      }

      // Submit the transcript
      setTranscript(finalTranscript);
      setState('processing');
      configRef.current.onTranscript?.(finalTranscript, confidence);

      // Clean up
      abortRecognition();
      transcriptBufferRef.current = '';

    }, configRef.current.silenceTimeout);
  }, [clearSilenceTimer, abortRecognition, confidence]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    if (stateRef.current === 'listening') {
      startSilenceCountdown();
    }
  }, [clearSilenceTimer, startSilenceCountdown]);

  // ============================================================================
  // START LISTENING
  // ============================================================================

  const startListening = useCallback(async () => {
    if (!isSupported) {
      const errorMsg = 'Speech recognition not supported in this browser';
      setError(errorMsg);
      setState('error');
      configRef.current.onError?.(errorMsg);
      return;
    }

    // Check mic permission
    if (hasMicPermission === false) {
      const hasPermission = await requestMicPermission();
      if (!hasPermission) {
        const errorMsg = 'Microphone access denied';
        setError(errorMsg);
        setState('error');
        configRef.current.onError?.(errorMsg);
        return;
      }
    }

    // Clean up any existing recognition
    stopEverything();

    // Create new recognition instance
    const SpeechRecognitionAPI = (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;
    isAbortedRef.current = false;

    // Configure recognition
    recognition.continuous = configRef.current.continuous;
    recognition.interimResults = configRef.current.interimResults;
    recognition.lang = configRef.current.recognitionLang;
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onstart = () => {
      setState('listening');
      setError(null);
      transcriptBufferRef.current = '';
      startSilenceCountdown();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (isAbortedRef.current) return;

      let finalText = '';
      let interim = '';
      let resultConfidence = 1;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        resultConfidence = result[0].confidence || 0.9;

        if (result.isFinal) {
          finalText += text;
        } else {
          interim += text;
        }
      }

      if (finalText) {
        transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + finalText.trim();
        setTranscript(transcriptBufferRef.current);
      }

      if (interim) {
        setInterimTranscript(interim);
        configRef.current.onInterimTranscript?.(transcriptBufferRef.current + ' ' + interim);
      }

      setConfidence(resultConfidence);
      resetSilenceTimer();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (isAbortedRef.current) return;

      // Map error to user-friendly message
      const errorMessages: Record<string, string> = {
        'not-allowed': 'Microphone access denied',
        'no-speech': 'No speech detected',
        'audio-capture': 'No microphone found',
        'network': 'Network error - check your connection',
        'aborted': 'Recognition was interrupted',
      };

      const errorMsg = errorMessages[event.error] || `Speech recognition error: ${event.error}`;

      // Ignore 'no-speech' and 'aborted' as they're expected
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }

      setError(errorMsg);
      setState('error');
      configRef.current.onError?.(errorMsg);
      clearSilenceTimer();
    };

    recognition.onend = () => {
      if (isAbortedRef.current) return;

      // If we have a valid transcript, submit it
      const finalTranscript = transcriptBufferRef.current.trim();
      if (finalTranscript.length >= configRef.current.minTranscriptLength) {
        setTranscript(finalTranscript);
        setState('processing');
        configRef.current.onTranscript?.(finalTranscript, confidence);
      } else {
        setState('idle');
      }

      clearSilenceTimer();
    };

    // Start recognition
    try {
      recognition.start();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start recognition';
      setError(errorMsg);
      setState('error');
      configRef.current.onError?.(errorMsg);
    }
  }, [
    isSupported,
    hasMicPermission,
    requestMicPermission,
    stopEverything,
    startSilenceCountdown,
    resetSilenceTimer,
    clearSilenceTimer,
    confidence,
  ]);

  // ============================================================================
  // STOP LISTENING
  // ============================================================================

  const stopListening = useCallback(() => {
    clearSilenceTimer();

    const finalTranscript = transcriptBufferRef.current.trim();

    if (finalTranscript.length >= configRef.current.minTranscriptLength) {
      setTranscript(finalTranscript);
      setState('processing');
      configRef.current.onTranscript?.(finalTranscript, confidence);
    } else {
      setState('idle');
    }

    abortRecognition();
    transcriptBufferRef.current = '';
    setInterimTranscript('');
  }, [clearSilenceTimer, abortRecognition, confidence]);

  // ============================================================================
  // SPEAK (TTS)
  // ============================================================================

  const speak = useCallback(async (text: string, lang?: string): Promise<void> => {
    if (!isSupported) {
      console.warn('[VoiceControl] Speech synthesis not supported');
      return;
    }

    // Respect mute setting
    if (isMuted) {
      console.log('[VoiceControl] TTS is muted, skipping speech');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Cancel any ongoing speech
        cancelSpeech();

        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;

        // Configure utterance
        utterance.lang = lang || configRef.current.synthesisLang;
        utterance.rate = configRef.current.whisperMode ? 0.8 : configRef.current.speechRate;
        utterance.pitch = configRef.current.speechPitch;
        utterance.volume = configRef.current.whisperMode ? 0.4 : configRef.current.speechVolume;

        // Try to find a matching voice
        const voices = window.speechSynthesis.getVoices();
        const targetLang = utterance.lang;
        const voice = voices.find(v => v.lang === targetLang) ||
          voices.find(v => v.lang.startsWith(targetLang.split('-')[0])) ||
          voices.find(v => v.lang.startsWith('en'));

        if (voice) {
          utterance.voice = voice;
        }

        // Event handlers
        utterance.onstart = () => {
          setState('speaking');
          configRef.current.onSpeakStart?.();
        };

        utterance.onend = () => {
          setState('idle');
          utteranceRef.current = null;
          configRef.current.onSpeakEnd?.();
          resolve();
        };

        utterance.onerror = (event) => {
          utteranceRef.current = null;

          // Ignore 'interrupted' errors (intentional stop)
          if (event.error === 'interrupted' || event.error === 'canceled') {
            setState('idle');
            resolve();
            return;
          }

          const errorMsg = `Speech synthesis error: ${event.error}`;
          setError(errorMsg);
          setState('error');
          configRef.current.onError?.(errorMsg);
          reject(new Error(errorMsg));
        };

        // Chrome workaround: Ensure not paused before speaking
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        window.speechSynthesis.speak(utterance);

        // Chrome 15-second bug workaround
        const resumeInterval = setInterval(() => {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        }, 200);

        utterance.onend = () => {
          clearInterval(resumeInterval);
          setState('idle');
          utteranceRef.current = null;
          configRef.current.onSpeakEnd?.();
          resolve();
        };

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Speech synthesis failed';
        setError(errorMsg);
        setState('error');
        configRef.current.onError?.(errorMsg);
        reject(new Error(errorMsg));
      }
    });
  }, [isSupported, isMuted, cancelSpeech]);

  // ============================================================================
  // STOP SPEAKING
  // ============================================================================

  const stopSpeaking = useCallback(() => {
    cancelSpeech();
    if (stateRef.current === 'speaking') {
      setState('idle');
    }
  }, [cancelSpeech]);

  // ============================================================================
  // MUTE CONTROLS
  // ============================================================================

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const setMutedState = useCallback((muted: boolean) => {
    setIsMuted(muted);
  }, []);

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const clearError = useCallback(() => {
    setError(null);
    if (stateRef.current === 'error') {
      setState('idle');
    }
  }, []);

  const reset = useCallback(() => {
    stopEverything();
    setError(null);
    setConfidence(1);
  }, [stopEverything]);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isProcessing = state === 'processing';
  const isIdle = state === 'idle';

  const botStatus: BotStatus = useMemo(() => {
    return state as BotStatus;
  }, [state]);

  // ============================================================================
  // CLEANUP ON UNMOUNT
  // ============================================================================

  useEffect(() => {
    return () => {
      stopEverything();
    };
  }, [stopEverything]);

  // ============================================================================
  // VISIBILITY CHANGE HANDLER (stop on tab hide)
  // ============================================================================

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && stateRef.current === 'listening') {
        stopListening();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [stopListening]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    state,
    botStatus,
    isListening,
    isSpeaking,
    isProcessing,
    isIdle,
    error,

    // Transcript data
    transcript,
    interimTranscript,
    confidence,

    // TTS state
    isMuted,

    // Silence countdown
    silenceProgress,
    isSilenceCountdown,

    // Actions
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    stopEverything,
    toggleMute,
    setMuted: setMutedState,
    clearError,
    reset,

    // Browser support
    isSupported,
    hasMicPermission,
    requestMicPermission,
  };
}

// ============================================================================
// HELPER: Create config from AppSettings
// ============================================================================

export function createVoiceConfigFromSettings(settings: AppSettings): VoiceControlConfig {
  return {
    speechRate: settings.speechRate,
    whisperMode: settings.whisperMode,
    speakResponses: settings.speakResponses,
  };
}

export default useVoiceControl;
