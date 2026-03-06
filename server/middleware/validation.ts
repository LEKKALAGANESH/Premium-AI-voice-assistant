import { Request, Response, NextFunction } from "express";

const MAX_PROMPT_LENGTH = 10_000;
const MAX_HISTORY_LENGTH = 50;
const MAX_TTS_TEXT_LENGTH = 5_000;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 50_000;
const ALLOWED_VOICE_NAMES = ["Charon", "Kore", "Fenrir", "Aoede", "Puck", "Zephyr"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLES = ["user", "assistant", "system"] as const;

type ValidationRule = {
  field: string;
  check: (value: unknown) => string | null;
};

function validate(...rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const rule of rules) {
      const value = req.body[rule.field];
      const error = rule.check(value);
      if (error) {
        return res.status(400).json({ error: "INVALID_INPUT", message: error });
      }
    }
    next();
  };
}

export const chatValidation = validate(
  { field: "prompt", check: (v) => typeof v !== "string" || !v ? "prompt must be a non-empty string" : v.length > MAX_PROMPT_LENGTH ? `prompt exceeds ${MAX_PROMPT_LENGTH} chars` : null },
  { field: "history", check: (v) => v && !Array.isArray(v) ? "history must be an array" : Array.isArray(v) && v.length > MAX_HISTORY_LENGTH ? `history exceeds ${MAX_HISTORY_LENGTH} messages` : null },
);

export const ttsValidation = validate(
  { field: "text", check: (v) => typeof v !== "string" || !v ? "text must be a non-empty string" : v.length > MAX_TTS_TEXT_LENGTH ? `text exceeds ${MAX_TTS_TEXT_LENGTH} chars` : null },
  { field: "voiceName", check: (v) => v && typeof v === "string" && !(ALLOWED_VOICE_NAMES as readonly string[]).includes(v) ? `Invalid voice. Allowed: ${ALLOWED_VOICE_NAMES.join(", ")}` : null },
);

export const validateUUID = (id: unknown): id is string =>
  typeof id === "string" && UUID_REGEX.test(id);

export const validateParamId = (req: Request, res: Response, next: NextFunction) => {
  if (!validateUUID(req.params.id)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "id must be a valid UUID" });
  }
  next();
};

export { MAX_TITLE_LENGTH, MAX_CONTENT_LENGTH, VALID_ROLES, ALLOWED_VOICE_NAMES, UUID_REGEX };
