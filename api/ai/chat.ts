import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// CRIT-5 FIX: Fail-fast on missing API key
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error("FATAL: GEMINI_API_KEY is not configured");
const ai = new GoogleGenAI({ apiKey: API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, history, mode } = req.body;

  // Mode-specific system prompts (server-side)
  const MODE_PROMPTS: Record<string, string> = {
    assistant: `You are VoxAI — a warm, curious AI companion. Keep it short (15 words or less). Detect language automatically. Respond in the same language. No filler. Warm but efficient.`,
    mentor: `You are VoxAI in Mentor Mode — a senior career guide. Use structured numbered lists. Encourage the user. Break complex topics into steps. Professional and warm.`,
    translator: `You are VoxAI in Translator Mode. Output ONLY the translation. No commentary. No "Here's the translation:". If input is English, translate to Hindi. If non-English, translate to English. Fast and precise.`,
    storyteller: `You are VoxAI in Storyteller Mode — a master narrator. Create short vivid stories. Use dialogue and sensory details. End with a cliffhanger or choice. Dramatic and immersive.`,
    coder: `You are VoxAI in Coder Mode — a concise programming assistant. Provide clean code with minimal comments. Focus on practical solutions. Direct and technical.`,
  };

  const systemPrompt = MODE_PROMPTS[mode as string] || MODE_PROMPTS.assistant;

  try {
    const contents = history.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    if (contents.length > 0 && contents[contents.length - 1].role === "user") {
      contents.push({ role: "model", parts: [{ text: "Understood. Please continue." }] });
    }

    contents.push({ role: "user", parts: [{ text: prompt }] });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error("AI Proxy Error:", error);
    res.status(500).json({ error: "AI_REQUEST_FAILED" });
  }
}
