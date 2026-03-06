// VoiceMediatorService.ts - Google-Grade Voice Engine
// SINGLETON: Exists outside React lifecycle to prevent ghost voices and cleanup loops
//
// Architecture:
// 1. FSM Supervisor with ref-based state (no useEffect loops)
// 2. AudioManager for voice initialization on first user click
// 3. Microphone only restarts on utterance.onend
// 4. Manual kill-switch support

// ============================================================================
// TYPES
// ============================================================================

export type MediatorState =
  | 'UNINITIALIZED'  // Audio not yet unlocked
  | 'IDLE'           // Ready, not active
  | 'LISTENING_A'    // Hearing Language A
  | 'LISTENING_B'    // Hearing Language B
  | 'TRANSLATING'    // Calling Gemini API
  | 'SPEAKING_A'     // Speaking in Language A
  | 'SPEAKING_B'     // Speaking in Language B
  | 'ERROR';         // Error state

export type Participant = 'A' | 'B';

export interface LanguageConfig {
  code: string;      // e.g., 'en-US', 'es-ES'
  name: string;      // e.g., 'English', 'Spanish'
  voiceLang?: string; // Override for TTS voice selection
}

export interface MediatorConfig {
  languageA: LanguageConfig;
  languageB: LanguageConfig;
  onStateChange?: (state: MediatorState, speaker: Participant | null) => void;
  onTranscript?: (text: string, isFinal: boolean, speaker: Participant) => void;
  onTranslation?: (original: string, translated: string, speaker: Participant) => void;
  onError?: (error: string) => void;
  onAudioLevel?: (level: number) => void;
}

// ============================================================================
// VALID STATE TRANSITIONS (FSM)
// ============================================================================

const VALID_TRANSITIONS: Record<MediatorState, MediatorState[]> = {
  'UNINITIALIZED': ['IDLE', 'ERROR'],
  'IDLE': ['LISTENING_A', 'LISTENING_B', 'ERROR'],
  'LISTENING_A': ['TRANSLATING', 'IDLE', 'ERROR'],
  'LISTENING_B': ['TRANSLATING', 'IDLE', 'ERROR'],
  'TRANSLATING': ['SPEAKING_A', 'SPEAKING_B', 'ERROR', 'IDLE'],
  'SPEAKING_A': ['LISTENING_B', 'IDLE', 'ERROR'],
  'SPEAKING_B': ['LISTENING_A', 'IDLE', 'ERROR'],
  'ERROR': ['IDLE', 'LISTENING_A', 'LISTENING_B'],
};

// ============================================================================
// VOICE MEDIATOR SERVICE (SINGLETON)
// ============================================================================

class VoiceMediatorService {
  private static instance: VoiceMediatorService | null = null;

  // === STATE (ref-based, not React state) ===
  private state: MediatorState = 'UNINITIALIZED';
  private currentSpeaker: Participant | null = null;
  private config: MediatorConfig | null = null;

  // === AUDIO MANAGER ===
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private audioLevelRAF: number | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded: boolean = false;

  // === SPEECH RECOGNITION ===
  private recognition: SpeechRecognition | null = null;
  private recognitionRestarting: boolean = false;

  // === SPEECH SYNTHESIS ===
  private utterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking: boolean = false;

  // === GUARDS ===
  private isDestroyed: boolean = false;
  private operationToken: number = 0;

  // ============================================================================
  // SINGLETON
  // ============================================================================

  private constructor() {
    console.log('[VoiceMediatorService] 🎤 Singleton created');
  }

  static getInstance(): VoiceMediatorService {
    if (!VoiceMediatorService.instance) {
      VoiceMediatorService.instance = new VoiceMediatorService();
    }
    return VoiceMediatorService.instance;
  }

  static destroyInstance(): void {
    if (VoiceMediatorService.instance) {
      VoiceMediatorService.instance.destroy();
      VoiceMediatorService.instance = null;
    }
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  configure(config: MediatorConfig): void {
    this.config = config;
    console.log('[VoiceMediatorService] Configured:', {
      langA: config.languageA.name,
      langB: config.languageB.name,
    });
  }

  // ============================================================================
  // FSM STATE MANAGEMENT
  // ============================================================================

  private transition(newState: MediatorState, speaker?: Participant | null): boolean {
    const validTargets = VALID_TRANSITIONS[this.state];

    if (!validTargets.includes(newState)) {
      console.warn(`[VoiceMediatorService] ❌ Invalid transition: ${this.state} → ${newState}`);
      return false;
    }

    const oldState = this.state;
    this.state = newState;
    this.currentSpeaker = speaker ?? this.currentSpeaker;

    console.log(`[VoiceMediatorService] 🔄 ${oldState} → ${newState} (Speaker: ${this.currentSpeaker})`);

    this.config?.onStateChange?.(newState, this.currentSpeaker);
    return true;
  }

  getState(): MediatorState {
    return this.state;
  }

  getCurrentSpeaker(): Participant | null {
    return this.currentSpeaker;
  }

  // ============================================================================
  // AUDIO MANAGER (Initialize on first user click)
  // ============================================================================

  async initialize(): Promise<boolean> {
    if (this.state !== 'UNINITIALIZED' && this.voicesLoaded) {
      console.log('[VoiceMediatorService] Already initialized');
      return true;
    }

    console.log('[VoiceMediatorService] 🔊 Initializing audio...');

    try {
      // 1. Create AudioContext
      this.audioContext = new AudioContext();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      console.log('[VoiceMediatorService] ✅ AudioContext ready');

      // 2. Load voices with promise
      await this.loadVoices();
      console.log('[VoiceMediatorService] ✅ Voices loaded:', this.voices.length);

      // 3. Prime speechSynthesis with silent utterance
      await this.primeSpeechSynthesis();
      console.log('[VoiceMediatorService] ✅ SpeechSynthesis primed');

      // 4. Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      console.log('[VoiceMediatorService] ✅ Microphone access granted');

      // 5. Set up audio analyser
      this.setupAnalyser();

      // 6. Transition to IDLE
      this.transition('IDLE');

      console.log('[VoiceMediatorService] 🎉 Initialization complete!');
      return true;

    } catch (err) {
      console.error('[VoiceMediatorService] ❌ Initialization failed:', err);
      this.config?.onError?.('Failed to initialize audio. Please allow microphone access.');
      this.transition('ERROR');
      return false;
    }
  }

  private loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;

      const loadAndCheck = () => {
        this.voices = synth.getVoices();
        if (this.voices.length > 0) {
          this.voicesLoaded = true;
          resolve();
        }
      };

      // Try immediately
      loadAndCheck();

      if (this.voicesLoaded) return;

      // Listen for voiceschanged
      synth.addEventListener('voiceschanged', loadAndCheck, { once: true });

      // Timeout fallback
      setTimeout(() => {
        loadAndCheck();
        resolve();
      }, 2000);
    });
  }

  private async primeSpeechSynthesis(): Promise<void> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      synth.cancel();

      const primer = new SpeechSynthesisUtterance(' ');
      primer.volume = 0.01;
      primer.rate = 10;

      // Store globally to prevent GC
      (window as any).__mediatorPrimer = primer;

      primer.onend = () => {
        (window as any).__mediatorPrimer = null;
        resolve();
      };

      primer.onerror = () => {
        (window as any).__mediatorPrimer = null;
        resolve();
      };

      synth.speak(primer);

      // Fallback
      setTimeout(() => {
        synth.cancel();
        resolve();
      }, 500);
    });
  }

  private setupAnalyser(): void {
    if (!this.audioContext || !this.mediaStream) return;

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    source.connect(this.analyser);

    this.startAudioLevelMonitoring();
  }

  private startAudioLevelMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      if (this.isDestroyed || !this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(rms / 128, 1);

      this.config?.onAudioLevel?.(level);

      this.audioLevelRAF = requestAnimationFrame(update);
    };

    update();
  }

  // ============================================================================
  // SPEECH RECOGNITION
  // ============================================================================

  startListening(speaker: Participant): void {
    if (this.state === 'UNINITIALIZED') {
      console.warn('[VoiceMediatorService] Not initialized');
      return;
    }

    if (this.isSpeaking) {
      console.log('[VoiceMediatorService] Cannot listen while speaking');
      return;
    }

    const targetState = speaker === 'A' ? 'LISTENING_A' : 'LISTENING_B';

    // Validate transition
    if (!this.transition(targetState, speaker)) {
      return;
    }

    this.createRecognition(speaker);
  }

  private createRecognition(speaker: Participant): void {
    // Clean up existing
    this.stopRecognition();

    const SpeechRecognitionAPI = (window as any).SpeechRecognition ||
                                  (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      this.config?.onError?.('Speech recognition not supported');
      this.transition('ERROR');
      return;
    }

    const langConfig = speaker === 'A' ? this.config?.languageA : this.config?.languageB;
    if (!langConfig) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = langConfig.code;
    recognition.maxAlternatives = 1;

    this.recognition = recognition;
    const token = ++this.operationToken;

    recognition.onstart = () => {
      console.log(`[VoiceMediatorService] 🎤 Recognition started (${langConfig.name})`);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (token !== this.operationToken) return;

      const result = event.results[event.resultIndex];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;

      this.config?.onTranscript?.(transcript, isFinal, speaker);

      if (isFinal && transcript.trim()) {
        console.log('[VoiceMediatorService] 📝 Final transcript:', transcript);
        this.processTranscript(transcript, speaker);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('[VoiceMediatorService] Recognition error:', event.error);

      // Auto-restart on no-speech
      if (event.error === 'no-speech' || event.error === 'aborted') {
        if (this.state === 'LISTENING_A' || this.state === 'LISTENING_B') {
          this.scheduleRecognitionRestart(speaker);
        }
        return;
      }

      this.config?.onError?.(`Recognition error: ${event.error}`);
      this.transition('ERROR');
    };

    recognition.onend = () => {
      console.log('[VoiceMediatorService] Recognition ended');

      // Only restart if still in listening state and not processing
      if ((this.state === 'LISTENING_A' || this.state === 'LISTENING_B') && !this.recognitionRestarting) {
        this.scheduleRecognitionRestart(speaker);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('[VoiceMediatorService] Recognition start error:', err);
      this.scheduleRecognitionRestart(speaker);
    }
  }

  private scheduleRecognitionRestart(speaker: Participant): void {
    if (this.recognitionRestarting || this.isDestroyed) return;
    if (this.state !== 'LISTENING_A' && this.state !== 'LISTENING_B') return;

    this.recognitionRestarting = true;

    setTimeout(() => {
      this.recognitionRestarting = false;
      if ((this.state === 'LISTENING_A' || this.state === 'LISTENING_B') && !this.isSpeaking) {
        this.createRecognition(speaker);
      }
    }, 300);
  }

  private stopRecognition(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }
  }

  // ============================================================================
  // TRANSLATION (Gemini API)
  // ============================================================================

  private async processTranscript(transcript: string, speaker: Participant): Promise<void> {
    this.stopRecognition();

    if (!this.transition('TRANSLATING')) {
      return;
    }

    const token = this.operationToken;
    const sourceLang = speaker === 'A' ? this.config?.languageA : this.config?.languageB;
    const targetLang = speaker === 'A' ? this.config?.languageB : this.config?.languageA;
    const nextSpeaker: Participant = speaker === 'A' ? 'B' : 'A';

    if (!sourceLang || !targetLang) return;

    try {
      const response = await fetch('/api/ai/mediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transcript,
          sourceLanguage: sourceLang.name,
          targetLanguage: targetLang.name,
        }),
      });

      if (token !== this.operationToken) return;

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.translatedText?.trim()) {
        throw new Error('Empty translation');
      }

      console.log('[VoiceMediatorService] 🌐 Translation:', data.translatedText);
      this.config?.onTranslation?.(transcript, data.translatedText, speaker);

      // Speak the translation
      await this.speak(data.translatedText, targetLang, nextSpeaker);

    } catch (err) {
      console.error('[VoiceMediatorService] Translation error:', err);

      // Speak error message
      const errorMsg = "I'm having trouble connecting to the server. Please try again.";
      this.config?.onError?.(errorMsg);

      try {
        await this.speak(errorMsg, { code: 'en-US', name: 'English' }, null);
      } catch (e) {}

      this.transition('IDLE');
    }
  }

  // ============================================================================
  // SPEECH SYNTHESIS
  // ============================================================================

  private async speak(
    text: string,
    lang: LanguageConfig,
    nextSpeaker: Participant | null
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const synth = window.speechSynthesis;

      // Transition to speaking state
      const speakingState = nextSpeaker === 'A' ? 'SPEAKING_B' : 'SPEAKING_A';
      if (nextSpeaker !== null) {
        this.transition(speakingState, this.currentSpeaker);
      }

      // Cancel any existing speech
      synth.cancel();

      this.isSpeaking = true;
      const token = this.operationToken;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang.code;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      // Find best voice
      const voice = this.findVoice(lang.code);
      if (voice) {
        utterance.voice = voice;
      }

      // Store globally to prevent GC
      this.utterance = utterance;
      (window as any).__mediatorUtterance = utterance;

      // Chrome bug workaround
      let resumeInterval: ReturnType<typeof setInterval> | null = null;

      utterance.onstart = () => {
        console.log('[VoiceMediatorService] 🔊 Speaking started');
        resumeInterval = setInterval(() => {
          if (synth.paused) {
            synth.resume();
          }
        }, 200);
      };

      // ============================================================================
      // CRITICAL: utterance.onend triggers microphone restart
      // ============================================================================
      utterance.onend = () => {
        console.log('[VoiceMediatorService] 🔊 Speaking ended');

        if (resumeInterval) clearInterval(resumeInterval);
        this.isSpeaking = false;
        this.utterance = null;
        (window as any).__mediatorUtterance = null;

        if (token !== this.operationToken) {
          resolve();
          return;
        }

        // Auto-start listening for next speaker
        if (nextSpeaker !== null) {
          // Echo prevention delay
          setTimeout(() => {
            if (this.state === 'SPEAKING_A' || this.state === 'SPEAKING_B') {
              this.startListening(nextSpeaker);
            }
          }, 350);
        } else {
          this.transition('IDLE');
        }

        resolve();
      };

      utterance.onerror = (event) => {
        console.error('[VoiceMediatorService] Speech error:', event.error);
        if (resumeInterval) clearInterval(resumeInterval);
        this.isSpeaking = false;
        this.utterance = null;
        (window as any).__mediatorUtterance = null;

        if (event.error === 'interrupted') {
          resolve();
        } else {
          reject(new Error(`Speech error: ${event.error}`));
        }
      };

      console.log('[VoiceMediatorService] 🔊 Speaking:', text.substring(0, 50) + '...');
      synth.speak(utterance);
    });
  }

  private findVoice(langCode: string): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) return null;

    const prefix = langCode.split('-')[0];

    return (
      this.voices.find(v => v.lang === langCode) ||
      this.voices.find(v => v.lang.startsWith(prefix + '-')) ||
      this.voices.find(v => v.lang.toLowerCase().startsWith(prefix.toLowerCase())) ||
      null
    );
  }

  // ============================================================================
  // KILL SWITCH
  // ============================================================================

  stop(): void {
    console.log('[VoiceMediatorService] 🛑 STOP called');

    this.operationToken++;

    // Stop recognition
    this.stopRecognition();
    this.recognitionRestarting = false;

    // Stop speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.utterance = null;
    (window as any).__mediatorUtterance = null;

    this.transition('IDLE');
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    console.log('[VoiceMediatorService] 🔴 Destroying...');

    this.isDestroyed = true;
    this.operationToken++;

    this.stop();

    // Stop audio monitoring
    if (this.audioLevelRAF) {
      cancelAnimationFrame(this.audioLevelRAF);
      this.audioLevelRAF = null;
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
    (window as any).__mediatorUtterance = null;
    (window as any).__mediatorPrimer = null;

    this.state = 'UNINITIALIZED';
    this.config = null;

    console.log('[VoiceMediatorService] ✅ Destroyed');
  }

  // ============================================================================
  // STATUS HELPERS
  // ============================================================================

  isInitialized(): boolean {
    return this.state !== 'UNINITIALIZED';
  }

  isActive(): boolean {
    return this.state !== 'UNINITIALIZED' && this.state !== 'IDLE' && this.state !== 'ERROR';
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const voiceMediatorService = VoiceMediatorService.getInstance();

export function destroyVoiceMediatorService(): void {
  VoiceMediatorService.destroyInstance();
}

export default voiceMediatorService;
