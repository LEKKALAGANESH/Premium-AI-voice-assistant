// 2026 Standard: Voice Service with Adaptive VAD, Frequency Filtering, and Confidence Tracking
// Updated: Singleton AudioContext, Warm-Start Protocol, Memory Leak Guards

export interface SpeechResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface SpeechRateMetrics {
  wordsPerMinute: number;
  avgWordDuration: number;
}

// === SINGLETON AUDIO CONTEXT FOR VAD ===
let vadAudioContext: AudioContext | null = null;

async function getVadAudioContext(): Promise<AudioContext> {
  if (vadAudioContext && vadAudioContext.state !== 'closed') {
    if (vadAudioContext.state === 'suspended') {
      await vadAudioContext.resume();
    }
    return vadAudioContext;
  }
  vadAudioContext = new AudioContext();
  console.log('[VoiceService] Created new VAD AudioContext');
  return vadAudioContext;
}

function closeVadAudioContext() {
  if (vadAudioContext && vadAudioContext.state !== 'closed') {
    try {
      vadAudioContext.close();
    } catch (e) {
      // Ignore close errors
    }
    vadAudioContext = null;
    console.log('[VoiceService] Closed VAD AudioContext');
  }
}

export class VoiceService {
  private recognition: SpeechRecognition | null = null;
  private audio: HTMLAudioElement | null = null;
  private analyzer: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private silenceTimer: number | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;

  // 2026: Speech rate tracking for adaptive VAD
  private speechStartTime: number = 0;
  private wordCount: number = 0;
  private lastSpeechRate: SpeechRateMetrics = { wordsPerMinute: 120, avgWordDuration: 500 };

  // 2026: Confidence tracking
  private lastConfidence: number = 1;

  // 2026: Audio state tracking
  private isAudioInitialized: boolean = false;
  private playbackAborted: boolean = false;

  constructor() {
    const SpeechRecognition =
      (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition })
        .webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition: typeof SpeechRecognition }).SpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      if (this.recognition) {
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;
      }
    }
  }

  // 2026: Check if audio is ready
  isAudioReady(): boolean {
    return this.isAudioInitialized;
  }

  // 2026: Initialize audio from user gesture
  async initializeAudio(): Promise<boolean> {
    try {
      const ctx = await getVadAudioContext();
      this.isAudioInitialized = ctx.state === 'running';
      return this.isAudioInitialized;
    } catch (e) {
      console.error('[VoiceService] Audio initialization failed:', e);
      return false;
    }
  }

  // 2026: Get adaptive timeout based on speech rate
  getAdaptiveTimeout(baseTimeout: number = 2500): number {
    // If speaking slowly (< 100 WPM), extend timeout
    // If speaking fast (> 150 WPM), reduce timeout slightly
    const wpm = this.lastSpeechRate.wordsPerMinute;

    if (wpm < 80) return baseTimeout * 1.5; // Very slow speaker
    if (wpm < 100) return baseTimeout * 1.25; // Slow speaker
    if (wpm > 150) return baseTimeout * 0.9; // Fast speaker
    return baseTimeout; // Normal speed
  }

  // 2026: Get last confidence score
  getLastConfidence(): number {
    return this.lastConfidence;
  }

  // 2026: Get speech rate metrics
  getSpeechRateMetrics(): SpeechRateMetrics {
    return this.lastSpeechRate;
  }

  async startListening(
    onResult: (result: SpeechResult) => void,
    onEnd: () => void,
    onError: (err: Error) => void,
    onSilence: () => void
  ) {
    if (!this.recognition) {
      onError(new Error('SPEECH_RECOGNITION_NOT_SUPPORTED'));
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await this.setupVAD(onSilence);
    } catch (err) {
      onError(new Error('MIC_PERMISSION_DENIED'));
      return;
    }

    // 2026: Reset speech metrics
    this.speechStartTime = Date.now();
    this.wordCount = 0;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';
      let confidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alternative = result[0];

        if (result.isFinal) {
          finalTranscript += alternative.transcript;
          confidence = alternative.confidence || 0.9;
        } else {
          interimTranscript += alternative.transcript;
          confidence = alternative.confidence || 0.7;
        }
      }

      const transcript = finalTranscript || interimTranscript;
      const isFinal = !!finalTranscript;

      // 2026: Update confidence tracking
      this.lastConfidence = confidence;

      // 2026: Update speech rate metrics
      if (isFinal) {
        const words = transcript.trim().split(/\s+/).length;
        this.wordCount += words;
        const elapsedMinutes = (Date.now() - this.speechStartTime) / 60000;
        if (elapsedMinutes > 0.05) {
          // At least 3 seconds of speech
          this.lastSpeechRate = {
            wordsPerMinute: Math.round(this.wordCount / elapsedMinutes),
            avgWordDuration: Math.round((Date.now() - this.speechStartTime) / this.wordCount),
          };
        }
      }

      onResult({ transcript, confidence, isFinal });

      // 2026: Adaptive VAD - adjust timeout based on speech rate
      const adaptiveTimeout = this.getAdaptiveTimeout();
      this.resetSilenceTimer(onSilence, adaptiveTimeout);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        onError(new Error('MIC_PERMISSION_DENIED'));
      } else if (event.error === 'network') {
        onError(new Error('NETWORK_ERROR'));
      } else {
        onError(new Error(event.error));
      }
    };

    this.recognition.onend = onEnd;

    try {
      this.recognition.start();
    } catch (e) {
      console.error('Recognition start error:', e);
    }
  }

  private async setupVAD(onSilence: () => void, timeout: number = 2500) {
    if (!this.stream) return;

    try {
      // Use singleton AudioContext for VAD
      const audioContext = await getVadAudioContext();

      // Clean up previous nodes if they exist
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch (e) {
          // Ignore
        }
        this.sourceNode = null;
      }

      this.sourceNode = audioContext.createMediaStreamSource(this.stream);

      // 2026 Standard: Frequency Isolation (80Hz - 255Hz high-pass filter)
      // Using 150Hz cutoff to isolate human speech from background AC/fan hum
      const highPassFilter = audioContext.createBiquadFilter();
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.value = 150; // Spec: 80-255Hz range
      highPassFilter.Q.value = 0.7; // Gentle rolloff

      // 2026 Standard: Noise floor suppression
      const noiseFloor = audioContext.createDynamicsCompressor();
      noiseFloor.threshold.value = -50;
      noiseFloor.knee.value = 40;
      noiseFloor.ratio.value = 12;
      noiseFloor.attack.value = 0;
      noiseFloor.release.value = 0.25;

      // Additional: Low-pass filter to remove high-frequency noise
      const lowPassFilter = audioContext.createBiquadFilter();
      lowPassFilter.type = 'lowpass';
      lowPassFilter.frequency.value = 3400; // Voice frequency range
      lowPassFilter.Q.value = 0.7;

      this.analyzer = audioContext.createAnalyser();
      this.analyzer.fftSize = 256;
      this.analyzer.smoothingTimeConstant = 0.8;

      // Filter chain: Source -> HighPass -> LowPass -> NoiseFloor -> Analyzer
      this.sourceNode.connect(highPassFilter);
      highPassFilter.connect(lowPassFilter);
      lowPassFilter.connect(noiseFloor);
      noiseFloor.connect(this.analyzer);

      this.resetSilenceTimer(onSilence, timeout);
    } catch (error) {
      console.error('[VoiceService] VAD setup failed:', error);
    }
  }

  resetSilenceTimer(onSilence: () => void, timeout: number = 2500) {
    if (this.silenceTimer) window.clearTimeout(this.silenceTimer);
    this.silenceTimer = window.setTimeout(() => {
      onSilence();
    }, timeout);
  }

  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        /* ignore */
      }
    }

    // Disconnect source node (but don't close singleton AudioContext)
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        /* ignore */
      }
      this.sourceNode = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Clear analyzer reference
    this.analyzer = null;

    if (this.silenceTimer) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  async speak(
    text: string,
    voiceName?: string,
    whisperMode: boolean = false
  ): Promise<void> {
    // Stop any existing audio first (barge-in resilience)
    this.stopSpeaking();
    this.playbackAborted = false;

    // Buffer check - don't try to play empty text
    if (!text || text.trim().length === 0) {
      console.warn('[VoiceService] Empty text, skipping TTS');
      return;
    }

    try {
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceName }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[VoiceService] TTS API error:', response.status, errorText);
        throw new Error('TTS_PROXY_FAILED');
      }

      const data = await response.json();
      const base64Audio = data?.audio;

      // Buffer check - don't play empty audio data
      if (!base64Audio || base64Audio.length === 0) {
        console.warn('[VoiceService] Empty audio buffer received');
        return;
      }

      // Check if playback was aborted during API call
      if (this.playbackAborted) {
        console.log('[VoiceService] Playback aborted before audio loaded');
        return;
      }

      return new Promise((resolve, reject) => {
        try {
          const audioElement = new Audio();

          // Set up event handlers before setting src
          audioElement.onended = () => {
            this.audio = null;
            resolve();
          };

          audioElement.onerror = (e) => {
            console.error('[VoiceService] Audio element error:', e);
            this.audio = null;
            reject(new Error('AUDIO_PLAYBACK_ERROR'));
          };

          audioElement.oncanplaythrough = () => {
            // Only play when audio is fully loaded and not aborted
            if (this.audio === audioElement && !this.playbackAborted) {
              audioElement.play()
                .then(() => {
                  console.log('[VoiceService] Playback started');
                })
                .catch((err) => {
                  // Ignore AbortError (happens when interrupted intentionally)
                  if (err.name === 'AbortError') {
                    console.log('[VoiceService] Playback aborted (intentional)');
                    resolve();
                  } else if (err.name === 'NotAllowedError') {
                    console.error('[VoiceService] Autoplay blocked - needs user gesture');
                    reject(new Error('AUDIO_BLOCKED_BY_BROWSER'));
                  } else {
                    console.error('[VoiceService] Play failed:', err);
                    reject(err);
                  }
                });
            } else if (this.playbackAborted) {
              console.log('[VoiceService] Playback aborted before play');
              resolve();
            }
          };

          // Apply settings
          if (whisperMode) {
            audioElement.volume = 0.4;
            audioElement.playbackRate = 0.9;
          }

          // Store reference and set source
          this.audio = audioElement;
          audioElement.src = `data:audio/mp3;base64,${base64Audio}`;
          audioElement.load();
        } catch (setupError) {
          console.error('[VoiceService] Audio setup error:', setupError);
          reject(new Error('AUDIO_SETUP_FAILED'));
        }
      });
    } catch (error) {
      console.error('[VoiceService] TTS Error:', error);
      const message = error instanceof Error ? error.message : 'TTS_FAILED';
      throw new Error(message);
    }
  }

  // 2026 Standard: Instant interruption (<100ms)
  stopSpeaking() {
    // Set abort flag to prevent queued audio from playing
    this.playbackAborted = true;

    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = ''; // Clear buffer immediately
        this.audio.load(); // Force resource release
      } catch (e) {
        // Ignore errors during stop
        console.log('[VoiceService] Stop speaking cleanup error (ignored):', e);
      }
      this.audio = null;
    }
  }

  // 2026: Check if currently speaking
  isSpeaking(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  // 2026: Get audio progress (0-1)
  getAudioProgress(): number {
    if (!this.audio || this.audio.duration === 0) return 0;
    return this.audio.currentTime / this.audio.duration;
  }

  cleanup() {
    this.stopListening();
    this.stopSpeaking();
    // Note: Don't close the singleton VAD AudioContext here
    // It will be reused for future sessions
  }

  // 2026: Full cleanup including AudioContext (call on app unmount)
  fullCleanup() {
    this.cleanup();
    closeVadAudioContext();
    this.isAudioInitialized = false;
  }
}

export const voiceService = new VoiceService();
