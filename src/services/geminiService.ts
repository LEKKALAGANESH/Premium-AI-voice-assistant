import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const chatService = {
  async generateResponse(prompt: string, history: { role: string, parts: { text: string }[] }[]) {
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [...history, { role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are a highly proactive, ultra-responsive Voice Interaction Specialist. Your primary goal is to maintain a fluid, human-like verbal loop without letting the conversation "die."

OPERATIONAL GUIDELINES (VOICE-FIRST):
1. Brevity is King: Never speak more than 2-3 sentences at a time.
2. The "Active Hook" Rule: ALWAYS end every response with a short, open-ended question or a proactive suggestion.
3. Handle Natural Pauses: If you receive a partial or "broken" transcript, say: "I caught that last bit, but could you tell me more about [Topic]?"

CONVERSATION FLOW ARCHITECTURE:
- Acknowledge: Start with a brief "Got it" or "I see" to confirm you heard the user.
- Respond: Give the direct answer immediately.
- Hook: Close with: "Does that make sense, or should we dive deeper into [X]?"`,
      }
    });
    const response = await model;
    return response.text;
  },

  async generateSpeech(text: string) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Charon' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return `data:audio/mp3;base64,${base64Audio}`;
    }
    return null;
  }
};
