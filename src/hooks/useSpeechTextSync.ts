// 2026 Pro-Active Voice UX: Synchronized Speak-While-Render Engine
// Implements 5-word look-ahead buffer with TTS audio synchronization

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

export interface UseSpeechTextSyncOptions {
  text: string;
  isActive: boolean;
  bufferSize?: number; // Default 5 words
  wordsPerSecond?: number; // Estimated TTS speed
  onWordSpoken?: (index: number, word: string) => void;
  onComplete?: () => void;
}

export interface UseSpeechTextSyncReturn {
  syncState: SyncState;
  getWordState: (index: number) => SyncWord['state'];
  start: () => void;
  pause: () => void;
  reset: () => void;
  seekToWord: (index: number) => void;
}

// === CONSTANTS ===
const DEFAULT_BUFFER_SIZE = 5;
const DEFAULT_WORDS_PER_SECOND = 2.5; // ~150 WPM typical TTS
const FRAME_BUDGET_MS = 16; // 60fps target

// === HOOK ===
export function useSpeechTextSync({
  text,
  isActive,
  bufferSize = DEFAULT_BUFFER_SIZE,
  wordsPerSecond = DEFAULT_WORDS_PER_SECOND,
  onWordSpoken,
  onComplete,
}: UseSpeechTextSyncOptions): UseSpeechTextSyncReturn {
  // === STATE ===
  const [syncState, setSyncState] = useState<SyncState>(() => createInitialState(text, bufferSize));

  // === REFS (avoid stale closures) ===
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const currentWordIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const textRef = useRef(text);
  const onWordSpokenRef = useRef(onWordSpoken);
  const onCompleteRef = useRef(onComplete);

  // Keep refs in sync
  useEffect(() => {
    onWordSpokenRef.current = onWordSpoken;
    onCompleteRef.current = onComplete;
  }, [onWordSpoken, onComplete]);

  // Reset when text changes
  useEffect(() => {
    if (text !== textRef.current) {
      textRef.current = text;
      currentWordIndexRef.current = 0;
      setSyncState(createInitialState(text, bufferSize));
    }
  }, [text, bufferSize]);

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
  }, []);

  const reset = useCallback(() => {
    pause();
    currentWordIndexRef.current = 0;
    setSyncState(createInitialState(text, bufferSize));
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
    getWordState,
    start,
    pause,
    reset,
    seekToWord,
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

export default useSpeechTextSync;
