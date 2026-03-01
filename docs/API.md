# VoxAI API Documentation

This document describes the backend API endpoints available in VoxAI.

## Base URL

- **Development**: `http://localhost:5173/api`
- **Production**: `https://your-domain.com/api`

## Authentication

All API endpoints use server-side API key authentication. Client requests do not require API keys - the server proxies requests to Google Gemini API using server-side credentials.

## Rate Limiting

All endpoints are rate-limited to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/ai/chat` | 30 requests | 1 minute |
| `/api/ai/tts` | 20 requests | 1 minute |
| `/api/ai/translate` | 60 requests | 1 minute |
| General `/api/*` | 100 requests | 1 minute |

When rate limited, the API returns:
```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Please wait a moment.",
  "retryable": true
}
```

---

## AI Endpoints

### POST /api/ai/chat

Generate an AI response for a conversation.

**Request Body:**
```json
{
  "prompt": "What's the weather like today?",
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there! How can I help you?" }
  ]
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | The user's message (max 10,000 characters) |
| `history` | array | No | Previous conversation messages (max 50 messages) |

**Response:**
```json
{
  "text": "I don't have access to real-time weather data, but I can help you find weather information for your location."
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `INVALID_INPUT` | Invalid prompt or history format |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `AI_REQUEST_FAILED` | AI service error |

---

### POST /api/ai/tts

Convert text to speech using Google Gemini TTS.

**Request Body:**
```json
{
  "text": "Hello, how are you today?",
  "voiceName": "Charon"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to convert (max 5,000 characters) |
| `voiceName` | string | No | Voice name (default: "Charon") |

**Available Voices:**
- `Charon` (default)
- `Kore`
- `Fenrir`
- `Aoede`
- `Puck`
- `Zephyr`

**Response:**
```json
{
  "audio": "base64-encoded-audio-data..."
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `INVALID_INPUT` | Invalid text or voice name |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `TTS_FAILED` | TTS service error |

---

### POST /api/ai/translate

Translate text between languages for voice translation.

**Request Body:**
```json
{
  "text": "Hello, how are you?",
  "sourceLanguage": "English",
  "targetLanguage": "Hindi"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to translate (max 5,000 characters) |
| `sourceLanguage` | string | Yes | Source language name |
| `targetLanguage` | string | Yes | Target language name |

**Response:**
```json
{
  "translatedText": "नमस्ते, आप कैसे हैं?",
  "sourceLanguage": "English",
  "targetLanguage": "Hindi",
  "originalLength": 19,
  "translatedLength": 22
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `MISSING_FIELDS` | Required fields missing |
| 400 | `INVALID_INPUT` | Text is empty or too long |
| 422 | `EMPTY_RESULT` | Translation returned empty |
| 429 | `RATE_LIMITED` | Too many requests |
| 503 | `SERVICE_UNAVAILABLE` | Translation service unavailable |
| 500 | `TRANSLATION_FAILED` | Translation error |

---

## Conversation Endpoints

### GET /api/conversations

Get all conversations ordered by last update.

**Response:**
```json
[
  {
    "id": "conv-123",
    "title": "Weather Discussion",
    "updated_at": "2024-01-15T10:30:00Z"
  }
]
```

---

### POST /api/conversations

Create a new conversation.

**Request Body:**
```json
{
  "id": "conv-123",
  "title": "New Conversation"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### PATCH /api/conversations/:id

Update a conversation's title.

**Request Body:**
```json
{
  "title": "Updated Title"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### DELETE /api/conversations/:id

Delete a conversation and all its messages.

**Response:**
```json
{
  "success": true
}
```

---

### DELETE /api/conversations/:id/clear

Clear all messages in a conversation without deleting the conversation.

**Response:**
```json
{
  "success": true
}
```

---

## Message Endpoints

### GET /api/conversations/:id/messages

Get all messages in a conversation.

**Response:**
```json
[
  {
    "id": "msg-1",
    "conversation_id": "conv-123",
    "role": "user",
    "content": "Hello",
    "created_at": "2024-01-15T10:30:00Z"
  },
  {
    "id": "msg-2",
    "conversation_id": "conv-123",
    "role": "assistant",
    "content": "Hi there!",
    "created_at": "2024-01-15T10:30:01Z"
  }
]
```

---

### POST /api/messages

Add a new message to a conversation.

**Request Body:**
```json
{
  "id": "msg-123",
  "conversation_id": "conv-123",
  "role": "user",
  "content": "Hello, world!"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### PATCH /api/messages/:id

Update a message's content.

**Request Body:**
```json
{
  "content": "Updated message content"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### DELETE /api/messages/:id

Delete a specific message.

**Response:**
```json
{
  "success": true
}
```

---

## Security Headers

All responses include the following security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: microphone=(self), camera=()
```

API responses also include:
```
Access-Control-Allow-Origin: *
Cache-Control: no-store
```

---

## Error Response Format

All errors follow this format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": "Additional context (optional)",
  "retryable": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `error` | string | Machine-readable error code |
| `message` | string | Human-readable description |
| `details` | string | Additional information (optional) |
| `retryable` | boolean | Whether the request can be retried |
