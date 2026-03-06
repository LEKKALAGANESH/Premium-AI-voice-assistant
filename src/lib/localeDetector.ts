// World-Wide Vox: Automatic locale detection from text
// Uses Unicode script ranges + word-frequency heuristics
// Returns BCP 47 locale codes (e.g., 'hi-IN', 'es-ES', 'de-DE')

export interface LocaleResult {
  lang: string;    // ISO 639-1 language code (e.g., 'hi', 'es')
  locale: string;  // Full BCP 47 locale (e.g., 'hi-IN', 'es-ES')
  confidence: number; // 0-1 detection confidence
}

// === SCRIPT-BASED DETECTION (High confidence — unique Unicode ranges) ===

const SCRIPT_PATTERNS: [RegExp, string, string][] = [
  // [pattern, lang, locale]
  [/[\u0900-\u097F]/, 'hi', 'hi-IN'],     // Hindi (Devanagari)
  [/[\u0C00-\u0C7F]/, 'te', 'te-IN'],     // Telugu
  [/[\u0B80-\u0BFF]/, 'ta', 'ta-IN'],     // Tamil
  [/[\u0A80-\u0AFF]/, 'gu', 'gu-IN'],     // Gujarati
  [/[\u0A00-\u0A7F]/, 'pa', 'pa-IN'],     // Punjabi (Gurmukhi)
  [/[\u0980-\u09FF]/, 'bn', 'bn-IN'],     // Bengali
  [/[\u0B00-\u0B7F]/, 'or', 'or-IN'],     // Odia
  [/[\u0D00-\u0D7F]/, 'ml', 'ml-IN'],     // Malayalam
  [/[\u0C80-\u0CFF]/, 'kn', 'kn-IN'],     // Kannada
  [/[\u0D80-\u0DFF]/, 'si', 'si-LK'],     // Sinhala
  [/[\u0E00-\u0E7F]/, 'th', 'th-TH'],     // Thai
  [/[\u0E80-\u0EFF]/, 'lo', 'lo-LA'],     // Lao
  [/[\u1000-\u109F]/, 'my', 'my-MM'],     // Myanmar (Burmese)
  [/[\u1780-\u17FF]/, 'km', 'km-KH'],     // Khmer
  [/[\u4E00-\u9FFF]/, 'zh', 'zh-CN'],     // Chinese (Simplified default)
  [/[\u3040-\u309F]/, 'ja', 'ja-JP'],     // Japanese Hiragana
  [/[\u30A0-\u30FF]/, 'ja', 'ja-JP'],     // Japanese Katakana
  [/[\uAC00-\uD7AF]/, 'ko', 'ko-KR'],     // Korean
  [/[\u0600-\u06FF]/, 'ar', 'ar-SA'],     // Arabic
  [/[\u0590-\u05FF]/, 'he', 'he-IL'],     // Hebrew
  [/[\u0980-\u09FF]/, 'bn', 'bn-BD'],     // Bengali (Bangladesh)
  [/[\u10A0-\u10FF]/, 'ka', 'ka-GE'],     // Georgian
  [/[\u0530-\u058F]/, 'hy', 'hy-AM'],     // Armenian
  [/[\u0400-\u04FF]/, 'ru', 'ru-RU'],     // Cyrillic (Russian default)
  [/[\u0370-\u03FF]/, 'el', 'el-GR'],     // Greek
];

// === WORD-FREQUENCY HEURISTICS (Latin-script languages) ===

const LATIN_HEURISTICS: [RegExp, string, string][] = [
  // Spanish
  [/\b(el|la|los|las|es|en|que|de|por|con|una|uno|del|para|como|pero|muy|bien|hola|gracias|tiene|puede|este|esta|esto|todos|bueno|cuando|donde|porque|ahora|algo|tambi[eé]n|siempre)\b/gi, 'es', 'es-ES'],
  // French
  [/\b(le|la|les|est|dans|une|des|que|pour|pas|sur|avec|qui|son|tout|cette|mais|aussi|bien|comme|fait|avoir|leur|nous|vous|votre|merci|bonjour|c['']est|je|tu|il|elle|nous|ils|elles|ont|sont)\b/gi, 'fr', 'fr-FR'],
  // German
  [/\b(der|die|das|ist|ein|eine|und|ich|nicht|von|mit|auf|den|dem|des|sich|wie|auch|oder|aber|nach|wenn|noch|nur|dann|kann|sind|wird|sein|haben|diese|mein|dein|sehr|danke|bitte|guten)\b/gi, 'de', 'de-DE'],
  // Portuguese
  [/\b(o\b|os\b|um|uma|que|de|em|com|para|por|como|mais|mas|est[aá]|tem|foi|ser|ter|fazer|pode|isso|este|esta|obrigado|bom|muito|aqui|quando|todos|porque|ainda|tamb[eé]m|agora|sempre|eles)\b/gi, 'pt', 'pt-BR'],
  // Italian
  [/\b(il|lo|la|le|gli|di|che|non|un|una|con|per|sono|del|della|come|anche|questo|questa|molto|bene|grazie|buono|dove|quando|perch[eé]|sempre|tutti|fare|avere|essere|hanno|cosa|fatto|pi[uù])\b/gi, 'it', 'it-IT'],
  // Dutch
  [/\b(het|een|van|de|is|dat|op|te|en|met|voor|niet|ook|zijn|naar|kan|maar|wel|nog|dan|dit|die|wat|hoe|uit|bij|dank|goed|heel)\b/gi, 'nl', 'nl-NL'],
  // Turkish
  [/\b(bir|ve|bu|da|de|ile|i[cç]in|var|olan|ben|sen|o\b|biz|onlar|ne|ama|gibi|daha|mi|m[ıi]|yok|iyi|evet|hay[ıi]r|te[sş]ekk[uü]r|merhaba|nas[ıi]l)\b/gi, 'tr', 'tr-TR'],
  // Swedish
  [/\b(jag|och|det|att|en|som|har|med|den|inte|av|till|[aä]r|var|f[oö]r|kan|vill|ska|tack|hej|bra|mycket)\b/gi, 'sv', 'sv-SE'],
  // Polish
  [/\b(jest|nie|to|na|si[eę]|do|jak|ale|tak|co|za|od|po|przez|przy|te[zż]|bardzo|dobry|dzi[eę]kuj[eę]|cze[sś][cć])\b/gi, 'pl', 'pl-PL'],
  // Indonesian/Malay
  [/\b(dan|yang|di|ini|itu|dengan|untuk|dari|ada|tidak|saya|anda|bisa|akan|sudah|juga|hanya|terima\s*kasih|selamat|baik|sangat)\b/gi, 'id', 'id-ID'],
];

// Minimum characters needed for reliable detection
const MIN_DETECTION_LENGTH = 10;
const HEURISTIC_THRESHOLD = 3; // Minimum word matches for Latin heuristic

/**
 * Detect the locale of a text string.
 * Call with the first 50-100 characters of a response for early detection.
 */
export function detectLocale(text: string): LocaleResult {
  if (!text || text.length < MIN_DETECTION_LENGTH) {
    return { lang: 'en', locale: 'en-US', confidence: 0.3 };
  }

  // Phase 1: Script detection (highest confidence)
  for (const [pattern, lang, locale] of SCRIPT_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, 'g'));
    if (matches && matches.length >= 2) {
      return { lang, locale, confidence: 0.95 };
    }
  }

  // Phase 2: Latin-script word-frequency heuristics
  let bestMatch: LocaleResult | null = null;
  let bestScore = 0;

  for (const [pattern, lang, locale] of LATIN_HEURISTICS) {
    const matches = text.match(pattern);
    const score = matches ? matches.length : 0;
    if (score > bestScore && score >= HEURISTIC_THRESHOLD) {
      bestScore = score;
      bestMatch = { lang, locale, confidence: Math.min(0.6 + score * 0.05, 0.9) };
    }
  }

  if (bestMatch) return bestMatch;

  // Phase 3: Default to English
  return { lang: 'en', locale: 'en-US', confidence: 0.5 };
}

/**
 * Lightweight check: is the text likely non-English?
 * Useful for quick gating before full detection.
 */
export function isNonEnglish(text: string): boolean {
  // Any non-Latin script characters → definitely non-English
  if (/[^\u0000-\u024F\u1E00-\u1EFF]/.test(text)) return true;
  // Heavy presence of accented characters
  const accented = (text.match(/[\u00C0-\u024F]/g) || []).length;
  return accented > text.length * 0.1;
}
