// Deterministic responses — ONLY for explicit factual queries with no conversational context
// These bypass the LLM entirely, so they must be extremely narrow triggers

import { format } from 'date-fns';

// Only match explicit, standalone time/date requests — not casual mentions
const EXACT_TIME_PATTERNS = [
  /^what(?:'s| is) the (?:current )?time\??$/i,
  /^tell me the time\??$/i,
  /^what time is it\??$/i,
];

const EXACT_DATE_PATTERNS = [
  /^what(?:'s| is) (?:the |today(?:'s)? )?date\??$/i,
  /^what is today(?:'s)? date\??$/i,
];

export const getDeterministicResponse = (input: string): string | null => {
  const trimmed = input.trim();

  if (EXACT_TIME_PATTERNS.some(p => p.test(trimmed))) {
    return `It's ${format(new Date(), 'p')} right now.`;
  }

  if (EXACT_DATE_PATTERNS.some(p => p.test(trimmed))) {
    return `Today is ${format(new Date(), 'PPPP')}.`;
  }

  return null;
};
