import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, ".env.local") });

const db = new Database("conversations.db");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// ============================================================================
// SECURITY: Rate Limiting Configuration
// ============================================================================

const createRateLimiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    message: { error: 'RATE_LIMITED', message, retryable: true },
    standardHeaders: true,
    legacyHeaders: false,
  });

// Different rate limits for different endpoints
const chatLimiter = createRateLimiter(60 * 1000, 30, 'Too many chat requests. Please wait a moment.');
const ttsLimiter = createRateLimiter(60 * 1000, 20, 'Too many TTS requests. Please wait a moment.');
const translateLimiter = createRateLimiter(60 * 1000, 60, 'Too many translation requests. Please wait a moment.');
const generalLimiter = createRateLimiter(60 * 1000, 100, 'Too many requests. Please slow down.');

// ============================================================================
// SECURITY: Input Validation Constants
// ============================================================================

const MAX_PROMPT_LENGTH = 10000;
const MAX_HISTORY_LENGTH = 50;
const MAX_TTS_TEXT_LENGTH = 5000;
const ALLOWED_VOICE_NAMES = ['Charon', 'Kore', 'Fenrir', 'Aoede', 'Puck', 'Zephyr'];

// ============================================================================
// SECURITY: Validation Helpers
// ============================================================================

const validateChatInput = (prompt: unknown, history: unknown): { valid: boolean; error?: string } => {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, error: 'Invalid prompt: must be a non-empty string' };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `Prompt too long: maximum ${MAX_PROMPT_LENGTH} characters` };
  }
  if (history && !Array.isArray(history)) {
    return { valid: false, error: 'Invalid history: must be an array' };
  }
  if (Array.isArray(history) && history.length > MAX_HISTORY_LENGTH) {
    return { valid: false, error: `History too long: maximum ${MAX_HISTORY_LENGTH} messages` };
  }
  return { valid: true };
};

const validateTTSInput = (text: unknown, voiceName: unknown): { valid: boolean; error?: string } => {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Invalid text: must be a non-empty string' };
  }
  if (text.length > MAX_TTS_TEXT_LENGTH) {
    return { valid: false, error: `Text too long: maximum ${MAX_TTS_TEXT_LENGTH} characters` };
  }
  if (voiceName && typeof voiceName === 'string' && !ALLOWED_VOICE_NAMES.includes(voiceName)) {
    return { valid: false, error: `Invalid voice name. Allowed: ${ALLOWED_VOICE_NAMES.join(', ')}` };
  }
  return { valid: true };
};

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '5173', 10);

  // ============================================================================
  // SECURITY: Helmet Middleware (Security Headers)
  // ============================================================================
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https://generativelanguage.googleapis.com"],
        mediaSrc: ["'self'", "blob:", "data:"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for some audio APIs
  }));

  app.use(express.json({ limit: '1mb' })); // Limit request body size

  // Apply general rate limiting to all routes
  app.use('/api/', generalLimiter);

  // ============================================================================
  // AI Proxy Routes (Zero-Trust Architecture with Validation)
  // ============================================================================

  app.post("/api/ai/chat", chatLimiter, async (req, res) => {
    const { prompt, history } = req.body;

    // Input validation
    const validation = validateChatInput(prompt, history);
    if (!validation.valid) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: validation.error });
    }

    console.log(`Chat Request - Prompt: "${prompt?.substring(0, 50)}...", History Length: ${history?.length || 0}`);

    try {
      const contents = history.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      // Ensure we don't have two consecutive user messages if history ends with user
      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        // This shouldn't happen with our current logic, but let's be safe
        contents.push({ role: 'model', parts: [{ text: 'Understood. Please continue.' }] });
      }

      contents.push({ role: 'user', parts: [{ text: prompt }] });

      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction: "You are a helpful, concise, and friendly voice assistant. Keep your responses brief and conversational.",
        }
      });
      const response = await model;
      res.json({ text: response.text });
    } catch (error) {
      console.error('AI Proxy Error:', error);
      res.status(500).json({ error: 'AI_REQUEST_FAILED' });
    }
  });

  app.post("/api/ai/tts", ttsLimiter, async (req, res) => {
    const { text, voiceName } = req.body;

    // Input validation
    const validation = validateTTSInput(text, voiceName);
    if (!validation.valid) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: validation.error });
    }

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

  // Voice Translator API Route with enhanced error handling
  app.post("/api/ai/translate", translateLimiter, async (req, res) => {
    const { text, sourceLanguage, targetLanguage } = req.body;

    // Validation
    if (!text || !sourceLanguage || !targetLanguage) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "Missing required fields",
        details: "Required: text, sourceLanguage, targetLanguage",
        retryable: false,
      });
    }

    const trimmedText = (text || '').trim();
    if (trimmedText.length === 0) {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "Text is empty",
        retryable: false,
      });
    }

    if (trimmedText.length > 5000) {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "Text too long",
        details: "Maximum 5000 characters allowed",
        retryable: false,
      });
    }

    console.log(`[Translate] ${sourceLanguage} -> ${targetLanguage}, length: ${trimmedText.length}`);

    try {
      const systemPrompt = `You are a real-time voice translator mediating a conversation between two people speaking different languages in the same room.

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
   - Script-specific nuances`;

      const prompt = `Translate the following ${sourceLanguage} text to ${targetLanguage}. Output ONLY the translation, nothing else:

"${trimmedText}"`;

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
        return res.status(422).json({
          error: "EMPTY_RESULT",
          message: "Translation returned empty",
          retryable: true,
        });
      }

      console.log(`[Translate] Success, output length: ${translatedText.length}`);
      res.json({
        translatedText,
        sourceLanguage,
        targetLanguage,
        originalLength: trimmedText.length,
        translatedLength: translatedText.length,
      });
    } catch (error: any) {
      console.error("[Translate] Error:", error);

      // Handle specific errors
      const errorMessage = error?.message || '';
      const errorStatus = error?.status || error?.code;

      if (errorStatus === 429 || errorMessage.includes('quota') || errorMessage.includes('rate')) {
        return res.status(429).json({
          error: "RATE_LIMITED",
          message: "Translation service is busy",
          details: "Please wait a moment and try again",
          retryable: true,
        });
      }

      if (errorStatus === 503 || errorStatus === 500) {
        return res.status(503).json({
          error: "SERVICE_UNAVAILABLE",
          message: "Translation service temporarily unavailable",
          retryable: true,
        });
      }

      res.status(500).json({
        error: "TRANSLATION_FAILED",
        message: "Translation failed",
        details: errorMessage || "Unknown error",
        retryable: true,
      });
    }
  });

  // API Routes
  app.get("/api/conversations", (req, res) => {
    const rows = db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all();
    res.json(rows);
  });

  app.post("/api/conversations", (req, res) => {
    const { id, title } = req.body;
    db.prepare("INSERT INTO conversations (id, title) VALUES (?, ?)").run(id, title);
    res.json({ success: true });
  });

  app.patch("/api/conversations/:id", (req, res) => {
    const { title } = req.body;
    db.prepare("UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(title, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/conversations/:id", (req, res) => {
    db.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/conversations/:id/messages", (req, res) => {
    const rows = db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").all();
    res.json(rows);
  });

  app.post("/api/messages", (req, res) => {
    const { id, conversation_id, role, content } = req.body;
    db.prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)").run(id, conversation_id, role, content);
    db.prepare("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(conversation_id);
    res.json({ success: true });
  });

  app.patch("/api/messages/:id", (req, res) => {
    const { content } = req.body;
    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(content, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/messages/:id", (req, res) => {
    db.prepare("DELETE FROM messages WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/conversations/:id/clear", (req, res) => {
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
