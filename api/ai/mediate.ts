// Bilingual Voice Mediator API Route
// Optimized for real-time face-to-face interpretation
// Uses Gemini 2.0 Flash for low-latency translation

import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ============================================================================
// ERROR HANDLING
// ============================================================================

enum MediatorErrorCode {
  MISSING_API_KEY = 'MISSING_API_KEY',
  MISSING_FIELDS = 'MISSING_FIELDS',
  INVALID_INPUT = 'INVALID_INPUT',
  TRANSLATION_FAILED = 'TRANSLATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
}

interface ErrorResponse {
  error: MediatorErrorCode;
  message: string;
  retryable: boolean;
}

const createError = (
  code: MediatorErrorCode,
  message: string,
  retryable = true
): ErrorResponse => ({ error: code, message, retryable });

// ============================================================================
// GEMINI CLIENT (Singleton)
// ============================================================================

let aiClient: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI | null => {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[Mediate API] GEMINI_API_KEY not configured');
    return null;
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  return aiClient;
};

// ============================================================================
// SYSTEM PROMPT - Optimized for Voice Mediation
// ============================================================================

const MEDIATOR_PROMPT = `You are a professional real-time voice interpreter facilitating a face-to-face conversation between two people speaking different languages.

CRITICAL RULES:
1. Output ONLY the translation - no explanations, no meta-text
2. Preserve the speaker's emotion and intent
3. Translate idioms to equivalent expressions in the target language (NEVER literally)
4. Use natural conversational speech appropriate for spoken communication
5. Keep translations concise - this will be spoken aloud
6. Maintain appropriate formality level based on context

NEVER:
- Add phrases like "The person said..." or "Translation:"
- Translate idioms word-for-word
- Add your own commentary or questions
- Include the original text in your response

Just output the natural translation that should be spoken.`;

// ============================================================================
// REQUEST HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CRIT-4 FIX: Fail-closed CORS — require ALLOWED_ORIGINS in production
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  if (allowedOrigins.length === 0) {
    console.error("FATAL: ALLOWED_ORIGINS env var is not set. Cannot serve cross-origin requests safely.");
    return res.status(500).json({ error: "SERVER_MISCONFIGURED", message: "CORS not configured" });
  }
  const requestOrigin = req.headers.origin || '';
  if (allowedOrigins.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json(
      createError(MediatorErrorCode.INVALID_INPUT, 'Method not allowed', false)
    );
  }

  // Get AI client
  const ai = getAI();
  if (!ai) {
    return res.status(503).json(
      createError(MediatorErrorCode.MISSING_API_KEY, 'Translation service not configured', false)
    );
  }

  // Validate request
  const { text, sourceLanguage, targetLanguage } = req.body || {};

  if (!text || !sourceLanguage || !targetLanguage) {
    return res.status(400).json(
      createError(
        MediatorErrorCode.MISSING_FIELDS,
        'Required: text, sourceLanguage, targetLanguage',
        false
      )
    );
  }

  const trimmedText = String(text).trim();

  if (trimmedText.length === 0) {
    return res.status(400).json(
      createError(MediatorErrorCode.INVALID_INPUT, 'Text cannot be empty', false)
    );
  }

  if (trimmedText.length > 2000) {
    return res.status(400).json(
      createError(MediatorErrorCode.INVALID_INPUT, 'Text too long (max 2000 characters)', false)
    );
  }

  console.log(`[Mediate API] ${sourceLanguage} -> ${targetLanguage}: "${trimmedText.substring(0, 50)}..."`);

  // Timeout race
  const timeoutMs = 20000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
  });

  try {
    const prompt = `Translate this ${sourceLanguage} speech to ${targetLanguage}:

"${trimmedText}"`;

    const translationPromise = ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: {
        systemInstruction: MEDIATOR_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 512,
        topP: 0.9,
        topK: 40,
      },
    });

    const response = await Promise.race([translationPromise, timeoutPromise]);

    // Clean the response
    let translatedText = (response.text || '').trim();

    // Remove common artifacts
    translatedText = translatedText
      .replace(/^["']|["']$/g, '')
      .replace(/^Translation:\s*/i, '')
      .replace(/^Output:\s*/i, '')
      .trim();

    if (!translatedText) {
      console.error('[Mediate API] Empty translation result');
      return res.status(422).json(
        createError(MediatorErrorCode.TRANSLATION_FAILED, 'Translation returned empty', true)
      );
    }

    console.log(`[Mediate API] Success: "${translatedText.substring(0, 50)}..."`);

    return res.status(200).json({
      translatedText,
      sourceLanguage,
      targetLanguage,
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : '';

    // Timeout
    if (errorMessage === 'TIMEOUT') {
      console.error('[Mediate API] Request timeout');
      return res.status(504).json(
        createError(MediatorErrorCode.TIMEOUT, 'Translation timed out', true)
      );
    }

    // Rate limiting
    if (errorMessage.includes('quota') || errorMessage.includes('rate')) {
      console.error('[Mediate API] Rate limited');
      return res.status(429).json(
        createError(MediatorErrorCode.RATE_LIMITED, 'Service is busy, please wait', true)
      );
    }

    // Generic error
    console.error('[Mediate API] Error:', err);
    return res.status(500).json(
      createError(MediatorErrorCode.TRANSLATION_FAILED, 'Translation failed', true)
    );
  }
}
