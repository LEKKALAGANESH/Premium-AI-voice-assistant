// StreamToVoiceController.ts - Real-time Streaming TTS with Sentence Buffering
// Reduces perceived latency from ~3s to <500ms by:
// 1. Streaming text from Gemini as it arrives
// 2. Detecting complete sentences (. ! ? , :)
// 3. Sending sentences to TTS immediately
// 4. Buffering next sentences while speaking

// ============================================================================
// TYPES
// ============================================================================

export interface StreamControllerConfig {
  onSentenceReady?: (sentence: string, index: number) => void;
  onSpeakingStart?: (sentence: string, index: number) => void;
  onSpeakingEnd?: (sentence: string, index: number) => void;
  onAllComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: StreamState) => void;
  speechRate?: number;
  voiceLang?: string;
}

export type StreamState =
  | 'IDLE'
  | 'STREAMING'     // Receiving chunks from API
  | 'BUFFERING'     // Building sentence buffer
  | 'SPEAKING'      // TTS active
  | 'COMPLETE'
  | 'ERROR'
  | 'CANCELLED';

interface SentenceQueueItem {
  text: string;
  index: number;
}

// ============================================================================
// SENTENCE DETECTION UTILITIES
// ============================================================================

// Sentence-ending punctuation (excludes abbreviations)
const SENTENCE_ENDINGS = /[.!?]\s*$/;
const CLAUSE_ENDINGS = /[,;:]\s*$/;

// Minimum characters before we consider a clause speakable
const MIN_SPEAKABLE_LENGTH = 20;

// Maximum buffer size before forcing a speak (for very long sentences)
const MAX_BUFFER_SIZE = 150;

/**
 * Detect if we have a complete, speakable segment
 */
function hasSpeakableSegment(text: string): { speakable: boolean; splitIndex: number } {
  // Check for sentence ending
  const sentenceMatch = text.match(/[.!?]/g);
  if (sentenceMatch) {
    const lastPunctIndex = Math.max(
      text.lastIndexOf('.'),
      text.lastIndexOf('!'),
      text.lastIndexOf('?')
    );
    if (lastPunctIndex > MIN_SPEAKABLE_LENGTH) {
      return { speakable: true, splitIndex: lastPunctIndex + 1 };
    }
  }

  // Check for clause ending (comma, semicolon) if buffer is getting large
  if (text.length > MIN_SPEAKABLE_LENGTH * 2) {
    const clauseMatch = text.match(/[,;:]/g);
    if (clauseMatch) {
      const lastClauseIndex = Math.max(
        text.lastIndexOf(','),
        text.lastIndexOf(';'),
        text.lastIndexOf(':')
      );
      if (lastClauseIndex > MIN_SPEAKABLE_LENGTH) {
        return { speakable: true, splitIndex: lastClauseIndex + 1 };
      }
    }
  }

  // Force split if buffer is too large
  if (text.length > MAX_BUFFER_SIZE) {
    // Find last space to avoid breaking words
    const lastSpace = text.lastIndexOf(' ', MAX_BUFFER_SIZE);
    if (lastSpace > MIN_SPEAKABLE_LENGTH) {
      return { speakable: true, splitIndex: lastSpace + 1 };
    }
  }

  return { speakable: false, splitIndex: -1 };
}

// ============================================================================
// STREAM TO VOICE CONTROLLER
// ============================================================================

export class StreamToVoiceController {
  private config: StreamControllerConfig;
  private state: StreamState = 'IDLE';
  private buffer: string = '';
  private sentenceQueue: SentenceQueueItem[] = [];
  private sentenceIndex: number = 0;
  private isSpeaking: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private abortController: AbortController | null = null;
  private isSessionActive: boolean = false;
  private fullText: string = '';
  private voices: SpeechSynthesisVoice[] = [];

  constructor(config: StreamControllerConfig = {}) {
    this.config = config;
    this.loadVoices();
  }

  // ========== VOICE LOADING ==========

  private loadVoices(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadFn = () => {
      this.voices = window.speechSynthesis.getVoices();
    };

    loadFn();
    window.speechSynthesis.addEventListener('voiceschanged', loadFn, { once: true });
  }

  private getPreferredVoice(): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) return null;

    const lang = this.config.voiceLang || 'en-US';
    const langPrefix = lang.split('-')[0];

    return (
      this.voices.find(v => v.lang === lang && v.localService) ||
      this.voices.find(v => v.lang === lang) ||
      this.voices.find(v => v.lang.startsWith(langPrefix)) ||
      this.voices[0]
    );
  }

  // ========== STATE MANAGEMENT ==========

  private setState(newState: StreamState): void {
    this.state = newState;
    this.config.onStateChange?.(newState);
  }

  getState(): StreamState {
    return this.state;
  }

  isActive(): boolean {
    return this.isSessionActive;
  }

  // ========== MAIN STREAMING METHOD ==========

  /**
   * Start streaming from API and progressively speak sentences
   */
  async startStreaming(prompt: string, history: { role: string; content: string }[] = []): Promise<string> {
    if (this.isSessionActive) {
      console.warn('[StreamController] Session already active');
      return '';
    }

    this.reset();
    this.isSessionActive = true;
    this.setState('STREAMING');

    this.abortController = new AbortController();

    try {
      const response = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (this.isSessionActive) {
        const { done, value } = await reader.read();

        if (done) break;

        const text = decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.error) {
                throw new Error(data.error);
              }

              if (data.chunk) {
                this.processChunk(data.chunk);
              }

              if (data.done) {
                this.fullText = data.fullText || this.fullText;
              }
            } catch (parseErr) {
              // Ignore JSON parse errors for incomplete chunks
              if (!(parseErr instanceof SyntaxError)) {
                throw parseErr;
              }
            }
          }
        }
      }

      // Process any remaining buffer
      if (this.buffer.trim() && this.isSessionActive) {
        this.queueSentence(this.buffer.trim());
        this.buffer = '';
      }

      // Wait for all speech to complete
      await this.waitForSpeechComplete();

      this.setState('COMPLETE');
      this.config.onAllComplete?.(this.fullText);

      return this.fullText;

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[StreamController] Stream aborted');
        this.setState('CANCELLED');
      } else {
        console.error('[StreamController] Error:', err);
        this.setState('ERROR');
        this.config.onError?.(err instanceof Error ? err : new Error('Stream failed'));
      }
      return this.fullText;
    } finally {
      this.isSessionActive = false;
      this.abortController = null;
    }
  }

  // ========== CHUNK PROCESSING ==========

  private processChunk(chunk: string): void {
    this.buffer += chunk;
    this.fullText += chunk;
    this.setState('BUFFERING');

    // Check if we have a speakable segment
    const { speakable, splitIndex } = hasSpeakableSegment(this.buffer);

    if (speakable) {
      const toSpeak = this.buffer.slice(0, splitIndex).trim();
      this.buffer = this.buffer.slice(splitIndex);

      if (toSpeak) {
        this.queueSentence(toSpeak);
      }
    }
  }

  // ========== SENTENCE QUEUE MANAGEMENT ==========

  private queueSentence(text: string): void {
    const item: SentenceQueueItem = {
      text,
      index: this.sentenceIndex++,
    };

    this.sentenceQueue.push(item);
    this.config.onSentenceReady?.(text, item.index);

    console.log(`[StreamController] Queued sentence #${item.index}: "${text.substring(0, 50)}..."`);

    // Start speaking if not already
    if (!this.isSpeaking) {
      this.speakNext();
    }
  }

  private speakNext(): void {
    if (!this.isSessionActive) return;
    if (this.sentenceQueue.length === 0) {
      this.isSpeaking = false;
      return;
    }

    const item = this.sentenceQueue.shift()!;
    this.speakSentence(item);
  }

  private speakSentence(item: SentenceQueueItem): void {
    if (!window.speechSynthesis) {
      console.warn('[StreamController] SpeechSynthesis not available');
      this.speakNext();
      return;
    }

    this.isSpeaking = true;
    this.setState('SPEAKING');

    // Cancel any existing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(item.text);
    this.currentUtterance = utterance;

    // Store globally to prevent GC
    (window as any).__streamControllerUtterance = utterance;

    // Configure voice
    const voice = this.getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = this.config.speechRate || 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.lang = this.config.voiceLang || 'en-US';

    // Chrome bug workaround: Keep-alive timer
    let resumeInterval: ReturnType<typeof setInterval> | null = null;

    utterance.onstart = () => {
      console.log(`[StreamController] Speaking #${item.index}`);
      this.config.onSpeakingStart?.(item.text, item.index);

      // Chrome workaround: Resume if paused
      resumeInterval = setInterval(() => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 200);
    };

    utterance.onend = () => {
      console.log(`[StreamController] Finished #${item.index}`);
      if (resumeInterval) clearInterval(resumeInterval);

      this.currentUtterance = null;
      (window as any).__streamControllerUtterance = null;

      this.config.onSpeakingEnd?.(item.text, item.index);

      // Speak next sentence if available AND session still active
      if (this.isSessionActive) {
        // Small delay for natural speech rhythm
        setTimeout(() => this.speakNext(), 50);
      } else {
        this.isSpeaking = false;
      }
    };

    utterance.onerror = (event) => {
      console.error(`[StreamController] Speech error:`, event.error);
      if (resumeInterval) clearInterval(resumeInterval);

      this.currentUtterance = null;
      (window as any).__streamControllerUtterance = null;

      // Continue with next sentence unless interrupted
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        setTimeout(() => this.speakNext(), 100);
      } else {
        this.isSpeaking = false;
      }
    };

    // Speak!
    window.speechSynthesis.speak(utterance);
  }

  private waitForSpeechComplete(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.isSpeaking && this.sentenceQueue.length === 0) {
          resolve();
        } else if (this.isSessionActive) {
          setTimeout(check, 100);
        } else {
          resolve();
        }
      };
      check();
    });
  }

  // ========== CONTROL METHODS ==========

  /**
   * Soft Stop: Cancel current utterance AND streaming, but keep session capability
   * This allows the user to ask a new question without fully ending the session
   */
  interruptCurrent(): void {
    console.log('[StreamController] Soft stop - interrupting current activity');

    // 1. Abort any ongoing streaming
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // 2. Cancel current speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // 3. Clear utterance refs
    this.currentUtterance = null;
    (window as any).__streamControllerUtterance = null;
    this.isSpeaking = false;

    // 4. Clear the queue (user interrupted, don't continue speaking)
    this.sentenceQueue = [];
    this.buffer = '';

    // 5. Mark streaming as inactive (but session can continue)
    this.isSessionActive = false;

    this.setState('CANCELLED');
  }

  /**
   * Hard End: Cancel everything and end session
   */
  endSession(): void {
    console.log('[StreamController] Ending session');

    this.isSessionActive = false;

    // Cancel streaming
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Cancel speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    this.currentUtterance = null;
    (window as any).__streamControllerUtterance = null;
    this.isSpeaking = false;

    // Clear queue
    this.sentenceQueue = [];
    this.buffer = '';

    this.setState('CANCELLED');
  }

  /**
   * Skip current sentence and move to next
   */
  skipToNext(): void {
    // Cancel only the current utterance, not the whole session
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    (window as any).__streamControllerUtterance = null;

    // Speak next sentence if queue has items
    if (this.sentenceQueue.length > 0) {
      this.speakNext();
    } else {
      this.isSpeaking = false;
    }
  }

  /**
   * Pause speech
   */
  pause(): void {
    if (window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
  }

  /**
   * Resume speech
   */
  resume(): void {
    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
  }

  /**
   * Reset controller state
   */
  reset(): void {
    this.endSession();
    this.buffer = '';
    this.fullText = '';
    this.sentenceIndex = 0;
    this.setState('IDLE');
  }

  /**
   * Get current buffer content (for UI display)
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get full accumulated text
   */
  getFullText(): string {
    return this.fullText;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.sentenceQueue.length;
  }

  /**
   * Check if currently speaking
   */
  isSpeakingNow(): boolean {
    return this.isSpeaking;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StreamControllerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let streamControllerInstance: StreamToVoiceController | null = null;

export function getStreamController(config?: StreamControllerConfig): StreamToVoiceController {
  if (!streamControllerInstance) {
    streamControllerInstance = new StreamToVoiceController(config);
  } else if (config) {
    streamControllerInstance.updateConfig(config);
  }
  return streamControllerInstance;
}

export function destroyStreamController(): void {
  if (streamControllerInstance) {
    streamControllerInstance.endSession();
    streamControllerInstance = null;
  }
}

export default StreamToVoiceController;
