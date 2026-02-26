import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, history } = req.body;

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
        systemInstruction:
          "You are a helpful, concise, and friendly voice assistant. Keep your responses brief and conversational.",
      },
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error("AI Proxy Error:", error);
    res.status(500).json({ error: "AI_REQUEST_FAILED" });
  }
}
