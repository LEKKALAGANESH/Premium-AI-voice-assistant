// useStreamingVoiceBot.ts - Production-Ready Streaming Voice Hook
// Version 1.0.0
//
// This hook integrates all components for sub-2-second voice latency:
// - StreamProcessor: Sentence detection as text arrives
// - VoiceQueue: Non-overlapping TTS queue management
// - LoopBackController: Heartbeat to keep conversation alive
//
// LATENCY TARGETS:
// - Time-to-First-Token (TTFT): < 500ms
// - Time-to-First-Audio (TTFA): < 1500ms
// - Perceived Latency: < 2000ms

import { useState, useCallback, useRef, useEffect } from 'react';
import { StreamProcessor, createBalancedProcessor } from '../lib/StreamProcessor';
import { VoiceQueue } from '../lib/VoiceQueue';
import { LoopBackController, getLoopBackController, destroyLoopBackController, ConversationState } from '../lib/LoopBackController';

// ============================================================================
// TYPES
// ============================================================================

export type VoiceMode = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export interface StreamingVoiceBotConfig {
  // Speech settings
  speechRate?: number;
  voiceLang?: string;

  // Streaming settings
  minSpeakableLength?: number;
  maxBufferSize?: number;

  // Timing
  echoPrevention?: number;

  // API endpoint
  apiEndpoint?: string;

  // Callbacks
  onModeChange?: (mode: VoiceMode) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (fullText: string) => void;
  onSentenceSpoken?: (sentence: string, index: number) => void;
  onError?: (error: Error) => void;
  onThinkingLong?: () => void; // After 3 seconds of thinking
}

export interface StreamingVoiceBotReturn {
  // Current state
  mode: VoiceMode;
  isSessionActive: boolean;
  isThinkingLong: boolean;

  // Content
  transcript: string;
  currentSentence: string;
  fullResponse: string;
  queueLength: number;

  // Error
  error: string | null;

  // Controls
  startSession: () => void;
  commitAndSend: () => void;
  endSession: () => void;
  interruptSpeaking: () => void;
  skipSentence: () => void;
  warmupAPI: () => void;

  // Stats
  stats: {
    turnCount: number;
    heartbeatCount: number;
    avgLatency: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_API_ENDPOINT = '/api/ai/chat-stream';
const THINKING_LONG_THRESHOLD = 3000; // 3 seconds

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useStreamingVoiceBot(config: StreamingVoiceBotConfig = {}): StreamingVoiceBotReturn {
  // ========== STATE ==========
  const [mode, setMode] = useState<VoiceMode>('IDLE');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isThinkingLong, setIsThinkingLong] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentSentence, setCurrentSentence] = useState('');
  const [fullResponse, setFullResponse] = useState('');
  const [queueLength, setQueueLength] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ turnCount: 0, heartbeatCount: 0, avgLatency: 0 });

  // ========== REFS ==========
  const isMountedRef = useRef(true);
  const isSessionActiveRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiWarmedUpRef = useRef(false);
  const pendingTranscriptRef = useRef('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sentenceIndexRef = useRef(0);
  const firstTokenTimeRef = useRef(0);
  const latenciesRef = useRef<number[]>([]);

  // Component instances (via refs for stability)
  const processorRef = useRef<StreamProcessor | null>(null);
  const queueRef = useRef<VoiceQueue | null>(null);
  const loopBackRef = useRef<LoopBackController | null>(null);

  // ========== HELPER: Update Mode ==========
  const updateMode = useCallback((newMode: VoiceMode) => {
    if (!isMountedRef.current) return;
    setMode(newMode);
    config.onModeChange?.(newMode);

    // Clear thinking timeout on mode change
    if (newMode !== 'THINKING' && thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
      setIsThinkingLong(false);
    }
  }, [config]);

  // ========== INITIALIZE COMPONENTS ==========
  useEffect(() => {
    // Stream Processor
    processorRef.current = createBalancedProcessor((segment) => {
      console.log(`[Hook] Segment ready: "${segment.text.substring(0, 30)}..."`);
    });

    // Voice Queue with callbacks
    queueRef.current = new VoiceQueue({
      rate: config.speechRate || 1.05,
      lang: config.voiceLang || 'en-US',

      onSpeakStart: (text) => {
        if (isMountedRef.current) {
          setCurrentSentence(text);
          updateMode('SPEAKING');
        }
      },

      onSpeakEnd: (text) => {
        sentenceIndexRef.current++;
        config.onSentenceSpoken?.(text, sentenceIndexRef.current);
      },

      onDrained: () => {
        // HEARTBEAT: Queue is empty + stream complete, signal loop-back controller
        console.log('[Hook] Queue drained - triggering heartbeat');
        if (loopBackRef.current && isSessionActiveRef.current) {
          loopBackRef.current.signalSpeakingEnd();
        }
      },

      onQueueChange: (length) => {
        if (isMountedRef.current) {
          setQueueLength(length);
        }
      },

      onSpeakError: (_text, err) => {
        console.error('[Hook] Speech error:', err);
      },
    });

    // Loop-Back Controller with callbacks
    loopBackRef.current = getLoopBackController({
      echoPrevention: config.echoPrevention || 250,

      onStateChange: (state: ConversationState) => {
        console.log(`[Hook] LoopBack state: ${state}`);
      },

      onListeningStart: () => {
        if (isMountedRef.current) {
          updateMode('LISTENING');
          setTranscript('');
        }
      },

      onHeartbeat: () => {
        setStats(prev => ({ ...prev, heartbeatCount: prev.heartbeatCount + 1 }));
      },

      onError: (err) => {
        console.error('[Hook] LoopBack error:', err);
        if (isMountedRef.current) {
          setError(err.message);
          updateMode('ERROR');
        }
      },
    });

    return () => {
      isMountedRef.current = false;
      queueRef.current?.destroy();
      destroyLoopBackController();
      processorRef.current?.reset();
    };
  }, []); // Only run once on mount

  // ========== API WARMUP ==========
  const warmupAPI = useCallback(() => {
    if (apiWarmedUpRef.current) return;

    console.log('[Hook] Warming up API...');
    const endpoint = config.apiEndpoint || DEFAULT_API_ENDPOINT;

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warmup: true }),
    })
      .then(() => {
        apiWarmedUpRef.current = true;
        console.log('[Hook] API warmed up');
      })
      .catch(() => {
        // Ignore warmup errors
      });
  }, [config.apiEndpoint]);

  // ========== STREAM TO AI ==========
  const streamToAI = useCallback(async (prompt: string) => {
    if (!prompt.trim() || !isSessionActiveRef.current) return;

    console.log('[Hook] Streaming to AI:', prompt);

    // Reset state
    setFullResponse('');
    setCurrentSentence('');
    sentenceIndexRef.current = 0;
    processorRef.current?.reset();
    firstTokenTimeRef.current = 0;

    // Start thinking timeout
    thinkingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && mode === 'THINKING') {
        setIsThinkingLong(true);
        config.onThinkingLong?.();
      }
    }, THINKING_LONG_THRESHOLD);

    abortControllerRef.current = new AbortController();
    const endpoint = config.apiEndpoint || DEFAULT_API_ENDPOINT;
    const requestStartTime = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history: [] }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let firstChunkReceived = false;

      // Signal loop-back that we're streaming
      loopBackRef.current?.signalStreamingStart();

      while (isSessionActiveRef.current) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (data.ack) continue;
            if (data.error) throw new Error(data.error);

            if (data.chunk) {
              // Track time to first token
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                firstTokenTimeRef.current = Date.now() - requestStartTime;

                // Clear thinking timeout
                if (thinkingTimeoutRef.current) {
                  clearTimeout(thinkingTimeoutRef.current);
                  thinkingTimeoutRef.current = null;
                }
                setIsThinkingLong(false);

                console.log(`[Hook] First token in ${firstTokenTimeRef.current}ms`);
              }

              // Process chunk through StreamProcessor
              fullText += data.chunk;
              setFullResponse(fullText);

              const result = processorRef.current?.processChunk(data.chunk);
              if (result) {
                for (const segment of result.segments) {
                  // Queue sentence for TTS
                  queueRef.current?.enqueue(segment.text);
                }
              }
            }

            if (data.done) break;
          } catch (parseErr) {
            if (!(parseErr instanceof SyntaxError)) throw parseErr;
          }
        }
      }

      // Flush remaining buffer
      const finalSegment = processorRef.current?.flush();
      if (finalSegment) {
        queueRef.current?.enqueue(finalSegment.text);
      }

      // Track latency
      const totalLatency = Date.now() - requestStartTime;
      latenciesRef.current.push(totalLatency);
      const avgLatency = Math.round(
        latenciesRef.current.reduce((a, b) => a + b, 0) / latenciesRef.current.length
      );
      setStats(prev => ({ ...prev, turnCount: prev.turnCount + 1, avgLatency }));

      config.onResponse?.(fullText);

    } catch (err) {
      console.error('[Hook] Stream error:', err);

      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
      setIsThinkingLong(false);

      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Hook] Stream aborted');
        return;
      }

      if (isMountedRef.current) {
        setError('Connection error. Please try again.');
        updateMode('ERROR');
        config.onError?.(err instanceof Error ? err : new Error('Stream failed'));
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [config, mode, updateMode]);

  // ========== SPEECH RECOGNITION ==========
  const startListening = useCallback(() => {
    if (!isSessionActiveRef.current) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setError('Speech recognition not supported');
      updateMode('ERROR');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = config.voiceLang || 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('[Hook] Recognition started');
      pendingTranscriptRef.current = '';
      updateMode('LISTENING');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

      const displayText = (
        pendingTranscriptRef.current +
        (interimTranscript ? ' ' + interimTranscript : '')
      ).trim();

      if (isMountedRef.current) {
        setTranscript(displayText);
        config.onTranscript?.(displayText, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('[Hook] Recognition error:', event.error);

      if (event.error === 'aborted') return;

      if (event.error === 'no-speech') {
        // Restart listening after short delay
        if (isSessionActiveRef.current) {
          setTimeout(() => startListening(), 100);
        }
        return;
      }

      setError('Could not understand. Please try again.');
      updateMode('ERROR');
    };

    recognition.onend = () => {
      console.log('[Hook] Recognition ended');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error('[Hook] Failed to start recognition:', err);
      if (isSessionActiveRef.current) {
        setTimeout(() => startListening(), 200);
      }
    }
  }, [config, updateMode]);

  // ========== PUBLIC CONTROLS ==========

  const startSession = useCallback(() => {
    console.log('[Hook] Starting session');

    isSessionActiveRef.current = true;
    setIsSessionActive(true);
    setError(null);
    setTranscript('');
    setCurrentSentence('');
    setFullResponse('');
    setIsThinkingLong(false);
    setQueueLength(0);
    latenciesRef.current = [];

    // Unlock audio (required for user gesture)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const unlocker = new SpeechSynthesisUtterance('');
      unlocker.volume = 0;
      window.speechSynthesis.speak(unlocker);
    }

    // Warmup API and start listening
    warmupAPI();
    startListening();
  }, [warmupAPI, startListening]);

  const commitAndSend = useCallback(() => {
    if (mode !== 'LISTENING') return;

    console.log('[Hook] Commit and send');

    // INSTANT: Show thinking state immediately
    updateMode('THINKING');

    // Stop recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    // Send accumulated transcript
    const textToSend = pendingTranscriptRef.current.trim() || transcript.trim();

    if (textToSend) {
      config.onTranscript?.(textToSend, true);
      streamToAI(textToSend);
    } else {
      // No transcript, restart listening
      startListening();
    }
  }, [mode, transcript, config, streamToAI, startListening, updateMode]);

  const interruptSpeaking = useCallback(() => {
    console.log('[Hook] Interrupt speaking');

    // Abort streaming
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop TTS and clear queue
    queueRef.current?.stop();

    // Clear thinking timeout
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
    setIsThinkingLong(false);

    // Restart listening if session active
    if (isSessionActiveRef.current) {
      setTimeout(() => startListening(), 250);
    }
  }, [startListening]);

  const skipSentence = useCallback(() => {
    queueRef.current?.skipCurrent();
  }, []);

  const endSession = useCallback(() => {
    console.log('[Hook] Ending session');

    isSessionActiveRef.current = false;
    setIsSessionActive(false);

    // Clean up timers
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }

    // Abort streaming
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
      recognitionRef.current = null;
    }

    // Stop TTS
    queueRef.current?.stop();

    // Reset state
    updateMode('IDLE');
    setTranscript('');
    setCurrentSentence('');
    setError(null);
    setIsThinkingLong(false);
  }, [updateMode]);

  // ========== LIFECYCLE ==========
  useEffect(() => {
    isMountedRef.current = true;

    // Pre-warm API on mount
    warmupAPI();

    return () => {
      isMountedRef.current = false;
      isSessionActiveRef.current = false;

      if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (recognitionRef.current) try { recognitionRef.current.abort(); } catch (e) {}
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [warmupAPI]);

  // ========== RETURN ==========
  return {
    mode,
    isSessionActive,
    isThinkingLong,
    transcript,
    currentSentence,
    fullResponse,
    queueLength,
    error,
    startSession,
    commitAndSend,
    endSession,
    interruptSpeaking,
    skipSentence,
    warmupAPI,
    stats,
  };
}

export default useStreamingVoiceBot;
