// 2026 Audio Engine: Singleton AudioContext with Warm-Start Protocol
// Fixes: Playback failed, autoplay policy, memory leaks, barge-in resilience

import { useState, useCallback, useEffect, useRef } from 'react';

// === TYPES ===
export type AudioState = 'uninitialized' | 'suspended' | 'running' | 'closed' | 'error';

export interface AudioPlayerState {
  state: AudioState;
  isPlaying: boolean;
  isInitialized: boolean;
  isMuted: boolean;
  error: string | null;
  volume: number;
  currentTime: number;
  duration: number;
}

export interface UseAudioPlayerReturn {
  state: AudioPlayerState;
  // Core operations
  initialize: () => Promise<boolean>;
  play: (base64Audio: string, options?: PlayOptions) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => Promise<void>;
  // State checks
  isReady: () => boolean;
  needsUserGesture: () => boolean;
  // Cleanup
  cleanup: () => void;
  // For SuperButton integration
  wakeUp: () => Promise<boolean>;
}

export interface PlayOptions {
  volume?: number;
  playbackRate?: number;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

// === SINGLETON AUDIO CONTEXT ===
let globalAudioContext: AudioContext | null = null;
let globalGainNode: GainNode | null = null;
let contextInitialized = false;
let initializationPromise: Promise<boolean> | null = null;

// Get or create the singleton AudioContext
function getAudioContext(): AudioContext | null {
  if (globalAudioContext && globalAudioContext.state !== 'closed') {
    return globalAudioContext;
  }
  return null;
}

// Initialize the singleton (must be called from user gesture)
async function initializeAudioContext(): Promise<boolean> {
  // If already initializing, return the existing promise
  if (initializationPromise) {
    return initializationPromise;
  }

  // If already initialized and running, return true
  if (globalAudioContext && globalAudioContext.state === 'running') {
    return true;
  }

  initializationPromise = (async () => {
    try {
      // Create new context if needed
      if (!globalAudioContext || globalAudioContext.state === 'closed') {
        globalAudioContext = new AudioContext();
        console.log('[AudioPlayer] Created new AudioContext');
      }

      // Resume if suspended (autoplay policy)
      if (globalAudioContext.state === 'suspended') {
        console.log('[AudioPlayer] Resuming suspended AudioContext...');
        await globalAudioContext.resume();
        console.log('[AudioPlayer] AudioContext resumed successfully');
      }

      // Create master gain node
      if (!globalGainNode || !globalGainNode.context || globalGainNode.context.state === 'closed') {
        globalGainNode = globalAudioContext.createGain();
        globalGainNode.connect(globalAudioContext.destination);
        globalGainNode.gain.value = 1.0;
        console.log('[AudioPlayer] Created GainNode');
      }

      contextInitialized = true;
      return true;
    } catch (error) {
      console.error('[AudioPlayer] Initialization failed:', error);
      contextInitialized = false;
      return false;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

// Cleanup the singleton
function cleanupAudioContext() {
  if (globalGainNode) {
    try {
      globalGainNode.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    globalGainNode = null;
  }

  if (globalAudioContext && globalAudioContext.state !== 'closed') {
    try {
      globalAudioContext.close();
    } catch (e) {
      // Ignore close errors
    }
  }
  globalAudioContext = null;
  contextInitialized = false;
  initializationPromise = null;
  console.log('[AudioPlayer] Cleanup complete');
}

// === HOOK ===
export function useAudioPlayer(): UseAudioPlayerReturn {
  const [state, setState] = useState<AudioPlayerState>({
    state: 'uninitialized',
    isPlaying: false,
    isInitialized: false,
    isMuted: false,
    error: null,
    volume: 1.0,
    currentTime: 0,
    duration: 0,
  });

  // Refs for audio playback
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Safe state update (only if mounted)
  const safeSetState = useCallback((updater: Partial<AudioPlayerState> | ((prev: AudioPlayerState) => AudioPlayerState)) => {
    if (!mountedRef.current) return;
    if (typeof updater === 'function') {
      setState(updater);
    } else {
      setState(prev => ({ ...prev, ...updater }));
    }
  }, []);

  // Update state from AudioContext
  const syncState = useCallback(() => {
    const ctx = getAudioContext();
    if (ctx) {
      safeSetState({
        state: ctx.state as AudioState,
        isInitialized: contextInitialized,
      });
    }
  }, [safeSetState]);

  // === INITIALIZE ===
  const initialize = useCallback(async (): Promise<boolean> => {
    safeSetState({ error: null });

    try {
      const success = await initializeAudioContext();

      if (success) {
        safeSetState({
          state: 'running',
          isInitialized: true,
          error: null,
        });
        return true;
      } else {
        safeSetState({
          state: 'error',
          isInitialized: false,
          error: 'Failed to initialize audio',
        });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audio initialization failed';
      safeSetState({
        state: 'error',
        isInitialized: false,
        error: message,
      });
      return false;
    }
  }, [safeSetState]);

  // === WAKE UP (for SuperButton) ===
  const wakeUp = useCallback(async (): Promise<boolean> => {
    console.log('[AudioPlayer] Wake up requested');

    // If already running, just return true
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'running') {
      console.log('[AudioPlayer] Already running');
      return true;
    }

    // Initialize/resume
    const success = await initialize();

    if (success) {
      console.log('[AudioPlayer] Wake up successful');
    } else {
      console.warn('[AudioPlayer] Wake up failed');
    }

    return success;
  }, [initialize]);

  // === STOP ===
  const stop = useCallback(() => {
    // Clear progress interval
    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Stop and cleanup audio element
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        audioElementRef.current.src = '';
        audioElementRef.current.load();
      } catch (e) {
        // Ignore errors during stop
      }
      audioElementRef.current = null;
    }

    // Disconnect source node
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      sourceNodeRef.current = null;
    }

    safeSetState({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
  }, [safeSetState]);

  // === PLAY ===
  const play = useCallback(async (base64Audio: string, options: PlayOptions = {}): Promise<void> => {
    const {
      volume = 1.0,
      playbackRate = 1.0,
      onProgress,
      onEnd,
      onError,
    } = options;

    // Buffer check - don't play empty data
    if (!base64Audio || base64Audio.length === 0) {
      console.warn('[AudioPlayer] Empty audio buffer, skipping playback');
      return;
    }

    // Stop any existing playback first (barge-in resilience)
    stop();

    // Ensure AudioContext is initialized
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') {
      const initialized = await initialize();
      if (!initialized) {
        const error = new Error('Audio not initialized. Click to enable audio.');
        safeSetState({ error: error.message });
        onError?.(error);
        throw error;
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const audioElement = new Audio();
        audioElementRef.current = audioElement;

        // Configure audio element
        audioElement.volume = volume;
        audioElement.playbackRate = playbackRate;

        // Event handlers
        audioElement.onloadedmetadata = () => {
          safeSetState({ duration: audioElement.duration });
        };

        audioElement.onended = () => {
          if (progressIntervalRef.current) {
            window.clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          safeSetState({ isPlaying: false, currentTime: 0 });
          onEnd?.();
          resolve();
        };

        audioElement.onerror = (e) => {
          console.error('[AudioPlayer] Playback error:', e);
          stop();
          const error = new Error('Playback failed');
          safeSetState({ error: error.message, isPlaying: false });
          onError?.(error);
          reject(error);
        };

        audioElement.oncanplaythrough = async () => {
          // Only play if this is still the current audio element
          if (audioElementRef.current !== audioElement) {
            console.log('[AudioPlayer] Audio element changed, skipping play');
            return;
          }

          try {
            // Connect to AudioContext for better control
            const currentCtx = getAudioContext();
            if (currentCtx && globalGainNode && !sourceNodeRef.current) {
              try {
                sourceNodeRef.current = currentCtx.createMediaElementSource(audioElement);
                sourceNodeRef.current.connect(globalGainNode);
              } catch (e) {
                // May fail if already connected, that's ok
                console.log('[AudioPlayer] Source already connected or error:', e);
              }
            }

            // Start playback
            await audioElement.play();

            safeSetState({ isPlaying: true, error: null });

            // Progress tracking
            if (onProgress) {
              progressIntervalRef.current = window.setInterval(() => {
                if (audioElementRef.current) {
                  const currentTime = audioElementRef.current.currentTime;
                  const duration = audioElementRef.current.duration || 0;
                  safeSetState({ currentTime, duration });
                  onProgress(currentTime, duration);
                }
              }, 100);
            }
          } catch (err) {
            // Handle autoplay policy errors
            if (err instanceof Error) {
              if (err.name === 'AbortError') {
                // Intentional interruption, not an error
                console.log('[AudioPlayer] Playback aborted (intentional)');
                resolve();
                return;
              }

              if (err.name === 'NotAllowedError') {
                // Autoplay blocked
                const error = new Error('Audio blocked by browser. Click to enable.');
                safeSetState({
                  state: 'suspended',
                  error: error.message,
                  isPlaying: false,
                });
                onError?.(error);
                reject(error);
                return;
              }
            }

            console.error('[AudioPlayer] Play failed:', err);
            const error = err instanceof Error ? err : new Error('Playback failed');
            safeSetState({ error: error.message, isPlaying: false });
            onError?.(error);
            reject(error);
          }
        };

        // Set source and load
        audioElement.src = `data:audio/mp3;base64,${base64Audio}`;
        audioElement.load();

      } catch (error) {
        console.error('[AudioPlayer] Setup error:', error);
        const err = error instanceof Error ? error : new Error('Audio setup failed');
        safeSetState({ error: err.message, isPlaying: false });
        onError?.(err);
        reject(err);
      }
    });
  }, [initialize, stop, safeSetState]);

  // === PAUSE ===
  const pause = useCallback(() => {
    if (audioElementRef.current && !audioElementRef.current.paused) {
      audioElementRef.current.pause();
      safeSetState({ isPlaying: false });
    }
  }, [safeSetState]);

  // === RESUME ===
  const resume = useCallback(async (): Promise<void> => {
    // Resume AudioContext if needed
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
      syncState();
    }

    // Resume audio element
    if (audioElementRef.current && audioElementRef.current.paused) {
      try {
        await audioElementRef.current.play();
        safeSetState({ isPlaying: true });
      } catch (error) {
        console.error('[AudioPlayer] Resume failed:', error);
      }
    }
  }, [safeSetState, syncState]);

  // === STATE CHECKS ===
  const isReady = useCallback((): boolean => {
    const ctx = getAudioContext();
    return ctx !== null && ctx.state === 'running';
  }, []);

  const needsUserGesture = useCallback((): boolean => {
    const ctx = getAudioContext();
    return !ctx || ctx.state === 'suspended' || !contextInitialized;
  }, []);

  // === CLEANUP ===
  const cleanup = useCallback(() => {
    stop();
    // Don't close the global AudioContext here - it's a singleton
    // Only cleanup local refs
  }, [stop]);

  // === LIFECYCLE ===
  useEffect(() => {
    mountedRef.current = true;

    // Sync state on mount
    syncState();

    // Listen for AudioContext state changes
    const ctx = getAudioContext();
    if (ctx) {
      const handleStateChange = () => syncState();
      ctx.addEventListener('statechange', handleStateChange);
      return () => {
        ctx.removeEventListener('statechange', handleStateChange);
      };
    }

    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [syncState, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  return {
    state,
    initialize,
    play,
    stop,
    pause,
    resume,
    isReady,
    needsUserGesture,
    cleanup,
    wakeUp,
  };
}

// === EXPORTS ===
export { initializeAudioContext, cleanupAudioContext, getAudioContext };
export default useAudioPlayer;
