// 2026 Standard: ChatWindow with Unified Surface Experience
// Features: Single Action Slot architecture, zero layout shift, AI Core button

import React, { useRef, useEffect, useCallback, useId } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message, VoiceState, FailedMessage } from '../types';
import MessageBubble from './MessageBubble';
import { Mic, RotateCcw, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';

import InputActionSlot from './InputActionSlot';

interface ChatWindowProps {
  messages: Message[];
  voiceAgent: {
    state: VoiceState;
    vadProgress: number;
    startListening: () => void;
    stopListening: () => void;
    interrupt: () => void;
    setError: (err: string | null) => void;
    isLowConfidence?: boolean;
    transcriptConfidence?: number;
    failedMessage?: FailedMessage | null;
    retryFailed?: () => void;
    clearFailedMessage?: () => void;
    // 2026: Smart-Silence capture props
    silenceProgress?: number;
    isSilenceCountdown?: boolean;
  };
  isThinking: boolean;
  inputText: string;
  streamingText: string;
  onInputChange: (text: string) => void;
  onSend: (text?: string) => void;
  isVoiceLocked?: boolean;
  textInputFailed?: FailedMessage | null;
  retryTextMessage?: () => void;
  focusMode?: boolean;
  // 2026: Column reveal animation for instant text display (when speakResponses is OFF)
  columnRevealMessageId?: string | null;
}

const ChatWindow = ({
  messages,
  voiceAgent,
  isThinking,
  inputText,
  streamingText,
  onInputChange,
  onSend,
  isVoiceLocked = false,
  textInputFailed,
  retryTextMessage,
  focusMode = false,
  columnRevealMessageId,
}: ChatWindowProps) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const regionId = useId();

  const {
    state,
    vadProgress,
    startListening,
    stopListening,
    interrupt,
    isLowConfidence,
    failedMessage,
    retryFailed,
    clearFailedMessage,
    // 2026: Smart-Silence capture props
    silenceProgress = 0,
    isSilenceCountdown = false,
  } = voiceAgent;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: messages.length - 1,
        behavior: 'smooth',
      });
    }
  }, [messages.length]);

  // Voice action handler with all states
  const handleVoiceAction = useCallback(() => {
    if (state === 'idle') startListening();
    else if (state === 'listening') stopListening();
    else if (state === 'speaking') interrupt();
    else if (state === 'error') {
      if (failedMessage && retryFailed) {
        retryFailed();
      } else if (clearFailedMessage) {
        clearFailedMessage();
      } else {
        voiceAgent.setError(null);
      }
    }
  }, [state, startListening, stopListening, interrupt, failedMessage, retryFailed, clearFailedMessage, voiceAgent]);

  return (
    <div
      className="vox-chat-shell vox-ghost-scroll"
      role="main"
      aria-label="Chat conversation"
    >
      {/* WCAG 2.2 - Aria-live region for streaming text */}
      <div
        id={regionId}
        aria-live="polite"
        aria-atomic="false"
        className="sr-only"
      >
        {isThinking && 'Processing your request...'}
        {streamingText && `You said: ${streamingText}`}
      </div>

      {/* === MESSAGE SCROLL AREA === */}
      <div className="vox-message-scroll">
        {messages.length === 0 ? (
          /* Empty state - Welcome screen with perfect centering */
          <div
            className="vox-welcome-center text-center"
            style={{ padding: 'var(--vox-space-4)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="vox-chat-container-golden"
            >
              <div
                className="bg-brand-500 flex items-center justify-center mx-auto rotate-3 animate-float"
                style={{
                  width: 'clamp(3.5rem, 5vw + 1rem, 5rem)',
                  height: 'clamp(3.5rem, 5vw + 1rem, 5rem)',
                  borderRadius: 'var(--vox-radius-2xl)',
                  marginBottom: 'var(--vox-space-4)',
                }}
              >
                <Mic
                  className="text-white"
                  style={{ width: 'clamp(1.75rem, 2.5vw + 0.5rem, 2.5rem)', height: 'clamp(1.75rem, 2.5vw + 0.5rem, 2.5rem)' }}
                  aria-hidden="true"
                />
              </div>
              <h1
                className="font-display font-bold tracking-tight vox-text-4xl"
                style={{ fontSize: 'var(--vox-text-4xl)', marginBottom: 'var(--vox-space-3)' }}
              >
                Welcome to <span className="text-brand-600">VoxAI</span>
              </h1>
              <p
                className="text-zinc-500 dark:text-zinc-400 mx-auto vox-text-lg"
                style={{ fontSize: 'var(--vox-text-lg)', maxWidth: 'var(--vox-container-max)', marginBottom: 'var(--vox-space-6)' }}
              >
                Your intelligent voice companion. Ask me anything or just start talking.
              </p>

              {/* Suggestion buttons */}
              <div
                className="grid grid-cols-1 sm:grid-cols-2 w-full mx-auto"
                style={{
                  gap: 'var(--vox-space-3)',
                  maxWidth: 'var(--vox-container-max)',
                }}
                role="group"
                aria-label="Suggested prompts"
              >
                {[
                  'Tell me a story',
                  "How's the weather?",
                  'Set a reminder',
                  'Explain quantum physics',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => onSend(suggestion)}
                    className="bg-zinc-100 dark:bg-zinc-900 text-left hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 vox-touch-target"
                    style={{
                      padding: 'var(--vox-space-4)',
                      borderRadius: 'var(--vox-radius-xl)',
                      minHeight: 'var(--vox-touch-min)',
                    }}
                  >
                    <p
                      className="font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-brand-600 transition-colors vox-text-sm"
                      style={{ fontSize: 'var(--vox-text-sm)' }}
                    >
                      {suggestion}
                    </p>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          /* Messages list - Virtuoso with proper height context */
          <div className="vox-message-scroll-inner vox-virtuoso-wrapper">
            <div className="vox-chat-container-golden vox-virtuoso-container">
              <Virtuoso
                ref={virtuosoRef}
                data={messages}
                initialTopMostItemIndex={messages.length - 1}
                followOutput="smooth"
                increaseViewportBy={{ top: 200, bottom: 200 }}
                itemContent={(_, msg) => (
                  <div className="vox-4k-compact-messages" style={{ paddingBottom: 'var(--vox-space-2)' }}>
                    <MessageBubble
                      message={msg}
                      useColumnReveal={msg.id === columnRevealMessageId}
                    />
                  </div>
                )}
                className="custom-scrollbar"
                aria-label="Message history"
              />
            </div>
          </div>
        )}
      </div>

      {/* === FOOTER: Sticky Input with Single Action Slot === */}
      <footer className="vox-glass-footer">
        {/* Low confidence warning */}
        <AnimatePresence>
          {isLowConfidence && streamingText && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="vox-input-container-golden bg-amber-100 dark:bg-amber-900/30 flex items-center"
              style={{
                marginBottom: 'var(--vox-space-2)',
                padding: 'var(--vox-space-2) var(--vox-space-3)',
                borderRadius: 'var(--vox-radius-lg)',
                gap: 'var(--vox-space-2)',
              }}
              role="alert"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <span className="vox-text-sm text-amber-700 dark:text-amber-300" style={{ fontSize: 'var(--vox-text-sm)' }}>
                Low confidence - did you mean: "{streamingText}"?
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text input failed - retry banner */}
        <AnimatePresence>
          {textInputFailed && retryTextMessage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="vox-input-container-golden bg-red-100 dark:bg-red-900/30 flex items-center justify-between"
              style={{
                marginBottom: 'var(--vox-space-2)',
                padding: 'var(--vox-space-2) var(--vox-space-3)',
                borderRadius: 'var(--vox-radius-lg)',
              }}
              role="alert"
            >
              <div className="flex items-center" style={{ gap: 'var(--vox-space-2)' }}>
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                <span className="vox-text-sm text-red-700 dark:text-red-300" style={{ fontSize: 'var(--vox-text-sm)' }}>
                  Message failed to send
                </span>
              </div>
              <button
                onClick={retryTextMessage}
                className="flex items-center bg-red-100 dark:bg-red-800/30 text-red-700 dark:text-red-300 font-medium hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 vox-touch-target"
                style={{
                  gap: 'var(--vox-space-1)',
                  padding: 'var(--vox-space-1) var(--vox-space-3)',
                  borderRadius: 'var(--vox-radius-md)',
                  fontSize: 'var(--vox-text-sm)',
                  minHeight: 'var(--vox-touch-min)',
                }}
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                Retry
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2026 Single Action Slot Input Architecture */}
        <InputActionSlot
          inputText={inputText}
          onInputChange={onInputChange}
          onSend={() => onSend()}
          voiceState={state}
          vadProgress={vadProgress}
          silenceProgress={silenceProgress}
          isSilenceCountdown={isSilenceCountdown}
          isVoiceLocked={isVoiceLocked}
          onVoiceClick={handleVoiceAction}
          onLongPressStart={() => {
            if (state === 'idle') startListening();
          }}
          onLongPressEnd={() => {
            if (state === 'listening') stopListening();
          }}
          disabled={isThinking}
          hasRetry={!!failedMessage}
          onRetry={retryFailed}
          streamingText={streamingText}
        />
      </footer>
    </div>
  );
};

export default ChatWindow;
