import rateLimit from "express-rate-limit";

export const createRateLimiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    message: { error: 'RATE_LIMITED', message, retryable: true },
    standardHeaders: true,
    legacyHeaders: false,
  });

export const chatLimiter = createRateLimiter(60 * 1000, 30, 'Too many chat requests. Please wait a moment.');
export const ttsLimiter = createRateLimiter(60 * 1000, 20, 'Too many TTS requests. Please wait a moment.');
export const translateLimiter = createRateLimiter(60 * 1000, 60, 'Too many translation requests. Please wait a moment.');
export const generalLimiter = createRateLimiter(60 * 1000, 100, 'Too many requests. Please slow down.');
