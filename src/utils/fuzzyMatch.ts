// 2026 Conversational Intelligence Layer: Fuzzy Matching Utility
// Implements: Levenshtein distance, phonetic matching, city name normalization

// === TYPES ===
export interface FuzzyMatchResult {
  input: string;
  match: string;
  score: number; // 0-1, higher is better
  confidence: 'high' | 'medium' | 'low' | 'no_match';
  isExactMatch: boolean;
  needsVerification: boolean;
  alternatives: FuzzyAlternative[];
}

export interface FuzzyAlternative {
  value: string;
  score: number;
}

export interface FuzzyMatchOptions {
  threshold?: number; // Minimum score to consider a match (0-1)
  maxAlternatives?: number;
  caseSensitive?: boolean;
  usePhonetic?: boolean;
}

// === CONSTANTS ===
const DEFAULT_THRESHOLD = 0.6;
const HIGH_CONFIDENCE_THRESHOLD = 0.9;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.75;
const VERIFICATION_THRESHOLD = 0.85; // Below this, ask for confirmation

// Common city name variations and aliases
const CITY_ALIASES: Record<string, string[]> = {
  'new york': ['nyc', 'new york city', 'manhattan', 'ny'],
  'los angeles': ['la', 'l.a.', 'los angeles ca'],
  'san francisco': ['sf', 'san fran', 'frisco'],
  'bangalore': ['bengaluru', 'blr'],
  'mumbai': ['bombay'],
  'chennai': ['madras'],
  'kolkata': ['calcutta'],
  'delhi': ['new delhi', 'dilli'],
  'puttaparthi': ['puttaparthy', 'puttapar', 'prasanthi', 'prasanthi nilayam'],
  'hyderabad': ['hyd', 'cyberabad'],
  'london': ['london uk', 'greater london'],
  'paris': ['paris france'],
  'tokyo': ['tokyo japan'],
  'beijing': ['peking'],
};

// Phonetic replacements for better matching
const PHONETIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ph/gi, 'f'],
  [/ck/gi, 'k'],
  [/gh/gi, 'g'],
  [/ough/gi, 'o'],
  [/tion/gi, 'shun'],
  [/sion/gi, 'zhun'],
  [/th/gi, 't'],
  [/wh/gi, 'w'],
  [/wr/gi, 'r'],
  [/kn/gi, 'n'],
  [/mb$/gi, 'm'],
  [/ee/gi, 'i'],
  [/oo/gi, 'u'],
  [/ai/gi, 'ay'],
  [/ea/gi, 'ee'],
];

// === LEVENSHTEIN DISTANCE ===
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// === SIMILARITY SCORE ===
function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// === PHONETIC NORMALIZATION ===
function phoneticNormalize(text: string): string {
  let normalized = text.toLowerCase();
  for (const [pattern, replacement] of PHONETIC_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  // Remove non-alphanumeric
  normalized = normalized.replace(/[^a-z0-9]/g, '');
  return normalized;
}

// === NORMALIZE CITY NAME ===
function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

// === CHECK ALIASES ===
function findAlias(input: string): string | null {
  const normalizedInput = normalizeCity(input);

  for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
    if (normalizedInput === canonical) return canonical;
    for (const alias of aliases) {
      if (normalizedInput === normalizeCity(alias)) {
        return canonical;
      }
    }
  }
  return null;
}

// === MAIN FUZZY MATCH FUNCTION ===
export function fuzzyMatchCity(
  input: string,
  candidates: string[],
  options: FuzzyMatchOptions = {}
): FuzzyMatchResult {
  const {
    threshold = DEFAULT_THRESHOLD,
    maxAlternatives = 3,
    caseSensitive = false,
    usePhonetic = true,
  } = options;

  const normalizedInput = caseSensitive ? input.trim() : normalizeCity(input);

  // Check for exact alias match first
  const aliasMatch = findAlias(input);
  if (aliasMatch) {
    // Find the candidate that matches the canonical name
    const canonicalCandidate = candidates.find(
      c => normalizeCity(c) === aliasMatch
    );
    if (canonicalCandidate) {
      return {
        input,
        match: canonicalCandidate,
        score: 1,
        confidence: 'high',
        isExactMatch: true,
        needsVerification: false,
        alternatives: [],
      };
    }
  }

  // Calculate scores for all candidates
  const scores: Array<{ candidate: string; score: number }> = candidates.map(candidate => {
    const normalizedCandidate = caseSensitive ? candidate : normalizeCity(candidate);

    // Exact match
    if (normalizedInput === normalizedCandidate) {
      return { candidate, score: 1 };
    }

    // Calculate base similarity
    let score = similarityScore(normalizedInput, normalizedCandidate);

    // Boost score if phonetic match is better
    if (usePhonetic) {
      const phoneticInput = phoneticNormalize(input);
      const phoneticCandidate = phoneticNormalize(candidate);
      const phoneticScore = similarityScore(phoneticInput, phoneticCandidate);
      score = Math.max(score, phoneticScore * 0.95); // Slight penalty for phonetic-only match
    }

    // Boost score if input is a prefix of candidate
    if (normalizedCandidate.startsWith(normalizedInput)) {
      score = Math.max(score, 0.8 + (normalizedInput.length / normalizedCandidate.length) * 0.2);
    }

    // Check candidate aliases
    for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
      if (normalizeCity(candidate) === canonical || aliases.some(a => normalizeCity(a) === normalizedCandidate)) {
        const aliasScore = Math.max(
          similarityScore(normalizedInput, canonical),
          ...aliases.map(a => similarityScore(normalizedInput, normalizeCity(a)))
        );
        score = Math.max(score, aliasScore);
      }
    }

    return { candidate, score };
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Get best match
  const bestMatch = scores[0];
  const isExactMatch = bestMatch?.score === 1;

  // Determine confidence level
  let confidence: FuzzyMatchResult['confidence'];
  if (bestMatch?.score >= HIGH_CONFIDENCE_THRESHOLD) {
    confidence = 'high';
  } else if (bestMatch?.score >= MEDIUM_CONFIDENCE_THRESHOLD) {
    confidence = 'medium';
  } else if (bestMatch?.score >= threshold) {
    confidence = 'low';
  } else {
    confidence = 'no_match';
  }

  // Determine if verification needed
  const needsVerification = !isExactMatch && bestMatch?.score < VERIFICATION_THRESHOLD;

  // Get alternatives (excluding best match)
  const alternatives: FuzzyAlternative[] = scores
    .slice(1, maxAlternatives + 1)
    .filter(s => s.score >= threshold)
    .map(s => ({ value: s.candidate, score: s.score }));

  return {
    input,
    match: bestMatch?.score >= threshold ? bestMatch.candidate : '',
    score: bestMatch?.score || 0,
    confidence,
    isExactMatch,
    needsVerification,
    alternatives,
  };
}

// === GENERATE VERIFICATION QUESTION ===
export function generateVerificationQuestion(
  matchResult: FuzzyMatchResult,
  context: 'city' | 'general' = 'city'
): string {
  if (matchResult.isExactMatch || !matchResult.needsVerification) {
    return '';
  }

  if (matchResult.confidence === 'no_match') {
    return context === 'city'
      ? `I couldn't find a city matching "${matchResult.input}". Could you spell it out or try a different name?`
      : `I'm not sure what "${matchResult.input}" refers to. Could you clarify?`;
  }

  // Format the match nicely (capitalize first letter of each word)
  const formattedMatch = matchResult.match
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // Include alternatives if available
  if (matchResult.alternatives.length > 0) {
    const altList = matchResult.alternatives
      .slice(0, 2)
      .map(a => a.value.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '));

    return `Did you mean ${formattedMatch}? Or perhaps ${altList.join(' or ')}?`;
  }

  return `Did you mean ${formattedMatch}?`;
}

// === COMMON CITIES DATABASE ===
export const COMMON_CITIES: string[] = [
  // India
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
  'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam',
  'Puttaparthi', 'Tirupati', 'Varanasi', 'Agra', 'Mysore', 'Coimbatore', 'Kochi', 'Goa',

  // USA
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio',
  'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'San Francisco', 'Seattle',
  'Denver', 'Boston', 'Las Vegas', 'Miami', 'Atlanta', 'Portland', 'Washington DC',

  // Europe
  'London', 'Paris', 'Berlin', 'Madrid', 'Rome', 'Amsterdam', 'Vienna', 'Barcelona',
  'Munich', 'Milan', 'Prague', 'Dublin', 'Brussels', 'Stockholm', 'Zurich', 'Copenhagen',

  // Asia
  'Tokyo', 'Singapore', 'Hong Kong', 'Seoul', 'Bangkok', 'Kuala Lumpur', 'Jakarta',
  'Manila', 'Shanghai', 'Beijing', 'Shenzhen', 'Taipei', 'Dubai', 'Abu Dhabi',

  // Australia & Others
  'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Auckland', 'Toronto', 'Vancouver', 'Montreal',
  'Cairo', 'Cape Town', 'Johannesburg', 'Lagos', 'Nairobi', 'Sao Paulo', 'Buenos Aires',
];

// === QUICK CITY MATCH ===
export function quickCityMatch(input: string): FuzzyMatchResult {
  return fuzzyMatchCity(input, COMMON_CITIES, {
    threshold: 0.5,
    maxAlternatives: 3,
    usePhonetic: true,
  });
}

export default fuzzyMatchCity;
