// VoxAI Test Setup - Global Mocks for Browser APIs
import { vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// ============================================================================
// SPEECH RECOGNITION MOCK
// ============================================================================

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  maxAlternatives = 1;

  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onaudioend: (() => void) | null = null;

  private isRunning = false;

  start() {
    if (this.isRunning) {
      throw new Error('Recognition already started');
    }
    this.isRunning = true;
    setTimeout(() => this.onstart?.(), 0);
  }

  stop() {
    this.isRunning = false;
    setTimeout(() => this.onend?.(), 0);
  }

  abort() {
    this.isRunning = false;
    setTimeout(() => this.onend?.(), 0);
  }

  // Test helper: Simulate a recognition result
  simulateResult(transcript: string, confidence: number, isFinal: boolean) {
    if (this.onresult) {
      this.onresult({
        resultIndex: 0,
        results: [
          [{ transcript, confidence }],
        ].map((alts, i) => ({
          ...alts,
          isFinal,
          length: 1,
          item: (idx: number) => alts[idx],
          [0]: alts[0],
        })),
      });
    }
  }

  // Test helper: Simulate an error
  simulateError(error: string) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

// ============================================================================
// SPEECH SYNTHESIS MOCK
// ============================================================================

class MockSpeechSynthesisUtterance {
  text: string;
  lang = 'en-US';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  volume = 1;

  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;

  constructor(text: string = '') {
    this.text = text;
  }
}

const mockVoices: SpeechSynthesisVoice[] = [
  { name: 'English US', lang: 'en-US', voiceURI: 'en-US', default: true, localService: true },
  { name: 'English UK', lang: 'en-GB', voiceURI: 'en-GB', default: false, localService: true },
  { name: 'Hindi', lang: 'hi-IN', voiceURI: 'hi-IN', default: false, localService: true },
  { name: 'Spanish', lang: 'es-ES', voiceURI: 'es-ES', default: false, localService: true },
] as SpeechSynthesisVoice[];

const mockSpeechSynthesis = {
  speaking: false,
  pending: false,
  paused: false,
  onvoiceschanged: null as (() => void) | null,

  getVoices: vi.fn(() => mockVoices),
  speak: vi.fn((utterance: MockSpeechSynthesisUtterance) => {
    mockSpeechSynthesis.speaking = true;
    setTimeout(() => {
      utterance.onstart?.();
      setTimeout(() => {
        mockSpeechSynthesis.speaking = false;
        utterance.onend?.();
      }, 100);
    }, 0);
  }),
  cancel: vi.fn(() => {
    mockSpeechSynthesis.speaking = false;
    mockSpeechSynthesis.pending = false;
  }),
  pause: vi.fn(() => {
    mockSpeechSynthesis.paused = true;
  }),
  resume: vi.fn(() => {
    mockSpeechSynthesis.paused = false;
  }),
};

// ============================================================================
// MEDIA DEVICES MOCK
// ============================================================================

const mockMediaStream = {
  getTracks: () => [{ stop: vi.fn() }],
  getAudioTracks: () => [{ stop: vi.fn() }],
};

const mockMediaDevices = {
  getUserMedia: vi.fn(() => Promise.resolve(mockMediaStream)),
  enumerateDevices: vi.fn(() =>
    Promise.resolve([
      { kind: 'audioinput', deviceId: 'default', label: 'Default Microphone' },
      { kind: 'audiooutput', deviceId: 'default', label: 'Default Speaker' },
    ])
  ),
};

// ============================================================================
// LOCAL STORAGE MOCK
// ============================================================================

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

// ============================================================================
// AUDIO CONTEXT MOCK
// ============================================================================

class MockAudioContext {
  state = 'running';
  sampleRate = 44100;

  createGain = vi.fn(() => ({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));

  createOscillator = vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));

  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));

  createAnalyser = vi.fn(() => ({
    fftSize: 256,
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));

  resume = vi.fn(() => Promise.resolve());
  suspend = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
}

// ============================================================================
// PERFORMANCE MOCK
// ============================================================================

const performanceMock = {
  now: vi.fn(() => Date.now()),
};

// ============================================================================
// GLOBAL SETUP
// ============================================================================

beforeEach(() => {
  // Setup Speech Recognition
  vi.stubGlobal('SpeechRecognition', MockSpeechRecognition);
  vi.stubGlobal('webkitSpeechRecognition', MockSpeechRecognition);

  // Setup Speech Synthesis
  vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
  vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);

  // Setup Media Devices
  Object.defineProperty(navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true,
    configurable: true,
  });

  // Setup Local Storage
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });

  // Setup Audio Context
  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal('webkitAudioContext', MockAudioContext);

  // Setup Performance
  Object.defineProperty(window, 'performance', {
    value: performanceMock,
    writable: true,
    configurable: true,
  });

  // Setup secure context
  Object.defineProperty(window, 'isSecureContext', {
    value: true,
    writable: true,
    configurable: true,
  });

  // Reset all mocks
  vi.clearAllMocks();
  localStorageMock.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// EXPORTS FOR TESTS
// ============================================================================

export {
  MockSpeechRecognition,
  MockSpeechSynthesisUtterance,
  mockSpeechSynthesis,
  mockMediaDevices,
  mockMediaStream,
  localStorageMock,
  MockAudioContext,
  mockVoices,
};
