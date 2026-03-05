// VoiceSupervisor - Google-Grade Voice AI State Machine
// Root-Fix for "Permanent Silence" and "Conversation Dropout"
//
// Architecture:
// 1. Audio Unlocker - User-Gesture priming for browser sandbox
// 2. Supervisor State Machine - IDLE, LISTENING, THINKING, SPEAKING
// 3. Zombie Listener Fix - Recursive auto-restart
// 4. Speech Synthesis Queue - Cancel-before-speak pattern
// 5. Heartbeat Monitor - 5-second liveness check
//
// This is a SINGLETON - survives React re-renders

// ============================================================================
// TYPES
// ============================================================================

export type SupervisorStatus = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';
export type Participant = 'A' | 'B';

export interface SupervisorConfig {
  languageA: string;
  languageB: string;
  autoListen: boolean;
  continuousMode: boolean;
  speechRate: number;
  onStatusChange?: (status: SupervisorStatus) => void;
  onSpeakerChange?: (speaker: Participant | null) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onTranslation?: (original: string, translated: string, speaker: Participant) => void;
  onError?: (error: string, recoverable: boolean) => void;
  onAudioLevel?: (level: number) => void;
}

interface SpeechQueueItem {
  text: string;
  lang: string;
  onStart?: () => void;
  onEnd?: () => void;
}

// ============================================================================
// GLOBAL SINGLETON STATE (Survives React re-renders)
// ============================================================================

declare global {
  interface Window {
    __voiceSupervisor?: VoiceSupervisor;
    __audioUnlocked?: boolean;
    __supervisorUtterance?: SpeechSynthesisUtterance | null;
    __supervisorRecognition?: SpeechRecognition | null;
  }
}

// ============================================================================
// VOICE SUPERVISOR CLASS
// ============================================================================

export class VoiceSupervisor {
  // ========== STATE ==========
  private status: SupervisorStatus = 'IDLE';
  private currentSpeaker: Participant | null = null;
  private isAudioUnlocked: boolean = false;
  private isDestroyed: boolean = false;

  // ========== CONFIG ==========
  private config: SupervisorConfig;

  // ========== BROWSER APIs ==========
  private recognition: SpeechRecognition | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;

  // ========== SPEECH QUEUE ==========
  private speechQueue: SpeechQueueItem[] = [];
  private isSpeaking: boolean = false;

  // ========== HEARTBEAT ==========
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 5000;

  // ========== ZOMBIE PROTECTION ==========
  private expectedStatus: SupervisorStatus = 'IDLE';
  private recognitionRestartAttempts: number = 0;
  private readonly MAX_RESTART_ATTEMPTS = 5;
  private lastRecognitionEnd: number = 0;

  // ========== AUDIO MONITORING ==========
  private animationFrame: number | null = null;
  private audioLevelCallback: ((level: number) => void) | null = null;

  // ========== VOICES ==========
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded: boolean = false;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(config: SupervisorConfig) {
    this.config = config;
    this.audioLevelCallback = config.onAudioLevel || null;

    // Load voices
    this.loadVoices();

    console.log('[VoiceSupervisor] Initialized');
  }

  // ============================================================================
  // SINGLETON PATTERN
  // ============================================================================

  static getInstance(config: SupervisorConfig): VoiceSupervisor {
    if (!window.__voiceSupervisor || window.__voiceSupervisor.isDestroyed) {
      window.__voiceSupervisor = new VoiceSupervisor(config);
    } else {
      // Update config on existing instance
      window.__voiceSupervisor.updateConfig(config);
    }
    return window.__voiceSupervisor;
  }

  static destroyInstance(): void {
    if (window.__voiceSupervisor) {
      window.__voiceSupervisor.destroy();
      window.__voiceSupervisor = undefined;
    }
  }

  // ============================================================================
  // CONFIG UPDATE
  // ============================================================================

  updateConfig(config: Partial<SupervisorConfig>): void {
    this.config = { ...this.config, ...config };
    this.audioLevelCallback = config.onAudioLevel || this.audioLevelCallback;
  }

  // ============================================================================
  // 1. AUDIO UNLOCKER (User-Gesture Priming)
  // ============================================================================

  /**
   * MUST be called from a user click/touch event.
   * This "primes" the browser to allow all future AI speech.
   */
  async unlockAudio(): Promise<boolean> {
    if (this.isAudioUnlocked && window.__audioUnlocked) {
      console.log('[VoiceSupervisor] Audio already unlocked');
      return true;
    }

    console.log('[VoiceSupervisor] Unlocking audio (user gesture required)...');

    try {
      // Step 1: Create and resume AudioContext
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('[VoiceSupervisor] AudioContext resumed');
      }

      // Step 2: Play silent utterance to prime speechSynthesis
      // This is CRITICAL - without this, Chrome may mute the first real utterance
      await this.playSilentPrimer();

      // Step 3: Request microphone (also needs user gesture)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Step 4: Set up audio analyser for level monitoring
      this.setupAudioAnalyser();

      this.isAudioUnlocked = true;
      window.__audioUnlocked = true;

      console.log('[VoiceSupervisor] Audio UNLOCKED successfully');
      return true;

    } catch (err) {
      console.error('[VoiceSupervisor] Audio unlock failed:', err);
      this.config.onError?.('Failed to unlock audio. Please allow microphone access.', true);
      return false;
    }
  }

  /**
   * Play a silent 0.1s "beep" to prime the browser's speech engine
   */
  private playSilentPrimer(): Promise<void> {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }

      // Cancel any pending speech
      window.speechSynthesis.cancel();

      // Create silent utterance
      const primer = new SpeechSynthesisUtterance('');
      primer.volume = 0.01; // Nearly silent but not zero (some browsers ignore zero)
      primer.rate = 10; // Fast
      primer.pitch = 1;

      // Store globally to prevent GC
      window.__supervisorUtterance = primer;

      primer.onend = () => {
        console.log('[VoiceSupervisor] Silent primer completed');
        window.__supervisorUtterance = null;
        resolve();
      };

      primer.onerror = () => {
        console.log('[VoiceSupervisor] Silent primer error (expected on some browsers)');
        window.__supervisorUtterance = null;
        resolve();
      };

      // Speak the primer
      window.speechSynthesis.speak(primer);

      // Fallback timeout
      setTimeout(() => {
        window.speechSynthesis.cancel();
        resolve();
      }, 500);
    });
  }

  // ============================================================================
  // 2. STATE MACHINE
  // ============================================================================

  private setStatus(newStatus: SupervisorStatus): void {
    if (this.status === newStatus) return;

    const oldStatus = this.status;
    this.status = newStatus;
    this.expectedStatus = newStatus;

    console.log(`[VoiceSupervisor] Status: ${oldStatus} -> ${newStatus}`);
    this.config.onStatusChange?.(newStatus);
  }

  getStatus(): SupervisorStatus {
    return this.status;
  }

  getCurrentSpeaker(): Participant | null {
    return this.currentSpeaker;
  }

  private setSpeaker(speaker: Participant | null): void {
    this.currentSpeaker = speaker;
    this.config.onSpeakerChange?.(speaker);
  }

  // ============================================================================
  // 3. ZOMBIE LISTENER FIX (Recursive Auto-Restart)
  // ============================================================================

  /**
   * Start listening with zombie protection.
   * If recognition ends unexpectedly, it will auto-restart.
   */
  startListening(speaker: Participant = 'A'): void {
    if (!this.isAudioUnlocked) {
      console.warn('[VoiceSupervisor] Cannot listen - audio not unlocked');
      this.config.onError?.('Please click Start to enable voice', true);
      return;
    }

    if (this.status === 'SPEAKING') {
      console.log('[VoiceSupervisor] Cannot listen while speaking');
      return;
    }

    this.setSpeaker(speaker);
    this.setStatus('LISTENING');
    this.recognitionRestartAttempts = 0;

    this.createAndStartRecognition(speaker);
  }

  private createAndStartRecognition(speaker: Participant): void {
    // Clean up existing
    this.stopRecognition();

    const SpeechRecognitionAPI = (window as any).SpeechRecognition ||
                                  (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      this.config.onError?.('Speech recognition not supported', false);
      return;
    }

    const lang = speaker === 'A' ? this.config.languageA : this.config.languageB;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    // Store in refs
    this.recognition = recognition;
    window.__supervisorRecognition = recognition;

    // ========== EVENT HANDLERS ==========

    recognition.onstart = () => {
      console.log(`[VoiceSupervisor] Recognition started (${lang})`);
      this.recognitionRestartAttempts = 0;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (this.status !== 'LISTENING') {
        console.log('[VoiceSupervisor] Ignoring result - not in LISTENING state');
        return;
      }

      const result = event.results[event.resultIndex];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;

      this.config.onTranscript?.(transcript, isFinal);

      if (isFinal && transcript.trim()) {
        console.log('[VoiceSupervisor] Final transcript:', transcript);
        this.processTranscript(transcript, speaker);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('[VoiceSupervisor] Recognition error:', event.error);

      // These are recoverable - auto-restart
      if (event.error === 'no-speech' || event.error === 'aborted') {
        this.scheduleRecognitionRestart(speaker);
        return;
      }

      // Network error - try to recover
      if (event.error === 'network') {
        this.config.onError?.('Network error - retrying...', true);
        setTimeout(() => this.scheduleRecognitionRestart(speaker), 2000);
        return;
      }

      // Fatal errors
      this.config.onError?.(`Recognition error: ${event.error}`, false);
      this.setStatus('IDLE');
    };

    recognition.onend = () => {
      const timeSinceLastEnd = Date.now() - this.lastRecognitionEnd;
      this.lastRecognitionEnd = Date.now();

      console.log(`[VoiceSupervisor] Recognition ended (status: ${this.status}, expected: ${this.expectedStatus})`);

      // ZOMBIE FIX: If we're supposed to be LISTENING but recognition ended,
      // this is a "zombie" state - restart it!
      if (this.expectedStatus === 'LISTENING' && this.status === 'LISTENING') {
        // Prevent rapid restart loops
        if (timeSinceLastEnd < 100) {
          console.warn('[VoiceSupervisor] Rapid restart detected, adding delay');
          setTimeout(() => this.scheduleRecognitionRestart(speaker), 500);
        } else {
          this.scheduleRecognitionRestart(speaker);
        }
      }
    };

    // Start recognition
    try {
      recognition.start();
      console.log('[VoiceSupervisor] Recognition.start() called');
    } catch (err) {
      console.error('[VoiceSupervisor] Recognition start error:', err);
      this.scheduleRecognitionRestart(speaker);
    }
  }

  private scheduleRecognitionRestart(speaker: Participant): void {
    if (this.isDestroyed) return;
    if (this.status === 'SPEAKING' || this.status === 'THINKING') return;
    if (this.expectedStatus !== 'LISTENING') return;

    this.recognitionRestartAttempts++;

    if (this.recognitionRestartAttempts > this.MAX_RESTART_ATTEMPTS) {
      console.error('[VoiceSupervisor] Max restart attempts reached');
      this.config.onError?.('Microphone stopped responding. Please restart.', true);
      this.setStatus('IDLE');
      return;
    }

    const delay = Math.min(300 * this.recognitionRestartAttempts, 2000);
    console.log(`[VoiceSupervisor] Scheduling restart in ${delay}ms (attempt ${this.recognitionRestartAttempts})`);

    setTimeout(() => {
      if (this.expectedStatus === 'LISTENING' && !this.isDestroyed) {
        this.createAndStartRecognition(speaker);
      }
    }, delay);
  }

  private stopRecognition(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
      window.__supervisorRecognition = null;
    }
  }

  // ============================================================================
  // 4. SPEECH SYNTHESIS QUEUE
  // ============================================================================

  /**
   * Queue text for speech synthesis.
   * Uses cancel-before-speak pattern to clear ghost audio.
   */
  speak(text: string, lang: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!text.trim()) {
        resolve();
        return;
      }

      this.speechQueue.push({
        text,
        lang,
        onStart: () => {},
        onEnd: () => resolve(),
      });

      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.isSpeaking || this.speechQueue.length === 0) {
      return;
    }

    const item = this.speechQueue.shift()!;
    this.isSpeaking = true;
    this.setStatus('SPEAKING');

    // Stop listening while speaking (echo prevention)
    this.stopRecognition();

    // CRITICAL: Cancel any existing speech to clear ghost audio
    window.speechSynthesis.cancel();

    // Small delay after cancel
    setTimeout(() => {
      this.speakItem(item);
    }, 50);
  }

  private speakItem(item: SpeechQueueItem): void {
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = item.lang;
    utterance.rate = this.config.speechRate || 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Find best voice
    const voice = this.findVoice(item.lang);
    if (voice) {
      utterance.voice = voice;
    }

    // CRITICAL: Store globally to prevent Chrome GC
    window.__supervisorUtterance = utterance;

    // Chrome bug workaround: resume if paused
    let resumeInterval: ReturnType<typeof setInterval> | null = null;

    utterance.onstart = () => {
      console.log('[VoiceSupervisor] Speech started');
      item.onStart?.();

      // Keep resuming in case Chrome pauses
      resumeInterval = setInterval(() => {
        if (window.speechSynthesis.paused) {
          console.log('[VoiceSupervisor] Resuming paused speech');
          window.speechSynthesis.resume();
        }
      }, 250);
    };

    utterance.onend = () => {
      console.log('[VoiceSupervisor] Speech ended');
      if (resumeInterval) clearInterval(resumeInterval);
      window.__supervisorUtterance = null;

      this.isSpeaking = false;
      item.onEnd?.();

      // Process next in queue or restart listening
      if (this.speechQueue.length > 0) {
        this.processQueue();
      } else {
        this.onSpeechComplete();
      }
    };

    utterance.onerror = (event) => {
      console.error('[VoiceSupervisor] Speech error:', event.error);
      if (resumeInterval) clearInterval(resumeInterval);
      window.__supervisorUtterance = null;

      this.isSpeaking = false;
      item.onEnd?.();

      // Try to recover
      if (this.speechQueue.length > 0) {
        this.processQueue();
      } else {
        this.onSpeechComplete();
      }
    };

    console.log('[VoiceSupervisor] Speaking:', item.text.substring(0, 50) + '...');
    window.speechSynthesis.speak(utterance);
  }

  private onSpeechComplete(): void {
    if (!this.config.continuousMode || !this.config.autoListen) {
      this.setStatus('IDLE');
      return;
    }

    // Switch to next speaker and resume listening
    const nextSpeaker: Participant = this.currentSpeaker === 'A' ? 'B' : 'A';

    console.log(`[VoiceSupervisor] Speech complete, switching to Speaker ${nextSpeaker}`);

    // Delay before listening (echo prevention)
    setTimeout(() => {
      if (!this.isDestroyed && this.config.autoListen) {
        this.startListening(nextSpeaker);
      }
    }, 350);
  }

  /**
   * Force stop all speech immediately (<200ms)
   */
  forceStopSpeech(): void {
    console.log('[VoiceSupervisor] Force stopping speech');

    // Clear queue
    this.speechQueue = [];
    this.isSpeaking = false;

    // Aggressive cancel
    if (window.speechSynthesis) {
      for (let i = 0; i < 5; i++) {
        window.speechSynthesis.cancel();
      }
    }

    window.__supervisorUtterance = null;

    if (this.status === 'SPEAKING') {
      this.setStatus('IDLE');
    }
  }

  // ============================================================================
  // 5. HEARTBEAT MONITOR
  // ============================================================================

  /**
   * Start the heartbeat monitor.
   * Every 5 seconds, if not SPEAKING or THINKING, ensure mic is active.
   */
  startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.performHeartbeat();
    }, this.HEARTBEAT_INTERVAL_MS);

    console.log('[VoiceSupervisor] Heartbeat started');
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private performHeartbeat(): void {
    if (this.isDestroyed) {
      this.stopHeartbeat();
      return;
    }

    console.log(`[VoiceSupervisor] Heartbeat (status: ${this.status}, expected: ${this.expectedStatus})`);

    // If we should be LISTENING but aren't, fix it
    if (this.expectedStatus === 'LISTENING' && this.status !== 'SPEAKING' && this.status !== 'THINKING') {
      const isRecognitionActive = this.recognition !== null;

      if (!isRecognitionActive) {
        console.warn('[VoiceSupervisor] Heartbeat detected dead microphone, restarting...');
        this.recognitionRestartAttempts = 0;
        this.createAndStartRecognition(this.currentSpeaker || 'A');
      }
    }

    // If we're IDLE but should be active, restart
    if (this.status === 'IDLE' && this.expectedStatus === 'LISTENING') {
      console.warn('[VoiceSupervisor] Heartbeat detected unexpected IDLE, restarting...');
      this.startListening(this.currentSpeaker || 'A');
    }
  }

  // ============================================================================
  // TRANSLATION PROCESSING
  // ============================================================================

  private async processTranscript(transcript: string, speaker: Participant): Promise<void> {
    this.setStatus('THINKING');
    this.stopRecognition();

    const sourceLang = speaker === 'A' ? this.config.languageA : this.config.languageB;
    const targetLang = speaker === 'A' ? this.config.languageB : this.config.languageA;

    try {
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transcript,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
        }),
      });

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.status}`);
      }

      const data = await response.json();
      const translatedText = data.translatedText;

      if (!translatedText?.trim()) {
        throw new Error('Empty translation');
      }

      console.log('[VoiceSupervisor] Translation:', translatedText);
      this.config.onTranslation?.(transcript, translatedText, speaker);

      // Speak the translation
      await this.speak(translatedText, targetLang);

    } catch (err) {
      console.error('[VoiceSupervisor] Translation error:', err);
      this.config.onError?.(err instanceof Error ? err.message : 'Translation failed', true);

      // Resume listening after error
      setTimeout(() => {
        if (!this.isDestroyed && this.config.autoListen) {
          this.startListening(speaker);
        }
      }, 1000);
    }
  }

  // ============================================================================
  // AUDIO LEVEL MONITORING
  // ============================================================================

  private setupAudioAnalyser(): void {
    if (!this.audioContext || !this.mediaStream) return;

    try {
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      this.startAudioLevelMonitoring();
    } catch (err) {
      console.error('[VoiceSupervisor] Audio analyser setup failed:', err);
    }
  }

  private startAudioLevelMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const updateLevel = () => {
      if (!this.analyser || this.isDestroyed) return;

      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(rms / 128, 1);

      this.audioLevelCallback?.(level);

      this.animationFrame = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }

  // ============================================================================
  // VOICE LOADING
  // ============================================================================

  private loadVoices(): void {
    if (!window.speechSynthesis) return;

    const load = () => {
      this.voices = window.speechSynthesis.getVoices();
      if (this.voices.length > 0) {
        this.voicesLoaded = true;
        console.log(`[VoiceSupervisor] Loaded ${this.voices.length} voices`);
      }
    };

    load();
    window.speechSynthesis.onvoiceschanged = load;
  }

  private findVoice(lang: string): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) return null;

    const prefix = lang.split('-')[0];

    return (
      this.voices.find(v => v.lang === lang) ||
      this.voices.find(v => v.lang.startsWith(prefix + '-')) ||
      this.voices.find(v => v.lang.toLowerCase().startsWith(prefix.toLowerCase())) ||
      null
    );
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the full conversation loop.
   * MUST be called from a user gesture (click).
   */
  async start(speaker: Participant = 'A'): Promise<boolean> {
    console.log('[VoiceSupervisor] Starting...');

    // Unlock audio (requires user gesture)
    const unlocked = await this.unlockAudio();
    if (!unlocked) {
      return false;
    }

    // Start heartbeat monitor
    this.startHeartbeat();

    // Begin listening
    this.startListening(speaker);

    return true;
  }

  /**
   * Stop all voice activity.
   */
  stop(): void {
    console.log('[VoiceSupervisor] Stopping...');

    this.expectedStatus = 'IDLE';
    this.setStatus('IDLE');

    this.stopHeartbeat();
    this.stopRecognition();
    this.forceStopSpeech();

    this.setSpeaker(null);
  }

  /**
   * Full cleanup - call when unmounting.
   */
  destroy(): void {
    console.log('[VoiceSupervisor] Destroying...');

    this.isDestroyed = true;
    this.stop();

    // Stop audio monitoring
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }

    // Clear globals
    window.__supervisorUtterance = null;
    window.__supervisorRecognition = null;
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  isUnlocked(): boolean {
    return this.isAudioUnlocked;
  }

  isActive(): boolean {
    return this.status !== 'IDLE';
  }
}

// ============================================================================
// EXPORT SINGLETON ACCESSOR
// ============================================================================

export function getVoiceSupervisor(config: SupervisorConfig): VoiceSupervisor {
  return VoiceSupervisor.getInstance(config);
}

export function destroyVoiceSupervisor(): void {
  VoiceSupervisor.destroyInstance();
}

export default VoiceSupervisor;
