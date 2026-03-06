// useVoiceBot.ts - Ultra-Low Latency Voice Bot Hook
// Version 4.0.0 - Optimized for sub-2-second latency with:
// - First-Sentence-Buffer: Speak immediately when sentence detected
// - Instant Manual Send: THINKING state before recognition.stop()
// - Pre-Connect Warmup: Prime API connection on mount
// - 3-Second Timeout: "Still thinking..." visual cue
// - TTS Heartbeat: Auto-restart listening after speaking

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export interface VoiceBotConfig {
  speechRate?: number;
  voiceLang?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
  onStateChange?: (state: VoiceState) => void;
  onError?: (error: Error) => void;
  onThinkingLong?: () => void; // Called after 3 seconds of thinking
}

export interface VoiceBotReturn {
  // State
  state: VoiceState;
  isSessionActive: boolean;
  isThinkingLong: boolean; // True if thinking > 3 seconds
  transcript: string;
  currentSentence: string;
  fullResponse: string;
  error: string | null;

  // Controls
  startSession: () => void;
  commitAndSend: () => void;  // Manual stop-to-send (instant THINKING)
  endSession: () => void;     // Hard end
  interruptSpeaking: () => void;
  warmupAPI: () => void;      // Pre-connect warmup
}

// ============================================================================
// CONSTANTS - Optimized for low latency
// ============================================================================

const MIN_SPEAKABLE_LENGTH = 10;  // Reduced from 15 for faster first sentence
const MAX_BUFFER_SIZE = 80;       // Reduced from 120 for faster chunking
const ECHO_PREVENTION_DELAY = 250; // Reduced from 350ms
const THINKING_LONG_THRESHOLD = 3000; // 3 seconds

const ERROR_MESSAGES = {
  API_FAILED: "I'm sorry, I lost my connection. Please try again.",
  RECOGNITION_FAILED: "I couldn't hear you clearly. Please try again.",
  GENERIC: "Something went wrong. Please try again.",
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function createRecognition(lang: string): SpeechRecognition | null {
  const SpeechRecognitionAPI =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionAPI) return null;

  const recognition = new SpeechRecognitionAPI();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;
  recognition.maxAlternatives = 1;

  return recognition;
}

/**
 * Ultra-fast sentence detection
 * Prioritizes speed over perfect grammar detection
 */
function findSpeakableSegment(text: string): { segment: string; remainder: string } | null {
  const trimmed = text.trim();
  if (trimmed.length < MIN_SPEAKABLE_LENGTH) return null;

  // Look for sentence endings: . ! ? and also , ; for clauses
  for (let i = MIN_SPEAKABLE_LENGTH - 1; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '.' || char === '!' || char === '?') {
      // Check it's not an abbreviation (followed by lowercase)
      const nextChar = trimmed[i + 1];
      if (!nextChar || nextChar === ' ' || nextChar === '\n') {
        return {
          segment: trimmed.slice(0, i + 1).trim(),
          remainder: trimmed.slice(i + 1),
        };
      }
    }
    // Also split on long clauses with commas
    if (char === ',' && i >= MIN_SPEAKABLE_LENGTH * 2) {
      return {
        segment: trimmed.slice(0, i + 1).trim(),
        remainder: trimmed.slice(i + 1),
      };
    }
  }

  // Force split if buffer too large
  if (trimmed.length > MAX_BUFFER_SIZE) {
    const lastSpace = trimmed.lastIndexOf(' ', MAX_BUFFER_SIZE);
    if (lastSpace > MIN_SPEAKABLE_LENGTH) {
      return {
        segment: trimmed.slice(0, lastSpace).trim(),
        remainder: trimmed.slice(lastSpace),
      };
    }
  }

  return null;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useVoiceBot(config: VoiceBotConfig = {}): VoiceBotReturn {
  // ========== STATE ==========
  const [state, setState] = useState<VoiceState>('IDLE');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isThinkingLong, setIsThinkingLong] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentSentence, setCurrentSentence] = useState('');
  const [fullResponse, setFullResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ========== REFS ==========
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentenceQueueRef = useRef<string[]>([]);
  const bufferRef = useRef<string>('');
  const isSessionActiveRef = useRef(false);
  const isMountedRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const pendingTranscriptRef = useRef<string>('');
  const isStreamingRef = useRef(false);
  const thinkingTimeoutRef = useRef<number | null>(null);
  const apiWarmedUpRef = useRef(false);
  const manualCommitPendingRef = useRef(false);

  // ========== FORWARD DECLARATIONS ==========
  const scheduleListeningRestartRef = useRef<() => void>(() => {});
  const processQueueRef = useRef<() => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});
  const streamToGeminiRef = useRef<(prompt: string) => void>(() => {});

  // ========== HELPERS ==========

  const updateState = useCallback((newState: VoiceState) => {
    if (!isMountedRef.current) return;
    setState(newState);
    config.onStateChange?.(newState);

    // Clear thinking timeout on state change
    if (newState !== 'THINKING' && thinkingTimeoutRef.current) {
      window.clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
      setIsThinkingLong(false);
    }
  }, [config]);

  const loadVoices = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    voicesRef.current = window.speechSynthesis.getVoices();
  }, []);

  const getPreferredVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current;
    if (voices.length === 0) return null;

    const lang = config.voiceLang || 'en-US';
    const langPrefix = lang.split('-')[0];

    return (
      voices.find(v => v.lang === lang && v.localService) ||
      voices.find(v => v.lang === lang) ||
      voices.find(v => v.lang.startsWith(langPrefix)) ||
      voices[0]
    );
  }, [config.voiceLang]);

  // ========== API WARMUP ==========

  const warmupAPI = useCallback(() => {
    if (apiWarmedUpRef.current) return;

    console.log('[VoiceBot] Warming up API...');
    fetch('/api/ai/chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warmup: true }),
    }).then(() => {
      apiWarmedUpRef.current = true;
      console.log('[VoiceBot] API warmed up');
    }).catch(() => {
      // Ignore warmup errors
    });
  }, []);

  // ========== SPEECH SYNTHESIS (TTS) ==========

  const speakText = useCallback((text: string, onComplete?: () => void) => {
    if (!window.speechSynthesis || !text.trim()) {
      onComplete?.();
      return;
    }

    // Don't cancel - we want to queue
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    (window as any).__voiceBotUtterance = utterance;

    const voice = getPreferredVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = config.speechRate || 1.1; // Slightly faster
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.lang = config.voiceLang || 'en-US';

    let resumeInterval: ReturnType<typeof setInterval> | null = null;

    utterance.onstart = () => {
      console.log('[VoiceBot] Speaking:', text.substring(0, 30) + '...');
      isSpeakingRef.current = true;
      setCurrentSentence(text);

      // Chrome bug workaround
      resumeInterval = setInterval(() => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 150);
    };

    utterance.onend = () => {
      if (resumeInterval) clearInterval(resumeInterval);
      utteranceRef.current = null;
      (window as any).__voiceBotUtterance = null;
      isSpeakingRef.current = false;
      onComplete?.();
    };

    utterance.onerror = (event) => {
      console.error('[VoiceBot] TTS error:', event.error);
      if (resumeInterval) clearInterval(resumeInterval);
      utteranceRef.current = null;
      (window as any).__voiceBotUtterance = null;
      isSpeakingRef.current = false;

      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        onComplete?.();
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [config.speechRate, config.voiceLang, getPreferredVoice]);

  const speakError = useCallback((message: string) => {
    updateState('ERROR');
    setError(message);

    speakText(message, () => {
      if (isMountedRef.current) {
        updateState('IDLE');
        setError(null);
      }
    });
  }, [speakText, updateState]);

  // ========== SENTENCE QUEUE ==========

  const processQueue = useCallback(() => {
    if (!isSessionActiveRef.current) return;
    if (isSpeakingRef.current) return;

    const queue = sentenceQueueRef.current;

    if (queue.length === 0) {
      if (!isStreamingRef.current) {
        // TTS Heartbeat - restart listening
        console.log('[VoiceBot] TTS Heartbeat');
        scheduleListeningRestartRef.current();
      }
      return;
    }

    const sentence = queue.shift()!;
    updateState('SPEAKING');

    speakText(sentence, () => {
      if (isMountedRef.current && isSessionActiveRef.current) {
        processQueueRef.current();
      }
    });
  }, [speakText, updateState]);

  processQueueRef.current = processQueue;

  const queueSentence = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;

    console.log('[VoiceBot] Queuing:', cleaned.substring(0, 30) + '...');
    sentenceQueueRef.current.push(cleaned);

    // Start speaking immediately if not already
    if (!isSpeakingRef.current) {
      processQueue();
    }
  }, [processQueue]);

  // ========== STREAMING API ==========

  const streamToGemini = useCallback(async (prompt: string) => {
    if (!prompt.trim()) {
      scheduleListeningRestartRef.current();
      return;
    }

    console.log('[VoiceBot] Streaming:', prompt);

    // State should already be THINKING (set by commitAndSend)
    if (state !== 'THINKING') {
      updateState('THINKING');
    }

    setFullResponse('');
    bufferRef.current = '';
    sentenceQueueRef.current = [];
    isStreamingRef.current = true;

    // Start 3-second thinking timeout
    thinkingTimeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current && isStreamingRef.current) {
        console.log('[VoiceBot] Still thinking...');
        setIsThinkingLong(true);
        config.onThinkingLong?.();
      }
    }, THINKING_LONG_THRESHOLD);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history: [] }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let firstChunkReceived = false;

      while (isSessionActiveRef.current) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            // Handle acknowledgment
            if (data.ack) {
              console.log('[VoiceBot] API acknowledged');
              continue;
            }

            if (data.error) throw new Error(data.error);

            if (data.chunk) {
              // Clear thinking timeout on first real chunk
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                if (thinkingTimeoutRef.current) {
                  window.clearTimeout(thinkingTimeoutRef.current);
                  thinkingTimeoutRef.current = null;
                }
                setIsThinkingLong(false);
                console.log('[VoiceBot] First chunk received');
              }

              bufferRef.current += data.chunk;
              fullText += data.chunk;
              setFullResponse(fullText);

              // First-Sentence-Buffer: Check for speakable segment
              let result = findSpeakableSegment(bufferRef.current);
              while (result) {
                queueSentence(result.segment);
                bufferRef.current = result.remainder;
                result = findSpeakableSegment(bufferRef.current);
              }
            }

            if (data.done) break;
          } catch (parseErr) {
            if (!(parseErr instanceof SyntaxError)) throw parseErr;
          }
        }
      }

      // Process remaining buffer
      if (bufferRef.current.trim() && isSessionActiveRef.current) {
        queueSentence(bufferRef.current.trim());
        bufferRef.current = '';
      }

      isStreamingRef.current = false;
      config.onResponse?.(fullText);

      if (!isSpeakingRef.current) {
        processQueue();
      }

    } catch (err) {
      console.error('[VoiceBot] Stream error:', err);
      isStreamingRef.current = false;

      if (thinkingTimeoutRef.current) {
        window.clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
      setIsThinkingLong(false);

      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[VoiceBot] Stream aborted');
        return;
      }

      speakError(ERROR_MESSAGES.API_FAILED);
      config.onError?.(err instanceof Error ? err : new Error('Stream failed'));
    } finally {
      abortControllerRef.current = null;
    }
  }, [state, config, processQueue, queueSentence, speakError, updateState]);

  streamToGeminiRef.current = streamToGemini;

  // ========== SPEECH RECOGNITION ==========

  const scheduleListeningRestart = useCallback(() => {
    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
    }

    restartTimeoutRef.current = window.setTimeout(() => {
      if (isSessionActiveRef.current && isMountedRef.current) {
        startListeningRef.current();
      }
      restartTimeoutRef.current = null;
    }, ECHO_PREVENTION_DELAY);
  }, []);

  scheduleListeningRestartRef.current = scheduleListeningRestart;

  const startListening = useCallback(() => {
    if (!isMountedRef.current || !isSessionActiveRef.current) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }

    const recognition = createRecognition(config.voiceLang || 'en-US');
    if (!recognition) {
      speakError(ERROR_MESSAGES.RECOGNITION_FAILED);
      return;
    }

    recognitionRef.current = recognition;
    pendingTranscriptRef.current = '';
    manualCommitPendingRef.current = false;
    setTranscript('');
    updateState('LISTENING');

    recognition.onstart = () => {
      console.log('[VoiceBot] Listening');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        pendingTranscriptRef.current += ' ' + finalTranscript;
        pendingTranscriptRef.current = pendingTranscriptRef.current.trim();
      }

      const displayText = (pendingTranscriptRef.current +
        (interimTranscript ? ' ' + interimTranscript : '')).trim();

      if (isMountedRef.current) {
        setTranscript(displayText);
        config.onTranscript?.(displayText, false);
      }
    };

    recognition.onerror = (event) => {
      console.log('[VoiceBot] Recognition error:', event.error);

      if (event.error === 'aborted') return;

      if (event.error === 'no-speech') {
        if (isSessionActiveRef.current) {
          scheduleListeningRestart();
        }
        return;
      }

      speakError(ERROR_MESSAGES.RECOGNITION_FAILED);
    };

    recognition.onend = () => {
      console.log('[VoiceBot] Recognition ended');

      // Handle manual commit: send accumulated transcript to API
      if (manualCommitPendingRef.current) {
        manualCommitPendingRef.current = false;
        const textToSend = pendingTranscriptRef.current.trim();

        if (textToSend) {
          config.onTranscript?.(textToSend, true);
          streamToGeminiRef.current(textToSend);
        } else {
          // No transcript - restart listening
          if (isSessionActiveRef.current) {
            startListeningRef.current();
          }
        }
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('[VoiceBot] Failed to start recognition:', err);
      if (isSessionActiveRef.current) {
        scheduleListeningRestart();
      }
    }
  }, [config, scheduleListeningRestart, speakError, updateState]);

  startListeningRef.current = startListening;

  // ========== PUBLIC CONTROLS ==========

  const startSession = useCallback(() => {
    console.log('[VoiceBot] Starting session');

    isSessionActiveRef.current = true;
    setIsSessionActive(true);
    setError(null);
    setTranscript('');
    setCurrentSentence('');
    setFullResponse('');
    setIsThinkingLong(false);
    sentenceQueueRef.current = [];
    bufferRef.current = '';

    // Voice Unlocker
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const unlocker = new SpeechSynthesisUtterance('');
      unlocker.volume = 0;
      window.speechSynthesis.speak(unlocker);
    }

    loadVoices();
    warmupAPI(); // Pre-connect
    startListening();
  }, [loadVoices, warmupAPI, startListening]);

  /**
   * Manual Stop-to-Send: INSTANT transition to THINKING state
   * 1. Immediately switch to THINKING (show Sparkle)
   * 2. Use recognition.stop() to capture final transcript
   * 3. onend handler will send to API
   */
  const commitAndSend = useCallback(() => {
    if (state !== 'LISTENING') return;

    console.log('[VoiceBot] Manual commit - instant THINKING');

    // INSTANT: Switch to THINKING state immediately (shows Sparkle)
    updateState('THINKING');
    manualCommitPendingRef.current = true;

    // Use stop() instead of abort() to get final results
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop(); // Triggers onend with final transcript
      } catch (e) {
        // If stop fails, use abort and send what we have
        try { recognitionRef.current.abort(); } catch (e2) {}
        manualCommitPendingRef.current = false;

        const textToSend = pendingTranscriptRef.current.trim() || transcript.trim();
        if (textToSend) {
          config.onTranscript?.(textToSend, true);
          streamToGemini(textToSend);
        } else {
          startListening();
        }
      }
    }

    // Clear restart timeout
    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, [state, transcript, config, streamToGemini, startListening, updateState]);

  const interruptSpeaking = useCallback(() => {
    console.log('[VoiceBot] Interrupting');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    sentenceQueueRef.current = [];
    bufferRef.current = '';
    isStreamingRef.current = false;
    isSpeakingRef.current = false;

    utteranceRef.current = null;
    (window as any).__voiceBotUtterance = null;

    if (thinkingTimeoutRef.current) {
      window.clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
    setIsThinkingLong(false);

    if (isSessionActiveRef.current) {
      scheduleListeningRestart();
    }
  }, [scheduleListeningRestart]);

  const endSession = useCallback(() => {
    console.log('[VoiceBot] Ending session');

    isSessionActiveRef.current = false;
    setIsSessionActive(false);

    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (thinkingTimeoutRef.current) {
      window.clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
      recognitionRef.current = null;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    utteranceRef.current = null;
    (window as any).__voiceBotUtterance = null;
    sentenceQueueRef.current = [];
    bufferRef.current = '';
    isStreamingRef.current = false;
    isSpeakingRef.current = false;
    pendingTranscriptRef.current = '';
    manualCommitPendingRef.current = false;

    updateState('IDLE');
    setTranscript('');
    setCurrentSentence('');
    setError(null);
    setIsThinkingLong(false);
  }, [updateState]);

  // ========== LIFECYCLE ==========

  useEffect(() => {
    isMountedRef.current = true;
    loadVoices();

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices, { once: true });
    }

    // Pre-warm API on mount
    warmupAPI();

    return () => {
      isMountedRef.current = false;
      isSessionActiveRef.current = false;

      if (restartTimeoutRef.current) window.clearTimeout(restartTimeoutRef.current);
      if (thinkingTimeoutRef.current) window.clearTimeout(thinkingTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (recognitionRef.current) try { recognitionRef.current.abort(); } catch (e) {}
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [loadVoices, warmupAPI]);

  // ========== RETURN ==========

  return {
    state,
    isSessionActive,
    isThinkingLong,
    transcript,
    currentSentence,
    fullResponse,
    error,
    startSession,
    commitAndSend,
    endSession,
    interruptSpeaking,
    warmupAPI,
  };
}

export default useVoiceBot;
