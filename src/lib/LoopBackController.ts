// LoopBackController.ts - Conversation Heartbeat Manager
// Version 1.0.0
//
// The "Loop-Back Heartbeat" ensures continuous conversation by:
// 1. Detecting when TTS (speaking) completes
// 2. Waiting for echo prevention delay
// 3. Automatically restarting speech recognition
// 4. Managing the entire conversation lifecycle
//
// This prevents the "Goes Idle" bug where the bot stops listening after speaking.

// ============================================================================
// TYPES
// ============================================================================

export type ConversationState =
  | 'INACTIVE'      // No conversation
  | 'LISTENING'     // Microphone active, waiting for user
  | 'PROCESSING'    // User finished, sending to AI
  | 'STREAMING'     // Receiving AI response chunks
  | 'SPEAKING'      // TTS active
  | 'TRANSITIONING' // Echo prevention delay
  | 'ERROR';        // Error state

export interface LoopBackConfig {
  // Delay after speaking before re-enabling mic (prevents echo)
  echoPrevention: number;

  // Maximum retries for recognition restart
  maxRestartRetries: number;

  // Timeout for stuck states (ms)
  stuckStateTimeout: number;

  // Callbacks for state changes
  onStateChange?: (state: ConversationState, prevState: ConversationState) => void;
  onListeningStart?: () => void;
  onListeningEnd?: (transcript: string) => void;
  onProcessingStart?: () => void;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onHeartbeat?: () => void; // Called when loop-back triggers
  onError?: (error: Error) => void;
  onConversationEnd?: () => void;
}

export interface LoopBackStats {
  turnCount: number;           // Number of conversation turns
  totalListeningTime: number;  // ms spent listening
  totalSpeakingTime: number;   // ms spent speaking
  heartbeatCount: number;      // Number of loop-back triggers
  restartCount: number;        // Number of recognition restarts
  errorCount: number;          // Number of errors
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: LoopBackConfig = {
  echoPrevention: 250,        // 250ms delay for echo prevention
  maxRestartRetries: 3,
  stuckStateTimeout: 30000,   // 30 seconds
};

// ============================================================================
// LOOP-BACK CONTROLLER CLASS
// ============================================================================

export class LoopBackController {
  private config: LoopBackConfig;
  private state: ConversationState = 'INACTIVE';
  private isConversationActive: boolean = false;
  private recognition: SpeechRecognition | null = null;
  private restartRetries: number = 0;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStateChangeTime: number = 0;
  private stats: LoopBackStats = {
    turnCount: 0,
    totalListeningTime: 0,
    totalSpeakingTime: 0,
    heartbeatCount: 0,
    restartCount: 0,
    errorCount: 0,
  };

  // Timing trackers
  private listeningStartTime: number = 0;
  private speakingStartTime: number = 0;

  constructor(config: Partial<LoopBackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ========== STATE MACHINE ==========

  private setState(newState: ConversationState): void {
    const prevState = this.state;
    if (prevState === newState) return;

    this.state = newState;
    this.lastStateChangeTime = Date.now();
    this.resetStuckTimer();

    console.log(`[LoopBack] State: ${prevState} → ${newState}`);
    this.config.onStateChange?.(newState, prevState);
  }

  getState(): ConversationState {
    return this.state;
  }

  isActive(): boolean {
    return this.isConversationActive;
  }

  // ========== CONVERSATION LIFECYCLE ==========

  /**
   * Start a new conversation session.
   * This enables the loop-back mechanism.
   */
  startConversation(): void {
    if (this.isConversationActive) {
      console.warn('[LoopBack] Conversation already active');
      return;
    }

    console.log('[LoopBack] Starting conversation');
    this.isConversationActive = true;
    this.resetStats();
    this.startListening();
  }

  /**
   * End the conversation session.
   * This stops the loop-back mechanism.
   */
  endConversation(): void {
    if (!this.isConversationActive) return;

    console.log('[LoopBack] Ending conversation');
    this.isConversationActive = false;
    this.stopListening();
    this.clearTimers();
    this.setState('INACTIVE');
    this.config.onConversationEnd?.();
  }

  // ========== LISTENING (Speech Recognition) ==========

  /**
   * Start listening for user speech.
   * Called automatically by heartbeat after speaking.
   */
  startListening(): void {
    if (!this.isConversationActive) {
      console.log('[LoopBack] Not starting - conversation inactive');
      return;
    }

    if (this.state === 'LISTENING') {
      console.log('[LoopBack] Already listening');
      return;
    }

    this.stopListening(); // Clean up any existing recognition

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      this.handleError(new Error('SpeechRecognition not supported'));
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('[LoopBack] Recognition started');
      this.restartRetries = 0;
      this.listeningStartTime = Date.now();
      this.setState('LISTENING');
      this.config.onListeningStart?.();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log(`[LoopBack] Recognition error: ${event.error}`);

      if (event.error === 'aborted') {
        // Intentional abort - do nothing
        return;
      }

      if (event.error === 'no-speech') {
        // No speech detected - restart if still active
        if (this.isConversationActive) {
          this.scheduleRestart();
        }
        return;
      }

      // Other errors
      this.stats.errorCount++;
      this.handleError(new Error(`Recognition error: ${event.error}`));
    };

    recognition.onend = () => {
      console.log('[LoopBack] Recognition ended');

      // Update stats
      if (this.listeningStartTime > 0) {
        this.stats.totalListeningTime += Date.now() - this.listeningStartTime;
        this.listeningStartTime = 0;
      }

      // If conversation still active and we're in listening state, restart
      // This handles cases where recognition stops unexpectedly
      if (this.isConversationActive && this.state === 'LISTENING') {
        this.scheduleRestart();
      }
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error('[LoopBack] Failed to start recognition:', err);
      this.scheduleRestart();
    }
  }

  /**
   * Stop listening (does not end conversation).
   */
  stopListening(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {
        // Ignore abort errors
      }
      this.recognition = null;
    }

    // Update listening time stats
    if (this.listeningStartTime > 0) {
      this.stats.totalListeningTime += Date.now() - this.listeningStartTime;
      this.listeningStartTime = 0;
    }
  }

  /**
   * Schedule a recognition restart (with retry limit).
   */
  private scheduleRestart(): void {
    if (!this.isConversationActive) return;

    this.restartRetries++;
    this.stats.restartCount++;

    if (this.restartRetries > this.config.maxRestartRetries) {
      console.error('[LoopBack] Max restart retries exceeded');
      this.handleError(new Error('Recognition restart failed after max retries'));
      return;
    }

    console.log(`[LoopBack] Scheduling restart (attempt ${this.restartRetries})`);

    // Small delay before restarting
    setTimeout(() => {
      if (this.isConversationActive && this.state !== 'SPEAKING') {
        this.startListening();
      }
    }, 100);
  }

  // ========== PROCESSING & STREAMING ==========

  /**
   * Signal that user has finished speaking and processing should begin.
   * @param transcript - The final transcript from speech recognition
   */
  signalProcessingStart(transcript: string): void {
    this.stopListening();
    this.stats.turnCount++;
    this.setState('PROCESSING');
    this.config.onListeningEnd?.(transcript);
    this.config.onProcessingStart?.();
  }

  /**
   * Signal that AI streaming has begun.
   */
  signalStreamingStart(): void {
    this.setState('STREAMING');
  }

  // ========== SPEAKING ==========

  /**
   * Signal that TTS has started speaking.
   */
  signalSpeakingStart(): void {
    this.speakingStartTime = Date.now();
    this.setState('SPEAKING');
    this.config.onSpeakingStart?.();
  }

  /**
   * Signal that TTS has finished speaking.
   * THIS IS THE HEARTBEAT TRIGGER - it schedules restart of listening.
   */
  signalSpeakingEnd(): void {
    // Update speaking time stats
    if (this.speakingStartTime > 0) {
      this.stats.totalSpeakingTime += Date.now() - this.speakingStartTime;
      this.speakingStartTime = 0;
    }

    this.config.onSpeakingEnd?.();

    // If conversation still active, trigger the loop-back heartbeat
    if (this.isConversationActive) {
      this.triggerHeartbeat();
    } else {
      this.setState('INACTIVE');
    }
  }

  // ========== HEARTBEAT (THE MAGIC) ==========

  /**
   * The Loop-Back Heartbeat.
   * This is called when TTS finishes to restart listening.
   */
  private triggerHeartbeat(): void {
    console.log('[LoopBack] 💓 HEARTBEAT - Scheduling listening restart');
    this.stats.heartbeatCount++;

    // Enter transitioning state (echo prevention)
    this.setState('TRANSITIONING');
    this.config.onHeartbeat?.();

    // Clear any existing transition timer
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
    }

    // Wait for echo prevention, then restart listening
    this.transitionTimer = setTimeout(() => {
      this.transitionTimer = null;

      if (this.isConversationActive) {
        console.log('[LoopBack] Echo prevention complete - restarting listening');
        this.startListening();
      } else {
        this.setState('INACTIVE');
      }
    }, this.config.echoPrevention);
  }

  /**
   * Manually trigger heartbeat (useful for external queue managers).
   */
  manualHeartbeat(): void {
    if (this.isConversationActive && this.state !== 'LISTENING') {
      this.triggerHeartbeat();
    }
  }

  // ========== ERROR HANDLING ==========

  private handleError(error: Error): void {
    console.error('[LoopBack] Error:', error);
    this.setState('ERROR');
    this.config.onError?.(error);

    // Auto-recover after a short delay if conversation is still active
    setTimeout(() => {
      if (this.isConversationActive && this.state === 'ERROR') {
        console.log('[LoopBack] Auto-recovering from error');
        this.startListening();
      }
    }, 1000);
  }

  // ========== STUCK STATE PREVENTION ==========

  private resetStuckTimer(): void {
    if (this.stuckTimer) {
      clearTimeout(this.stuckTimer);
    }

    // Set up stuck detection for states that shouldn't last too long
    if (this.state === 'PROCESSING' || this.state === 'STREAMING' || this.state === 'TRANSITIONING') {
      this.stuckTimer = setTimeout(() => {
        if (this.isConversationActive) {
          console.warn(`[LoopBack] Stuck in ${this.state} state - forcing recovery`);
          this.triggerHeartbeat();
        }
      }, this.config.stuckStateTimeout);
    }
  }

  // ========== CLEANUP ==========

  private clearTimers(): void {
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.stuckTimer) {
      clearTimeout(this.stuckTimer);
      this.stuckTimer = null;
    }
  }

  /**
   * Full cleanup - call when destroying the controller.
   */
  destroy(): void {
    this.endConversation();
    this.clearTimers();
    console.log('[LoopBack] Destroyed');
  }

  // ========== STATS ==========

  getStats(): LoopBackStats {
    return { ...this.stats };
  }

  private resetStats(): void {
    this.stats = {
      turnCount: 0,
      totalListeningTime: 0,
      totalSpeakingTime: 0,
      heartbeatCount: 0,
      restartCount: 0,
      errorCount: 0,
    };
  }

  // ========== CONFIGURATION ==========

  updateConfig(config: Partial<LoopBackConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let controllerInstance: LoopBackController | null = null;

export function getLoopBackController(config?: Partial<LoopBackConfig>): LoopBackController {
  if (!controllerInstance) {
    controllerInstance = new LoopBackController(config);
  } else if (config) {
    controllerInstance.updateConfig(config);
  }
  return controllerInstance;
}

export function destroyLoopBackController(): void {
  if (controllerInstance) {
    controllerInstance.destroy();
    controllerInstance = null;
  }
}

export default LoopBackController;
