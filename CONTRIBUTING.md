# Contributing to VoxAI

Thank you for your interest in contributing to VoxAI! This guide will help you get started.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Architecture Overview](#architecture-overview)

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/voxai---advanced-voice-assistant.git
   cd voxai---advanced-voice-assistant
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env.local` file with your API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- A Google Gemini API key

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run TypeScript type checking |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:ui` | Open Vitest UI |

### Project Structure

```
src/
├── components/       # React components
│   ├── VoiceTranslator/  # Voice translation feature
│   └── ...
├── hooks/           # Custom React hooks
│   ├── useVoiceAgent.ts      # Voice interaction logic
│   ├── useConversations.ts   # Conversation state management
│   ├── useAnalytics.ts       # Analytics and latency tracking
│   └── ...
├── services/        # API and external services
├── types/           # TypeScript type definitions
├── utils/           # Pure utility functions
│   ├── sanitizeTranscript.ts # Speech transcript cleaning
│   └── fuzzyMatch.ts         # City name fuzzy matching
└── __tests__/       # Test files
    ├── setup.ts     # Test configuration and mocks
    ├── hooks/       # Hook tests
    └── utils/       # Utility tests
```

## Code Style

### TypeScript

- Use TypeScript for all new code
- Define explicit types for function parameters and return values
- Prefer interfaces over type aliases for object shapes
- Use `const` assertions where applicable

```typescript
// Good
interface MessageProps {
  id: string;
  content: string;
  role: 'user' | 'assistant';
}

function processMessage(message: MessageProps): string {
  return message.content.trim();
}

// Avoid
function processMessage(message: any) {
  return message.content.trim();
}
```

### React Components

- Use functional components with hooks
- Keep components focused and single-purpose
- Extract complex logic into custom hooks
- Use `React.memo()` for expensive renders

```typescript
// Good
const MessageItem = React.memo(function MessageItem({ message }: Props) {
  const { formatted } = useMessageFormatter(message);
  return <div>{formatted}</div>;
});

// Avoid
class MessageItem extends React.Component { ... }
```

### Hooks

- Prefix custom hooks with `use`
- Keep hooks focused on a single concern
- Document complex hooks with JSDoc comments
- Return stable references using `useCallback` and `useMemo`

```typescript
/**
 * Manages voice recording state and transcription
 * @returns Voice recording controls and current transcript
 */
export function useVoiceRecording() {
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(() => {
    setIsRecording(true);
  }, []);

  return { isRecording, startRecording };
}
```

### Styling

- Use Tailwind CSS for styling
- Follow mobile-first responsive design
- Use CSS custom properties for theming
- Maintain dark mode support

```tsx
// Good
<div className="p-4 md:p-6 lg:p-8 bg-white dark:bg-zinc-900">

// Avoid inline styles
<div style={{ padding: '16px' }}>
```

## Testing Requirements

### Writing Tests

All new features and bug fixes should include tests.

**Test File Location:**
- Place tests in `src/__tests__/` directory
- Mirror the source file structure
- Use `.test.ts` or `.test.tsx` extension

**Test Structure:**
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('functionName', () => {
  describe('scenario', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Coverage Requirements

Maintain minimum coverage thresholds:
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### Browser API Mocks

The test setup (`src/__tests__/setup.ts`) provides mocks for:
- `SpeechRecognition` / `webkitSpeechRecognition`
- `SpeechSynthesis` / `SpeechSynthesisUtterance`
- `MediaDevices.getUserMedia`
- `localStorage`
- `AudioContext`

Use these mocks in your tests:
```typescript
import { MockSpeechRecognition } from '../setup';

it('should handle speech recognition', () => {
  const recognition = new MockSpeechRecognition();
  recognition.start();
  recognition.simulateResult('hello world', 0.95, true);
});
```

## Pull Request Process

### Before Submitting

1. **Ensure tests pass:**
   ```bash
   npm run test:run
   ```

2. **Check TypeScript:**
   ```bash
   npm run lint
   ```

3. **Test the build:**
   ```bash
   npm run build
   ```

4. **Test manually:**
   - Voice recognition works
   - TTS playback works
   - No console errors
   - Mobile responsive

### PR Guidelines

1. **Branch naming:**
   - `feature/description` for new features
   - `fix/description` for bug fixes
   - `docs/description` for documentation

2. **Commit messages:**
   - Use conventional commits format
   - Examples:
     - `feat: add voice translation support`
     - `fix: resolve TTS playback on Safari`
     - `docs: update API documentation`

3. **PR description:**
   - Describe what changes were made
   - Explain why the changes were needed
   - Include screenshots for UI changes
   - List any breaking changes

4. **Review process:**
   - All PRs require at least one review
   - Address review feedback promptly
   - Keep PRs focused and small when possible

## Architecture Overview

### State Management

VoxAI uses React hooks for state management:
- `useConversations` - Conversation CRUD operations
- `useVoiceAgent` - Voice interaction state machine
- `useSettings` - User preferences
- `useAnalytics` - Latency and usage tracking

### Voice Pipeline

```
User Speech → SpeechRecognition API → Transcript Sanitization
                                           ↓
                                    AI Processing
                                           ↓
                                    TTS Generation
                                           ↓
                                   Audio Playback
```

### Key Design Decisions

1. **Zero-trust API proxy:** All AI requests go through the server
2. **Optimistic updates:** UI updates immediately, syncs in background
3. **Error recovery:** Automatic retries with exponential backoff
4. **Lazy loading:** Heavy components loaded on demand

## Questions?

If you have questions about contributing, please open an issue with the `question` label.

Thank you for contributing to VoxAI!
