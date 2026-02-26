// 2026 Conversational Intelligence Layer: Weather Action with Fuzzy Verification
// Implements: Location persistence, zero-friction retrieval, natural phrasing

import { sanitizeTranscript, generateClarificationMessage } from '../utils/sanitizeTranscript';
import { fuzzyMatchCity, quickCityMatch, generateVerificationQuestion, COMMON_CITIES } from '../utils/fuzzyMatch';
import type { UserPreferences, PendingClarification } from '../hooks/useConversationMemory';

// === TYPES ===
export interface WeatherActionContext {
  userInput: string;
  confidence: number;
  preferences: UserPreferences;
  setCity: (city: string) => void;
  setPendingClarification: (c: PendingClarification | null) => void;
  getPendingClarification: () => PendingClarification | null;
  addRecentEntity: (entity: { type: 'city'; value: string; confidence: number }) => void;
}

export interface WeatherActionResult {
  type: 'response' | 'clarification' | 'verification' | 'error';
  message: string;
  city?: string;
  shouldSpeak: boolean;
  data?: WeatherData;
}

export interface WeatherData {
  city: string;
  temperature: number;
  unit: 'celsius' | 'fahrenheit';
  condition: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

// === INTENT PATTERNS ===
const WEATHER_INTENTS = [
  /weather/i,
  /temperature/i,
  /how('s| is) (it|the weather)/i,
  /what('s| is) (it|the weather) like/i,
  /is it (hot|cold|raining|sunny|cloudy)/i,
  /forecast/i,
  /climate/i,
];

const CITY_CHANGE_PATTERNS = [
  /change (?:my )?(?:city|location) to (.+)/i,
  /set (?:my )?(?:city|location) (?:to|as) (.+)/i,
  /(?:i'm|i am|im) (?:in|at) (.+)/i,
  /my (?:city|location) is (.+)/i,
  /update (?:my )?(?:city|location) to (.+)/i,
];

const CITY_EXTRACTION_PATTERNS = [
  /weather (?:in|at|for) (.+?)(?:\?|$|\.)/i,
  /temperature (?:in|at|for) (.+?)(?:\?|$|\.)/i,
  /how(?:'s| is) (?:the weather|it) (?:in|at) (.+?)(?:\?|$|\.)/i,
  /what(?:'s| is) (?:the weather|it) like (?:in|at) (.+?)(?:\?|$|\.)/i,
];

const CONFIRMATION_PATTERNS = [
  /^yes$/i,
  /^yeah$/i,
  /^yep$/i,
  /^correct$/i,
  /^that's right$/i,
  /^exactly$/i,
  /^right$/i,
];

const REJECTION_PATTERNS = [
  /^no$/i,
  /^nope$/i,
  /^wrong$/i,
  /^not that/i,
  /^different/i,
];

// === NATURAL RESPONSE TEMPLATES ===
const RESPONSE_TEMPLATES = {
  askCity: [
    "Sure! Which city should I check for you?",
    "Of course! What city are you interested in?",
    "Happy to help! Which city's weather would you like?",
  ],
  cityStored: (city: string) => [
    `Got it! I'll remember ${city} for future weather checks.`,
    `Perfect, I've saved ${city} as your location.`,
    `${city} is now set as your city.`,
  ],
  weatherReport: (data: WeatherData) => {
    const temp = `${data.temperature}°${data.unit === 'celsius' ? 'C' : 'F'}`;
    const feels = `${data.feelsLike}°${data.unit === 'celsius' ? 'C' : 'F'}`;
    return [
      `In ${data.city}, it's currently ${temp} and ${data.condition.toLowerCase()}. Feels like ${feels}.`,
      `${data.city} is ${temp} right now with ${data.condition.toLowerCase()} conditions. Humidity is ${data.humidity}%.`,
      `The weather in ${data.city}: ${temp}, ${data.condition.toLowerCase()}. Wind at ${data.windSpeed} km/h.`,
    ];
  },
  lowConfidence: [
    "I didn't catch that clearly. Could you repeat the city name?",
    "Sorry, I missed that. Which city did you say?",
    "I want to make sure I heard you right. What city was that?",
  ],
  noMatch: (input: string) => [
    `I couldn't find a city matching "${input}". Could you try spelling it differently?`,
    `"${input}" doesn't match any city I know. Could you clarify?`,
  ],
};

// === HELPER FUNCTIONS ===
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isWeatherIntent(input: string): boolean {
  return WEATHER_INTENTS.some(pattern => pattern.test(input));
}

function extractCityFromInput(input: string): string | null {
  for (const pattern of CITY_EXTRACTION_PATTERNS) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function extractCityChangeRequest(input: string): string | null {
  for (const pattern of CITY_CHANGE_PATTERNS) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function isConfirmation(input: string): boolean {
  return CONFIRMATION_PATTERNS.some(p => p.test(input.trim()));
}

function isRejection(input: string): boolean {
  return REJECTION_PATTERNS.some(p => p.test(input.trim()));
}

// === MOCK WEATHER DATA (Replace with real API) ===
async function fetchWeatherData(city: string, unit: 'celsius' | 'fahrenheit'): Promise<WeatherData> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Mock data - in production, call real weather API
  const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear'];
  const baseTemp = unit === 'celsius' ? 25 : 77;
  const variance = Math.floor(Math.random() * 10) - 5;

  return {
    city: city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
    temperature: baseTemp + variance,
    unit,
    condition: pickRandom(conditions),
    humidity: 45 + Math.floor(Math.random() * 30),
    windSpeed: 5 + Math.floor(Math.random() * 20),
    feelsLike: baseTemp + variance + (Math.random() > 0.5 ? 2 : -2),
  };
}

// === MAIN ACTION HANDLER ===
export async function handleWeatherAction(ctx: WeatherActionContext): Promise<WeatherActionResult> {
  const { userInput, confidence, preferences, setCity, setPendingClarification, getPendingClarification, addRecentEntity } = ctx;

  // 1. Sanitize the input
  const sanitized = sanitizeTranscript(userInput, confidence);
  const cleanInput = sanitized.sanitized;

  // 2. Check for pending clarification (user responding to a previous question)
  const pendingClarification = getPendingClarification();
  if (pendingClarification?.type === 'city') {
    return handleCityClarificationResponse(cleanInput, confidence, ctx);
  }
  if (pendingClarification?.type === 'confirmation') {
    return handleConfirmationResponse(cleanInput, pendingClarification, ctx);
  }

  // 3. Check for city change request
  const cityChangeRequest = extractCityChangeRequest(cleanInput);
  if (cityChangeRequest) {
    return handleCityChange(cityChangeRequest, confidence, ctx);
  }

  // 4. Check if this is a weather intent
  if (!isWeatherIntent(cleanInput)) {
    return {
      type: 'error',
      message: '',
      shouldSpeak: false,
    };
  }

  // 5. Try to extract city from input
  const extractedCity = extractCityFromInput(cleanInput);

  if (extractedCity) {
    // User specified a city - validate it
    return handleCityWeatherRequest(extractedCity, confidence, ctx);
  }

  // 6. No city specified - check if we have one stored
  const storedCity = preferences.city;
  if (storedCity) {
    // Zero-friction: use stored city without asking
    const weatherData = await fetchWeatherData(storedCity, preferences.temperatureUnit);
    return {
      type: 'response',
      message: pickRandom(RESPONSE_TEMPLATES.weatherReport(weatherData)),
      city: storedCity,
      shouldSpeak: true,
      data: weatherData,
    };
  }

  // 7. No city stored - ask for one naturally
  setPendingClarification({
    type: 'city',
    originalInput: cleanInput,
    suggestions: [],
    confidence: confidence,
    timestamp: Date.now(),
  });

  return {
    type: 'clarification',
    message: pickRandom(RESPONSE_TEMPLATES.askCity),
    shouldSpeak: true,
  };
}

// === CITY CLARIFICATION RESPONSE ===
async function handleCityClarificationResponse(
  input: string,
  confidence: number,
  ctx: WeatherActionContext
): Promise<WeatherActionResult> {
  const { preferences, setCity, setPendingClarification, addRecentEntity } = ctx;

  // Check confidence threshold (0.80)
  if (confidence < 0.80) {
    return {
      type: 'clarification',
      message: pickRandom(RESPONSE_TEMPLATES.lowConfidence),
      shouldSpeak: true,
    };
  }

  // Fuzzy match the city
  const matchResult = quickCityMatch(input);

  if (matchResult.confidence === 'no_match') {
    return {
      type: 'clarification',
      message: pickRandom(RESPONSE_TEMPLATES.noMatch(input)),
      shouldSpeak: true,
    };
  }

  // If needs verification, ask for confirmation
  if (matchResult.needsVerification) {
    const verificationQuestion = generateVerificationQuestion(matchResult, 'city');
    setPendingClarification({
      type: 'confirmation',
      originalInput: input,
      suggestions: [matchResult.match, ...matchResult.alternatives.map(a => a.value)],
      confidence: matchResult.score,
      timestamp: Date.now(),
    });

    return {
      type: 'verification',
      message: verificationQuestion,
      city: matchResult.match,
      shouldSpeak: true,
    };
  }

  // High confidence match - proceed directly
  const city = matchResult.match;
  setCity(city);
  addRecentEntity({ type: 'city', value: city, confidence: matchResult.score });
  setPendingClarification(null);

  // Fetch and return weather
  const weatherData = await fetchWeatherData(city, preferences.temperatureUnit);
  const confirmation = pickRandom(RESPONSE_TEMPLATES.cityStored(city));
  const weather = pickRandom(RESPONSE_TEMPLATES.weatherReport(weatherData));

  return {
    type: 'response',
    message: `${confirmation} ${weather}`,
    city,
    shouldSpeak: true,
    data: weatherData,
  };
}

// === CONFIRMATION RESPONSE ===
async function handleConfirmationResponse(
  input: string,
  pending: PendingClarification,
  ctx: WeatherActionContext
): Promise<WeatherActionResult> {
  const { preferences, setCity, setPendingClarification, addRecentEntity } = ctx;

  if (isConfirmation(input)) {
    // User confirmed the suggestion
    const city = pending.suggestions[0];
    if (city) {
      setCity(city);
      addRecentEntity({ type: 'city', value: city, confidence: pending.confidence });
      setPendingClarification(null);

      const weatherData = await fetchWeatherData(city, preferences.temperatureUnit);
      const confirmation = pickRandom(RESPONSE_TEMPLATES.cityStored(city));
      const weather = pickRandom(RESPONSE_TEMPLATES.weatherReport(weatherData));

      return {
        type: 'response',
        message: `${confirmation} ${weather}`,
        city,
        shouldSpeak: true,
        data: weatherData,
      };
    }
  }

  if (isRejection(input)) {
    // User rejected - ask again
    setPendingClarification({
      type: 'city',
      originalInput: pending.originalInput,
      suggestions: [],
      confidence: 0,
      timestamp: Date.now(),
    });

    return {
      type: 'clarification',
      message: "No problem! Which city did you mean?",
      shouldSpeak: true,
    };
  }

  // User might have said the correct city name directly
  return handleCityClarificationResponse(input, 0.9, ctx);
}

// === CITY WEATHER REQUEST ===
async function handleCityWeatherRequest(
  cityInput: string,
  confidence: number,
  ctx: WeatherActionContext
): Promise<WeatherActionResult> {
  const { preferences, setCity, setPendingClarification, addRecentEntity } = ctx;

  // Fuzzy match
  const matchResult = quickCityMatch(cityInput);

  if (matchResult.confidence === 'no_match') {
    setPendingClarification({
      type: 'city',
      originalInput: cityInput,
      suggestions: [],
      confidence: 0,
      timestamp: Date.now(),
    });

    return {
      type: 'clarification',
      message: pickRandom(RESPONSE_TEMPLATES.noMatch(cityInput)),
      shouldSpeak: true,
    };
  }

  // If needs verification
  if (matchResult.needsVerification) {
    const verificationQuestion = generateVerificationQuestion(matchResult, 'city');
    setPendingClarification({
      type: 'confirmation',
      originalInput: cityInput,
      suggestions: [matchResult.match, ...matchResult.alternatives.map(a => a.value)],
      confidence: matchResult.score,
      timestamp: Date.now(),
    });

    return {
      type: 'verification',
      message: verificationQuestion,
      city: matchResult.match,
      shouldSpeak: true,
    };
  }

  // Good match - proceed
  const city = matchResult.match;
  addRecentEntity({ type: 'city', value: city, confidence: matchResult.score });

  // Optionally store as preferred city
  if (!preferences.city) {
    setCity(city);
  }

  setPendingClarification(null);

  const weatherData = await fetchWeatherData(city, preferences.temperatureUnit);
  return {
    type: 'response',
    message: pickRandom(RESPONSE_TEMPLATES.weatherReport(weatherData)),
    city,
    shouldSpeak: true,
    data: weatherData,
  };
}

// === CITY CHANGE REQUEST ===
async function handleCityChange(
  newCity: string,
  confidence: number,
  ctx: WeatherActionContext
): Promise<WeatherActionResult> {
  const { setCity, setPendingClarification, addRecentEntity } = ctx;

  // Check confidence
  if (confidence < 0.80) {
    return {
      type: 'clarification',
      message: pickRandom(RESPONSE_TEMPLATES.lowConfidence),
      shouldSpeak: true,
    };
  }

  // Fuzzy match
  const matchResult = quickCityMatch(newCity);

  if (matchResult.confidence === 'no_match') {
    return {
      type: 'clarification',
      message: pickRandom(RESPONSE_TEMPLATES.noMatch(newCity)),
      shouldSpeak: true,
    };
  }

  if (matchResult.needsVerification) {
    const verificationQuestion = generateVerificationQuestion(matchResult, 'city');
    setPendingClarification({
      type: 'confirmation',
      originalInput: newCity,
      suggestions: [matchResult.match, ...matchResult.alternatives.map(a => a.value)],
      confidence: matchResult.score,
      timestamp: Date.now(),
    });

    return {
      type: 'verification',
      message: `You want to change your city to ${matchResult.match}?`,
      city: matchResult.match,
      shouldSpeak: true,
    };
  }

  // Good match - update city
  const city = matchResult.match;
  setCity(city);
  addRecentEntity({ type: 'city', value: city, confidence: matchResult.score });
  setPendingClarification(null);

  return {
    type: 'response',
    message: pickRandom(RESPONSE_TEMPLATES.cityStored(city)),
    city,
    shouldSpeak: true,
  };
}

// === EXPORT INTENT CHECKER ===
export { isWeatherIntent };

export default handleWeatherAction;
