<div align="center">
<img width="1200" height="475" alt="VoxAI Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# VoxAI - Advanced Voice Assistant

A premium AI-powered voice assistant built with React 19 and Google Gemini, featuring real-time voice interaction, multilingual translation, and a modern responsive design.

![React](https://img.shields.io/badge/React-19.0.0-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-06B6D4?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green)

[Features](#features) | [Getting Started](#getting-started) | [Keyboard Shortcuts](#keyboard-shortcuts) | [Documentation](#documentation)

</div>

---

## Features

### Voice Assistant
- **Real-Time Voice Interaction** - Speak naturally and get instant AI responses
- **Smart-Silence Engine** - Advanced voice activity detection with 98% accuracy
- **Barge-In Support** - Interrupt AI speech mid-response
- **3-Word Look-Ahead Buffer** - Perceived zero-latency response display
- **Multiple Voice Options** - 8 distinct AI voices (Charon, Puck, Kore, Fenrir, Zephyr, Aoede, Erebus, Nyx)
- **Whisper Mode** - Low volume and slower pace for quiet environments

### Voice Translator
- **Real-Time Bilingual Mediation** - Facilitate conversations between two people in different languages
- **25+ Languages** - Full support for Indian languages (Hindi, Tamil, Telugu, Bengali, Kannada, Malayalam, etc.) plus global languages
- **Voice Wave Animation** - Visual feedback during listening states
- **Translation History** - Persistent record of all translations

### Conversation Management
- **Persistent Storage** - Conversations saved automatically
- **Pin & Search** - Pin important chats, search through history
- **Export/Import** - Backup and restore conversation data (JSON format)
- **Analytics Dashboard** - Track message counts, response latency, session duration

### UI/UX
- **Light/Dark/System Themes** - Automatic theme detection
- **Zen Focus Mode** - Distraction-free centered chat interface
- **Global UI Scaling** - Adjustable from 80% to 140% for accessibility
- **Responsive Design** - Works on all devices from mobile (320px) to 4K displays
- **Keyboard Shortcuts** - Full keyboard navigation with hover hints

---

## Keyboard Shortcuts

All shortcuts show on hover - zero extra space when not in use.

| Action | Windows/Linux | Mac |
|--------|---------------|-----|
| New Chat | `Ctrl+N` | `⌘N` |
| Open Settings | `Ctrl+,` | `⌘,` |
| Toggle Sidebar | `Ctrl+B` | `⌘B` |
| Zen Focus Mode | `Ctrl+.` | `⌘.` |
| Search Conversations | `Ctrl+K` | `⌘K` |
| Open Translator | `Ctrl+Shift+T` | `⌘⇧T` |
| Send Message | `Enter` | `Enter` |
| New Line | `Shift+Enter` | `Shift+Enter` |
| Close Modal/Search | `Escape` | `Escape` |

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | React 19.0.0 |
| **Language** | TypeScript 5.8 (Strict Mode) |
| **Build Tool** | Vite 6.2 |
| **Styling** | Tailwind CSS 4.1 |
| **AI Provider** | Google Gemini API |
| **Animation** | Motion (Framer Motion) |
| **Icons** | Lucide React (850+ icons) |
| **Virtualization** | React Virtuoso |
| **Deployment** | Vercel Serverless |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
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

The production build will be output to the `dist/` directory.

---

## Project Structure

```
voxai-advanced-voice-assistant/
├── src/
│   ├── components/           # React UI components
│   │   ├── ChatWindow.tsx    # Main chat interface
│   │   ├── Sidebar.tsx       # Conversation sidebar
│   │   ├── SettingsModal.tsx # Settings panel
│   │   ├── VoiceTranslator/  # Translator feature
│   │   ├── AICoreButton.tsx  # Voice control button
│   │   ├── KeyboardHint.tsx  # Shortcut hints
│   │   └── ...
│   ├── hooks/                # Custom React hooks
│   │   ├── useAppLogic.ts    # Main app state
│   │   ├── useVoiceAgent.ts  # Voice lifecycle
│   │   ├── useVoiceCapture.ts# Smart-Silence VAD
│   │   ├── useKeyboardShortcuts.ts
│   │   └── ...
│   ├── services/             # API integrations
│   │   ├── geminiService.ts  # Gemini API
│   │   ├── voice.ts          # Web Speech API
│   │   └── ...
│   ├── types/                # TypeScript definitions
│   ├── App.tsx               # Root component
│   └── index.css             # Global styles & design tokens
├── api/                      # Vercel serverless functions
│   └── ai/
│       ├── chat.ts           # Chat endpoint
│       ├── translate.ts      # Translation endpoint
│       └── tts.ts            # Text-to-speech endpoint
├── docs/                     # Technical documentation
├── package.json
├── vite.config.ts
├── vercel.json               # Vercel deployment config
└── README.md
```

---

## Configuration

### App Settings

All settings are persistent and accessible via the Settings modal (`Ctrl+,`).

| Setting | Description | Default |
|---------|-------------|---------|
| Theme | Color theme (light/dark/system) | `system` |
| Voice Enabled | Enable voice input/output | `true` |
| Voice Name | AI voice selection | `Charon` |
| Whisper Mode | Low volume audio profile | `false` |
| Speech Rate | TTS speed (0.5x - 2.0x) | `1.0` |
| UI Scale | Interface size (80% - 140%) | `100%` |
| Focus Mode | Zen distraction-free mode | `false` |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `APP_URL` | No | Application URL for deployment |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | POST | Generate chat responses |
| `/api/ai/translate` | POST | Translate text between languages |
| `/api/ai/tts` | POST | Convert text to speech |

---

## Supported Languages

### Indian Languages
Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese, Urdu

### Global Languages
English, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Korean, Chinese (Simplified/Traditional), Arabic, Dutch, Swedish, Norwegian, Danish, Finnish, Polish, Turkish, Thai, Vietnamese, Indonesian

---

## Accessibility

VoxAI is built with accessibility as a priority:

- **WCAG 2.2 AA Compliant** - Color contrast, focus states, screen reader support
- **Keyboard Navigation** - Full functionality without mouse
- **Reduced Motion** - Respects `prefers-reduced-motion` preference
- **Touch Targets** - Minimum 44px for mobile accessibility
- **UI Scaling** - Adjustable text and element sizes (80% - 140%)
- **Screen Reader Support** - ARIA labels and live regions throughout

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run TypeScript type checking |
| `npm run clean` | Remove build artifacts |

---

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add the `GEMINI_API_KEY` environment variable
4. Deploy

The `vercel.json` configuration handles routing and serverless functions automatically.

### Manual Deployment

1. Build the project: `npm run build`
2. Deploy the `dist/` folder to your hosting provider
3. Configure environment variables on your server
4. Set up API routes for `/api/ai/*` endpoints

---

## Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 90+ |
| Firefox | 85+ |
| Safari | 14+ |
| Edge | 90+ |

> **Note:** Voice features require browsers with Web Speech API support.

---

## Documentation

Additional technical documentation is available in the `/docs` directory:

- `VOXAI_COMPLIANCE_AUDIT.md` - 2026 Standard compliance report
- `VOICE_CAPTURE_STRESS_TEST_REPORT.md` - Smart-Silence engine testing
- `LAYOUT_STRESS_TEST_REPORT.md` - Responsive design verification
- `PIPELINE_INTEGRITY_AUDIT.md` - Message flow validation
- And more...

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows the existing style and includes appropriate tests.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Google Gemini](https://ai.google.dev/) - AI and TTS capabilities
- [React](https://react.dev/) - UI framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Lucide](https://lucide.dev/) - Icons
- [Vercel](https://vercel.com/) - Deployment platform

---

<div align="center">

**[Back to Top](#voxai---advanced-voice-assistant)**

Made with care for the future of voice interaction

</div>
