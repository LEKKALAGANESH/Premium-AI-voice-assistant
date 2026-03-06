// useStreamingVoice.ts — Sentence-Level Streaming Voice Hook
// Version 2.0.0
//
// The "Ice-Cold" Pipeline:
//
//   1. AUDIO PRIMING
//      On speech commit, immediately fire speechSynthesis.speak("") to warm
//      the browser's audio engine during the ~500ms API latency window.
//
//   2. FIRST-PERIOD TRIGGER
//      Stream from Gemini via SSE. The moment the first "." "!" or "?" arrives,
//      StreamProcessor extracts the sentence and feeds it to VoiceQueue.
//      The voice starts the millisecond that first sentence is ready.
//
//   3. VOICE QUEUE (Non-Overlapping Pipeline)
//      Sentence 1 is SPEAKING -> Sentence 2 is BUFFERED -> Sentence 3 is DOWNLOADING.
//      VoiceQueue guarantees sequential playback with no overlaps.
//
//   4. CONVERSATION LOOP
//      recognition.start() is triggered by VoiceQueue.onDrained — which fires
//      ONLY after the very last sentence finishes speaking AND the stream is complete.
//      This ensures the bot only listens once it is completely finished talking.

import { useState, useCallback, useRef, useEffect } from 'react';
import { StreamProcessor } from '../lib/StreamProcessor';
import { VoiceQueue } from '../lib/VoiceQueue';
import type { Message } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type VoiceMode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface StreamingVoiceConfig {
  speechRate?: number;
  voiceLang?: string;
  preferredVoice?: string;
  echoPreventionMs?: number;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
  onSentenceSpoken?: (sentence: string, index: number) => void;
  onModeChange?: (mode: VoiceMode) => void;
  onError?: (error: Error) => void;
}

export interface StreamingVoiceReturn {
  // State
  mode: VoiceMode;
  isSessionActive: boolean;
  isSpeaking: boolean;
  currentSentence: string;
  queueLength: number;
  fullResponse: string;
  partialTranscript: string;
  error: string | null;
  latency: { ttft: number; ttfa: number } | null;

  // Controls
  startSession: () => void;
  endSession: () => void;
  interruptBot: () => void;
  skipSentence: () => void;
  streamResponse: (prompt: string, history?: Message[]) => Promise<string>;
}

// ============================================================================
// HELPERS
// ============================================================================

function createRecognition(lang: string): SpeechRecognition | null {
  const API =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  if (!API) return null;

  const r = new API();
  r.continuous = false;
  r.interimResults = true;
  r.lang = lang;
  r.maxAlternatives = 1;
  return r;
}

/**
 * Audio Priming — warm the browser's audio pipeline.
 * Calling this during the API latency window eliminates the cold-start
 * delay that would otherwise add 200-400ms to first audio playback.
 */
function primeAudio(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const primer = new SpeechSynthesisUtterance('');
  primer.volume = 0;
  window.speechSynthesis.speak(primer);
}

// ============================================================================
// HOOK
// ============================================================================

export function useStreamingVoice(config: StreamingVoiceConfig = {}): StreamingVoiceReturn {
  // ── React State ──────────────────────────────────────
  const [mode, setMode] = useState<VoiceMode>('idle');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentSentence, setCurrentSentence] = useState('');
  const [queueLength, setQueueLength] = useState(0);
  const [fullResponse, setFullResponse] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<{ ttft: number; ttfa: number } | null>(null);

  // ── Stable Refs ──────────────────────────────────────
  const mountedRef = useRef(true);
  const sessionRef = useRef(false);
  const processingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const queueRef = useRef<VoiceQueue | null>(null);
  const processorRef = useRef<StreamProcessor | null>(null);

  // Latency tracking
  const streamStartRef = useRef(0);
  const firstTokenRef = useRef(0);
  const firstAudioRef = useRef(0);

  // ── Mode setter that also fires callback ─────────────
  const setModeTracked = useCallback((m: VoiceMode) => {
    if (!mountedRef.current) return;
    setMode(m);
    config.onModeChange?.(m);
  }, [config.onModeChange]);

  // ── Timer Utilities ──────────────────────────────────
  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  // Forward-declared so scheduleListeningRestart and startListening can reference each other
  const startListeningRef = useRef<() => void>(() => {});

  const scheduleListeningRestart = useCallback(() => {
    clearRestartTimer();
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (sessionRef.current && mountedRef.current) {
        startListeningRef.current();
      }
    }, config.echoPreventionMs || 300);
  }, [config.echoPreventionMs, clearRestartTimer]);

  // ── Initialize Queue + Processor on mount ────────────
  useEffect(() => {
    mountedRef.current = true;

    queueRef.current = new VoiceQueue({
      rate: config.speechRate || 1.05,
      lang: config.voiceLang || 'en-US',
      preferredVoice: config.preferredVoice,

      onSpeakStart: (text, idx) => {
        if (!mountedRef.current) return;

        // Track time-to-first-audio
        if (firstAudioRef.current === 0) {
          firstAudioRef.current = Date.now();
          const ttft = firstTokenRef.current - streamStartRef.current;
          const ttfa = firstAudioRef.current - streamStartRef.current;
          setLatency({ ttft, ttfa });
          console.log(`[useStreamingVoice] TTFT: ${ttft}ms | TTFA: ${ttfa}ms`);
        }

        setCurrentSentence(text);
        setIsSpeaking(true);
        setModeTracked('speaking');
        config.onSentenceSpoken?.(text, idx);
      },

      onSpeakEnd: () => {
        if (!mountedRef.current) return;
        setCurrentSentence('');
      },

      // ─── THE CONVERSATION LOOP ───
      // This fires ONLY when:
      //   (a) the stream is complete (markStreamComplete was called)
      //   (b) every queued sentence has finished speaking
      // That's the signal to restart the microphone.
      onDrained: () => {
        if (!mountedRef.current) return;
        setIsSpeaking(false);
        processingRef.current = false;

        if (sessionRef.current) {
          scheduleListeningRestart();
        } else {
          setModeTracked('idle');
        }
      },

      onQueueChange: (len) => {
        if (mountedRef.current) setQueueLength(len);
      },

      onSpeakError: (text, err) => {
        console.warn(`[VoiceQueue] TTS error on "${text.substring(0, 30)}...": ${err}`);
      },
    });

    // StreamProcessor: aggressive settings for first-period trigger
    // minSpeakableLength=5 ensures even short sentences like "Got it." trigger immediately
    processorRef.current = new StreamProcessor({
      minSpeakableLength: 5,
      clauseThreshold: 35,
      maxBufferSize: 100,
      splitOnNewline: true,
    });

    return () => {
      mountedRef.current = false;
      sessionRef.current = false;
      queueRef.current?.destroy();
      processorRef.current?.reset();
      clearRestartTimer();
      abortRef.current?.abort();
      try { recognitionRef.current?.abort(); } catch {}
    };
  }, [config.speechRate, config.voiceLang, config.preferredVoice]);

  // ── Listening (Speech Recognition) ───────────────────

  const startListening = useCallback(() => {
    if (!mountedRef.current || !sessionRef.current) return;

    // Clean up any existing recognition
    try { recognitionRef.current?.abort(); } catch {}

    const rec = createRecognition(config.voiceLang || 'en-US');
    if (!rec) {
      setError('Speech recognition not supported');
      setModeTracked('error');
      return;
    }

    recognitionRef.current = rec;
    setModeTracked('listening');
    setPartialTranscript('');

    rec.onresult = (e: any) => {
      const result = e.results[e.resultIndex];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;

      if (!mountedRef.current) return;
      setPartialTranscript(transcript);
      config.onTranscript?.(transcript, isFinal);

      if (isFinal && transcript.trim()) {
        setPartialTranscript('');

        // ─── AUDIO PRIMING ───
        // Fire an empty utterance NOW to warm the audio engine
        // while the API request is in flight (~500ms window).
        primeAudio();

        streamResponseRef.current(transcript);
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'aborted') return;
      if (e.error === 'no-speech') {
        if (sessionRef.current) scheduleListeningRestart();
        return;
      }
      setError(`Recognition: ${e.error}`);
      setModeTracked('error');
    };

    rec.onend = () => {
      // Auto-restart if session active and not processing a response
      if (sessionRef.current && !processingRef.current) {
        scheduleListeningRestart();
      }
    };

    try {
      rec.start();
    } catch {
      if (sessionRef.current) scheduleListeningRestart();
    }
  }, [config.voiceLang, config.onTranscript, scheduleListeningRestart, setModeTracked]);

  // Keep the ref in sync so scheduleListeningRestart can call it
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // ── Streaming Response (The Core Pipeline) ───────────

  const streamResponse = useCallback(async (prompt: string, history: Message[] = []): Promise<string> => {
    const queue = queueRef.current;
    const processor = processorRef.current;
    if (!queue || !processor) return '';

    // Lock out recognition restarts while we're processing + speaking
    processingRef.current = true;
    clearRestartTimer();
    try { recognitionRef.current?.abort(); } catch {}

    // Reset pipeline for this turn
    queue.reset();
    processor.reset();

    setModeTracked('thinking');
    setError(null);
    setFullResponse('');
    setCurrentSentence('');
    setQueueLength(0);
    setLatency(null);

    // Latency tracking
    streamStartRef.current = Date.now();
    firstTokenRef.current = 0;
    firstAudioRef.current = 0;

    const ac = new AbortController();
    abortRef.current = ac;

    let fullText = '';

    try {
      const res = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          history: history.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: ac.signal,
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // ── Stream Loop ──
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value, { stream: true });

        for (const line of raw.split('\n')) {
          if (!line.startsWith('data: ')) continue;

          let data: any;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.error) throw new Error(data.error);

          if (data.chunk) {
            // Track time-to-first-token
            if (firstTokenRef.current === 0) {
              firstTokenRef.current = Date.now();
            }

            fullText += data.chunk;
            if (mountedRef.current) setFullResponse(fullText);

            // ─── FIRST-PERIOD TRIGGER ───
            // StreamProcessor scans for "." "!" "?" boundaries.
            // The moment it finds one, it yields a segment.
            // That segment goes straight into VoiceQueue, which
            // starts speaking immediately if it's the first sentence.
            const { segments } = processor.processChunk(data.chunk);
            for (const seg of segments) {
              queue.enqueue(seg.text);
            }
          }

          if (data.done) {
            fullText = data.fullText || fullText;
            if (mountedRef.current) setFullResponse(fullText);
          }
        }
      }

      // Flush any remaining text in the processor buffer
      const last = processor.flush();
      if (last) queue.enqueue(last.text);

      // Signal the queue: no more sentences are coming.
      // onDrained will fire after the last sentence finishes speaking.
      queue.markStreamComplete();

      config.onResponse?.(fullText);
      return fullText;

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return fullText;
      }
      const msg = err instanceof Error ? err.message : 'Stream failed';
      if (mountedRef.current) {
        setError(msg);
        setModeTracked('error');
        config.onError?.(err instanceof Error ? err : new Error(msg));
      }
      processingRef.current = false;
      return fullText;
    } finally {
      abortRef.current = null;
    }
  }, [config.onResponse, config.onError, clearRestartTimer, setModeTracked]);

  // Ref for streamResponse so recognition callback doesn't go stale
  const streamResponseRef = useRef(streamResponse);
  useEffect(() => {
    streamResponseRef.current = streamResponse;
  }, [streamResponse]);

  // ── Session Controls ─────────────────────────────────

  /** Start a new voice conversation session. */
  const startSession = useCallback(() => {
    sessionRef.current = true;
    setIsSessionActive(true);
    setError(null);

    // ─── AUDIO PRIMING ON SESSION START ───
    // Satisfies browser autoplay policy + warms the audio engine.
    primeAudio();

    startListening();
  }, [startListening]);

  /** Hard end: stop everything, end the session entirely. */
  const endSession = useCallback(() => {
    sessionRef.current = false;
    processingRef.current = false;
    setIsSessionActive(false);

    clearRestartTimer();
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;

    abortRef.current?.abort();
    abortRef.current = null;

    queueRef.current?.stop();
    processorRef.current?.reset();

    setModeTracked('idle');
    setIsSpeaking(false);
    setCurrentSentence('');
    setPartialTranscript('');
    setQueueLength(0);
    setError(null);
  }, [clearRestartTimer, setModeTracked]);

  /** Interrupt: stop current speech + streaming, resume listening. */
  const interruptBot = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    processorRef.current?.reset();

    // interrupt() calls stop() + fires onDrained, which triggers conversation loop
    queueRef.current?.interrupt();

    setIsSpeaking(false);
    setCurrentSentence('');
  }, []);

  /** Skip just the current sentence — queue advances to next. */
  const skipSentence = useCallback(() => {
    queueRef.current?.skipCurrent();
  }, []);

  // ── Return ───────────────────────────────────────────

  return {
    mode,
    isSessionActive,
    isSpeaking,
    currentSentence,
    queueLength,
    fullResponse,
    partialTranscript,
    error,
    latency,
    startSession,
    endSession,
    interruptBot,
    skipSentence,
    streamResponse,
  };
}

export default useStreamingVoice;
