<div align="center">
<img width="1200" height="475" alt="VoxAI Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# VoxAI - Advanced Voice Assistant

A premium AI-powered voice assistant with real-time streaming, auto-looping conversation, rich Markdown rendering, multilingual translation, and a mentor personality — built with React 19, Express, and Google Gemini.

![React](https://img.shields.io/badge/React-19.0.0-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-06B6D4?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green)

[Features](#features) | [Architecture](#architecture) | [Getting Started](#getting-started) | [Keyboard Shortcuts](#keyboard-shortcuts)

</div>

---

## Features

### Zero-Wait Voice Engine
- **SSE Streaming** — Sub-second time-to-first-audio via Server-Sent Events from Gemini
- **StreamProcessor + VoiceQueue** — Sentence boundary detection pipes text to TTS the instant a period is found, no waiting for the full response
- **Auto-Looping Conversation** — LISTENING > THINKING > SPEAKING > LISTENING, hands-free recursive loop
- **Barge-In Support** — Interrupt AI speech mid-sentence; stream aborts cleanly
- **Smart-Silence VAD** — 1.5s adaptive silence detection with configurable timeout
- **Keep-Alive Heartbeat** — Visual pulse after 10s silence so the user knows the mic is still live

### Mentor Personality
- **Identity Lock** — VoxAI is a character (storyteller, mentor, language bridge), never a generic assistant
- **Narrative Threading** — Greetings reference the ongoing conversation, not "How can I help you?"
- **10-Turn Context Window** — Deep conversational awareness across the session
- **Zoom-In Logic** — Numbered lists let users say "tell me more about the first one" and the bot resolves the reference
- **Anti-Generic Filter** — Strict regex deterministic middleware prevents "Today is Friday" from hijacking greetings

### Clean Interface Engine
- **Rich Markdown Rendering** — `react-markdown` turns `**bold**`, lists, code blocks into styled components
- **Feature Cards** — List items with `**Bold Title** — description` auto-render as icon cards (10 icon categories)
- **Voice-Strip TTS** — `stripMarkdown()` removes all `*`, `_`, `#`, `` ` `` before text reaches speech synthesis
- **No Raw Artifacts** — Zero `*` or `_` symbols visible in chat bubbles

### Voice Translator
- **Real-Time Bilingual Mediation** — Facilitate live conversations between two speakers in different languages
- **25+ Languages** — Full support for Indian languages (Hindi, Tamil, Telugu, Bengali, Kannada, Malayalam, etc.) plus global languages
- **Context-Aware Translation** — 3-exchange sliding window for pronoun/reference resolution
- **Translation History** — Persistent record of all translations with speaker badges

### Conversation Management
- **SQLite Persistence** — Conversations and messages stored server-side via `better-sqlite3`
- **Pin & Search** — Pin important chats, search through history
- **Export/Import** — Backup and restore conversation data (JSON)
- **Analytics** — Message counts, response latency, session duration per conversation

### UI/UX
- **Light/Dark/System Themes** — Automatic theme detection
- **Zen Focus Mode** — Distraction-free centered chat interface
- **Golden Ratio Layout** — 680px container, 80% bubble width, fluid typography with `clamp()`
- **Global UI Scaling** — 80% to 140% for accessibility
- **Responsive** — 320px mobile to 4K displays, zero layout shift
- **WCAG 2.2 AA** — Touch targets, focus states, `prefers-reduced-motion`, screen reader support

---

## Architecture

```
Client (React 19 + Vite)              Server (Express + Vite middleware)
========================              ==================================

useAppLogic                           server/index.ts (entry)
  |                                     |
  |-- useVoiceAgent                   server/routes/ai.ts
  |     |-- useVoiceCapture              |-- POST /api/ai/chat
  |     |-- voiceStateMachine            |-- POST /api/ai/chat-stream (SSE)
  |     |-- VoiceQueue                   |-- POST /api/ai/tts
  |     |-- StreamProcessor              |-- POST /api/ai/translate
  |                                     |
  |-- chatService                     server/routes/conversations.ts
  |     |-- streamResponse (SSE)      server/routes/messages.ts
  |     |-- generateResponse          server/services/ai.ts (Gemini singleton)
  |                                   server/services/db.ts (SQLite)
  |-- useConversations                server/middleware/
  |-- useSettings                       |-- auth.ts, validation.ts, rateLimiter.ts
  |-- useAnalytics
```

### Voice Pipeline (Streaming Path)

```
User speaks -> SpeechRecognition -> onFinalSubmit
  -> sendMessage(text, 'voice')
    -> chatService.streamResponse() [SSE from /api/ai/chat-stream]
      -> onChunk callback:
           1. updateMessageContent() [progressive bubble render]
           2. StreamProcessor.processChunk() [sentence boundary detection]
           3. VoiceQueue.enqueue(stripMarkdown(segment)) [TTS]
      -> VoiceQueue.markStreamComplete()
      -> await speechDone [all TTS finished]
      -> voiceAgent.finishSpeaking() [triggers loop-back to LISTENING]
```

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | React 19, TypeScript 5.8 (strict), Vite 6.2 |
| **Styling** | Tailwind CSS 4.1, fluid `clamp()` design tokens |
| **Backend** | Express 4, `tsx` runtime |
| **Database** | SQLite via `better-sqlite3` |
| **AI** | Google Gemini (`gemini-2.0-flash`, `gemini-3-flash-preview`, `gemini-2.5-flash-preview-tts`) |
| **Markdown** | `react-markdown` with custom Feature Card components |
| **Animation** | Motion (Framer Motion) |
| **Icons** | Lucide React |
| **Virtualization** | React Virtuoso |
| **Deployment** | Vercel (Edge Runtime for streaming, Serverless for rest) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Google Gemini API key ([Get one here](https://ai.google.dev/))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/voxai-advanced-voice-assistant.git
   cd voxai-advanced-voice-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env.local` file in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:5173
   ```

### Build for Production

```bash
npm run build
```

---

## Project Structure

```
voxai-advanced-voice-assistant/
├── src/
│   ├── components/
│   │   ├── ChatWindow.tsx         # Main chat interface with Virtuoso
│   │   ├── MessageBubble.tsx      # Rich Markdown bubble rendering
│   │   ├── MarkdownRenderer.tsx   # react-markdown with Feature Cards
│   │   ├── InputActionSlot.tsx    # Unified input + voice button
│   │   ├── AICoreButton.tsx       # Voice control button
│   │   ├── Sidebar.tsx            # Conversation list
│   │   └── VoiceTranslator/      # Translator feature
│   ├── hooks/
│   │   ├── useAppLogic.ts         # Central pipeline orchestrator
│   │   ├── useVoiceAgent.ts       # Voice state machine + capture + TTS
│   │   ├── useVoiceCapture.ts     # Smart-Silence VAD
│   │   ├── useConversations.ts    # CRUD + pipeline locking
│   │   └── useKeyboardShortcuts.ts
│   ├── lib/
│   │   ├── StreamProcessor.ts     # Sentence boundary detection
│   │   ├── VoiceQueue.ts          # Non-overlapping TTS queue
│   │   ├── voiceStateMachine.ts   # Pure state machine
│   │   └── stripMarkdown.ts       # Markdown removal for TTS
│   ├── services/
│   │   ├── chat.ts                # SSE streaming + non-streaming chat API
│   │   ├── voice.ts               # Web Speech API wrapper
│   │   └── geminiService.ts       # Gemini client helpers
│   ├── middleware/
│   │   └── deterministic.ts       # Regex-based time/date bypass
│   ├── types/
│   └── App.tsx
├── server/
│   ├── index.ts                   # Express bootstrap (entry point)
│   ├── routes/
│   │   ├── ai.ts                  # /api/ai/* (chat, chat-stream, tts, translate)
│   │   ├── conversations.ts       # /api/conversations/* CRUD
│   │   └── messages.ts            # /api/messages/* CRUD
│   ├── services/
│   │   ├── ai.ts                  # GoogleGenAI singleton + system prompt
│   │   └── db.ts                  # SQLite singleton
│   └── middleware/
│       ├── auth.ts                # Bearer token auth
│       ├── validation.ts          # Input validation
│       └── rateLimiter.ts         # Rate limiter factory
├── api/                           # Vercel Edge/Serverless functions
│   └── ai/
│       ├── chat.ts
│       ├── chat-stream.ts         # Edge Runtime SSE streaming
│       ├── tts.ts
│       └── translate.ts
├── docs/                          # Technical documentation & audits
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vercel.json
└── README.md
```

---

## Keyboard Shortcuts

| Action | Windows/Linux | Mac |
|--------|---------------|-----|
| New Chat | `Ctrl+N` | `Cmd+N` |
| Open Settings | `Ctrl+,` | `Cmd+,` |
| Toggle Sidebar | `Ctrl+B` | `Cmd+B` |
| Zen Focus Mode | `Ctrl+.` | `Cmd+.` |
| Search Conversations | `Ctrl+K` | `Cmd+K` |
| Open Translator | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| Send Message | `Enter` | `Enter` |
| New Line | `Shift+Enter` | `Shift+Enter` |
| Close Modal/Search | `Escape` | `Escape` |

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `APP_SECRET` | No | Bearer token for API auth (bypassed when unset) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |

### App Settings (via Settings modal)

| Setting | Description | Default |
|---------|-------------|---------|
| Theme | Color theme (light/dark/system) | `system` |
| Voice Enabled | Enable voice input/output | `true` |
| Voice Name | AI voice selection | `Charon` |
| Whisper Mode | Low volume audio profile | `false` |
| Speech Rate | TTS speed (0.5x - 2.0x) | `1.05` |
| Speak Responses | TTS for text-typed messages too | `false` |
| UI Scale | Interface size (80% - 140%) | `100%` |
| Focus Mode | Zen distraction-free mode | `false` |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | POST | Non-streaming chat (gemini-3-flash-preview) |
| `/api/ai/chat-stream` | POST | SSE streaming chat (gemini-2.0-flash) |
| `/api/ai/tts` | POST | Text-to-speech (gemini-2.5-flash-preview-tts) |
| `/api/ai/translate` | POST | Context-aware translation (gemini-2.0-flash) |
| `/api/conversations` | GET/POST | List/create conversations |
| `/api/conversations/:id` | GET/PATCH/DELETE | CRUD for a conversation |
| `/api/conversations/:id/messages` | GET/POST | Messages within a conversation |

---

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add the `GEMINI_API_KEY` environment variable
4. Deploy — `vercel.json` handles routing and Edge/Serverless functions automatically

### Manual

1. `npm run build`
2. Deploy `dist/` to your static host
3. Run `npm run dev` (or `node server/index.ts` via `tsx`) for the API server
4. Configure env vars on your server

---

## Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 90+ |
| Firefox | 85+ |
| Safari | 14+ |
| Edge | 90+ |

> Voice features require Web Speech API support. Chrome recommended for best experience.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express + Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type checking (`tsc --noEmit`) |
| `npm run test` | Run tests with Vitest |
| `npm run test:coverage` | Tests with coverage report |
| `npm run clean` | Remove build artifacts |

---

## Supported Languages

**Indian:** Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese, Urdu

**Global:** English, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Korean, Chinese (Simplified/Traditional), Arabic, Dutch, Swedish, Norwegian, Danish, Finnish, Polish, Turkish, Thai, Vietnamese, Indonesian

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**[Back to Top](#voxai---advanced-voice-assistant)**

Made with care for the future of voice interaction

</div>
