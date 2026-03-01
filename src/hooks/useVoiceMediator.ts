// useVoiceMediator - 2026 Standard Voice Translation Hook
// Manages Web Speech API (recognition + synthesis) and Gemini translation calls
// Enhanced with comprehensive error handling and recovery mechanisms

import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  MediatorState,
  Participant,
  TranslationEntry,
  MediatorConfig,
  VoiceMediatorReturn,
  SpeechRecognitionEvent,
  LanguageCode,
} from '../types/translator';
import { DEFAULT_MEDIATOR_CONFIG } from '../types/translator';

// Global type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

// ============================================================================
// ERROR TYPES AND CODES
// ============================================================================

export enum TranslatorErrorCode {
  // Browser Support Errors
  SPEECH_RECOGNITION_NOT_SUPPORTED = 'SPEECH_RECOGNITION_NOT_SUPPORTED',
  SPEECH_SYNTHESIS_NOT_SUPPORTED = 'SPEECH_SYNTHESIS_NOT_SUPPORTED',

  // Permission Errors
  MICROPHONE_PERMISSION_DENIED = 'MICROPHONE_PERMISSION_DENIED',
  MICROPHONE_NOT_FOUND = 'MICROPHONE_NOT_FOUND',

  // Recognition Errors
  RECOGNITION_NETWORK_ERROR = 'RECOGNITION_NETWORK_ERROR',
  RECOGNITION_NOT_ALLOWED = 'RECOGNITION_NOT_ALLOWED',
  RECOGNITION_SERVICE_NOT_ALLOWED = 'RECOGNITION_SERVICE_NOT_ALLOWED',
  RECOGNITION_LANGUAGE_NOT_SUPPORTED = 'RECOGNITION_LANGUAGE_NOT_SUPPORTED',
  RECOGNITION_AUDIO_CAPTURE_FAILED = 'RECOGNITION_AUDIO_CAPTURE_FAILED',
  RECOGNITION_ABORTED = 'RECOGNITION_ABORTED',

  // Translation Errors
  TRANSLATION_NETWORK_ERROR = 'TRANSLATION_NETWORK_ERROR',
  TRANSLATION_API_ERROR = 'TRANSLATION_API_ERROR',
  TRANSLATION_TIMEOUT = 'TRANSLATION_TIMEOUT',
  TRANSLATION_EMPTY_RESULT = 'TRANSLATION_EMPTY_RESULT',

  // Synthesis Errors
  SYNTHESIS_ERROR = 'SYNTHESIS_ERROR',
  SYNTHESIS_VOICE_NOT_FOUND = 'SYNTHESIS_VOICE_NOT_FOUND',

  // General Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface TranslatorError {
  code: TranslatorErrorCode;
  message: string;
  details?: string;
  recoverable: boolean;
  retryable: boolean;
}

// Error message mapping for user-friendly messages
const ERROR_MESSAGES: Record<TranslatorErrorCode, { message: string; recoverable: boolean; retryable: boolean }> = {
  [TranslatorErrorCode.SPEECH_RECOGNITION_NOT_SUPPORTED]: {
    message: 'Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.',
    recoverable: false,
    retryable: false,
  },
  [TranslatorErrorCode.SPEECH_SYNTHESIS_NOT_SUPPORTED]: {
    message: 'Speech synthesis is not supported in this browser.',
    recoverable: false,
    retryable: false,
  },
  [TranslatorErrorCode.MICROPHONE_PERMISSION_DENIED]: {
    message: 'Microphone access was denied. Please allow microphone access and try again.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.MICROPHONE_NOT_FOUND]: {
    message: 'No microphone found. Please connect a microphone and try again.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.RECOGNITION_NETWORK_ERROR]: {
    message: 'Network error during speech recognition. Please check your internet connection.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.RECOGNITION_NOT_ALLOWED]: {
    message: 'Speech recognition is not allowed. Please check your browser settings.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.RECOGNITION_SERVICE_NOT_ALLOWED]: {
    message: 'Speech recognition service is not available. Please try again later.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.RECOGNITION_LANGUAGE_NOT_SUPPORTED]: {
    message: 'The selected language is not supported for speech recognition.',
    recoverable: true,
    retryable: false,
  },
  [TranslatorErrorCode.RECOGNITION_AUDIO_CAPTURE_FAILED]: {
    message: 'Failed to capture audio. Please check your microphone.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.RECOGNITION_ABORTED]: {
    message: 'Speech recognition was interrupted.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.TRANSLATION_NETWORK_ERROR]: {
    message: 'Network error during translation. Please check your internet connection.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.TRANSLATION_API_ERROR]: {
    message: 'Translation service error. Please try again.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.TRANSLATION_TIMEOUT]: {
    message: 'Translation request timed out. Please try again.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.TRANSLATION_EMPTY_RESULT]: {
    message: 'Translation returned empty. Please try speaking again.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.SYNTHESIS_ERROR]: {
    message: 'Failed to speak the translation. Please try again.',
    recoverable: true,
    retryable: true,
  },
  [TranslatorErrorCode.SYNTHESIS_VOICE_NOT_FOUND]: {
    message: 'Voice for the target language is not available.',
    recoverable: true,
    retryable: false,
  },
  [TranslatorErrorCode.UNKNOWN_ERROR]: {
    message: 'An unexpected error occurred. Please try again.',
    recoverable: true,
    retryable: true,
  },
};

// Map Web Speech API error types to our error codes
const mapRecognitionError = (error: string): TranslatorErrorCode => {
  switch (error) {
    case 'not-allowed':
      return TranslatorErrorCode.MICROPHONE_PERMISSION_DENIED;
    case 'no-speech':
      return TranslatorErrorCode.RECOGNITION_ABORTED; // Not really an error
    case 'aborted':
      return TranslatorErrorCode.RECOGNITION_ABORTED;
    case 'audio-capture':
      return TranslatorErrorCode.RECOGNITION_AUDIO_CAPTURE_FAILED;
    case 'network':
      return TranslatorErrorCode.RECOGNITION_NETWORK_ERROR;
    case 'service-not-allowed':
      return TranslatorErrorCode.RECOGNITION_SERVICE_NOT_ALLOWED;
    case 'language-not-supported':
      return TranslatorErrorCode.RECOGNITION_LANGUAGE_NOT_SUPPORTED;
    default:
      return TranslatorErrorCode.UNKNOWN_ERROR;
  }
};

// Create error object
const createError = (code: TranslatorErrorCode, details?: string): TranslatorError => {
  const errorInfo = ERROR_MESSAGES[code];
  return {
    code,
    message: errorInfo.message,
    details,
    recoverable: errorInfo.recoverable,
    retryable: errorInfo.retryable,
  };
};

// ============================================================================
// BROWSER COMPATIBILITY CHECK
// ============================================================================

export interface BrowserCompatibility {
  speechRecognition: boolean;
  speechSynthesis: boolean;
  mediaDevices: boolean;
  fullySupported: boolean;
}

export const checkBrowserCompatibility = (): BrowserCompatibility => {
  const speechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const speechSynthesis = !!window.speechSynthesis;
  const mediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  return {
    speechRecognition,
    speechSynthesis,
    mediaDevices,
    fullySupported: speechRecognition && speechSynthesis && mediaDevices,
  };
};

// ============================================================================
// EXTENDED RETURN TYPE WITH ERROR HANDLING
// ============================================================================

export interface VoiceMediatorReturnExtended extends VoiceMediatorReturn {
  // Enhanced error handling
  errorDetails: TranslatorError | null;
  retry: () => void;
  browserCompatibility: BrowserCompatibility;

  // Recovery
  resetSession: () => void;
  checkMicrophonePermission: () => Promise<boolean>;

  // Voice synthesis
  voicesReady: boolean;
  voicesLoading: boolean;
  availableVoices: SpeechSynthesisVoice[];
  initializeSpeechSynthesis: () => void;

  // Session state
  isStarting: boolean;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Custom hook for real-time voice mediation between two speakers
 * Handles speech recognition, translation via Gemini, and speech synthesis
 * Enhanced with comprehensive error handling and recovery mechanisms
 */
export function useVoiceMediator(
  initialConfig?: Partial<MediatorConfig>
): VoiceMediatorReturnExtended {
  // State
  const [state, setState] = useState<MediatorState>('idle');
  const [currentSpeaker, setCurrentSpeaker] = useState<Participant | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<MediatorConfig>({
    ...DEFAULT_MEDIATOR_CONFIG,
    ...initialConfig,
  });
  const [history, setHistory] = useState<TranslationEntry[]>([]);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [lastTranslation, setLastTranslation] = useState<TranslationEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<TranslatorError | null>(null);
  const [browserCompatibility] = useState<BrowserCompatibility>(() => checkBrowserCompatibility());

  // Voice state - store available voices reactively
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesReady, setVoicesReady] = useState(false);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const speechSynthesisInitialized = useRef(false);

  // Refs for Web Speech API instances
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isProcessingRef = useRef(false);
  const shouldContinueRef = useRef(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const lastTranscriptRef = useRef<{ text: string; confidence: number } | null>(null);

  // Guard refs to prevent double-start and race conditions
  const isStartingRef = useRef(false);
  const isRecognitionActiveRef = useRef(false);

  /**
   * Set error with details
   */
  const setErrorWithDetails = useCallback((code: TranslatorErrorCode, details?: string) => {
    const err = createError(code, details);
    setError(err.message);
    setErrorDetails(err);
    setState('error');
    console.error(`[VoiceMediator] Error: ${code}`, details);
  }, []);

  /**
   * Check microphone permission
   */
  const checkMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop all tracks to release the microphone
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.warn('[VoiceMediator] Microphone permission check failed:', err);
      return false;
    }
  }, []);

  /**
   * Initialize speech recognition with error handling
   */
  const initRecognition = useCallback((languageCode: LanguageCode): SpeechRecognition | null => {
    if (!browserCompatibility.speechRecognition) {
      setErrorWithDetails(TranslatorErrorCode.SPEECH_RECOGNITION_NOT_SUPPORTED);
      return null;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = languageCode;
      // maxAlternatives is supported but may not be in all type definitions
      (recognition as any).maxAlternatives = 1;
      return recognition;
    } catch (err) {
      setErrorWithDetails(
        TranslatorErrorCode.UNKNOWN_ERROR,
        `Failed to initialize speech recognition: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      return null;
    }
  }, [browserCompatibility.speechRecognition, setErrorWithDetails]);

  /**
   * Wait for voices to be available (with timeout)
   */
  const waitForVoices = useCallback(async (maxWaitMs = 3000): Promise<SpeechSynthesisVoice[]> => {
    if (!window.speechSynthesis) return [];

    // First check if voices are already available
    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) return voices;

    setVoicesLoading(true);

    // Wait for voices to load (Chrome loads them async)
    return new Promise((resolve) => {
      let waited = 0;
      const interval = 100;

      const finishWithVoices = (v: SpeechSynthesisVoice[]) => {
        setVoicesLoading(false);
        resolve(v);
      };

      const checkVoices = () => {
        voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          finishWithVoices(voices);
          return;
        }

        waited += interval;
        if (waited >= maxWaitMs) {
          console.warn('[VoiceMediator] Timeout waiting for voices');
          finishWithVoices([]);
          return;
        }

        setTimeout(checkVoices, interval);
      };

      // Also listen for the voiceschanged event
      const handleVoicesChanged = () => {
        const v = window.speechSynthesis.getVoices();
        if (v.length > 0) {
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
          finishWithVoices(v);
        }
      };

      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      checkVoices();
    });
  }, []);

  /**
   * Get available voices for a language with fallback
   * Uses the stored availableVoices state for reactive updates
   */
  const getVoiceForLanguage = useCallback((langCode: LanguageCode): SpeechSynthesisVoice | null => {
    if (!window.speechSynthesis) return null;

    // Use state voices first, fallback to direct call
    let voices = availableVoices;
    if (voices.length === 0) {
      voices = window.speechSynthesis.getVoices();
    }

    if (voices.length === 0) {
      console.warn('[VoiceMediator] No voices available for language:', langCode);
      return null;
    }

    const langPrefix = langCode.split('-')[0];

    // Try exact match first
    let voice = voices.find((v) => v.lang === langCode);

    // Fallback to language prefix match (e.g., "hi" for "hi-IN")
    if (!voice) {
      voice = voices.find((v) => v.lang.startsWith(langPrefix + '-'));
    }

    // Fallback to any voice with similar language (case insensitive)
    if (!voice) {
      voice = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()));
    }

    // For Indian languages, also try alternative codes
    if (!voice && langCode.endsWith('-IN')) {
      // Try without region
      voice = voices.find((v) => v.lang.startsWith(langPrefix));
    }

    if (voice) {
      console.log(`[VoiceMediator] Selected voice for ${langCode}:`, voice.name, voice.lang);
    } else {
      console.warn(`[VoiceMediator] No matching voice found for ${langCode}, will use default`);
    }

    return voice || null;
  }, [availableVoices]);

  /**
   * Initialize speech synthesis (Chrome workaround)
   * Chrome requires a user gesture to initialize speechSynthesis
   * This function should be called on first user interaction
   */
  const initializeSpeechSynthesis = useCallback(() => {
    if (speechSynthesisInitialized.current || !window.speechSynthesis) return;

    try {
      // Chrome workaround: Speak empty utterance to initialize
      const initUtterance = new SpeechSynthesisUtterance('');
      initUtterance.volume = 0;
      window.speechSynthesis.speak(initUtterance);
      window.speechSynthesis.cancel();

      // Force load voices
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        setVoicesReady(true);
      }

      speechSynthesisInitialized.current = true;
      console.log('[VoiceMediator] Speech synthesis initialized');
    } catch (err) {
      console.warn('[VoiceMediator] Failed to initialize speech synthesis:', err);
    }
  }, []);

  /**
   * Speak text using Web Speech Synthesis API with error handling
   * Includes Chrome-specific workarounds for common issues
   */
  const speak = useCallback(
    async (text: string, languageCode: LanguageCode): Promise<void> => {
      if (!browserCompatibility.speechSynthesis) {
        throw createError(TranslatorErrorCode.SPEECH_SYNTHESIS_NOT_SUPPORTED);
      }

      if (!text.trim()) {
        return; // Empty text, nothing to speak
      }

      console.log(`[VoiceMediator] Speaking: "${text.substring(0, 50)}..." in ${languageCode}`);

      // Ensure voices are loaded before speaking
      if (!voicesReady || availableVoices.length === 0) {
        console.log('[VoiceMediator] Waiting for voices to load...');
        const loadedVoices = await waitForVoices(3000);
        if (loadedVoices.length > 0 && !voicesReady) {
          setAvailableVoices(loadedVoices);
          setVoicesReady(true);
        }
      }

      return new Promise((resolve, reject) => {
        try {
          // Cancel any ongoing speech first - use multiple cancel calls for Chrome reliability
          window.speechSynthesis.cancel();

          // Small delay after cancel to ensure clean state (Chrome fix)
          setTimeout(() => {
            try {
              // Double-check cancel worked
              if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
              }

              const utterance = new SpeechSynthesisUtterance(text);
              utterance.lang = languageCode;
              utterance.rate = config.speechRate;
              utterance.pitch = 1;
              utterance.volume = 1;

              const voice = getVoiceForLanguage(languageCode);
              if (voice) {
                utterance.voice = voice;
                console.log(`[VoiceMediator] Using voice: ${voice.name} (${voice.lang})`);
              } else {
                // Set language explicitly even without specific voice
                console.warn(`[VoiceMediator] No specific voice for ${languageCode}, using default with lang set`);
              }

              // Timeout for speech synthesis (30 seconds max)
              const timeout = setTimeout(() => {
                console.warn('[VoiceMediator] Speech synthesis timeout');
                cleanup();
                window.speechSynthesis.cancel();
                reject(createError(TranslatorErrorCode.SYNTHESIS_ERROR, 'Speech synthesis timed out'));
              }, 30000);

              // Chrome bug workaround: Keep checking if speaking and resume if paused
              // Chrome pauses after ~15 seconds, so we need to keep resuming
              let resumeInterval: ReturnType<typeof setInterval> | null = null;
              let speakStartTime = 0;

              const startResumeWorkaround = () => {
                speakStartTime = Date.now();
                resumeInterval = setInterval(() => {
                  // Force resume if paused
                  if (window.speechSynthesis.paused) {
                    console.log('[VoiceMediator] Resuming paused speech');
                    window.speechSynthesis.resume();
                  }

                  // Chrome bug: synthesis stops after ~15 seconds
                  // If speaking for too long without progress, force a refresh
                  const elapsed = Date.now() - speakStartTime;
                  if (elapsed > 14000 && window.speechSynthesis.speaking) {
                    window.speechSynthesis.pause();
                    window.speechSynthesis.resume();
                  }
                }, 200);
              };

              const cleanup = () => {
                clearTimeout(timeout);
                if (resumeInterval) {
                  clearInterval(resumeInterval);
                  resumeInterval = null;
                }
                synthesisRef.current = null;
              };

              utterance.onstart = () => {
                console.log('[VoiceMediator] Speech started');
                startResumeWorkaround();
              };

              utterance.onend = () => {
                console.log('[VoiceMediator] Speech ended successfully');
                cleanup();
                resolve();
              };

              utterance.onerror = (event) => {
                console.error('[VoiceMediator] Speech error:', event.error);
                cleanup();

                // Some errors are not critical (e.g., interrupted)
                if (event.error === 'interrupted' || event.error === 'canceled') {
                  resolve();
                  return;
                }

                reject(createError(TranslatorErrorCode.SYNTHESIS_ERROR, `Speech synthesis error: ${event.error}`));
              };

              synthesisRef.current = utterance;

              // Chrome workaround: Ensure not paused before speaking
              if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
              }

              window.speechSynthesis.speak(utterance);
              console.log('[VoiceMediator] Utterance queued, speaking:', window.speechSynthesis.speaking);

              // Another Chrome workaround: If not speaking after a short delay, try resume
              setTimeout(() => {
                if (window.speechSynthesis.pending && !window.speechSynthesis.speaking) {
                  console.log('[VoiceMediator] Forcing resume after delay');
                  window.speechSynthesis.resume();
                }
              }, 100);

            } catch (innerErr) {
              console.error('[VoiceMediator] Inner speak error:', innerErr);
              reject(createError(
                TranslatorErrorCode.SYNTHESIS_ERROR,
                innerErr instanceof Error ? innerErr.message : 'Unknown synthesis error'
              ));
            }
          }, 100); // Small delay after cancel (increased for reliability)

        } catch (err) {
          console.error('[VoiceMediator] Speak error:', err);
          reject(createError(
            TranslatorErrorCode.SYNTHESIS_ERROR,
            err instanceof Error ? err.message : 'Unknown synthesis error'
          ));
        }
      });
    },
    [config.speechRate, getVoiceForLanguage, browserCompatibility.speechSynthesis, voicesReady, availableVoices, waitForVoices]
  );

  /**
   * Translate text using Gemini API with timeout and retry
   */
  const translateText = useCallback(
    async (
      text: string,
      sourceLanguage: string,
      targetLanguage: string,
      retryAttempt = 0
    ): Promise<string> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      try {
        const response = await fetch('/api/ai/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            sourceLanguage,
            targetLanguage,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw createError(
            TranslatorErrorCode.TRANSLATION_API_ERROR,
            `HTTP ${response.status}: ${errorData.error || 'Unknown error'}`
          );
        }

        const data = await response.json();

        if (!data.translatedText || !data.translatedText.trim()) {
          throw createError(TranslatorErrorCode.TRANSLATION_EMPTY_RESULT);
        }

        return data.translatedText;
      } catch (err) {
        clearTimeout(timeoutId);

        // Handle abort (timeout)
        if (err instanceof Error && err.name === 'AbortError') {
          if (retryAttempt < 2) {
            console.log(`[VoiceMediator] Translation timeout, retrying (attempt ${retryAttempt + 1})`);
            return translateText(text, sourceLanguage, targetLanguage, retryAttempt + 1);
          }
          throw createError(TranslatorErrorCode.TRANSLATION_TIMEOUT);
        }

        // Handle network errors
        if (err instanceof TypeError && err.message.includes('fetch')) {
          if (retryAttempt < 2) {
            console.log(`[VoiceMediator] Network error, retrying (attempt ${retryAttempt + 1})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryAttempt + 1)));
            return translateText(text, sourceLanguage, targetLanguage, retryAttempt + 1);
          }
          throw createError(TranslatorErrorCode.TRANSLATION_NETWORK_ERROR);
        }

        // Re-throw TranslatorError as-is
        if ((err as TranslatorError).code) {
          throw err;
        }

        throw createError(
          TranslatorErrorCode.TRANSLATION_API_ERROR,
          err instanceof Error ? err.message : 'Unknown translation error'
        );
      }
    },
    []
  );

  /**
   * Process complete speech: translate and speak with error recovery
   */
  const processTranslation = useCallback(
    async (transcript: string, confidence: number) => {
      if (!transcript.trim() || isProcessingRef.current) return;

      isProcessingRef.current = true;
      setState('processing');
      lastTranscriptRef.current = { text: transcript, confidence };

      const speaker = currentSpeaker;
      const sourceConfig = speaker === 'A' ? config.languageA : config.languageB;
      const targetConfig = speaker === 'A' ? config.languageB : config.languageA;

      try {
        // Translate the text
        const translatedText = await translateText(
          transcript,
          sourceConfig.name,
          targetConfig.name
        );

        // Create translation entry
        const entry: TranslationEntry = {
          id: uuidv4(),
          timestamp: Date.now(),
          speaker: speaker!,
          originalText: transcript,
          originalLanguage: sourceConfig.code,
          translatedText,
          targetLanguage: targetConfig.code,
          confidence,
        };

        setHistory((prev) => [...prev, entry]);
        setLastTranslation(entry);
        setPartialTranscript('');
        retryCountRef.current = 0; // Reset retry count on success

        // Speak the translation
        setState(speaker === 'A' ? 'speaking_b' : 'speaking_a');

        try {
          await speak(translatedText, targetConfig.code);
        } catch (speakError) {
          // Log but don't fail - the translation was still successful
          console.warn('[VoiceMediator] Speech synthesis failed:', speakError);
        }

        // Switch to other speaker and continue if auto-listen is enabled
        if (shouldContinueRef.current && config.autoListen && config.continuousMode) {
          const nextSpeaker: Participant = speaker === 'A' ? 'B' : 'A';
          setCurrentSpeaker(nextSpeaker);
          setTimeout(() => {
            if (shouldContinueRef.current) {
              startListening(nextSpeaker);
            }
          }, 500);
        } else {
          setState('idle');
          setIsActive(false);
        }
      } catch (err) {
        const translatorError = err as TranslatorError;

        if (translatorError.code) {
          setError(translatorError.message);
          setErrorDetails(translatorError);
        } else {
          setErrorWithDetails(
            TranslatorErrorCode.UNKNOWN_ERROR,
            err instanceof Error ? err.message : 'Unknown error'
          );
        }

        setState('error');
      } finally {
        isProcessingRef.current = false;
      }
    },
    [currentSpeaker, config, translateText, speak, setErrorWithDetails]
  );

  /**
   * Start listening for a specific speaker with comprehensive error handling
   */
  const startListening = useCallback(
    (speaker: Participant) => {
      // Guard: Prevent double-start
      if (isRecognitionActiveRef.current) {
        console.warn('[VoiceMediator] Recognition already active, skipping start');
        return;
      }

      // Clear any previous errors when starting fresh
      if (retryCountRef.current === 0) {
        setError(null);
        setErrorDetails(null);
      }

      const langConfig = speaker === 'A' ? config.languageA : config.languageB;
      const recognition = initRecognition(langConfig.code);

      if (!recognition) return;

      // Abort any existing recognition first
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore
        }
      }

      recognitionRef.current = recognition;
      isRecognitionActiveRef.current = true;

      recognition.onstart = () => {
        setState(speaker === 'A' ? 'listening_a' : 'listening_b');
        setCurrentSpeaker(speaker);
        setIsActive(true);
        retryCountRef.current = 0; // Reset retry count on successful start
      };

      recognition.onresult = (event) => {
        // Cast to our extended type with resultIndex
        const speechEvent = event as unknown as SpeechRecognitionEvent;
        const result = speechEvent.results[speechEvent.resultIndex];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;

        if (result.isFinal) {
          processTranslation(transcript, confidence);
        } else {
          setPartialTranscript(transcript);
        }
      };

      recognition.onerror = (event) => {
        const errorCode = mapRecognitionError(event.error);

        // Mark recognition as inactive on error
        isRecognitionActiveRef.current = false;

        // Ignore 'no-speech' and 'aborted' errors - they're expected in continuous mode
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // Restart listening if in continuous mode
          if (shouldContinueRef.current && config.continuousMode) {
            setTimeout(() => {
              if (shouldContinueRef.current) {
                startListening(speaker);
              }
            }, 500);
          }
          return;
        }

        // For recoverable errors, try to restart
        const errorInfo = ERROR_MESSAGES[errorCode];
        if (errorInfo.retryable && retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          console.log(`[VoiceMediator] Recognition error, retrying (attempt ${retryCountRef.current})`);
          setTimeout(() => {
            if (shouldContinueRef.current) {
              startListening(speaker);
            }
          }, 1000 * retryCountRef.current);
          return;
        }

        setErrorWithDetails(errorCode, event.error);
      };

      recognition.onend = () => {
        // Mark recognition as inactive
        isRecognitionActiveRef.current = false;

        // Handle unexpected end - restart if needed
        if (
          shouldContinueRef.current &&
          config.continuousMode &&
          !isProcessingRef.current &&
          state !== 'processing' &&
          state !== 'error'
        ) {
          setTimeout(() => {
            if (shouldContinueRef.current && !isProcessingRef.current) {
              startListening(speaker);
            }
          }, 300);
        }
      };

      try {
        recognition.start();
      } catch (err) {
        // Handle "already started" error gracefully
        if (err instanceof Error && err.message.includes('already started')) {
          console.warn('[VoiceMediator] Recognition already started');
          return;
        }

        setErrorWithDetails(
          TranslatorErrorCode.UNKNOWN_ERROR,
          `Failed to start recognition: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    },
    [config, initRecognition, processTranslation, state, setErrorWithDetails]
  );

  /**
   * Start mediation session (Person A speaks first)
   */
  const start = useCallback(async () => {
    // Guard against double-start
    if (isStartingRef.current || isStarting || isActive) {
      console.warn('[VoiceMediator] Session already starting or active');
      return;
    }

    isStartingRef.current = true;
    setIsStarting(true);

    try {
      // Check browser compatibility first
      if (!browserCompatibility.fullySupported) {
        if (!browserCompatibility.speechRecognition) {
          setErrorWithDetails(TranslatorErrorCode.SPEECH_RECOGNITION_NOT_SUPPORTED);
          isStartingRef.current = false;
          setIsStarting(false);
          return;
        }
        if (!browserCompatibility.speechSynthesis) {
          setErrorWithDetails(TranslatorErrorCode.SPEECH_SYNTHESIS_NOT_SUPPORTED);
          isStartingRef.current = false;
          setIsStarting(false);
          return;
        }
      }

      // Initialize speech synthesis (must be done on user gesture)
      initializeSpeechSynthesis();

      // Pre-load voices to avoid delay on first translation
      if (!voicesReady) {
        console.log('[VoiceMediator] Pre-loading voices on session start...');
        const voices = await waitForVoices(2000);
        if (voices.length > 0) {
          setAvailableVoices(voices);
          setVoicesReady(true);
        }
      }

      // Check microphone permission
      const hasMicPermission = await checkMicrophonePermission();
      if (!hasMicPermission) {
        setErrorWithDetails(TranslatorErrorCode.MICROPHONE_PERMISSION_DENIED);
        isStartingRef.current = false;
        setIsStarting(false);
        return;
      }

      setError(null);
      setErrorDetails(null);
      retryCountRef.current = 0;
      shouldContinueRef.current = true;

      // Small delay to ensure everything is ready
      setTimeout(() => {
        startListening('A');
        isStartingRef.current = false;
        setIsStarting(false);
      }, 100);

    } catch (err) {
      console.error('[VoiceMediator] Error starting session:', err);
      isStartingRef.current = false;
      setIsStarting(false);
      setErrorWithDetails(TranslatorErrorCode.UNKNOWN_ERROR, err instanceof Error ? err.message : 'Failed to start');
    }
  }, [startListening, browserCompatibility, checkMicrophonePermission, setErrorWithDetails, initializeSpeechSynthesis, isActive, isStarting, voicesReady, waitForVoices]);

  /**
   * Stop mediation session
   */
  const stop = useCallback(() => {
    shouldContinueRef.current = false;
    isProcessingRef.current = false;
    retryCountRef.current = 0;
    isStartingRef.current = false;
    isRecognitionActiveRef.current = false;
    setIsStarting(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (err) {
        console.warn('[VoiceMediator] Error aborting recognition:', err);
      }
      recognitionRef.current = null;
    }

    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.warn('[VoiceMediator] Error canceling synthesis:', err);
      }
    }

    setState('idle');
    setCurrentSpeaker(null);
    setIsActive(false);
    setPartialTranscript('');
  }, []);

  /**
   * Retry last failed operation
   */
  const retry = useCallback(() => {
    // Reset all error and guard states
    setError(null);
    setErrorDetails(null);
    retryCountRef.current = 0;
    isStartingRef.current = false;
    isRecognitionActiveRef.current = false;
    setIsStarting(false);

    // Reset state machine from error state
    if (state === 'error') {
      setState('idle');
    }

    // If we have a last transcript, retry translation
    if (lastTranscriptRef.current && currentSpeaker) {
      setState('processing');
      processTranslation(lastTranscriptRef.current.text, lastTranscriptRef.current.confidence);
    } else if (currentSpeaker) {
      // Otherwise, restart listening
      shouldContinueRef.current = true;
      startListening(currentSpeaker);
    } else {
      // Start fresh
      start();
    }
  }, [currentSpeaker, processTranslation, startListening, start, state]);

  /**
   * Reset entire session
   */
  const resetSession = useCallback(() => {
    stop();
    setError(null);
    setErrorDetails(null);
    setHistory([]);
    setLastTranslation(null);
    lastTranscriptRef.current = null;

    // Reset all guard states
    isStartingRef.current = false;
    isRecognitionActiveRef.current = false;
    setIsStarting(false);
  }, [stop]);

  /**
   * Manually switch to the other speaker
   */
  const switchSpeaker = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (err) {
        console.warn('[VoiceMediator] Error aborting recognition:', err);
      }
    }

    const nextSpeaker: Participant = currentSpeaker === 'A' ? 'B' : 'A';
    retryCountRef.current = 0;
    startListening(nextSpeaker);
  }, [currentSpeaker, startListening]);

  /**
   * Clear conversation history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setLastTranslation(null);
    lastTranscriptRef.current = null;
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
    setErrorDetails(null);
    if (state === 'error') {
      setState('idle');
    }
  }, [state]);

  /**
   * Update configuration
   */
  const updateConfig = useCallback((updates: Partial<MediatorConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldContinueRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (err) {
          // Ignore cleanup errors
        }
      }
      if (window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  // Load voices when available - critical for TTS to work
  useEffect(() => {
    if (!window.speechSynthesis) {
      console.warn('[VoiceMediator] SpeechSynthesis not available');
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log(`[VoiceMediator] ${voices.length} voices loaded`);

      if (voices.length > 0) {
        setAvailableVoices(voices);
        setVoicesReady(true);

        // Log available voices for debugging
        const indianVoices = voices.filter(v =>
          v.lang.includes('-IN') ||
          v.lang.startsWith('hi') ||
          v.lang.startsWith('bn') ||
          v.lang.startsWith('ta') ||
          v.lang.startsWith('te')
        );
        if (indianVoices.length > 0) {
          console.log('[VoiceMediator] Indian voices available:', indianVoices.map(v => `${v.name} (${v.lang})`));
        }
      }
    };

    // Initial load
    loadVoices();

    // Chrome loads voices asynchronously, so we need to listen for changes
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Fallback: Try loading again after a short delay (some browsers need this)
    const fallbackTimer = setTimeout(() => {
      if (!voicesReady) {
        console.log('[VoiceMediator] Fallback voice load attempt');
        loadVoices();
      }
    }, 500);

    return () => {
      clearTimeout(fallbackTimer);
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [voicesReady]);

  return {
    // State
    state,
    currentSpeaker,
    isActive,

    // Configuration
    config,
    updateConfig,

    // Conversation history
    history,

    // Live data
    partialTranscript,
    lastTranslation,

    // Controls
    start,
    stop,
    switchSpeaker,
    clearHistory,

    // Error handling
    error,
    clearError,
    errorDetails,
    retry,
    browserCompatibility,

    // Recovery
    resetSession,
    checkMicrophonePermission,

    // Voice synthesis
    voicesReady,
    voicesLoading,
    availableVoices,
    initializeSpeechSynthesis,

    // Session state
    isStarting,
  };
}
