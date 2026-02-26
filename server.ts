import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, ".env.local") });

const db = new Database("conversations.db");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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
  const PORT = process.env.PORT || 5173;

  app.use(express.json());

  // AI Proxy Routes (Zero-Trust Architecture)
  app.post("/api/ai/chat", async (req, res) => {
    const { prompt, history } = req.body;
    console.log(`Chat Request - Prompt: "${prompt}", History Length: ${history?.length || 0}`);
    
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

  app.post("/api/ai/tts", async (req, res) => {
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
