// Voice Translator API Route - 2026 Standard
// Gemini-powered translation for real-time voice mediation
// Enhanced with comprehensive error handling

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
// VALIDATION
// ============================================================================

const MAX_TEXT_LENGTH = 5000; // Maximum characters for translation
const MIN_TEXT_LENGTH = 1;

const validateRequest = (body: any): { valid: boolean; error?: TranslationErrorResponse } => {
  const { text, sourceLanguage, targetLanguage } = body;

  // Check required fields
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

  // Validate text length
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

  // Validate language formats
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
// GEMINI CLIENT INITIALIZATION
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
// SYSTEM PROMPT
// ============================================================================

/**
 * System prompt for strict translation mediation
 * This prompt ensures Gemini acts as a pure translator without robotic commentary
 */
const TRANSLATOR_SYSTEM_PROMPT = `You are a real-time voice translator mediating a conversation between two people speaking different languages in the same room.

CRITICAL RULES:
1. ONLY output the direct translation. Never add commentary, explanations, or your own words.
2. Preserve the speaker's tone, intent, and emotion in the translation.
3. Use natural, conversational language appropriate for spoken communication.
4. If the input contains greetings, questions, or expressions, translate them naturally.
5. Never say things like "The person said..." or "They are asking..." - just translate directly.
6. Handle colloquialisms and idioms by finding equivalent expressions in the target language.
7. Keep the same level of formality as the original speech.
8. If the input is unclear or incomplete, translate what you can understand naturally.
9. For Indian languages, be particularly careful with:
   - Respectful forms (आप/तुम, formal/informal)
   - Regional expressions and idioms
   - Honorifics and titles
   - Script-specific nuances

Example:
Input (Hindi): "नमस्ते, आपका नाम क्या है?"
Output (English): "Hello, what is your name?"

NOT: "The speaker is greeting you and asking for your name. They said: Hello, what is your name?"`;

// ============================================================================
// REQUEST HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
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

  // Validate API key
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

  // Validate request body
  const validation = validateRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json(validation.error);
  }

  const { text, sourceLanguage, targetLanguage } = req.body;
  const trimmedText = text.trim();

  // Log request (without sensitive data in production)
  console.log(`[Translate API] ${sourceLanguage} -> ${targetLanguage}, length: ${trimmedText.length}`);

  try {
    const prompt = `Translate the following ${sourceLanguage} text to ${targetLanguage}. Output ONLY the translation, nothing else:

"${trimmedText}"`;

    // Set timeout for the API call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          systemInstruction: TRANSLATOR_SYSTEM_PROMPT,
          temperature: 0.3, // Lower temperature for more consistent translations
          maxOutputTokens: 1024,
        },
      });
    } catch (genError: any) {
      clearTimeout(timeoutId);

      // Handle specific Gemini API errors
      const errorMessage = genError?.message || '';
      const errorStatus = genError?.status || genError?.code;

      // Rate limiting
      if (errorStatus === 429 || errorMessage.includes('quota') || errorMessage.includes('rate')) {
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
      if (errorStatus === 503 || errorStatus === 500 || errorMessage.includes('unavailable')) {
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

      // Timeout
      if (genError.name === 'AbortError' || errorMessage.includes('timeout')) {
        console.error('[Translate API] Request timeout');
        return res.status(504).json(
          createErrorResponse(
            TranslationErrorCode.TIMEOUT,
            'Translation request timed out',
            'Please try with shorter text or try again',
            true
          )
        );
      }

      // Generic API error
      console.error('[Translate API] Gemini API error:', genError);
      return res.status(500).json(
        createErrorResponse(
          TranslationErrorCode.TRANSLATION_FAILED,
          'Translation failed',
          errorMessage || 'Unknown API error',
          true
        )
      );
    }

    clearTimeout(timeoutId);

    // Extract and clean the translated text
    const rawText = response.text || '';
    const translatedText = rawText
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .trim();

    // Check for empty result
    if (!translatedText) {
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

    // Log success
    console.log(`[Translate API] Success, output length: ${translatedText.length}`);

    // Return successful response
    return res.status(200).json({
      translatedText,
      sourceLanguage,
      targetLanguage,
      originalLength: trimmedText.length,
      translatedLength: translatedText.length,
    });

  } catch (error: any) {
    // Catch-all for unexpected errors
    console.error("[Translate API] Unexpected error:", error);

    return res.status(500).json(
      createErrorResponse(
        TranslationErrorCode.INTERNAL_ERROR,
        'An unexpected error occurred',
        error?.message || 'Unknown error',
        true
      )
    );
  }
}
