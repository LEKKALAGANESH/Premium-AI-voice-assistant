// 2026 Conversational Intelligence Layer: Speech Sanitization Protocol
// Implements: Confidence guardrails, artifact purging, transcript normalization

// === TYPES ===
export interface SanitizationResult {
  original: string;
  sanitized: string;
  confidence: number;
  isLowConfidence: boolean;
  artifacts: string[];
  corrections: SanitizationCorrection[];
}

export interface SanitizationCorrection {
  type: 'confidence_suffix' | 'trailing_artifact' | 'filler_word' | 'repeated_word' | 'noise';
  original: string;
  removed: string;
  position: number;
}

export interface SanitizationOptions {
  confidenceThreshold?: number;
  removeFiller?: boolean;
  removeRepeats?: boolean;
  normalizeWhitespace?: boolean;
  lowercaseOutput?: boolean;
}

// === CONSTANTS ===
const DEFAULT_CONFIDENCE_THRESHOLD = 0.80;

// Patterns for artifact detection
const PATTERNS = {
  // Confidence suffixes: "hello 86%", "weather 89%", etc.
  confidenceSuffix: /\s*\d{1,3}%\s*$/g,

  // Inline confidence markers: "[86%]", "(89%)", etc.
  inlineConfidence: /\s*[\[(]\d{1,3}%[\])]\s*/g,

  // Trailing non-word artifacts: "...", "???", "!!!", random punctuation
  trailingArtifacts: /[\.\?\!]{2,}$|[^\w\s\'\-]+$/g,

  // Leading artifacts
  leadingArtifacts: /^[^\w\s]+/g,

  // STT noise markers: "[inaudible]", "[unclear]", "<noise>", etc.
  noiseMarkers: /\[(?:inaudible|unclear|noise|silence|background)\]|\<(?:noise|unk|silence)\>/gi,

  // Filler words (English)
  fillerWords: /\b(um+|uh+|er+|ah+|like|you know|i mean|basically|actually|literally|so+)\b/gi,

  // Repeated words: "the the", "I I I"
  repeatedWords: /\b(\w+)(?:\s+\1)+\b/gi,

  // Multiple spaces
  multipleSpaces: /\s{2,}/g,

  // Trailing/leading whitespace
  trimWhitespace: /^\s+|\s+$/g,
};

// Common STT misrecognitions to auto-correct
const COMMON_CORRECTIONS: Record<string, string> = {
  'weather in': 'weather in',
  'wheather': 'weather',
  'wether': 'weather',
  'temprature': 'temperature',
  'temperture': 'temperature',
  'celcius': 'celsius',
  'farenheit': 'fahrenheit',
  'tommorow': 'tomorrow',
  'tomorow': 'tomorrow',
};

// === MAIN SANITIZATION FUNCTION ===
export function sanitizeTranscript(
  transcript: string,
  confidence: number = 1.0,
  options: SanitizationOptions = {}
): SanitizationResult {
  const {
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
    removeFiller = true,
    removeRepeats = true,
    normalizeWhitespace = true,
    lowercaseOutput = false,
  } = options;

  const artifacts: string[] = [];
  const corrections: SanitizationCorrection[] = [];
  let sanitized = transcript;
  let position = 0;

  // 1. Remove confidence suffixes (e.g., "hello 86%")
  const confidenceMatch = sanitized.match(PATTERNS.confidenceSuffix);
  if (confidenceMatch) {
    confidenceMatch.forEach(match => {
      artifacts.push(match.trim());
      corrections.push({
        type: 'confidence_suffix',
        original: match,
        removed: match.trim(),
        position: sanitized.indexOf(match),
      });
    });
    sanitized = sanitized.replace(PATTERNS.confidenceSuffix, '');
  }

  // 2. Remove inline confidence markers
  const inlineMatches = sanitized.match(PATTERNS.inlineConfidence);
  if (inlineMatches) {
    inlineMatches.forEach(match => {
      artifacts.push(match.trim());
      corrections.push({
        type: 'confidence_suffix',
        original: match,
        removed: match.trim(),
        position: sanitized.indexOf(match),
      });
    });
    sanitized = sanitized.replace(PATTERNS.inlineConfidence, ' ');
  }

  // 3. Remove noise markers
  const noiseMatches = sanitized.match(PATTERNS.noiseMarkers);
  if (noiseMatches) {
    noiseMatches.forEach(match => {
      artifacts.push(match);
      corrections.push({
        type: 'noise',
        original: match,
        removed: match,
        position: sanitized.indexOf(match),
      });
    });
    sanitized = sanitized.replace(PATTERNS.noiseMarkers, '');
  }

  // 4. Remove trailing artifacts
  const trailingMatch = sanitized.match(PATTERNS.trailingArtifacts);
  if (trailingMatch) {
    trailingMatch.forEach(match => {
      artifacts.push(match);
      corrections.push({
        type: 'trailing_artifact',
        original: match,
        removed: match,
        position: sanitized.length - match.length,
      });
    });
    sanitized = sanitized.replace(PATTERNS.trailingArtifacts, '');
  }

  // 5. Remove leading artifacts
  sanitized = sanitized.replace(PATTERNS.leadingArtifacts, '');

  // 6. Remove filler words (optional)
  if (removeFiller) {
    const fillerMatches = sanitized.match(PATTERNS.fillerWords);
    if (fillerMatches) {
      fillerMatches.forEach(match => {
        corrections.push({
          type: 'filler_word',
          original: match,
          removed: match,
          position: sanitized.toLowerCase().indexOf(match.toLowerCase()),
        });
      });
      sanitized = sanitized.replace(PATTERNS.fillerWords, '');
    }
  }

  // 7. Remove repeated words (optional)
  if (removeRepeats) {
    sanitized = sanitized.replace(PATTERNS.repeatedWords, (match, word) => {
      if (match !== word) {
        corrections.push({
          type: 'repeated_word',
          original: match,
          removed: match.replace(word, '').trim(),
          position: sanitized.indexOf(match),
        });
      }
      return word;
    });
  }

  // 8. Apply common corrections
  Object.entries(COMMON_CORRECTIONS).forEach(([wrong, correct]) => {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, correct);
    }
  });

  // 9. Normalize whitespace
  if (normalizeWhitespace) {
    sanitized = sanitized.replace(PATTERNS.multipleSpaces, ' ');
    sanitized = sanitized.replace(PATTERNS.trimWhitespace, '');
  }

  // 10. Optional lowercase
  if (lowercaseOutput) {
    sanitized = sanitized.toLowerCase();
  }

  // Determine if low confidence
  const isLowConfidence = confidence < confidenceThreshold;

  return {
    original: transcript,
    sanitized,
    confidence,
    isLowConfidence,
    artifacts,
    corrections,
  };
}

// === CONFIDENCE THRESHOLD CHECK ===
export function isConfidenceBelowThreshold(
  confidence: number,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): boolean {
  return confidence < threshold;
}

// === CLARIFICATION MESSAGE GENERATOR ===
export function generateClarificationMessage(
  context: 'city' | 'general' | 'name' | 'number',
  originalInput?: string
): string {
  const messages: Record<typeof context, string[]> = {
    city: [
      "I didn't catch that clearly. Could you repeat the city name?",
      "Sorry, I missed that. Which city did you say?",
      "I want to make sure I heard you right. What city was that?",
    ],
    general: [
      "I didn't quite catch that. Could you say it again?",
      "Sorry, could you repeat that?",
      "I want to make sure I understood. Could you say that once more?",
    ],
    name: [
      "I didn't catch the name clearly. Could you repeat it?",
      "Sorry, what was that name again?",
    ],
    number: [
      "I didn't catch that number. Could you repeat it?",
      "Sorry, what was that number again?",
    ],
  };

  const options = messages[context];
  return options[Math.floor(Math.random() * options.length)];
}

// === EXTRACT CONFIDENCE FROM TRANSCRIPT ===
export function extractConfidenceFromTranscript(transcript: string): {
  text: string;
  extractedConfidence: number | null;
} {
  // Look for patterns like "hello 86%" or "weather [89%]"
  const suffixMatch = transcript.match(/(\d{1,3})%\s*$/);
  const inlineMatch = transcript.match(/[\[(](\d{1,3})%[\])]/);

  if (suffixMatch) {
    const confidence = parseInt(suffixMatch[1], 10) / 100;
    const text = transcript.replace(/\s*\d{1,3}%\s*$/, '').trim();
    return { text, extractedConfidence: confidence };
  }

  if (inlineMatch) {
    const confidence = parseInt(inlineMatch[1], 10) / 100;
    const text = transcript.replace(/\s*[\[(]\d{1,3}%[\])]\s*/g, ' ').trim();
    return { text, extractedConfidence: confidence };
  }

  return { text: transcript, extractedConfidence: null };
}

// === BATCH SANITIZATION ===
export function sanitizeTranscripts(
  transcripts: Array<{ text: string; confidence: number }>,
  options?: SanitizationOptions
): SanitizationResult[] {
  return transcripts.map(t => sanitizeTranscript(t.text, t.confidence, options));
}

export default sanitizeTranscript;
