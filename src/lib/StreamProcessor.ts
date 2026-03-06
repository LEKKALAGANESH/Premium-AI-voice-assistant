// StreamProcessor.ts - Ultra-Low Latency Sentence Detection Engine
// Version 1.0.0
//
// Core Design Principles:
// 1. FIRST-WORD LATENCY: Start speaking the first sentence ASAP (target: <500ms after first token)
// 2. NATURAL BREAKS: Detect sentence/clause boundaries without cutting mid-thought
// 3. ADAPTIVE BUFFERING: Smaller buffers = faster speech, larger = more natural pauses
// 4. NEWLINE TRIGGERS: Treat \n as immediate sentence boundary (AI often uses these)

// ============================================================================
// TYPES
// ============================================================================

export interface SpeakableSegment {
  text: string;
  type: 'sentence' | 'clause' | 'forced';
  confidence: number; // 0-1, how confident we are this is a natural break
}

export interface StreamProcessorConfig {
  // Minimum characters before considering a segment speakable
  // Lower = faster first speech, but may cut off awkwardly
  minSpeakableLength: number;

  // Characters to wait before forcing a split on clause boundary (, ; :)
  clauseThreshold: number;

  // Maximum buffer before forcing a split (prevents infinite buffering)
  maxBufferSize: number;

  // Whether to split on newlines immediately
  splitOnNewline: boolean;

  // Custom sentence endings (regex pattern)
  sentenceEndPattern?: RegExp;

  // Callback when a segment is ready
  onSegmentReady?: (segment: SpeakableSegment, remainingBuffer: string) => void;
}

export interface ProcessResult {
  segments: SpeakableSegment[];
  remainder: string;
}

// ============================================================================
// DEFAULT CONFIGURATION - Optimized for Sub-2-Second Latency
// ============================================================================

const DEFAULT_CONFIG: StreamProcessorConfig = {
  minSpeakableLength: 5,    // ULTRA-AGGRESSIVE: 5 chars ~1-2 words for <800ms TTFA
  clauseThreshold: 25,       // Split on comma after 25 chars (faster first chunk)
  maxBufferSize: 80,         // Force split at 80 chars (more frequent, shorter segments)
  splitOnNewline: true,
};

// ============================================================================
// REGEX PATTERNS
// ============================================================================

// Sentence endings: period, exclamation, question mark
// Excludes common abbreviations: Mr., Mrs., Dr., etc.
const SENTENCE_END_REGEX = /(?<![A-Z])(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|vs|etc|Inc|Ltd|Corp))\s*[.!?]+\s*$/;

// Clause endings: comma, semicolon, colon, em-dash
const CLAUSE_END_REGEX = /[,;:\u2014]\s*$/;

// Abbreviations to NOT split after
const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|vs|etc|Inc|Ltd|Corp|i\.e|e\.g|a\.m|p\.m)\.\s*$/i;

// Numbers with decimals (don't split on the period)
const DECIMAL_PATTERN = /\d+\.\d*$/;

// ============================================================================
// STREAM PROCESSOR CLASS
// ============================================================================

export class StreamProcessor {
  private config: StreamProcessorConfig;
  private buffer: string = '';
  private segmentCount: number = 0;

  constructor(config: Partial<StreamProcessorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ========== MAIN PROCESSING METHOD ==========

  /**
   * Process an incoming chunk and extract any speakable segments.
   *
   * @param chunk - New text chunk from streaming API
   * @returns ProcessResult with extracted segments and remaining buffer
   */
  processChunk(chunk: string): ProcessResult {
    this.buffer += chunk;
    const segments: SpeakableSegment[] = [];

    // Process buffer until no more segments can be extracted
    let result = this.extractNextSegment();
    while (result) {
      segments.push(result);
      this.segmentCount++;
      this.config.onSegmentReady?.(result, this.buffer);
      result = this.extractNextSegment();
    }

    return {
      segments,
      remainder: this.buffer,
    };
  }

  /**
   * Extract the next speakable segment from the buffer.
   * Returns null if no speakable segment is ready.
   */
  private extractNextSegment(): SpeakableSegment | null {
    const text = this.buffer;

    // Not enough content yet
    if (text.length < this.config.minSpeakableLength) {
      return null;
    }

    // ========== PRIORITY 1: NEWLINE SPLIT ==========
    if (this.config.splitOnNewline) {
      const newlineIndex = text.indexOf('\n');
      if (newlineIndex >= 0 && newlineIndex >= this.config.minSpeakableLength - 1) {
        const segment = text.slice(0, newlineIndex).trim();
        this.buffer = text.slice(newlineIndex + 1);

        if (segment.length >= 3) { // Minimum 3 chars to speak
          return {
            text: segment,
            type: 'sentence',
            confidence: 0.95,
          };
        }
      }
    }

    // ========== PRIORITY 2: SENTENCE ENDING ==========
    const sentenceMatch = this.findSentenceEnd(text);
    if (sentenceMatch !== -1 && sentenceMatch >= this.config.minSpeakableLength - 1) {
      const segment = text.slice(0, sentenceMatch + 1).trim();
      this.buffer = text.slice(sentenceMatch + 1);

      return {
        text: segment,
        type: 'sentence',
        confidence: 1.0,
      };
    }

    // ========== PRIORITY 3: CLAUSE ENDING (for longer buffers) ==========
    if (text.length >= this.config.clauseThreshold) {
      const clauseMatch = this.findClauseEnd(text);
      if (clauseMatch !== -1 && clauseMatch >= this.config.minSpeakableLength) {
        const segment = text.slice(0, clauseMatch + 1).trim();
        this.buffer = text.slice(clauseMatch + 1);

        return {
          text: segment,
          type: 'clause',
          confidence: 0.8,
        };
      }
    }

    // ========== PRIORITY 4: FORCE SPLIT (prevent infinite buffering) ==========
    if (text.length >= this.config.maxBufferSize) {
      const splitIndex = this.findBestWordBreak(text, this.config.maxBufferSize);
      const segment = text.slice(0, splitIndex).trim();
      this.buffer = text.slice(splitIndex);

      return {
        text: segment,
        type: 'forced',
        confidence: 0.5,
      };
    }

    return null;
  }

  // ========== BOUNDARY DETECTION HELPERS ==========

  /**
   * Find the last sentence-ending punctuation position.
   * Returns -1 if not found or if it's likely an abbreviation.
   */
  private findSentenceEnd(text: string): number {
    let lastIndex = -1;

    for (let i = this.config.minSpeakableLength - 1; i < text.length; i++) {
      const char = text[i];

      if (char === '.' || char === '!' || char === '?') {
        const textUpToHere = text.slice(0, i + 1);

        // Skip if it's an abbreviation
        if (ABBREVIATIONS.test(textUpToHere)) {
          continue;
        }

        // Skip if it's a decimal number
        if (DECIMAL_PATTERN.test(textUpToHere)) {
          continue;
        }

        // Check next char (should be space, newline, or end)
        const nextChar = text[i + 1];
        if (!nextChar || nextChar === ' ' || nextChar === '\n' || nextChar === '\r') {
          lastIndex = i;
        }
      }
    }

    return lastIndex;
  }

  /**
   * Find the last clause-ending punctuation position.
   */
  private findClauseEnd(text: string): number {
    let lastIndex = -1;

    for (let i = this.config.minSpeakableLength - 1; i < text.length; i++) {
      const char = text[i];

      if (char === ',' || char === ';' || char === ':' || char === '\u2014') { // em-dash
        // Ensure there's content after (not trailing punctuation)
        const remaining = text.slice(i + 1).trim();
        if (remaining.length > 0) {
          lastIndex = i;
        }
      }
    }

    return lastIndex;
  }

  /**
   * Find the best word break near the target position.
   * Prefers breaking at spaces to avoid cutting words.
   */
  private findBestWordBreak(text: string, targetPos: number): number {
    // Look for space backwards from target
    for (let i = targetPos; i > this.config.minSpeakableLength; i--) {
      if (text[i] === ' ') {
        return i + 1; // Include the space on the left segment
      }
    }

    // Look for space forwards from target
    for (let i = targetPos; i < Math.min(text.length, targetPos + 20); i++) {
      if (text[i] === ' ') {
        return i + 1;
      }
    }

    // Fallback: just cut at target
    return targetPos;
  }

  // ========== BUFFER MANAGEMENT ==========

  /**
   * Flush any remaining buffer as a final segment.
   * Call this when the stream ends.
   */
  flush(): SpeakableSegment | null {
    const text = this.buffer.trim();
    this.buffer = '';

    if (text.length >= 2) { // At least 2 chars
      this.segmentCount++;
      return {
        text,
        type: 'forced',
        confidence: 1.0, // It's the end, so we're confident
      };
    }

    return null;
  }

  /**
   * Reset the processor state.
   */
  reset(): void {
    this.buffer = '';
    this.segmentCount = 0;
  }

  /**
   * Get current buffer content.
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get count of segments processed.
   */
  getSegmentCount(): number {
    return this.segmentCount;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<StreamProcessorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// QUICK-START FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a processor optimized for ULTRA-LOW latency (first-word speed).
 * Trade-off: May have slightly less natural pauses.
 */
export function createUltraFastProcessor(
  onSegmentReady?: StreamProcessorConfig['onSegmentReady']
): StreamProcessor {
  return new StreamProcessor({
    minSpeakableLength: 6,     // ~2 words
    clauseThreshold: 25,        // Split earlier on clauses
    maxBufferSize: 60,          // Aggressive force-split
    splitOnNewline: true,
    onSegmentReady,
  });
}

/**
 * Create a processor optimized for NATURAL speech (better pauses).
 * Trade-off: Slightly higher latency on first sentence.
 */
export function createNaturalProcessor(
  onSegmentReady?: StreamProcessorConfig['onSegmentReady']
): StreamProcessor {
  return new StreamProcessor({
    minSpeakableLength: 15,    // ~4-5 words
    clauseThreshold: 50,        // More context before clause split
    maxBufferSize: 150,         // Allow longer sentences
    splitOnNewline: true,
    onSegmentReady,
  });
}

/**
 * Create a processor with balanced settings (recommended).
 */
export function createBalancedProcessor(
  onSegmentReady?: StreamProcessorConfig['onSegmentReady']
): StreamProcessor {
  return new StreamProcessor({
    minSpeakableLength: 8,
    clauseThreshold: 35,
    maxBufferSize: 100,
    splitOnNewline: true,
    onSegmentReady,
  });
}

// ============================================================================
// SINGLETON FOR SIMPLE USAGE
// ============================================================================

let processorInstance: StreamProcessor | null = null;

export function getStreamProcessor(config?: Partial<StreamProcessorConfig>): StreamProcessor {
  if (!processorInstance) {
    processorInstance = new StreamProcessor(config);
  } else if (config) {
    processorInstance.updateConfig(config);
  }
  return processorInstance;
}

export function resetStreamProcessor(): void {
  if (processorInstance) {
    processorInstance.reset();
  }
}

export default StreamProcessor;
