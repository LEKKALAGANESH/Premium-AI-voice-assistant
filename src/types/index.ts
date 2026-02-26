export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  isDeterministic?: boolean; // 2026: Live Data badge for time/date overrides
  confidence?: number; // STT confidence score (0-1)
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  isPinned?: boolean; // 2026: Pinned conversations appear at top
}

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

// 2026 Standard: Independent input thread management
export type InputMode = 'idle' | 'voice' | 'text';

// 2026 Standard: Failed message retry queue
export interface FailedMessage {
  text: string;
  retryCount: number;
  timestamp: number;
}

// 2026 Standard: Voice agent state with enhanced tracking
export interface VoiceAgentState {
  state: VoiceState;
  inputMode: InputMode;
  partialTranscript: string;
  vadProgress: number;
  currentSpokenWordIndex: number;
  transcriptConfidence: number;
  failedMessage: FailedMessage | null;
  wordsBuffer: string[]; // 3-word look-ahead shared buffer
  speechRate: number; // Detected speech rate for adaptive VAD
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  voiceEnabled: boolean;
  voiceName: string;
  whisperMode: boolean;
  speechRate: number;
  accessibilityAnnouncements: boolean; // WCAG 2.2: aria-live toggle
  reducedMotion: boolean; // WCAG 2.2: respect prefers-reduced-motion
  uiScale: number; // Global UI scale factor (0.8 - 1.4, default 1.0)
  focusMode: boolean; // 2026: Zen Focus Mode - hides sidebar, centers chat container
}

export interface StorageAdapter {
  getConversations(): Promise<Conversation[]>;
  saveConversation(conv: Conversation): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  getSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<void>;
}
