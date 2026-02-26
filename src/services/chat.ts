import { Message } from "../types";
import { getDeterministicResponse } from "../middleware/deterministic";

export const chatService = {
  async generateResponse(prompt: string, history: Message[]): Promise<string> {
    // 1. Check deterministic overrides
    const deterministic = getDeterministicResponse(prompt);
    if (deterministic) return deterministic;

    // 2. Proxy to Server (Zero-Trust)
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history })
      });
      
      if (!response.ok) throw new Error('AI_PROXY_FAILED');
      
      const data = await response.json();
      return data.text || "I'm sorry, I couldn't generate a response.";
    } catch (error) {
      console.error('Chat Service Error:', error);
      throw new Error('AI_REQUEST_FAILED');
    }
  }
};
