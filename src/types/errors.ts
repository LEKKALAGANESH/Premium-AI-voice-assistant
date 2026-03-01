// 2026 Premium Error Handling System
// Comprehensive error types with user-friendly messages and recovery actions

export type ErrorCategory =
  | 'microphone'
  | 'permission'
  | 'browser'
  | 'network'
  | 'audio'
  | 'speech'
  | 'system';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface VoxError {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  title: string;
  message: string;
  suggestion: string;
  icon: 'mic-off' | 'shield-off' | 'globe-off' | 'wifi-off' | 'volume-x' | 'alert-triangle' | 'x-circle';
  recoveryAction?: {
    label: string;
    action: 'retry' | 'settings' | 'refresh' | 'dismiss';
  };
}

// Error code registry with detailed user-friendly messages
export const ERROR_REGISTRY: Record<string, VoxError> = {
  // === MICROPHONE ERRORS ===
  NO_MICROPHONE: {
    code: 'NO_MICROPHONE',
    category: 'microphone',
    severity: 'error',
    title: 'No Microphone Detected',
    message: 'Please connect a microphone to use voice features.',
    suggestion: 'Connect a headset, USB microphone, or enable your built-in microphone.',
    icon: 'mic-off',
    recoveryAction: { label: 'Try Again', action: 'retry' },
  },
  MIC_IN_USE: {
    code: 'MIC_IN_USE',
    category: 'microphone',
    severity: 'warning',
    title: 'Microphone Busy',
    message: 'Your microphone is being used by another application.',
    suggestion: 'Close other apps using the microphone (Zoom, Teams, Discord) and try again.',
    icon: 'mic-off',
    recoveryAction: { label: 'Retry', action: 'retry' },
  },
  MIC_NOT_READABLE: {
    code: 'MIC_NOT_READABLE',
    category: 'microphone',
    severity: 'error',
    title: 'Microphone Error',
    message: 'Unable to read audio from your microphone.',
    suggestion: 'Check if your microphone is working properly in system settings.',
    icon: 'mic-off',
    recoveryAction: { label: 'Try Again', action: 'retry' },
  },

  // === PERMISSION ERRORS ===
  MIC_PERMISSION_DENIED: {
    code: 'MIC_PERMISSION_DENIED',
    category: 'permission',
    severity: 'error',
    title: 'Microphone Access Denied',
    message: 'VoxAI needs microphone permission to hear you.',
    suggestion: 'Click the lock icon in your browser\'s address bar and allow microphone access.',
    icon: 'shield-off',
    recoveryAction: { label: 'Open Settings', action: 'settings' },
  },
  MIC_PERMISSION_DISMISSED: {
    code: 'MIC_PERMISSION_DISMISSED',
    category: 'permission',
    severity: 'warning',
    title: 'Permission Required',
    message: 'Microphone permission was dismissed.',
    suggestion: 'Click the voice button again and select "Allow" when prompted.',
    icon: 'shield-off',
    recoveryAction: { label: 'Try Again', action: 'retry' },
  },

  // === BROWSER SUPPORT ERRORS ===
  SPEECH_RECOGNITION_NOT_SUPPORTED: {
    code: 'SPEECH_RECOGNITION_NOT_SUPPORTED',
    category: 'browser',
    severity: 'critical',
    title: 'Browser Not Supported',
    message: 'Your browser doesn\'t support voice recognition.',
    suggestion: 'Please use Chrome, Edge, or Safari for voice features.',
    icon: 'globe-off',
    recoveryAction: { label: 'Dismiss', action: 'dismiss' },
  },
  MEDIA_DEVICES_NOT_SUPPORTED: {
    code: 'MEDIA_DEVICES_NOT_SUPPORTED',
    category: 'browser',
    severity: 'critical',
    title: 'Browser Too Old',
    message: 'Your browser doesn\'t support media devices.',
    suggestion: 'Please update your browser to the latest version.',
    icon: 'globe-off',
    recoveryAction: { label: 'Dismiss', action: 'dismiss' },
  },
  SECURE_CONTEXT_REQUIRED: {
    code: 'SECURE_CONTEXT_REQUIRED',
    category: 'browser',
    severity: 'critical',
    title: 'Secure Connection Required',
    message: 'Voice features require a secure (HTTPS) connection.',
    suggestion: 'Access VoxAI via HTTPS or localhost.',
    icon: 'shield-off',
  },

  // === NETWORK ERRORS ===
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    category: 'network',
    severity: 'error',
    title: 'Connection Lost',
    message: 'Unable to connect to voice services.',
    suggestion: 'Check your internet connection and try again.',
    icon: 'wifi-off',
    recoveryAction: { label: 'Retry', action: 'retry' },
  },
  TTS_PROXY_FAILED: {
    code: 'TTS_PROXY_FAILED',
    category: 'network',
    severity: 'error',
    title: 'Voice Service Unavailable',
    message: 'Unable to generate voice response.',
    suggestion: 'The voice server may be temporarily down. Try again in a moment.',
    icon: 'wifi-off',
    recoveryAction: { label: 'Retry', action: 'retry' },
  },
  API_TIMEOUT: {
    code: 'API_TIMEOUT',
    category: 'network',
    severity: 'warning',
    title: 'Request Timeout',
    message: 'The request took too long to complete.',
    suggestion: 'Your connection may be slow. Try again.',
    icon: 'wifi-off',
    recoveryAction: { label: 'Retry', action: 'retry' },
  },

  // === AUDIO PLAYBACK ERRORS ===
  AUDIO_BLOCKED_BY_BROWSER: {
    code: 'AUDIO_BLOCKED_BY_BROWSER',
    category: 'audio',
    severity: 'warning',
    title: 'Audio Blocked',
    message: 'Your browser blocked automatic audio playback.',
    suggestion: 'Click anywhere on the page first, then try voice again.',
    icon: 'volume-x',
    recoveryAction: { label: 'Got It', action: 'dismiss' },
  },
  AUDIO_PLAYBACK_ERROR: {
    code: 'AUDIO_PLAYBACK_ERROR',
    category: 'audio',
    severity: 'error',
    title: 'Playback Failed',
    message: 'Unable to play the voice response.',
    suggestion: 'Check your audio output device and volume settings.',
    icon: 'volume-x',
    recoveryAction: { label: 'Retry', action: 'retry' },
  },
  AUDIO_SETUP_FAILED: {
    code: 'AUDIO_SETUP_FAILED',
    category: 'audio',
    severity: 'error',
    title: 'Audio Setup Failed',
    message: 'Unable to initialize audio system.',
    suggestion: 'Refresh the page and try again.',
    icon: 'volume-x',
    recoveryAction: { label: 'Refresh', action: 'refresh' },
  },

  // === SPEECH RECOGNITION ERRORS ===
  NO_SPEECH_DETECTED: {
    code: 'NO_SPEECH_DETECTED',
    category: 'speech',
    severity: 'info',
    title: 'No Speech Detected',
    message: 'We didn\'t hear anything.',
    suggestion: 'Make sure to speak clearly into your microphone.',
    icon: 'mic-off',
    recoveryAction: { label: 'Try Again', action: 'retry' },
  },
  SPEECH_ABORTED: {
    code: 'SPEECH_ABORTED',
    category: 'speech',
    severity: 'info',
    title: 'Listening Stopped',
    message: 'Voice capture was cancelled.',
    suggestion: 'Tap the voice button to start again.',
    icon: 'mic-off',
  },
  LOW_CONFIDENCE: {
    code: 'LOW_CONFIDENCE',
    category: 'speech',
    severity: 'warning',
    title: 'Unclear Speech',
    message: 'We had trouble understanding that.',
    suggestion: 'Try speaking more slowly and clearly.',
    icon: 'alert-triangle',
    recoveryAction: { label: 'Try Again', action: 'retry' },
  },

  // === SYSTEM ERRORS ===
  UNKNOWN_ERROR: {
    code: 'UNKNOWN_ERROR',
    category: 'system',
    severity: 'error',
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    suggestion: 'Please try again. If the problem persists, refresh the page.',
    icon: 'x-circle',
    recoveryAction: { label: 'Try Again', action: 'retry' },
  },
  RECOGNITION_START_FAILED: {
    code: 'RECOGNITION_START_FAILED',
    category: 'system',
    severity: 'error',
    title: 'Voice Start Failed',
    message: 'Unable to start voice recognition.',
    suggestion: 'Another voice session may be active. Refresh and try again.',
    icon: 'x-circle',
    recoveryAction: { label: 'Refresh', action: 'refresh' },
  },
};

// Map raw error codes to VoxError
export function mapErrorToVoxError(errorCode: string): VoxError {
  // Direct match
  if (ERROR_REGISTRY[errorCode]) {
    return ERROR_REGISTRY[errorCode];
  }

  // Pattern matching for common browser errors
  const errorMappings: Record<string, string> = {
    'not-allowed': 'MIC_PERMISSION_DENIED',
    'NotAllowedError': 'MIC_PERMISSION_DENIED',
    'permission-denied': 'MIC_PERMISSION_DENIED',
    'PermissionDeniedError': 'MIC_PERMISSION_DENIED',

    'NotFoundError': 'NO_MICROPHONE',
    'DevicesNotFoundError': 'NO_MICROPHONE',
    'audio-capture': 'NO_MICROPHONE',

    'NotReadableError': 'MIC_NOT_READABLE',
    'TrackStartError': 'MIC_IN_USE',
    'AbortError': 'MIC_IN_USE',

    'network': 'NETWORK_ERROR',
    'NetworkError': 'NETWORK_ERROR',

    'no-speech': 'NO_SPEECH_DETECTED',
    'aborted': 'SPEECH_ABORTED',

    'service-not-allowed': 'SPEECH_RECOGNITION_NOT_SUPPORTED',
    'language-not-supported': 'SPEECH_RECOGNITION_NOT_SUPPORTED',
  };

  const mappedCode = errorMappings[errorCode];
  if (mappedCode && ERROR_REGISTRY[mappedCode]) {
    return ERROR_REGISTRY[mappedCode];
  }

  // Check for partial matches
  const lowerCode = errorCode.toLowerCase();

  if (lowerCode.includes('permission') || lowerCode.includes('denied')) {
    return ERROR_REGISTRY.MIC_PERMISSION_DENIED;
  }
  if (lowerCode.includes('microphone') || lowerCode.includes('mic')) {
    return ERROR_REGISTRY.NO_MICROPHONE;
  }
  if (lowerCode.includes('network') || lowerCode.includes('connection')) {
    return ERROR_REGISTRY.NETWORK_ERROR;
  }
  if (lowerCode.includes('support')) {
    return ERROR_REGISTRY.SPEECH_RECOGNITION_NOT_SUPPORTED;
  }

  // Fallback to unknown error
  return {
    ...ERROR_REGISTRY.UNKNOWN_ERROR,
    message: errorCode || 'An unexpected error occurred.',
  };
}

// Check microphone availability before starting capture
export async function checkMicrophoneAvailability(): Promise<VoxError | null> {
  // Check secure context
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return ERROR_REGISTRY.SECURE_CONTEXT_REQUIRED;
  }

  // Check media devices support
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return ERROR_REGISTRY.MEDIA_DEVICES_NOT_SUPPORTED;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');

    if (audioInputs.length === 0) {
      return ERROR_REGISTRY.NO_MICROPHONE;
    }

    // Check if all devices have empty labels (permission not granted yet)
    const hasLabels = audioInputs.some(device => device.label !== '');

    if (!hasLabels) {
      // Permission not yet granted, but devices exist - this is okay
      return null;
    }

    return null;
  } catch (err) {
    console.error('[checkMicrophoneAvailability] Error:', err);
    return ERROR_REGISTRY.UNKNOWN_ERROR;
  }
}

// Get error from MediaDevices getUserMedia error
export function getMediaError(error: Error): VoxError {
  const name = error.name;
  const message = error.message?.toLowerCase() || '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    // Check if it was dismissed vs blocked
    if (message.includes('dismissed') || message.includes('prompt')) {
      return ERROR_REGISTRY.MIC_PERMISSION_DISMISSED;
    }
    return ERROR_REGISTRY.MIC_PERMISSION_DENIED;
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return ERROR_REGISTRY.NO_MICROPHONE;
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return ERROR_REGISTRY.MIC_NOT_READABLE;
  }

  if (name === 'AbortError') {
    return ERROR_REGISTRY.MIC_IN_USE;
  }

  if (name === 'OverconstrainedError') {
    return ERROR_REGISTRY.MIC_NOT_READABLE;
  }

  if (name === 'SecurityError') {
    return ERROR_REGISTRY.SECURE_CONTEXT_REQUIRED;
  }

  return mapErrorToVoxError(error.message || 'UNKNOWN_ERROR');
}
