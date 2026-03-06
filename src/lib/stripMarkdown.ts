// stripMarkdown.ts — Vox-Polish M2S (Markdown-to-Speech) Filter
// Dual-stream: UI sees **Bold**, Voice says "Bold" with natural phrasing
// Ensures "1. **Moroccan Tagine** — A slow-cooked..." becomes
// "First, Moroccan Tagine, A slow-cooked..."

// Ordinal map for natural TTS: "1." -> "First," etc.
const ORDINALS: Record<number, string> = {
  1: 'First,',
  2: 'Second,',
  3: 'Third,',
  4: 'Fourth,',
  5: 'Fifth,',
  6: 'Sixth,',
  7: 'Seventh,',
  8: 'Eighth,',
  9: 'Ninth,',
  10: 'Tenth,',
};

// Vowel detection for Neural Orb lip sync (AGENT 3)
const VOWELS = /[aeiouAEIOU\u0900-\u097F\u0C00-\u0C7F]/g;

/** Compute vowel intensity (0-1) for a word — drives Neural Orb amplitude */
export function getVowelIntensity(word: string): number {
  if (!word || word.length === 0) return 0;
  const vowelCount = (word.match(VOWELS) || []).length;
  // Normalize: 3+ vowels = max intensity
  return Math.min(vowelCount / 3, 1);
}

export function stripMarkdown(text: string): string {
  return text
    // Remove bold/italic markers: **text**, __text__, *text*, _text_
    .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
    .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
    // Remove strikethrough: ~~text~~
    .replace(/~~(.*?)~~/g, '$1')
    // Remove inline code: `code`
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks: ```...```
    .replace(/```[\s\S]*?```/g, '')
    // Remove headings: # ## ### etc
    .replace(/^#{1,6}\s+/gm, '')
    // Convert numbered list markers to natural ordinals: "1. Item" -> "First, Item"
    .replace(/^[\s]*(\d+)\.\s+/gm, (_match, num) => {
      const n = parseInt(num, 10);
      return ORDINALS[n] ? `${ORDINALS[n]} ` : `Number ${n}, `;
    })
    // Remove bullet/list markers: *, -, +
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Remove links: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images: ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove [ACTION: title | description] tags (rendered as UI cards, not spoken)
    .replace(/\[ACTION:\s*.+?(?:\s*\|\s*.+?)?\]/g, '')
    // Remove blockquotes: > text
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules: ---, ***, ___
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Natural phrasing: em-dash/en-dash → comma pause (sounds natural in TTS)
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    // Collapse multiple newlines into single space (for speech flow)
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Public M2S API: Strip all markdown for clean TTS speech */
export const getCleanSpeech = stripMarkdown;

export default stripMarkdown;
