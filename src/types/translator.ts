// Voice Translator Types - 2026 Standard
// Real-time bilingual mediation system types

/**
 * Supported language codes for voice translation
 */
export type LanguageCode =
  // Global Languages
  | 'en-US'   // English (US)
  | 'en-GB'   // English (UK)
  | 'en-IN'   // English (India)
  | 'es-ES'   // Spanish (Spain)
  | 'es-MX'   // Spanish (Mexico)
  | 'fr-FR'   // French
  | 'de-DE'   // German
  | 'it-IT'   // Italian
  | 'pt-BR'   // Portuguese (Brazil)
  | 'pt-PT'   // Portuguese (Portugal)
  | 'zh-CN'   // Chinese (Simplified)
  | 'zh-TW'   // Chinese (Traditional)
  | 'ja-JP'   // Japanese
  | 'ko-KR'   // Korean
  | 'ar-SA'   // Arabic
  | 'ru-RU'   // Russian
  | 'nl-NL'   // Dutch
  | 'pl-PL'   // Polish
  | 'tr-TR'   // Turkish
  | 'vi-VN'   // Vietnamese
  // Indian Languages
  | 'hi-IN'   // Hindi
  | 'bn-IN'   // Bengali
  | 'ta-IN'   // Tamil
  | 'te-IN'   // Telugu
  | 'mr-IN'   // Marathi
  | 'gu-IN'   // Gujarati
  | 'kn-IN'   // Kannada
  | 'ml-IN'   // Malayalam
  | 'pa-IN'   // Punjabi
  | 'or-IN'   // Odia (Oriya)
  | 'as-IN'   // Assamese
  | 'ur-IN'   // Urdu
  | 'ne-NP'   // Nepali
  | 'sd-IN'   // Sindhi
  | 'ks-IN'   // Kashmiri
  | 'sa-IN'   // Sanskrit
  | 'kok-IN'  // Konkani
  | 'mai-IN'  // Maithili
  | 'doi-IN'  // Dogri
  | 'mni-IN'; // Manipuri (Meitei)

/**
 * Language configuration for each participant
 */
export interface LanguageConfig {
  code: LanguageCode;
  name: string;
  nativeName: string;
  voiceName?: string; // Optional specific voice for synthesis
}

/**
 * Mediator state machine states
 */
export type MediatorState =
  | 'idle'           // Waiting to start
  | 'listening_a'    // Listening to Person A
  | 'listening_b'    // Listening to Person B
  | 'processing'     // Translating via Gemini
  | 'speaking_a'     // Speaking translation to Person A
  | 'speaking_b'     // Speaking translation to Person B
  | 'error';         // Error state

/**
 * Participant identification
 */
export type Participant = 'A' | 'B';

/**
 * Individual translation entry in conversation history
 */
export interface TranslationEntry {
  id: string;
  timestamp: number;
  speaker: Participant;
  originalText: string;
  originalLanguage: LanguageCode;
  translatedText: string;
  targetLanguage: LanguageCode;
  confidence?: number; // STT confidence score
}

/**
 * Voice Mediator configuration
 */
export interface MediatorConfig {
  languageA: LanguageConfig;
  languageB: LanguageConfig;
  autoListen: boolean;        // Auto-start listening after speaking
  continuousMode: boolean;    // Keep session active indefinitely
  showTranscripts: boolean;   // Display text transcripts in UI
  speechRate: number;         // TTS speech rate (0.5 - 2.0)
}

/**
 * Voice Mediator hook return type
 */
export interface VoiceMediatorReturn {
  // State
  state: MediatorState;
  currentSpeaker: Participant | null;
  isActive: boolean;

  // Configuration
  config: MediatorConfig;
  updateConfig: (updates: Partial<MediatorConfig>) => void;

  // Conversation history
  history: TranslationEntry[];

  // Live data
  partialTranscript: string;
  lastTranslation: TranslationEntry | null;

  // Controls
  start: () => void;
  stop: () => void;
  switchSpeaker: () => void;
  clearHistory: () => void;

  // Error handling
  error: string | null;
  clearError: () => void;
}

/**
 * Web Speech API types for TypeScript
 */
export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/**
 * Available languages configuration
 * Organized by region with Indian languages prominently featured
 */
export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  // === INDIAN LANGUAGES ===
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'or-IN', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'as-IN', name: 'Assamese', nativeName: 'অসমীয়া' },
  { code: 'ur-IN', name: 'Urdu', nativeName: 'اردو' },
  { code: 'ne-NP', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'sd-IN', name: 'Sindhi', nativeName: 'سنڌي' },
  { code: 'ks-IN', name: 'Kashmiri', nativeName: 'कॉशुर' },
  { code: 'sa-IN', name: 'Sanskrit', nativeName: 'संस्कृतम्' },
  { code: 'kok-IN', name: 'Konkani', nativeName: 'कोंकणी' },
  { code: 'mai-IN', name: 'Maithili', nativeName: 'मैथिली' },
  { code: 'doi-IN', name: 'Dogri', nativeName: 'डोगरी' },
  { code: 'mni-IN', name: 'Manipuri', nativeName: 'মৈতৈলোন্' },
  { code: 'en-IN', name: 'English', nativeName: 'English (India)' },

  // === GLOBAL LANGUAGES ===
  { code: 'en-US', name: 'English', nativeName: 'English (US)' },
  { code: 'en-GB', name: 'English', nativeName: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español (España)' },
  { code: 'es-MX', name: 'Spanish', nativeName: 'Español (México)' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt-BR', name: 'Portuguese', nativeName: 'Português (Brasil)' },
  { code: 'pt-PT', name: 'Portuguese', nativeName: 'Português (Portugal)' },
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文 (简体)' },
  { code: 'zh-TW', name: 'Chinese', nativeName: '中文 (繁體)' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
  { code: 'ar-SA', name: 'Arabic', nativeName: 'العربية' },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский' },
  { code: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl-PL', name: 'Polish', nativeName: 'Polski' },
  { code: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];

/**
 * Default mediator configuration
 */
export const DEFAULT_MEDIATOR_CONFIG: MediatorConfig = {
  languageA: SUPPORTED_LANGUAGES[0], // Hindi
  languageB: SUPPORTED_LANGUAGES[21], // English (US)
  autoListen: true,
  continuousMode: true,
  showTranscripts: true,
  speechRate: 1.0,
};
