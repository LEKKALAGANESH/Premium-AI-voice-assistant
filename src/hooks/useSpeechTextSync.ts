// 2026 Pro-Active Voice UX: Synchronized Speak-While-Render Engine
// REFACTORED: TTFT Tracking + Streaming-Aware TTS Speech Queue
// Implements:
// - Time to First Token (TTFT) measurement using performance.now()
// - Async speech queue that starts after 4-5 words arrive
// - Barge-in support via speechSynthesis.cancel()
// - 5-word look-ahead buffer with TTS audio synchronization

import { useState, useCallback, useRef, useEffect } from 'react';

// === TYPES ===
export interface SyncWord {
  word: string;
  index: number;
  state: 'pending' | 'buffered' | 'speaking' | 'spoken';
}

export interface SyncState {
  words: SyncWord[];
  currentWordIndex: number;
  bufferEndIndex: number;
  isPlaying: boolean;
  progress: number; // 0-1 overall progress
}

// 2026 TTFT: Time to First Token metrics
export interface TTFTMetrics {
  submissionTime: number | null;   // performance.now() at message submission
  firstTokenTime: number | null;   // performance.now() at first chunk received
  ttft: number | null;             // TTFT in milliseconds
  isTracking: boolean;             // Whether TTFT tracking is active
}

// 2026 Speech Queue: Individual speech chunk
export interface SpeechChunk {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  status: 'pending' | 'speaking' | 'spoken' | 'cancelled';
}

// 2026 Speech Queue: Queue state
export interface SpeechQueueState {
  chunks: SpeechChunk[];
  currentChunkIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
  isBargingIn: boolean;
}

export interface UseSpeechTextSyncOptions {
  text: string;
  isActive: boolean;
  bufferSize?: number; // Default 5 words
  wordsPerSecond?: number; // Estimated TTS speed
  speechChunkSize?: number; // Words per TTS chunk (default 4-5)
  voiceEnabled?: boolean; // Whether to enable TTS
  onWordSpoken?: (index: number, word: string) => void;
  onComplete?: () => void;
  onTTFTCaptured?: (ttft: number) => void; // Callback when TTFT is measured
  onBargeIn?: () => void; // Callback when user barges in
}

export interface UseSpeechTextSyncReturn {
  syncState: SyncState;
  ttftMetrics: TTFTMetrics;
  speechQueue: SpeechQueueState;
  getWordState: (index: number) => SyncWord['state'];
  start: () => void;
  pause: () => void;
  reset: () => void;
  seekToWord: (index: number) => void;
  // 2026 TTFT: Timer controls
  startTTFTTimer: () => void;
  captureFirstToken: () => number | null;
  // 2026 Speech Queue: Queue controls
  enqueueChunk: (text: string, startIndex: number) => void;
  bargeIn: () => void;
  resumeSpeech: () => void;
}

// === CONSTANTS ===
const DEFAULT_BUFFER_SIZE = 5;
const DEFAULT_WORDS_PER_SECOND = 2.5; // ~150 WPM typical TTS
const DEFAULT_SPEECH_CHUNK_SIZE = 5; // 4-5 words before TTS starts
const FRAME_BUDGET_MS = 16; // 60fps target

// === SPEECH SYNTHESIS HELPERS ===
const isSpeechSynthesisSupported = (): boolean => {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
};

const cancelAllSpeech = (): void => {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
};

// === HOOK ===
export function useSpeechTextSync({
  text,
  isActive,
  bufferSize = DEFAULT_BUFFER_SIZE,
  wordsPerSecond = DEFAULT_WORDS_PER_SECOND,
  speechChunkSize = DEFAULT_SPEECH_CHUNK_SIZE,
  voiceEnabled = true,
  onWordSpoken,
  onComplete,
  onTTFTCaptured,
  onBargeIn,
}: UseSpeechTextSyncOptions): UseSpeechTextSyncReturn {
  // === STATE ===
  const [syncState, setSyncState] = useState<SyncState>(() => createInitialState(text, bufferSize));

  // 2026 TTFT: Timing state
  const [ttftMetrics, setTTFTMetrics] = useState<TTFTMetrics>({
    submissionTime: null,
    firstTokenTime: null,
    ttft: null,
    isTracking: false,
  });

  // 2026 Speech Queue: Queue state
  const [speechQueue, setSpeechQueue] = useState<SpeechQueueState>({
    chunks: [],
    currentChunkIndex: 0,
    isPlaying: false,
    isPaused: false,
    isBargingIn: false,
  });

  // === REFS (avoid stale closures) ===
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const currentWordIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const textRef = useRef(text);
  const onWordSpokenRef = useRef(onWordSpoken);
  const onCompleteRef = useRef(onComplete);
  const onTTFTCapturedRef = useRef(onTTFTCaptured);
  const onBargeInRef = useRef(onBargeIn);

  // 2026 Speech Queue: Active utterance ref
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechQueueRef = useRef<SpeechChunk[]>([]);
  const isSpeakingRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    onWordSpokenRef.current = onWordSpoken;
    onCompleteRef.current = onComplete;
    onTTFTCapturedRef.current = onTTFTCaptured;
    onBargeInRef.current = onBargeIn;
  }, [onWordSpoken, onComplete, onTTFTCaptured, onBargeIn]);

  // Reset when text changes
  useEffect(() => {
    if (text !== textRef.current) {
      textRef.current = text;
      currentWordIndexRef.current = 0;
      setSyncState(createInitialState(text, bufferSize));
      // Reset speech queue on new text
      speechQueueRef.current = [];
      setSpeechQueue({
        chunks: [],
        currentChunkIndex: 0,
        isPlaying: false,
        isPaused: false,
        isBargingIn: false,
      });
    }
  }, [text, bufferSize]);

  // ============================================================================
  // 2026 TTFT: Time to First Token Implementation
  // ============================================================================
  // Uses performance.now() for high-resolution timing
  // Timer starts at message submission, stops at first streaming chunk
  // ============================================================================

  const startTTFTTimer = useCallback(() => {
    const now = performance.now();
    setTTFTMetrics({
      submissionTime: now,
      firstTokenTime: null,
      ttft: null,
      isTracking: true,
    });
  }, []);

  const captureFirstToken = useCallback((): number | null => {
    setTTFTMetrics(prev => {
      // Only capture if tracking and not already captured
      if (!prev.isTracking || prev.firstTokenTime !== null) {
        return prev;
      }

      const now = performance.now();
      const ttft = prev.submissionTime !== null
        ? Math.round(now - prev.submissionTime)
        : null;

      // Fire callback
      if (ttft !== null && onTTFTCapturedRef.current) {
        onTTFTCapturedRef.current(ttft);
      }

      return {
        ...prev,
        firstTokenTime: now,
        ttft,
        isTracking: false, // Stop tracking after first token
      };
    });

    // Return current TTFT (may be null if called before state updates)
    return ttftMetrics.ttft;
  }, [ttftMetrics.ttft]);

  // ============================================================================
  // 2026 Speech Queue: Streaming-Aware TTS Engine
  // ============================================================================
  // Implements async speech queue that starts after 4-5 words arrive
  // Supports barge-in via speechSynthesis.cancel()
  // ============================================================================

  const speakChunk = useCallback((chunk: SpeechChunk) => {
    if (!isSpeechSynthesisSupported() || !voiceEnabled) return;

    const utterance = new SpeechSynthesisUtterance(chunk.text);
    activeUtteranceRef.current = utterance;
    isSpeakingRef.current = true;

    utterance.onstart = () => {
      setSpeechQueue(prev => ({
        ...prev,
        isPlaying: true,
        chunks: prev.chunks.map((c, i) =>
          c.id === chunk.id ? { ...c, status: 'speaking' } : c
        ),
      }));
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      activeUtteranceRef.current = null;

      setSpeechQueue(prev => {
        const updatedChunks = prev.chunks.map(c =>
          c.id === chunk.id ? { ...c, status: 'spoken' as const } : c
        );

        const nextIndex = prev.currentChunkIndex + 1;
        const hasMore = nextIndex < updatedChunks.length;

        return {
          ...prev,
          chunks: updatedChunks,
          currentChunkIndex: nextIndex,
          isPlaying: hasMore,
        };
      });

      // Process next chunk in queue
      processNextChunk();
    };

    utterance.onerror = (event) => {
      if (event.error !== 'interrupted') {
        console.error('[SpeechQueue] Utterance error:', event.error);
      }
      isSpeakingRef.current = false;
      activeUtteranceRef.current = null;
    };

    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  const processNextChunk = useCallback(() => {
    const queue = speechQueueRef.current;
    const currentIndex = speechQueue.currentChunkIndex;

    if (currentIndex < queue.length && !isSpeakingRef.current && !speechQueue.isPaused) {
      const nextChunk = queue[currentIndex];
      if (nextChunk && nextChunk.status === 'pending') {
        speakChunk(nextChunk);
      }
    }
  }, [speechQueue.currentChunkIndex, speechQueue.isPaused, speakChunk]);

  const enqueueChunk = useCallback((chunkText: string, startIndex: number) => {
    const chunkId = `chunk-${Date.now()}-${startIndex}`;
    const words = chunkText.trim().split(/\s+/);

    const newChunk: SpeechChunk = {
      id: chunkId,
      text: chunkText,
      startIndex,
      endIndex: startIndex + words.length - 1,
      status: 'pending',
    };

    speechQueueRef.current.push(newChunk);

    setSpeechQueue(prev => ({
      ...prev,
      chunks: [...prev.chunks, newChunk],
    }));

    // Start speaking if this is the first chunk or queue is ready
    if (!isSpeakingRef.current && !speechQueue.isPaused && voiceEnabled) {
      setTimeout(processNextChunk, 0);
    }
  }, [processNextChunk, speechQueue.isPaused, voiceEnabled]);

  const bargeIn = useCallback(() => {
    // Immediately cancel all speech
    cancelAllSpeech();
    isSpeakingRef.current = false;
    activeUtteranceRef.current = null;

    // Update queue state
    setSpeechQueue(prev => ({
      ...prev,
      isPlaying: false,
      isPaused: true,
      isBargingIn: true,
      chunks: prev.chunks.map(c =>
        c.status === 'pending' || c.status === 'speaking'
          ? { ...c, status: 'cancelled' as const }
          : c
      ),
    }));

    // Clear pending queue
    speechQueueRef.current = [];

    // Fire barge-in callback
    onBargeInRef.current?.();
  }, []);

  const resumeSpeech = useCallback(() => {
    setSpeechQueue(prev => ({
      ...prev,
      isPaused: false,
      isBargingIn: false,
    }));

    // Process next chunk if available
    setTimeout(processNextChunk, 0);
  }, [processNextChunk]);

  // === ANIMATION LOOP (requestAnimationFrame) ===
  const animationLoop = useCallback((timestamp: number) => {
    if (!isPlayingRef.current) return;

    const elapsed = timestamp - lastUpdateTimeRef.current;
    const msPerWord = 1000 / wordsPerSecond;

    if (elapsed >= msPerWord) {
      lastUpdateTimeRef.current = timestamp;

      setSyncState(prev => {
        const newIndex = currentWordIndexRef.current + 1;

        // Check if complete
        if (newIndex >= prev.words.length) {
          isPlayingRef.current = false;
          onCompleteRef.current?.();
          return {
            ...prev,
            currentWordIndex: prev.words.length - 1,
            isPlaying: false,
            progress: 1,
            words: prev.words.map(w => ({ ...w, state: 'spoken' as const })),
          };
        }

        currentWordIndexRef.current = newIndex;
        onWordSpokenRef.current?.(newIndex, prev.words[newIndex]?.word || '');

        // Update word states with buffer
        const newWords = prev.words.map((w, i) => {
          if (i < newIndex) return { ...w, state: 'spoken' as const };
          if (i === newIndex) return { ...w, state: 'speaking' as const };
          if (i <= newIndex + bufferSize) return { ...w, state: 'buffered' as const };
          return { ...w, state: 'pending' as const };
        });

        return {
          ...prev,
          words: newWords,
          currentWordIndex: newIndex,
          bufferEndIndex: Math.min(newIndex + bufferSize, prev.words.length - 1),
          progress: newIndex / (prev.words.length - 1),
          isPlaying: true,
        };
      });
    }

    // Continue loop within frame budget
    if (isPlayingRef.current) {
      animationFrameRef.current = requestAnimationFrame(animationLoop);
    }
  }, [wordsPerSecond, bufferSize]);

  // === CONTROLS ===
  const start = useCallback(() => {
    if (syncState.words.length === 0) return;

    isPlayingRef.current = true;
    lastUpdateTimeRef.current = performance.now();

    // Initialize buffer immediately
    setSyncState(prev => ({
      ...prev,
      isPlaying: true,
      words: prev.words.map((w, i) => {
        if (i === currentWordIndexRef.current) return { ...w, state: 'speaking' as const };
        if (i <= currentWordIndexRef.current + bufferSize) return { ...w, state: 'buffered' as const };
        return { ...w, state: 'pending' as const };
      }),
      bufferEndIndex: Math.min(currentWordIndexRef.current + bufferSize, prev.words.length - 1),
    }));

    animationFrameRef.current = requestAnimationFrame(animationLoop);
  }, [animationLoop, bufferSize, syncState.words.length]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setSyncState(prev => ({ ...prev, isPlaying: false }));

    // Also pause speech
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.pause();
    }
  }, []);

  const reset = useCallback(() => {
    pause();
    currentWordIndexRef.current = 0;
    setSyncState(createInitialState(text, bufferSize));

    // Reset TTFT metrics
    setTTFTMetrics({
      submissionTime: null,
      firstTokenTime: null,
      ttft: null,
      isTracking: false,
    });

    // Reset speech queue
    cancelAllSpeech();
    speechQueueRef.current = [];
    setSpeechQueue({
      chunks: [],
      currentChunkIndex: 0,
      isPlaying: false,
      isPaused: false,
      isBargingIn: false,
    });
  }, [pause, text, bufferSize]);

  const seekToWord = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, syncState.words.length - 1));
    currentWordIndexRef.current = clampedIndex;

    setSyncState(prev => ({
      ...prev,
      currentWordIndex: clampedIndex,
      bufferEndIndex: Math.min(clampedIndex + bufferSize, prev.words.length - 1),
      progress: clampedIndex / (prev.words.length - 1),
      words: prev.words.map((w, i) => {
        if (i < clampedIndex) return { ...w, state: 'spoken' as const };
        if (i === clampedIndex) return { ...w, state: 'speaking' as const };
        if (i <= clampedIndex + bufferSize) return { ...w, state: 'buffered' as const };
        return { ...w, state: 'pending' as const };
      }),
    }));
  }, [bufferSize, syncState.words.length]);

  const getWordState = useCallback((index: number): SyncWord['state'] => {
    return syncState.words[index]?.state || 'pending';
  }, [syncState.words]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      cancelAllSpeech();
    };
  }, []);

  // Auto-start when isActive becomes true
  useEffect(() => {
    if (isActive && !syncState.isPlaying && syncState.progress < 1) {
      start();
    } else if (!isActive && syncState.isPlaying) {
      pause();
    }
  }, [isActive, syncState.isPlaying, syncState.progress, start, pause]);

  return {
    syncState,
    ttftMetrics,
    speechQueue,
    getWordState,
    start,
    pause,
    reset,
    seekToWord,
    // 2026 TTFT controls
    startTTFTTimer,
    captureFirstToken,
    // 2026 Speech Queue controls
    enqueueChunk,
    bargeIn,
    resumeSpeech,
  };
}

// === HELPERS ===
function createInitialState(text: string, bufferSize: number): SyncState {
  const wordStrings = text.trim().split(/\s+/).filter(w => w.length > 0);

  const words: SyncWord[] = wordStrings.map((word, index) => ({
    word,
    index,
    state: index < bufferSize ? 'buffered' : 'pending',
  }));

  // First word starts as 'speaking' if we have words
  if (words.length > 0) {
    words[0].state = 'buffered';
  }

  return {
    words,
    currentWordIndex: 0,
    bufferEndIndex: Math.min(bufferSize - 1, words.length - 1),
    isPlaying: false,
    progress: 0,
  };
}

// ============================================================================
// 2026 STREAMING TTS: Helper function for chunking streaming text
// ============================================================================
// Call this function as words arrive from the streaming API
// It will automatically enqueue speech when threshold is reached
// ============================================================================
export function createStreamingTTSController(
  enqueueChunk: (text: string, startIndex: number) => void,
  chunkSize: number = DEFAULT_SPEECH_CHUNK_SIZE
) {
  let wordBuffer: string[] = [];
  let totalWordsProcessed = 0;

  return {
    // Add words as they arrive from stream
    addWords: (newWords: string[]) => {
      wordBuffer.push(...newWords);

      // When we have enough words, enqueue a chunk
      while (wordBuffer.length >= chunkSize) {
        const chunk = wordBuffer.splice(0, chunkSize);
        const chunkText = chunk.join(' ');
        enqueueChunk(chunkText, totalWordsProcessed);
        totalWordsProcessed += chunk.length;
      }
    },

    // Flush remaining words at end of stream
    flush: () => {
      if (wordBuffer.length > 0) {
        const chunkText = wordBuffer.join(' ');
        enqueueChunk(chunkText, totalWordsProcessed);
        totalWordsProcessed += wordBuffer.length;
        wordBuffer = [];
      }
    },

    // Reset for new stream
    reset: () => {
      wordBuffer = [];
      totalWordsProcessed = 0;
    },

    // Get buffer status
    getBufferSize: () => wordBuffer.length,
    getTotalProcessed: () => totalWordsProcessed,
  };
}

export default useSpeechTextSync;
