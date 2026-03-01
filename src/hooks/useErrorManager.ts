// 2026 Premium Error Management Hook
// Global error state with deduplication and auto-cleanup

import { useState, useCallback, useRef } from 'react';
import { VoxError, mapErrorToVoxError, ERROR_REGISTRY } from '../types/errors';

export interface ManagedError extends VoxError {
  id: string;
  timestamp: number;
}

interface UseErrorManagerReturn {
  errors: ManagedError[];
  activeError: ManagedError | null;
  showError: (errorOrCode: string | VoxError) => string;
  dismissError: (id: string) => void;
  dismissAll: () => void;
  clearError: () => void;
  hasErrors: boolean;
}

// Generate unique ID for errors
const generateId = () => `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Deduplication window - don't show same error twice within this time
const DEDUP_WINDOW_MS = 3000;

export function useErrorManager(): UseErrorManagerReturn {
  const [errors, setErrors] = useState<ManagedError[]>([]);
  const lastErrorRef = useRef<{ code: string; timestamp: number } | null>(null);

  // Show an error (accepts code string or VoxError object)
  const showError = useCallback((errorOrCode: string | VoxError): string => {
    const voxError = typeof errorOrCode === 'string'
      ? mapErrorToVoxError(errorOrCode)
      : errorOrCode;

    // Deduplication check
    const now = Date.now();
    if (
      lastErrorRef.current &&
      lastErrorRef.current.code === voxError.code &&
      now - lastErrorRef.current.timestamp < DEDUP_WINDOW_MS
    ) {
      // Same error within dedup window, skip
      return '';
    }

    // Update last error reference
    lastErrorRef.current = { code: voxError.code, timestamp: now };

    const managedError: ManagedError = {
      ...voxError,
      id: generateId(),
      timestamp: now,
    };

    setErrors((prev) => {
      // Remove any existing error with the same code
      const filtered = prev.filter((e) => e.code !== voxError.code);
      // Add new error at the top
      return [managedError, ...filtered].slice(0, 5); // Max 5 errors at once
    });

    return managedError.id;
  }, []);

  // Dismiss a specific error by ID
  const dismissError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Dismiss all errors
  const dismissAll = useCallback(() => {
    setErrors([]);
    lastErrorRef.current = null;
  }, []);

  // Clear the most recent error (for backwards compatibility)
  const clearError = useCallback(() => {
    setErrors((prev) => prev.slice(1));
  }, []);

  // Get the most recent/active error
  const activeError = errors.length > 0 ? errors[0] : null;

  return {
    errors,
    activeError,
    showError,
    dismissError,
    dismissAll,
    clearError,
    hasErrors: errors.length > 0,
  };
}

// === HELPER HOOKS ===

// Quick error display for components
export function useShowError(showError: (error: string | VoxError) => string) {
  return {
    showMicError: () => showError(ERROR_REGISTRY.NO_MICROPHONE),
    showPermissionError: () => showError(ERROR_REGISTRY.MIC_PERMISSION_DENIED),
    showNetworkError: () => showError(ERROR_REGISTRY.NETWORK_ERROR),
    showBrowserError: () => showError(ERROR_REGISTRY.SPEECH_RECOGNITION_NOT_SUPPORTED),
    showAudioError: () => showError(ERROR_REGISTRY.AUDIO_PLAYBACK_ERROR),
    showGenericError: (message?: string) => {
      if (message) {
        return showError({
          ...ERROR_REGISTRY.UNKNOWN_ERROR,
          message,
        });
      }
      return showError(ERROR_REGISTRY.UNKNOWN_ERROR);
    },
  };
}

export default useErrorManager;
