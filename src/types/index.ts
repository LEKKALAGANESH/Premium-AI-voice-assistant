export type Role = 'user' | 'assistant' | 'system';

// 2026 Analytics: Message source classification
export type MessageSource = 'typed' | 'voice' | 'suggestion' | 'override';

// 2026 Analytics: Enhanced Message interface with metadata tracking
export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  // Legacy field - keeping for backwards compatibility
  isDeterministic?: boolean; // 2026: Live Data badge for time/date overrides
  confidence?: number; // STT confidence score (0-1)
  // 2026 Analytics: New metadata fields
  createdAt: number; // Absolute timestamp (epoch ms)
  source?: MessageSource; // Origin of message
  latency?: number; // Response time in ms (assistant messages only)
}

// 2026 Analytics: Conversation-level analytics aggregation
export interface ConversationAnalytics {
  totalMessages: number;
  userMessageCount: number;
  botMessageCount: number;
  averageLatency: number; // Cumulative average of bot response times (ms)
  sessionDuration: number; // Time elapsed between first and last message (ms)
  firstMessageAt: number | null; // Timestamp of first message
  lastMessageAt: number | null; // Timestamp of last message
}

// 2026 Analytics: Enhanced Conversation interface
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  isPinned?: boolean; // 2026: Pinned conversations appear at top
  // 2026 Analytics: Persistent analytics object
  analytics?: ConversationAnalytics;
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
  speakResponses: boolean; // 2026: Speak all AI responses (not just voice flow)
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
  // 2026 UNIFIED PIPELINE: Extended interface for atomic operations
  addMessageToConversation?(convId: string, message: Message): Promise<Conversation | null>;
  createAndPersistConversation?(title?: string): Promise<Conversation>;
  getActiveConversationIdSync?(): string | null;
  setActiveConversationIdSync?(id: string | null): void;
}
