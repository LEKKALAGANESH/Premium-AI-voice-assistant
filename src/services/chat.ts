import { Message } from "../types";
import { getDeterministicResponse } from "../middleware/deterministic";

// Discriminated union for SSE events from /api/ai/chat-stream
type StreamEvent =
  | { type: 'ack'; ts: number }
  | { type: 'chunk'; chunk: string; done: false; idx: number }
  | { type: 'done'; chunk: ''; done: true; fullText: string; total: number }
  | { type: 'error'; error: string; message: string; recoverable: boolean };

function parseStreamEvent(line: string): StreamEvent | null {
  if (!line.startsWith('data: ')) return null;
  try {
    const raw = JSON.parse(line.slice(6));
    if (raw.ack) return { type: 'ack', ts: raw.ts };
    if (raw.error) return { type: 'error', error: raw.error, message: raw.message, recoverable: raw.recoverable };
    if (raw.done) return { type: 'done', chunk: '', done: true, fullText: raw.fullText, total: raw.total };
    if (raw.chunk !== undefined) return { type: 'chunk', chunk: raw.chunk, done: false, idx: raw.idx };
    return null;
  } catch {
    return null;
  }
}

export const chatService = {
  /** Generate a semantic 2-4 word title from the first user+bot exchange. */
  async generateTitle(userMessage: string, botMessage: string): Promise<string> {
    try {
      const res = await fetch('/api/ai/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage, botMessage }),
      });
      if (!res.ok) return 'Chat';
      const data = await res.json();
      return data.title || 'Chat';
    } catch {
      return 'Chat';
    }
  },

  /** Non-streaming: waits for full response. Used by text flow. */
  async generateResponse(prompt: string, history: Message[], mode?: string): Promise<string> {
    // 1. Check deterministic overrides
    const deterministic = getDeterministicResponse(prompt);
    if (deterministic) return deterministic;

    // 2. Proxy to Server (Zero-Trust)
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history, mode })
      });

      if (!response.ok) throw new Error('AI_PROXY_FAILED');

      const data = await response.json();
      return data.text || "I'm sorry, I couldn't generate a response.";
    } catch (error) {
      console.error('Chat Service Error:', error);
      throw new Error('AI_REQUEST_FAILED');
    }
  },

  /**
   * Streaming: yields chunks as they arrive via SSE.
   * Used by voice flow for sub-second time-to-first-audio.
   *
   * @param onChunk Called with each text chunk as it arrives
   * @param signal  AbortSignal for cancellation (barge-in)
   * @returns The complete response text
   */
  async streamResponse(
    prompt: string,
    history: Message[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    mode?: string,
  ): Promise<string> {
    // Check deterministic overrides first
    const deterministic = getDeterministicResponse(prompt);
    if (deterministic) {
      onChunk(deterministic);
      return deterministic;
    }

    const res = await fetch('/api/ai/chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, history, mode }),
      signal,
    });

    if (!res.ok) throw new Error(`AI_STREAM_FAILED: ${res.status}`);
    if (!res.body) throw new Error('AI_STREAM_NO_BODY');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const raw = decoder.decode(value, { stream: true });
      for (const line of raw.split('\n')) {
        const event = parseStreamEvent(line);
        if (!event) continue;

        switch (event.type) {
          case 'ack':
            break; // connection acknowledged
          case 'chunk':
            fullText += event.chunk;
            onChunk(event.chunk);
            break;
          case 'done':
            fullText = event.fullText;
            break;
          case 'error':
            throw new Error(event.error);
        }
      }
    }

    return fullText || "I'm sorry, I couldn't generate a response.";
  },
};
