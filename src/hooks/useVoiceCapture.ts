// 2026 Standard: Voice Capture Engine with Smart-Silence Reset Logic
// Features: Continuous stream, 2.5s anchor timer, min-length filter, ghost prevention

import { useState, useCallback, useEffect, useRef } from 'react';

// === CAPTURE STATE MACHINE ===
export type CaptureState =
  | 'IDLE'           // Not listening
  | 'LISTENING'      // Mic active, waiting for speech
  | 'CAPTURING'      // Actively receiving speech input
  | 'STABLE_SILENCE' // 2.5s timer running, may submit
  | 'SUBMITTING';    // Finalizing and sending transcript

// State transition guards
const VALID_TRANSITIONS: Record<CaptureState, CaptureState[]> = {
  IDLE: ['LISTENING'],
  LISTENING: ['IDLE', 'CAPTURING'],
  CAPTURING: ['IDLE', 'STABLE_SILENCE'],
  STABLE_SILENCE: ['IDLE', 'CAPTURING', 'SUBMITTING'],
  SUBMITTING: ['IDLE'],
};

// === CONFIGURATION ===
const CONFIG = {
  SILENCE_TIMEOUT_MS: 2500,        // 2.5s silence anchor
  MIN_TRANSCRIPT_LENGTH: 4,        // Ignore < 4 chars (coughs, "um")
  COUNTDOWN_UPDATE_INTERVAL: 50,   // Update progress every 50ms
  SLOW_SPEAKER_THRESHOLD: 80,      // WPM for slow speaker detection
  FAST_SPEAKER_THRESHOLD: 150,     // WPM for fast speaker detection
};

// === INTERFACES ===
export interface CaptureResult {
  transcript: string;
  confidence: number;
  wordCount: number;
  duration: number;
}

export interface VoiceCaptureState {
  captureState: CaptureState;
  fullTranscript: string;
  interimTranscript: string;
  silenceProgress: number;         // 0-100, for countdown ring
  confidence: number;
  error: string | null;
  isCapturing: boolean;
  isSilenceCountdown: boolean;
}

interface UseVoiceCaptureProps {
  onInterimUpdate?: (text: string) => void;
  onFinalSubmit?: (result: CaptureResult) => void;
  onError?: (error: string) => void;
  onStateChange?: (state: CaptureState) => void;
}

interface UseVoiceCaptureReturn extends VoiceCaptureState {
  startCapture: () => void;
  stopCapture: () => void;
  cancelCapture: () => void;
  resetCapture: () => void;
}

// === HOOK ===
export const useVoiceCapture = ({
  onInterimUpdate,
  onFinalSubmit,
  onError,
  onStateChange,
}: UseVoiceCaptureProps = {}): UseVoiceCaptureReturn => {
  // === STATE ===
  const [captureState, setCaptureState] = useState<CaptureState>('IDLE');
  const [fullTranscript, setFullTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [confidence, setConfidence] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // === REFS (avoid stale closures) ===
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number>(0);
  const captureStartRef = useRef<number>(0);
  const transcriptBufferRef = useRef<string>('');
  const wordCountRef = useRef<number>(0);
  const stateRef = useRef<CaptureState>('IDLE');
  const streamRef = useRef<MediaStream | null>(null);
  const isAbortedRef = useRef<boolean>(false);
  const lastResultIndexRef = useRef<number>(0);

  // Keep state ref in sync
  useEffect(() => {
    stateRef.current = captureState;
    onStateChange?.(captureState);
  }, [captureState, onStateChange]);

  // === STATE TRANSITION ===
  const transitionTo = useCallback((nextState: CaptureState) => {
    const currentState = stateRef.current;

    if (!VALID_TRANSITIONS[currentState].includes(nextState)) {
      console.warn(`[VoiceCapture] Invalid transition: ${currentState} → ${nextState}`);
      return false;
    }

    setCaptureState(nextState);
    return true;
  }, []);

  // === CLEANUP UTILITIES ===
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
  }, []);

  const stopMediaStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
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

  // === FULL CLEANUP (Ghost Prevention) ===
  const fullCleanup = useCallback(() => {
    clearSilenceTimer();
    abortRecognition();
    stopMediaStream();

    // Reset all state
    setFullTranscript('');
    setInterimTranscript('');
    setSilenceProgress(0);
    setConfidence(1);
    setError(null);

    // Reset refs
    transcriptBufferRef.current = '';
    wordCountRef.current = 0;
    lastResultIndexRef.current = 0;
    isAbortedRef.current = false;
  }, [clearSilenceTimer, abortRecognition, stopMediaStream]);

  // === SMART-SILENCE TIMER LOGIC ===
  const startSilenceCountdown = useCallback(() => {
    clearSilenceTimer();

    if (stateRef.current !== 'CAPTURING') return;

    transitionTo('STABLE_SILENCE');
    silenceStartRef.current = Date.now();

    // Progress update interval for countdown ring
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - silenceStartRef.current;
      const progress = Math.min((elapsed / CONFIG.SILENCE_TIMEOUT_MS) * 100, 100);
      setSilenceProgress(progress);
    }, CONFIG.COUNTDOWN_UPDATE_INTERVAL);

    // The actual submission timer
    silenceTimerRef.current = window.setTimeout(() => {
      clearSilenceTimer();

      const transcript = transcriptBufferRef.current.trim();

      // Min-length filter: ignore short fragments
      if (transcript.length < CONFIG.MIN_TRANSCRIPT_LENGTH) {
        console.log(`[VoiceCapture] Ignoring short transcript: "${transcript}"`);
        // Reset and keep listening
        transcriptBufferRef.current = '';
        setFullTranscript('');
        setInterimTranscript('');

        if (stateRef.current === 'STABLE_SILENCE') {
          transitionTo('CAPTURING');
        }
        return;
      }

      // Valid transcript - submit
      if (transitionTo('SUBMITTING')) {
        const duration = Date.now() - captureStartRef.current;
        const result: CaptureResult = {
          transcript,
          confidence,
          wordCount: wordCountRef.current,
          duration,
        };

        onFinalSubmit?.(result);

        // Cleanup and return to IDLE
        abortRecognition();
        stopMediaStream();
        clearSilenceTimer();

        setFullTranscript('');
        setInterimTranscript('');
        transcriptBufferRef.current = '';
        wordCountRef.current = 0;
        lastResultIndexRef.current = 0;

        transitionTo('IDLE');
      }
    }, CONFIG.SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, transitionTo, confidence, onFinalSubmit, abortRecognition, stopMediaStream]);

  // === RESET SILENCE TIMER (Called on every result) ===
  const resetSilenceTimer = useCallback(() => {
    // Cancel any pending silence timer
    clearSilenceTimer();

    // If we're in STABLE_SILENCE, go back to CAPTURING
    if (stateRef.current === 'STABLE_SILENCE') {
      transitionTo('CAPTURING');
    }

    // Start new countdown
    startSilenceCountdown();
  }, [clearSilenceTimer, transitionTo, startSilenceCountdown]);

  // === START CAPTURE ===
  const startCapture = useCallback(async () => {
    // Ghost prevention: Full cleanup before starting
    fullCleanup();

    // Only start from IDLE
    if (stateRef.current !== 'IDLE') {
      console.warn('[VoiceCapture] Cannot start - not in IDLE state');
      return;
    }

    // Check for SpeechRecognition support
    const SpeechRecognitionAPI =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setError('Speech recognition not supported in this browser');
      onError?.('SPEECH_RECOGNITION_NOT_SUPPORTED');
      return;
    }

    try {
      // Request microphone permission
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
    } catch (err) {
      setError('Microphone access denied');
      onError?.('MIC_PERMISSION_DENIED');
      return;
    }

    transitionTo('LISTENING');
    captureStartRef.current = Date.now();
    isAbortedRef.current = false;

    // Create fresh recognition instance
    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    // === CONTINUOUS STREAM PROTOCOL ===
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // === RESULT HANDLER (Core Smart-Silence Logic) ===
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (isAbortedRef.current) return;

      let finalText = '';
      let interimText = '';
      let resultConfidence = 1;

      // Process only new results
      for (let i = lastResultIndexRef.current; i < event.results.length; i++) {
        const result = event.results[i];
        const alternative = result[0];

        if (result.isFinal) {
          finalText += alternative.transcript;
          resultConfidence = alternative.confidence || 0.9;
          lastResultIndexRef.current = i + 1;
        } else {
          interimText += alternative.transcript;
          resultConfidence = alternative.confidence || 0.7;
        }
      }

      // Update confidence
      if (resultConfidence > 0) {
        setConfidence(resultConfidence);
      }

      // Accumulate final transcript
      if (finalText) {
        transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + finalText.trim();
        setFullTranscript(transcriptBufferRef.current);

        // Count words
        const words = finalText.trim().split(/\s+/).filter(w => w.length > 0);
        wordCountRef.current += words.length;
      }

      // Show interim results (grayed out in UI)
      const displayInterim = interimText.trim();
      setInterimTranscript(displayInterim);
      onInterimUpdate?.(transcriptBufferRef.current + (displayInterim ? ' ' + displayInterim : ''));

      // Transition to CAPTURING if we're still in LISTENING
      if (stateRef.current === 'LISTENING') {
        transitionTo('CAPTURING');
      }

      // === CRITICAL: Reset the 2.5s timer on EVERY result ===
      // Even interim results (single syllables) reset the timer
      resetSilenceTimer();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (isAbortedRef.current) return;

      const errorMessages: Record<string, string> = {
        'not-allowed': 'Microphone access denied',
        'network': 'Network error - check connection',
        'no-speech': 'No speech detected',
        'aborted': 'Recognition aborted',
      };

      const message = errorMessages[event.error] || event.error;

      // Don't report 'no-speech' as error if we have transcript
      if (event.error === 'no-speech' && transcriptBufferRef.current.trim()) {
        // Treat as natural end of speech
        startSilenceCountdown();
        return;
      }

      setError(message);
      onError?.(event.error);
      fullCleanup();
      transitionTo('IDLE');
    };

    recognition.onend = () => {
      if (isAbortedRef.current) return;

      // Recognition ended - if we have transcript, submit it
      const transcript = transcriptBufferRef.current.trim();

      if (transcript.length >= CONFIG.MIN_TRANSCRIPT_LENGTH) {
        clearSilenceTimer();

        if (transitionTo('SUBMITTING')) {
          const duration = Date.now() - captureStartRef.current;
          const result: CaptureResult = {
            transcript,
            confidence,
            wordCount: wordCountRef.current,
            duration,
          };

          onFinalSubmit?.(result);
        }
      }

      fullCleanup();
      transitionTo('IDLE');
    };

    recognition.onspeechstart = () => {
      if (stateRef.current === 'LISTENING') {
        transitionTo('CAPTURING');
      }
    };

    recognition.onspeechend = () => {
      // Speech ended - start silence countdown
      if (stateRef.current === 'CAPTURING') {
        startSilenceCountdown();
      }
    };

    // Start recognition
    try {
      recognition.start();
    } catch (e) {
      console.error('[VoiceCapture] Recognition start error:', e);
      setError('Failed to start voice recognition');
      fullCleanup();
      transitionTo('IDLE');
    }
  }, [
    fullCleanup,
    transitionTo,
    onError,
    resetSilenceTimer,
    onInterimUpdate,
    startSilenceCountdown,
    clearSilenceTimer,
    onFinalSubmit,
    confidence,
  ]);

  // === STOP CAPTURE (Manual stop - submit if valid) ===
  const stopCapture = useCallback(() => {
    clearSilenceTimer();

    const transcript = transcriptBufferRef.current.trim();

    if (transcript.length >= CONFIG.MIN_TRANSCRIPT_LENGTH) {
      if (transitionTo('SUBMITTING')) {
        const duration = Date.now() - captureStartRef.current;
        const result: CaptureResult = {
          transcript,
          confidence,
          wordCount: wordCountRef.current,
          duration,
        };

        onFinalSubmit?.(result);
      }
    }

    fullCleanup();
    transitionTo('IDLE');
  }, [clearSilenceTimer, transitionTo, confidence, onFinalSubmit, fullCleanup]);

  // === CANCEL CAPTURE (Discard everything) ===
  const cancelCapture = useCallback(() => {
    fullCleanup();
    transitionTo('IDLE');
  }, [fullCleanup, transitionTo]);

  // === RESET CAPTURE ===
  const resetCapture = useCallback(() => {
    fullCleanup();
    setCaptureState('IDLE');
  }, [fullCleanup]);

  // === LIFECYCLE CLEANUP ===
  useEffect(() => {
    return () => {
      fullCleanup();
    };
  }, [fullCleanup]);

  // === VISIBILITY CHANGE HANDLER ===
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && stateRef.current !== 'IDLE') {
        cancelCapture();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cancelCapture]);

  // === DERIVED STATE ===
  const isCapturing = captureState === 'CAPTURING' || captureState === 'STABLE_SILENCE';
  const isSilenceCountdown = captureState === 'STABLE_SILENCE';

  return {
    captureState,
    fullTranscript,
    interimTranscript,
    silenceProgress,
    confidence,
    error,
    isCapturing,
    isSilenceCountdown,
    startCapture,
    stopCapture,
    cancelCapture,
    resetCapture,
  };
};

export default useVoiceCapture;
