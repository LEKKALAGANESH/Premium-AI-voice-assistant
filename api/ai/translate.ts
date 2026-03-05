// Voice Translator API Route - 100/100 Production Ready
// Gemini-powered translation with:
// - Context Window for conversation memory
// - Cultural Nuance & Idiom handling
// - Robust timeout and error handling
// - Intent over Literalism translation

import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ============================================================================
// ERROR CODES
// ============================================================================

enum TranslationErrorCode {
  MISSING_API_KEY = 'MISSING_API_KEY',
  MISSING_FIELDS = 'MISSING_FIELDS',
  INVALID_INPUT = 'INVALID_INPUT',
  TRANSLATION_FAILED = 'TRANSLATION_FAILED',
  EMPTY_RESULT = 'EMPTY_RESULT',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

interface TranslationErrorResponse {
  error: TranslationErrorCode;
  message: string;
  details?: string;
  retryable: boolean;
}

const createErrorResponse = (
  code: TranslationErrorCode,
  message: string,
  details?: string,
  retryable = true
): TranslationErrorResponse => ({
  error: code,
  message,
  details,
  retryable,
});

// ============================================================================
// CONTEXT WINDOW TYPES
// ============================================================================

interface ContextEntry {
  speaker: 'A' | 'B';
  original: string;
  translated: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

const MAX_TEXT_LENGTH = 5000;
const MIN_TEXT_LENGTH = 1;
const MAX_CONTEXT_ENTRIES = 10;
const TRANSLATION_TIMEOUT_MS = 25000; // 25 seconds

const validateRequest = (body: any): { valid: boolean; error?: TranslationErrorResponse } => {
  const { text, sourceLanguage, targetLanguage } = body;

  if (!text || !sourceLanguage || !targetLanguage) {
    return {
      valid: false,
      error: createErrorResponse(
        TranslationErrorCode.MISSING_FIELDS,
        'Missing required fields',
        'Required: text, sourceLanguage, targetLanguage',
        false
      ),
    };
  }

  if (typeof text !== 'string') {
    return {
      valid: false,
      error: createErrorResponse(
        TranslationErrorCode.INVALID_INPUT,
        'Invalid text format',
        'Text must be a string',
        false
      ),
    };
  }

  const trimmedText = text.trim();
  if (trimmedText.length < MIN_TEXT_LENGTH) {
    return {
      valid: false,
      error: createErrorResponse(
        TranslationErrorCode.INVALID_INPUT,
        'Text too short',
        `Text must be at least ${MIN_TEXT_LENGTH} character(s)`,
        false
      ),
    };
  }

  if (trimmedText.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      error: createErrorResponse(
        TranslationErrorCode.INVALID_INPUT,
        'Text too long',
        `Text must be less than ${MAX_TEXT_LENGTH} characters`,
        false
      ),
    };
  }

  if (typeof sourceLanguage !== 'string' || typeof targetLanguage !== 'string') {
    return {
      valid: false,
      error: createErrorResponse(
        TranslationErrorCode.INVALID_INPUT,
        'Invalid language format',
        'Languages must be strings',
        false
      ),
    };
  }

  return { valid: true };
};

// ============================================================================
// GEMINI CLIENT
// ============================================================================

let aiClient: GoogleGenAI | null = null;

const getAIClient = (): GoogleGenAI | null => {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[Translate API] GEMINI_API_KEY not configured');
    return null;
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  return aiClient;
};

// ============================================================================
// CULTURAL NUANCE & IDIOM-AWARE SYSTEM PROMPT
// ============================================================================

/**
 * Production-grade system prompt with:
 * - Intent over Literalism principle
 * - Cultural nuance awareness
 * - Idiom and slang handling
 * - Pronoun resolution from context
 */
const getTranslatorSystemPrompt = (hasContext: boolean): string => {
  const basePrompt = `You are an expert real-time voice interpreter mediating a live face-to-face conversation between two people speaking different languages. Your role is to facilitate natural, fluid communication.

═══════════════════════════════════════════════════════════════
CORE PRINCIPLE: INTENT OVER LITERALISM
═══════════════════════════════════════════════════════════════

Your primary goal is to convey the speaker's INTENT and MEANING, not to produce a word-for-word translation. The listener should understand exactly what the speaker meant to communicate.

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

1. OUTPUT ONLY THE TRANSLATION
   - Never add commentary, explanations, or meta-text
   - Never say "The person said..." or "They are asking..."
   - Just output the natural translation

2. PRESERVE EMOTIONAL TONE
   - Maintain the speaker's emotion (excitement, concern, humor, etc.)
   - Keep the same level of formality/informality
   - Preserve urgency, hesitation, or emphasis

3. HANDLE IDIOMS & SLANG CULTURALLY
   - NEVER translate idioms literally
   - Find the equivalent expression in the target language that conveys the same meaning

   Examples:
   - "Break a leg" → Target language equivalent of "Good luck!"
   - "It's raining cats and dogs" → Target language equivalent of "It's raining heavily"
   - "Piece of cake" → Target language equivalent of "Very easy"
   - "Beat around the bush" → Target language equivalent of "Avoid the main topic"
   - "Cost an arm and a leg" → Target language equivalent of "Very expensive"
   - "Under the weather" → Target language equivalent of "Feeling sick/unwell"

4. CULTURAL ADAPTATION
   - Adapt cultural references to be understood by the listener
   - Use appropriate honorifics and politeness levels for the target culture
   - Consider cultural context when translating humor or expressions

═══════════════════════════════════════════════════════════════
LANGUAGE-SPECIFIC GUIDELINES
═══════════════════════════════════════════════════════════════

INDIAN LANGUAGES (Hindi, Tamil, Telugu, Bengali, etc.):
- Use appropriate respectful forms (आप vs तुम, formal vs informal)
- Preserve honorifics (जी, साहब, etc.) when culturally appropriate
- Handle code-mixing naturally (Hinglish is common and acceptable)
- Be aware of regional idioms and expressions

EAST ASIAN LANGUAGES (Japanese, Korean, Chinese):
- Maintain proper politeness levels (keigo, jondaenmal, etc.)
- Use appropriate particles and sentence endings
- Handle indirect communication styles
- Respect hierarchical address forms

EUROPEAN LANGUAGES (Spanish, French, German, etc.):
- Preserve formal/informal distinctions (usted/tú, vous/tu, Sie/du)
- Maintain grammatical gender agreements
- Adapt region-specific expressions (Latin American vs European Spanish)

MIDDLE EASTERN LANGUAGES (Arabic, Hebrew, Farsi):
- Use appropriate greeting formulas and religious expressions
- Respect cultural communication norms
- Handle right-to-left script concepts naturally`;

  if (hasContext) {
    return `${basePrompt}

═══════════════════════════════════════════════════════════════
CONTEXT AWARENESS (CRITICAL)
═══════════════════════════════════════════════════════════════

You will receive recent conversation exchanges as context. Use this to:

1. RESOLVE PRONOUNS & REFERENCES
   - "it", "that", "this" → Identify what they refer to from context
   - "he", "she", "they" → Understand who is being referenced
   - "there", "here" → Resolve spatial references

   Example:
   Context: Person A asked about "the red book" earlier
   Current: "Put it on the table"
   → You should translate knowing "it" = "the red book"

2. MAINTAIN CONVERSATION COHERENCE
   - Keep consistent terminology throughout the conversation
   - Reference previously discussed topics naturally
   - Don't repeat information the listener already knows

3. TRACK SPEAKER RELATIONSHIPS
   - Note if speakers are formal or casual with each other
   - Maintain consistent formality level throughout

IMPORTANT: Do NOT mention the context explicitly in your translation. Just use it to understand references and produce natural translations.`;
  }

  return basePrompt;
};

// ============================================================================
// BUILD CONTEXT PROMPT
// ============================================================================

const buildContextPrompt = (
  context: ContextEntry[],
  currentText: string,
  sourceLanguage: string,
  targetLanguage: string
): string => {
  if (!context || context.length === 0) {
    return `Translate the following ${sourceLanguage} speech to ${targetLanguage}.
Remember: Prioritize intent over literalism. Handle idioms culturally.
Output ONLY the translation, nothing else:

"${currentText}"`;
  }

  const limitedContext = context.slice(-MAX_CONTEXT_ENTRIES);

  const contextLines = limitedContext.map((entry, index) => {
    const speakerLabel = entry.speaker === 'A' ? 'Speaker A' : 'Speaker B';
    return `${index + 1}. ${speakerLabel}: "${entry.original}" → "${entry.translated}"`;
  }).join('\n');

  return `CONVERSATION CONTEXT (for resolving references and maintaining coherence):
${contextLines}

═══════════════════════════════════════════════════════════════
NOW TRANSLATE this ${sourceLanguage} speech to ${targetLanguage}.

Use the context above to:
- Resolve any pronouns (it, that, this, he, she, they)
- Understand references to earlier topics
- Maintain consistent terminology

Remember: Prioritize INTENT over literalism. Handle idioms culturally.
Output ONLY the translation, nothing else:

"${currentText}"`;
};

// ============================================================================
// ROBUST API CALL WITH RETRY
// ============================================================================

async function translateWithRetry(
  ai: GoogleGenAI,
  prompt: string,
  systemPrompt: string,
  maxRetries: number = 2
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.25, // Low for consistent translations
          maxOutputTokens: 1024,
          topP: 0.9,
          topK: 40,
        },
      });

      const rawText = response.text || '';
      const translatedText = rawText
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/^Translation:\s*/i, '')
        .replace(/^Output:\s*/i, '')
        .replace(/^Result:\s*/i, '')
        .trim();

      if (translatedText) {
        return translatedText;
      }

      throw new Error('Empty translation result');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on certain errors
      const errorMessage = lastError.message.toLowerCase();
      if (
        errorMessage.includes('quota') ||
        errorMessage.includes('rate') ||
        errorMessage.includes('invalid')
      ) {
        throw lastError;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500; // 500ms, 1000ms
        await new Promise(resolve => setTimeout(resolve, delay));
        console.log(`[Translate API] Retry attempt ${attempt + 1} after ${delay}ms`);
      }
    }
  }

  throw lastError || new Error('Translation failed after retries');
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json(
      createErrorResponse(
        TranslationErrorCode.INTERNAL_ERROR,
        'Method not allowed',
        'Only POST requests are accepted',
        false
      )
    );
  }

  const ai = getAIClient();
  if (!ai) {
    return res.status(503).json(
      createErrorResponse(
        TranslationErrorCode.MISSING_API_KEY,
        'Translation service not configured',
        'API key is missing',
        false
      )
    );
  }

  const validation = validateRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json(validation.error);
  }

  const { text, sourceLanguage, targetLanguage, context } = req.body;
  const trimmedText = text.trim();

  // Validate context
  const validContext: ContextEntry[] = [];
  if (Array.isArray(context)) {
    for (const entry of context.slice(-MAX_CONTEXT_ENTRIES)) {
      if (
        entry &&
        typeof entry.speaker === 'string' &&
        typeof entry.original === 'string' &&
        typeof entry.translated === 'string'
      ) {
        validContext.push({
          speaker: entry.speaker === 'B' ? 'B' : 'A',
          original: entry.original.substring(0, 500),
          translated: entry.translated.substring(0, 500),
        });
      }
    }
  }

  const hasContext = validContext.length > 0;

  console.log(`[Translate API] ${sourceLanguage} → ${targetLanguage}, length: ${trimmedText.length}, context: ${validContext.length}`);

  // Set up timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('TIMEOUT'));
    }, TRANSLATION_TIMEOUT_MS);
  });

  try {
    const prompt = buildContextPrompt(
      validContext,
      trimmedText,
      sourceLanguage,
      targetLanguage
    );

    const systemPrompt = getTranslatorSystemPrompt(hasContext);

    // Race between translation and timeout
    const translatedText = await Promise.race([
      translateWithRetry(ai, prompt, systemPrompt),
      timeoutPromise,
    ]);

    console.log(`[Translate API] Success, output length: ${translatedText.length}`);

    return res.status(200).json({
      translatedText,
      sourceLanguage,
      targetLanguage,
      originalLength: trimmedText.length,
      translatedLength: translatedText.length,
      contextUsed: hasContext,
      contextEntries: validContext.length,
    });

  } catch (err: any) {
    const errorMessage = err?.message || '';

    // Timeout
    if (errorMessage === 'TIMEOUT' || err?.name === 'AbortError') {
      console.error('[Translate API] Request timeout');
      return res.status(504).json(
        createErrorResponse(
          TranslationErrorCode.TIMEOUT,
          'Translation request timed out',
          'Please check your connection and try again',
          true
        )
      );
    }

    // Rate limiting
    if (errorMessage.includes('quota') || errorMessage.includes('rate')) {
      console.error('[Translate API] Rate limited:', errorMessage);
      return res.status(429).json(
        createErrorResponse(
          TranslationErrorCode.RATE_LIMITED,
          'Translation service is busy',
          'Please wait a moment and try again',
          true
        )
      );
    }

    // Service unavailable
    if (errorMessage.includes('unavailable') || errorMessage.includes('500')) {
      console.error('[Translate API] Service unavailable:', errorMessage);
      return res.status(503).json(
        createErrorResponse(
          TranslationErrorCode.SERVICE_UNAVAILABLE,
          'Translation service temporarily unavailable',
          'Please try again in a few moments',
          true
        )
      );
    }

    // Network errors
    if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
      console.error('[Translate API] Network error:', errorMessage);
      return res.status(503).json(
        createErrorResponse(
          TranslationErrorCode.SERVICE_UNAVAILABLE,
          'Network error connecting to translation service',
          'Please check your connection',
          true
        )
      );
    }

    // Empty result
    if (errorMessage.includes('Empty translation')) {
      console.warn('[Translate API] Empty translation result');
      return res.status(422).json(
        createErrorResponse(
          TranslationErrorCode.EMPTY_RESULT,
          'Translation returned empty',
          'The translation service could not process this text',
          true
        )
      );
    }

    // Generic error
    console.error("[Translate API] Unexpected error:", err);
    return res.status(500).json(
      createErrorResponse(
        TranslationErrorCode.INTERNAL_ERROR,
        'An unexpected error occurred',
        errorMessage || 'Unknown error',
        true
      )
    );
  }
}
