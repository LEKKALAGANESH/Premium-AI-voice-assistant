import { Router } from "express";
import { Modality } from "@google/genai";
import { ai, getSystemPrompt, getGenerationConfig } from "../services/ai";
import { chatLimiter, ttsLimiter, translateLimiter } from "../middleware/rateLimiter";
import { chatValidation, ttsValidation } from "../middleware/validation";

const router = Router();

// ============================================================================
// Chat (non-streaming)
// ============================================================================

router.post("/chat", chatLimiter, chatValidation, async (req, res) => {
  const { prompt, history, mode } = req.body;

  console.log(`Chat Request [${mode || 'assistant'}] - Prompt: "${prompt?.substring(0, 50)}...", History Length: ${history?.length || 0}`);

  // Strict Persona: resolve mode-specific prompt + generation config
  const systemPrompt = getSystemPrompt(mode);
  const genConfig = getGenerationConfig(mode);

  try {
    const contents = history.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents.push({ role: 'model', parts: [{ text: 'Understood. Please continue.' }] });
    }

    // Directive Reinforcement: append mode tag to user prompt
    const modeTag = mode ? `\n\n[Current Mode: ${mode.toUpperCase()}. Stay strictly in character.]` : '';
    contents.push({ role: 'user', parts: [{ text: prompt + modeTag }] });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: { systemInstruction: systemPrompt, ...genConfig },
    });
    res.json({ text: response.text });
  } catch (error) {
    console.error('AI Proxy Error:', error);
    res.status(500).json({ error: 'AI_REQUEST_FAILED' });
  }
});

// ============================================================================
// Chat (streaming SSE)
// ============================================================================

router.post("/chat-stream", chatLimiter, async (req, res) => {
  const { prompt, history, warmup, mode } = req.body;

  if (warmup) {
    return res.status(200).json({ ok: true, warmed: true });
  }

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'prompt must be a non-empty string' });
  }

  // Strict Persona: resolve mode-specific prompt + generation config
  const systemPrompt = getSystemPrompt(mode);
  const genConfig = getGenerationConfig(mode);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write(`data: ${JSON.stringify({ ack: true, ts: Date.now() })}\n\n`);

  try {
    const contents = (history || []).slice(-10).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents.push({ role: 'model', parts: [{ text: 'OK.' }] });
    }

    // Directive Reinforcement: append mode tag to user prompt
    const modeTag = mode ? `\n\n[Current Mode: ${mode.toUpperCase()}. Stay strictly in character.]` : '';
    contents.push({ role: 'user', parts: [{ text: prompt + modeTag }] });

    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: systemPrompt,
        ...genConfig,
      },
    });

    let fullText = '';
    let chunkCount = 0;

    for await (const chunk of stream) {
      const text = chunk.text || '';
      if (text) {
        fullText += text;
        chunkCount++;
        res.write(`data: ${JSON.stringify({ chunk: text, done: false, idx: chunkCount })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ chunk: '', done: true, fullText, total: chunkCount })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[chat-stream] Error:', error);
    res.write(`data: ${JSON.stringify({
      error: 'AI_STREAM_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error',
      recoverable: true,
    })}\n\n`);
    res.end();
  }
});

// ============================================================================
// TTS
// ============================================================================

router.post("/tts", ttsLimiter, ttsValidation, async (req, res) => {
  const { text, voiceName } = req.body;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || 'Charon' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    res.json({ audio: base64Audio });
  } catch (error) {
    console.error('TTS Proxy Error:', error);
    res.status(500).json({ error: 'TTS_FAILED' });
  }
});

// ============================================================================
// Translation
// ============================================================================

router.post("/translate", translateLimiter, async (req, res) => {
  const { text, sourceLanguage, targetLanguage, context } = req.body;

  if (!text || !sourceLanguage || !targetLanguage) {
    return res.status(400).json({
      error: "MISSING_FIELDS",
      message: "Missing required fields",
      details: "Required: text, sourceLanguage, targetLanguage",
      retryable: false,
    });
  }

  const trimmedText = String(text).trim();
  if (trimmedText.length === 0) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Text is empty", retryable: false });
  }
  if (trimmedText.length > 5000) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Text too long", details: "Maximum 5000 characters allowed", retryable: false });
  }

  console.log(`[Translate] ${sourceLanguage} -> ${targetLanguage}, length: ${trimmedText.length}`);

  // Build context window from last 3 exchanges for continuity
  const contextLines: string[] = [];
  if (Array.isArray(context) && context.length > 0) {
    const recentContext = context.slice(-3);
    contextLines.push('RECENT CONVERSATION CONTEXT (for pronoun/reference resolution):');
    for (const entry of recentContext) {
      if (entry.original && entry.translated) {
        contextLines.push(`  [${entry.speaker || '?'}] ${entry.original} → ${entry.translated}`);
      }
    }
  }

  try {
    const systemPrompt = `You are a TRANSLATION-ONLY engine. You are mediating a live face-to-face conversation between two people who speak different languages (Telugu, Hindi, English, or other Indian/global languages).

YOUR ONLY FUNCTION IS TRANSLATION. YOU MUST:
1. Output ONLY the direct translation — nothing else. No commentary, no timestamps, no dates, no greetings from yourself.
2. NEVER answer questions yourself. If someone asks "What time is it?" — translate that question, do NOT answer it.
3. NEVER add your own words, opinions, or suggestions. You are invisible. You are a voice channel, not a participant.
4. Preserve the speaker's exact tone, intent, emotion, and formality level.
5. Translate idioms to equivalent natural expressions — never translate literally.
6. For Telugu (తెలుగు), Hindi (हिन्दी), and other Indian languages:
   - Preserve respectful forms (మీరు/నువ్వు, आप/तुम)
   - Handle regional idioms naturally
   - Maintain honorifics and titles
   - Use script-appropriate punctuation
7. If speech is unclear or fragmented, translate what you can understand. Do NOT ask for clarification.
8. Keep translations concise — this will be spoken aloud in real-time.

ABSOLUTELY FORBIDDEN:
- Telling the time or date
- Answering trivia or knowledge questions
- Adding "Translation:" or "Here's the translation:" prefixes
- Saying "The person said..." or "They are asking..."
- Any meta-commentary about the translation process`;

    let prompt = '';
    if (contextLines.length > 0) {
      prompt = `${contextLines.join('\n')}\n\nNow translate the following ${sourceLanguage} speech to ${targetLanguage}. Output ONLY the translation:\n\n"${trimmedText}"`;
    } else {
      prompt = `Translate the following ${sourceLanguage} speech to ${targetLanguage}. Output ONLY the translation:\n\n"${trimmedText}"`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    const rawText = response.text || "";
    const translatedText = rawText.trim().replace(/^["']|["']$/g, "").trim();

    if (!translatedText) {
      console.warn("[Translate] Empty result");
      return res.status(422).json({ error: "EMPTY_RESULT", message: "Translation returned empty", retryable: true });
    }

    console.log(`[Translate] Success, output length: ${translatedText.length}`);
    res.json({
      translatedText,
      sourceLanguage,
      targetLanguage,
      originalLength: trimmedText.length,
      translatedLength: translatedText.length,
    });
  } catch (error: unknown) {
    console.error("[Translate] Error:", error);

    const errorMessage = error instanceof Error ? error.message : '';
    const errorObj = error as Record<string, unknown>;
    const errorStatus = errorObj?.status || errorObj?.code;

    if (errorStatus === 429 || errorMessage.includes('quota') || errorMessage.includes('rate')) {
      return res.status(429).json({ error: "RATE_LIMITED", message: "Translation service is busy", details: "Please wait a moment and try again", retryable: true });
    }
    if (errorStatus === 503 || errorStatus === 500) {
      return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Translation service temporarily unavailable", retryable: true });
    }
    res.status(500).json({ error: "TRANSLATION_FAILED", message: "Translation failed", details: errorMessage || "Unknown error", retryable: true });
  }
});

// ============================================================================
// Title Generation (semantic naming for conversations)
// ============================================================================

router.post("/title", chatLimiter, async (req, res) => {
  const { userMessage, botMessage } = req.body;

  if (!userMessage || !botMessage) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'userMessage and botMessage required' });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: `User: "${String(userMessage).slice(0, 200)}"\nBot: "${String(botMessage).slice(0, 200)}"` }] }],
      config: {
        systemInstruction: `You are a naming specialist. Given a conversation snippet, provide a concise 2-4 word professional title that captures the topic or intent. Examples: "AI Engineering Roles", "Flicker's Story", "Telugu Translation", "Quantum Physics Intro", "Recipe Ideas". Rules: Return ONLY the title text. No quotes, no punctuation, no explanation. Max 25 characters.`,
        maxOutputTokens: 20,
        temperature: 0.3,
      },
    });

    const title = (response.text || "").trim().replace(/^["']|["']$/g, "").slice(0, 25).trim();
    res.json({ title: title || "Chat" });
  } catch (error) {
    console.error("[Title] Error:", error);
    res.json({ title: "Chat" });
  }
});

export default router;
