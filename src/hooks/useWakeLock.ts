// useWakeLock - Screen Wake Lock API Hook for Mobile
// Prevents screen from dimming/locking during active voice translation sessions
// Production-ready with iOS Safari and Android support

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface WakeLockSentinel {
  released: boolean;
  type: 'screen';
  release(): Promise<void>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
}

interface UseWakeLockOptions {
  /** Whether wake lock should be active */
  enabled: boolean;
  /** Callback when wake lock is acquired */
  onAcquire?: () => void;
  /** Callback when wake lock is released */
  onRelease?: () => void;
  /** Callback when wake lock errors */
  onError?: (error: Error) => void;
}

interface UseWakeLockReturn {
  /** Whether wake lock is currently active */
  isLocked: boolean;
  /** Whether the browser supports Wake Lock API */
  isSupported: boolean;
  /** Current error if any */
  error: Error | null;
  /** Manually request wake lock */
  request: () => Promise<boolean>;
  /** Manually release wake lock */
  release: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWakeLock(options: UseWakeLockOptions): UseWakeLockReturn {
  const { enabled, onAcquire, onRelease, onError } = options;

  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isMountedRef = useRef(true);

  // Check support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const nav = navigator as NavigatorWithWakeLock;
      setIsSupported('wakeLock' in nav && nav.wakeLock !== undefined);
    }
  }, []);

  // Handle wake lock release event
  const handleRelease = useCallback(() => {
    if (isMountedRef.current) {
      setIsLocked(false);
      wakeLockRef.current = null;
      console.log('[WakeLock] Released');
      onRelease?.();
    }
  }, [onRelease]);

  // Request wake lock
  const request = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.log('[WakeLock] Not supported in this browser');
      return false;
    }

    const nav = navigator as NavigatorWithWakeLock;

    // Don't request if already locked
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      return true;
    }

    try {
      const sentinel = await nav.wakeLock!.request('screen');
      wakeLockRef.current = sentinel;

      sentinel.addEventListener('release', handleRelease);

      if (isMountedRef.current) {
        setIsLocked(true);
        setError(null);
        console.log('[WakeLock] Acquired');
        onAcquire?.();
      }

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to acquire wake lock');
      console.warn('[WakeLock] Failed to acquire:', error.message);

      if (isMountedRef.current) {
        setError(error);
        onError?.(error);
      }

      return false;
    }
  }, [isSupported, handleRelease, onAcquire, onError]);

  // Release wake lock
  const release = useCallback(async (): Promise<void> => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try {
        wakeLockRef.current.removeEventListener('release', handleRelease);
        await wakeLockRef.current.release();
        wakeLockRef.current = null;

        if (isMountedRef.current) {
          setIsLocked(false);
          console.log('[WakeLock] Manually released');
        }
      } catch (err) {
        console.warn('[WakeLock] Release error:', err);
      }
    }
  }, [handleRelease]);

  // Re-acquire wake lock when document becomes visible again
  useEffect(() => {
    if (!isSupported || !enabled) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && enabled) {
        // Re-acquire wake lock when tab becomes visible
        await request();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSupported, enabled, request]);

  // Main effect to acquire/release based on enabled state
  useEffect(() => {
    if (!isSupported) return;

    if (enabled) {
      request();
    } else {
      release();
    }
  }, [enabled, isSupported, request, release]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (wakeLockRef.current && !wakeLockRef.current.released) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  return {
    isLocked,
    isSupported,
    error,
    request,
    release,
  };
}

// ============================================================================
// ALTERNATIVE: No-Operation Fallback for iOS Safari
// iOS Safari doesn't support Wake Lock API, but we can use other strategies
// ============================================================================

/**
 * Alternative screen keep-alive using video playback
 * This is a fallback for browsers that don't support Wake Lock API
 * Works on iOS Safari by playing a tiny silent video
 */
export function useNoSleepFallback(enabled: boolean): boolean {
  const [isActive, setIsActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create a tiny video element
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('loop', '');
      video.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;';

      // Base64 encoded tiny webm video (smallest possible)
      video.src = 'data:video/webm;base64,GkXfowEAAAAAAAAfQoaBAUL3gQFC8oEEQvOBCEKChHdlYm1Ch4ECQoWBAhhTgGcBAAAAAAAVkhFNm3RALE27i1OrhBVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsggI47AEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmAQAAAAAAAEUq17GDD0JATYCNTGF2ZjU4LjI5LjEwMFdBjUxhdmY1OC4yOS4xMDBzpJBlrrXf3DCDVB8KcgbMpcr+RImIQJBgAAAAAAAWVK5rAQAAAAAAADuuAQAAAAAAADLXgQFzxYEBnIEAIrWcg3VuZIaFVl9WUDmDgQEj44OEAmJaAOABAAAAAAAABrCBsLqBkB9DtnVA';

      document.body.appendChild(video);
      videoRef.current = video;
    }

    const video = videoRef.current;

    const play = async () => {
      try {
        await video.play();
        setIsActive(true);
        console.log('[NoSleep] Video fallback active');
      } catch (err) {
        console.warn('[NoSleep] Video playback failed:', err);
        setIsActive(false);
      }
    };

    const stop = () => {
      video.pause();
      setIsActive(false);
      console.log('[NoSleep] Video fallback stopped');
    };

    if (enabled) {
      play();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [enabled]);

  // Cleanup video element on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.remove();
        videoRef.current = null;
      }
    };
  }, []);

  return isActive;
}

// ============================================================================
// COMBINED HOOK: Uses Wake Lock API with video fallback
// ============================================================================

export interface UseScreenAwakeReturn {
  isAwake: boolean;
  method: 'wakeLock' | 'video' | 'none';
  error: Error | null;
}

export function useScreenAwake(enabled: boolean): UseScreenAwakeReturn {
  const wakeLock = useWakeLock({ enabled });
  const [useFallback, setUseFallback] = useState(false);

  // Use video fallback if Wake Lock is not supported
  useEffect(() => {
    if (typeof window !== 'undefined' && !wakeLock.isSupported) {
      setUseFallback(true);
    }
  }, [wakeLock.isSupported]);

  const videoActive = useNoSleepFallback(enabled && useFallback);

  const isAwake = wakeLock.isLocked || videoActive;
  const method = wakeLock.isLocked ? 'wakeLock' : videoActive ? 'video' : 'none';

  return {
    isAwake,
    method,
    error: wakeLock.error,
  };
}

export default useWakeLock;
