// VoiceQueue.ts — Non-Overlapping TTS Queue Manager
// Version 2.1.0 — Added markdown stripping for clean TTS
//
// Pipeline: Sentence 1 SPEAKING -> Sentence 2 BUFFERED -> Sentence 3 DOWNLOADING
//
// Key contract:
//   enqueue()            — add a sentence to the pipeline
//   markStreamComplete() — signal that no more sentences are coming
//   onDrained            — fires ONLY when last sentence finishes AND stream is complete
//
// This ensures recognition.start() is called at exactly the right moment.

import { stripMarkdown } from './stripMarkdown';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceQueueConfig {
  rate: number;
  pitch: number;
  volume: number;
  lang: string;
  preferredVoice?: string;
  interSentenceGap: number;    // ms pause between sentences (natural rhythm)
  chromeResumeMs: number;      // Chrome 15s-pause bug workaround interval

  // Cloud TTS fallback: called when no local voice is available for a language
  cloudTtsFallback?: (text: string, lang: string) => Promise<string | null>;

  onSpeakStart?: (text: string, index: number) => void;
  onSpeakEnd?: (text: string, index: number) => void;
  onSpeakError?: (text: string, error: string) => void;
  onDrained?: () => void;      // ALL speech done — last sentence finished + stream complete
  onQueueChange?: (length: number) => void;
  onWordBoundary?: (word: string, charIndex: number) => void;
}

// ============================================================================
// WORLD-WIDE VOX: Accent-Prioritized Voice Preferences
// ============================================================================
// Maps BCP 47 locale prefixes to preferred voice name substrings.
// The picker tries these in order before falling back to generic lang match.
// ============================================================================

const VOICE_PREFERENCES: Record<string, string[]> = {
  'hi':    ['Google हिन्दी', 'Microsoft Hemant', 'Microsoft Kalpana', 'Hindi'],
  'te':    ['Google తెలుగు', 'Microsoft Chitra', 'Telugu'],
  'ta':    ['Google தமிழ்', 'Microsoft Valluvar', 'Tamil'],
  'bn':    ['Google বাংলা', 'Microsoft Bashkar', 'Bengali', 'Bangla'],
  'gu':    ['Google ગુજરાતી', 'Microsoft Dhwani', 'Gujarati'],
  'kn':    ['Google ಕನ್ನಡ', 'Microsoft Gagan', 'Kannada'],
  'ml':    ['Google മലയാളം', 'Microsoft Sobhana', 'Malayalam'],
  'pa':    ['Google ਪੰਜਾਬੀ', 'Punjabi'],
  'mr':    ['Google मराठी', 'Marathi'],
  'es':    ['Google español', 'Microsoft Raul', 'Microsoft Helena', 'Español', 'Spanish'],
  'fr':    ['Google français', 'Microsoft Paul', 'Microsoft Julie', 'Français', 'French'],
  'de':    ['Google Deutsch', 'Microsoft Stefan', 'Microsoft Hedda', 'Deutsch', 'German'],
  'it':    ['Google italiano', 'Microsoft Cosimo', 'Microsoft Elsa', 'Italiano', 'Italian'],
  'pt':    ['Google português', 'Microsoft Daniel', 'Português', 'Portuguese'],
  'ru':    ['Google русский', 'Microsoft Pavel', 'Microsoft Irina', 'Русский', 'Russian'],
  'ja':    ['Google 日本語', 'Microsoft Haruka', 'Microsoft Ichiro', 'Japanese'],
  'ko':    ['Google 한국의', 'Microsoft Heami', 'Korean'],
  'zh':    ['Google 普通话', 'Microsoft Huihui', 'Microsoft Kangkang', 'Chinese', 'Mandarin'],
  'ar':    ['Google العربية', 'Microsoft Hoda', 'Arabic'],
  'tr':    ['Google Türkçe', 'Microsoft Tolga', 'Turkish'],
  'nl':    ['Google Nederlands', 'Microsoft Frank', 'Dutch'],
  'pl':    ['Google polski', 'Microsoft Adam', 'Polish'],
  'sv':    ['Google svenska', 'Swedish'],
  'el':    ['Google Ελληνικά', 'Greek'],
  'he':    ['Google עברית', 'Hebrew'],
  'th':    ['Google ไทย', 'Thai'],
  'vi':    ['Google Tiếng Việt', 'Vietnamese'],
  'id':    ['Google Bahasa Indonesia', 'Indonesian'],
  'uk':    ['Google українська', 'Ukrainian'],
  'cs':    ['Google čeština', 'Czech'],
  'ro':    ['Google română', 'Romanian'],
  'da':    ['Google dansk', 'Danish'],
  'fi':    ['Google suomi', 'Finnish'],
  'no':    ['Google norsk', 'Norwegian'],
  'hu':    ['Google magyar', 'Hungarian'],
  'en':    ['Google US English', 'Google UK English Female', 'Microsoft Zira', 'Microsoft David', 'English'],
};

interface QueueEntry {
  text: string;
  index: number;
}

// ============================================================================
// VOICE QUEUE CLASS
// ============================================================================

export class VoiceQueue {
  private config: VoiceQueueConfig;
  private queue: QueueEntry[] = [];
  private speaking = false;
  private streamComplete = false;
  private entryIndex = 0;
  private utterance: SpeechSynthesisUtterance | null = null;
  private chromeTimer: ReturnType<typeof setInterval> | null = null;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private destroyed = false;

  constructor(config: Partial<VoiceQueueConfig> = {}) {
    this.config = {
      rate: 1.05,
      pitch: 1.0,
      volume: 1.0,
      lang: 'en-US',
      interSentenceGap: 30,    // Reduced for human-level latency
      chromeResumeMs: 120,     // Faster Chrome resume cycle
      ...config,
    };
    this.loadVoices();
  }

  // ── Voice Loading ──────────────────────────────────────

  private loadVoices(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    this.voices = window.speechSynthesis.getVoices();
    if (this.voices.length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this.voices = window.speechSynthesis.getVoices();
      }, { once: true });
    }
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (!this.voices.length) return null;
    const { lang, preferredVoice } = this.config;
    const prefix = lang.split('-')[0].toLowerCase();

    // 1. User's explicit preferred voice (highest priority)
    if (preferredVoice) {
      const match = this.voices.find(v =>
        v.name.toLowerCase().includes(preferredVoice.toLowerCase())
      );
      if (match) return match;
    }

    // 2. Accent-prioritized preferences from VOICE_PREFERENCES map
    const prefs = VOICE_PREFERENCES[prefix];
    if (prefs) {
      for (const pref of prefs) {
        const match = this.voices.find(v =>
          v.name.toLowerCase().includes(pref.toLowerCase()) &&
          v.lang.toLowerCase().startsWith(prefix)
        );
        if (match) return match;
      }
    }

    // 3. Exact locale match (e.g., 'hi-IN' exact)
    const exactLocal = this.voices.find(v => v.lang === lang && v.localService);
    if (exactLocal) return exactLocal;

    const exact = this.voices.find(v => v.lang === lang);
    if (exact) return exact;

    // 4. Language prefix match (e.g., 'hi' matches 'hi-IN')
    const prefixLocal = this.voices.find(v =>
      v.lang.toLowerCase().startsWith(prefix) && v.localService
    );
    if (prefixLocal) return prefixLocal;

    const prefixMatch = this.voices.find(v =>
      v.lang.toLowerCase().startsWith(prefix)
    );
    if (prefixMatch) return prefixMatch;

    // 5. No voice for this language — return null (triggers cloud fallback)
    return null;
  }

  /** Check if a local voice is available for the current language */
  hasLocalVoice(): boolean {
    if (!this.voices.length) return false;
    const prefix = this.config.lang.split('-')[0].toLowerCase();
    return this.voices.some(v => v.lang.toLowerCase().startsWith(prefix));
  }

  // ── Public API ─────────────────────────────────────────

  /** Add a sentence to the pipeline. Strips markdown before speaking. */
  enqueue(text: string): void {
    const cleaned = stripMarkdown(text.trim());
    if (!cleaned || this.destroyed) return;

    this.queue.push({ text: cleaned, index: this.entryIndex++ });
    this.config.onQueueChange?.(this.queue.length);

    if (!this.speaking) this.next();
  }

  /** Signal that the stream is done — no more sentences are coming. */
  markStreamComplete(): void {
    this.streamComplete = true;
    // If queue already drained while we were waiting for this signal, fire now
    if (!this.speaking && this.queue.length === 0) {
      this.config.onDrained?.();
    }
  }

  /** Hard stop: cancel everything, clear queue. Does NOT fire onDrained. */
  stop(): void {
    this.clearTimers();
    this.queue = [];
    this.streamComplete = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.cleanupUtterance();
    this.speaking = false;
    this.config.onQueueChange?.(0);
  }

  /** Interrupt: stop everything AND fire onDrained (triggers conversation loop). */
  interrupt(): void {
    this.stop();
    this.config.onDrained?.();
  }

  /** Skip just the current sentence — onend handler will advance to next. */
  skipCurrent(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  pause(): void { window.speechSynthesis?.pause(); }
  resume(): void { window.speechSynthesis?.resume(); }

  /** Reset for a new conversation turn. */
  reset(): void {
    this.stop();
    this.entryIndex = 0;
    this.streamComplete = false;
  }

  /** Full teardown — call on unmount. */
  destroy(): void {
    this.destroyed = true;
    this.stop();
  }

  // ── Getters ────────────────────────────────────────────

  get length(): number { return this.queue.length; }
  get isSpeaking(): boolean { return this.speaking; }
  get isEmpty(): boolean { return this.queue.length === 0 && !this.speaking; }

  updateConfig(config: Partial<VoiceQueueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ── Internal Pipeline ──────────────────────────────────

  private next(): void {
    if (this.destroyed) return;

    if (this.queue.length === 0) {
      this.speaking = false;
      // Only fire onDrained when stream is complete AND queue is empty
      if (this.streamComplete) {
        this.config.onDrained?.();
      }
      return;
    }

    const entry = this.queue.shift()!;
    this.config.onQueueChange?.(this.queue.length);
    this.speak(entry);
  }

  private speak(entry: QueueEntry): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.next();
      return;
    }

    this.speaking = true;
    const voice = this.pickVoice();

    // WORLD-WIDE VOX: Cloud TTS fallback when no local voice is available
    if (!voice && this.config.cloudTtsFallback) {
      console.log('[VoiceQueue] No local voice for', this.config.lang, '— using cloud TTS fallback');
      this.speakWithCloudFallback(entry);
      return;
    }

    console.log('[VoiceQueue] TTS triggered with text:', entry.text.substring(0, 60),
      '| lang:', this.config.lang, '| voice:', voice?.name || 'browser-default');

    // VOICE RECOVERY: Cancel any lingering utterance, then use a microtask
    // delay before speaking. Direct cancel→speak causes silent drops on Chrome/Windows.
    window.speechSynthesis.cancel();

    // VOICE RECOVERY: Resume the synthesis context — browsers silently pause it
    // after inactivity, causing all subsequent speaks to be silently queued.
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Microtask delay: let cancel() fully propagate before queuing new utterance
    setTimeout(() => {
      if (this.destroyed) return;

      const utt = new SpeechSynthesisUtterance(entry.text);
      this.utterance = utt;
      // Prevent Chrome garbage-collection of the utterance object
      (window as any).__vqUtterance = utt;

      if (voice) utt.voice = voice;
      utt.rate = this.config.rate;
      utt.pitch = this.config.pitch;
      utt.volume = this.config.volume;

      // FORCE LOCALE FIX: Always set utterance.lang to the exact locale.
      // This prevents the "English Accent" bug where the browser uses the default
      // system voice accent regardless of the selected voice's language.
      if (this.config.lang) utt.lang = this.config.lang;

      utt.onstart = () => {
        console.log('[VoiceQueue] TTS onstart | lang:', this.config.lang, '| voice:', voice?.name);
        this.config.onSpeakStart?.(entry.text, entry.index);
        this.startChromeWorkaround();
      };

      utt.onboundary = (e) => {
        if (e.name === 'word') {
          this.config.onWordBoundary?.(
            entry.text.substring(e.charIndex, e.charIndex + (e.charLength || 10)),
            e.charIndex,
          );
        }
      };

      utt.onend = () => {
        this.stopChromeWorkaround();
        this.cleanupUtterance();
        this.config.onSpeakEnd?.(entry.text, entry.index);
        // Inter-sentence gap for natural speech rhythm
        this.gapTimer = setTimeout(() => {
          this.gapTimer = null;
          this.next();
        }, this.config.interSentenceGap);
      };

      utt.onerror = (e) => {
        console.warn('[VoiceQueue] TTS onerror:', e.error, 'for:', entry.text.substring(0, 40));
        this.stopChromeWorkaround();
        this.cleanupUtterance();
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          this.config.onSpeakError?.(entry.text, e.error);
        }
        // Continue pipeline — skip the errored sentence
        this.gapTimer = setTimeout(() => {
          this.gapTimer = null;
          this.next();
        }, 50);
      };

      // VOICE RECOVERY: Final resume right before speak to ensure context is active
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      window.speechSynthesis.speak(utt);
    }, 10); // 10ms delay: enough for cancel to propagate, imperceptible to user
  }

  // ── Cloud TTS Fallback (Zero Silence) ───────────────────
  // Used when no local voice exists for the target language.
  // Calls the cloud TTS API and plays the returned audio.

  private async speakWithCloudFallback(entry: QueueEntry): Promise<void> {
    this.config.onSpeakStart?.(entry.text, entry.index);

    try {
      const base64Audio = await this.config.cloudTtsFallback!(entry.text, this.config.lang);
      if (this.destroyed || !base64Audio) {
        this.config.onSpeakEnd?.(entry.text, entry.index);
        this.gapTimer = setTimeout(() => { this.gapTimer = null; this.next(); }, 50);
        return;
      }

      const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
      // Store globally to prevent GC
      (window as any).__vqCloudAudio = audio;

      audio.playbackRate = this.config.rate;
      audio.volume = this.config.volume;

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          (window as any).__vqCloudAudio = null;
          this.config.onSpeakEnd?.(entry.text, entry.index);
          resolve();
        };
        audio.onerror = () => {
          console.warn('[VoiceQueue] Cloud TTS playback error for:', entry.text.substring(0, 40));
          (window as any).__vqCloudAudio = null;
          this.config.onSpeakError?.(entry.text, 'cloud-playback-error');
          resolve();
        };
        audio.play().catch(() => {
          (window as any).__vqCloudAudio = null;
          resolve();
        });
      });
    } catch (err) {
      console.warn('[VoiceQueue] Cloud TTS fallback failed:', err);
      this.config.onSpeakError?.(entry.text, 'cloud-fallback-failed');
    }

    // Continue pipeline
    this.gapTimer = setTimeout(() => {
      this.gapTimer = null;
      this.next();
    }, this.config.interSentenceGap);
  }

  // ── Cleanup Helpers ────────────────────────────────────

  private cleanupUtterance(): void {
    this.utterance = null;
    (window as any).__vqUtterance = null;
  }

  private clearTimers(): void {
    this.stopChromeWorkaround();
    if (this.gapTimer) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }

  // ── Chrome 15-Second Pause Bug Workaround ──────────────

  private startChromeWorkaround(): void {
    this.stopChromeWorkaround();
    this.chromeTimer = setInterval(() => {
      if (window.speechSynthesis.paused && this.speaking) {
        window.speechSynthesis.resume();
      }
    }, this.config.chromeResumeMs);
  }

  private stopChromeWorkaround(): void {
    if (this.chromeTimer) {
      clearInterval(this.chromeTimer);
      this.chromeTimer = null;
    }
  }
}

export default VoiceQueue;
