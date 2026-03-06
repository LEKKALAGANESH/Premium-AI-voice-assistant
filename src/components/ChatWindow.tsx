// 2026 Standard: ChatWindow with Unified Surface Experience
// Features: Single Action Slot architecture, zero layout shift, AI Core button

import React, { useRef, useEffect, useCallback, useId } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Message, VoiceState, FailedMessage } from '../types';
import MessageBubble from './MessageBubble';
import { Mic, RotateCcw, AlertTriangle, Square, Sparkles } from 'lucide-react';
import SuggestionMatrix from './SuggestionMatrix';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';

import InputActionSlot from './InputActionSlot';
import type { VoxMode } from '../lib/modes';

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
    // Language + conversation state for visualizer
    detectedLang?: string;
    isConversationActive?: boolean;
    // Auto-Resume Engine
    endConversation?: () => void;
    keepAliveActive?: boolean;
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
  // Zero-Wait Engine: Live transcript shown in real-time while user speaks
  liveTranscript?: string;
  // Versatility Engine: Mode switcher
  activeMode?: VoxMode;
  onModeChange?: (mode: VoxMode) => void;
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
  liveTranscript = '',
  activeMode = 'assistant',
  onModeChange,
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
    // Language + conversation state for visualizer
    detectedLang,
    isConversationActive,
    // Auto-Resume Engine
    endConversation,
    keepAliveActive = false,
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
          /* Discovery Engine: Dynamic welcome screen with context-aware suggestions */
          <div
            className="vox-welcome-center text-center"
            style={{ padding: 'var(--vox-space-4)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="vox-chat-container-golden"
            >
              {/* Premium animated icon */}
              <div
                className="vox-discovery-orb flex items-center justify-center mx-auto animate-float"
                style={{
                  width: 'clamp(3.5rem, 5vw + 1rem, 5rem)',
                  height: 'clamp(3.5rem, 5vw + 1rem, 5rem)',
                  borderRadius: 'var(--vox-radius-2xl)',
                  marginBottom: 'var(--vox-space-4)',
                }}
              >
                <Sparkles
                  className="text-white"
                  style={{ width: 'clamp(1.5rem, 2vw + 0.5rem, 2rem)', height: 'clamp(1.5rem, 2vw + 0.5rem, 2rem)' }}
                  aria-hidden="true"
                />
              </div>

              {/* Premium gradient heading */}
              <h1
                className="font-display font-bold tracking-tight vox-discovery-heading"
                style={{ fontSize: 'var(--vox-text-4xl)', marginBottom: 'var(--vox-space-2)' }}
              >
                Welcome to VoxAI
              </h1>
              <p
                className="text-zinc-400 dark:text-zinc-500 mx-auto"
                style={{ fontSize: 'var(--vox-text-sm)', maxWidth: 'var(--vox-container-max)', marginBottom: 'var(--vox-space-6)' }}
              >
                Your intelligent voice companion. Pick a suggestion or just start talking.
              </p>

              {/* Discovery Engine: Context-aware suggestion matrix */}
              <SuggestionMatrix
                activeMode={activeMode}
                onInputChange={onInputChange}
                onSend={() => onSend()}
              />
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
                itemContent={(index, msg) => (
                  <div className="vox-4k-compact-messages" style={{ paddingBottom: 'var(--vox-space-2)' }}>
                    <MessageBubble
                      message={msg}
                      useColumnReveal={msg.id === columnRevealMessageId}
                      isSpeaking={state === 'speaking' && msg.role === 'assistant' && index === messages.length - 1}
                      isStreaming={isThinking && msg.role === 'assistant' && index === messages.length - 1}
                      activeMode={activeMode}
                    />
                  </div>
                )}
                className="custom-scrollbar"
                aria-label="Message history"
              />

              {/* Zero-Wait Engine: Live transcript bubble — shows what user is saying in real-time */}
              <AnimatePresence>
                {liveTranscript && (state === 'listening' || state === 'processing') && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="vox-4k-compact-messages flex justify-end"
                    style={{ paddingBottom: 'var(--vox-space-2)' }}
                  >
                    <div
                      className="bg-brand-500/90 text-white px-4 py-2.5 max-w-[80%] shadow-sm"
                      style={{ borderRadius: 'var(--vox-radius-xl)' }}
                    >
                      <p className="vox-text-sm" style={{ fontSize: 'var(--vox-text-sm)' }}>
                        {liveTranscript}
                        <span className="inline-block w-1.5 h-4 bg-white/60 ml-1 animate-pulse align-middle" />
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Zero-Wait Engine: Thinking indicator — never leave the bot bubble empty */}
              <AnimatePresence>
                {isThinking && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="vox-4k-compact-messages flex justify-start"
                    style={{ paddingBottom: 'var(--vox-space-2)' }}
                  >
                    <div
                      className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 shadow-sm"
                      style={{ borderRadius: 'var(--vox-radius-xl)' }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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

        {/* Auto-Resume Engine: End Session button — visible when conversation loop is active */}
        <AnimatePresence>
          {isConversationActive && (state === 'listening' || state === 'speaking' || state === 'processing') && endConversation && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="vox-input-container-golden flex justify-center"
              style={{ marginBottom: 'var(--vox-space-2)' }}
            >
              <button
                onClick={() => {
                  endConversation();
                  if (state === 'listening') stopListening();
                  if (state === 'speaking') interrupt();
                }}
                className={clsx(
                  'flex items-center text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-full',
                  keepAliveActive && 'animate-pulse text-brand-500'
                )}
                style={{
                  gap: 'var(--vox-space-1)',
                  padding: 'var(--vox-space-1) var(--vox-space-3)',
                  fontSize: 'var(--vox-text-xs)',
                }}
                aria-label="End voice session"
              >
                <Square className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
                <span>{keepAliveActive ? 'Still listening...' : 'End session'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Single Action Slot + Integrated Mode Selector */}
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
          detectedLang={detectedLang}
          isConversationActive={isConversationActive}
          activeMode={activeMode}
          onModeChange={onModeChange}
        />
      </footer>
    </div>
  );
};

export default ChatWindow;
