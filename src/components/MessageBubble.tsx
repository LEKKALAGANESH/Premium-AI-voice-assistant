// 2026 Pro-Active Voice UX: MessageBubble with Synchronized Word Highlighting
// Updated: Fluid Design System with clamp() for 320px-4K device parity
import React, { memo, useState, useCallback, useMemo } from 'react';
import { Message } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Bot, Copy, Edit2, Check, Sparkles } from 'lucide-react';
import { SyncState, SyncWord } from '../hooks/useSpeechTextSync';

// === TYPES ===
interface MessageBubbleProps {
  message: Message;
  syncState?: SyncState;
  isSpeaking?: boolean;
}

// === WORD COMPONENT (memoized for performance) ===
interface WordProps {
  word: string;
  state: SyncWord['state'];
  isLastWord: boolean;
}

const Word = memo(({ word, state, isLastWord }: WordProps) => {
  const wordClass = useMemo(() => {
    switch (state) {
      case 'spoken':
        return 'text-zinc-900 dark:text-zinc-100 opacity-100';
      case 'speaking':
        return 'text-brand-600 dark:text-brand-400 font-medium bg-brand-100/50 dark:bg-brand-900/30 rounded px-0.5 -mx-0.5 animate-pulse';
      case 'buffered':
        return 'text-zinc-400 dark:text-zinc-500 opacity-70';
      case 'pending':
      default:
        return 'text-zinc-300 dark:text-zinc-600 opacity-40';
    }
  }, [state]);

  return (
    <span
      className={clsx(
        'inline transition-all duration-150 ease-out',
        wordClass
      )}
      data-word-state={state}
    >
      {word}
      {!isLastWord && ' '}
    </span>
  );
});

Word.displayName = 'Word';

// === MAIN COMPONENT ===
const MessageBubble = memo(({ message, syncState, isSpeaking = false }: MessageBubbleProps) => {
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // Memoize word rendering for assistant messages with sync
  const renderedContent = useMemo(() => {
    // If we have sync state and it's an assistant message, use word highlighting
    if (isAssistant && syncState && syncState.words.length > 0) {
      return (
        <span
          className="inline"
          role="region"
          aria-live={isSpeaking ? 'polite' : 'off'}
          aria-atomic="false"
        >
          {syncState.words.map((syncWord, index) => (
            <Word
              key={`${syncWord.index}-${syncWord.word}`}
              word={syncWord.word}
              state={syncWord.state}
              isLastWord={index === syncState.words.length - 1}
            />
          ))}
        </span>
      );
    }

    // Default: render full content without sync
    return message.content;
  }, [isAssistant, syncState, isSpeaking, message.content]);

  // Progress indicator for synced playback
  const progressBar = useMemo(() => {
    if (!syncState || !isSpeaking || syncState.progress === 0) return null;

    return (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 dark:bg-brand-400 transition-all duration-150 ease-linear"
          style={{ width: `${syncState.progress * 100}%` }}
        />
      </div>
    );
  }, [syncState, isSpeaking]);

  // Confidence indicator for voice messages
  const confidenceBadge = useMemo(() => {
    if (!message.confidence || message.role !== 'user') return null;

    const confidencePercent = Math.round(message.confidence * 100);
    const isLowConfidence = message.confidence < 0.7;

    return (
      <span
        className={clsx(
          'ml-2 text-xs px-1.5 py-0.5 rounded-full inline-flex items-center gap-1',
          isLowConfidence
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
        )}
        title={`Speech recognition confidence: ${confidencePercent}%`}
      >
        {confidencePercent}%
      </span>
    );
  }, [message.confidence, message.role]);

  // Live data badge for deterministic responses
  const liveDataBadge = useMemo(() => {
    if (!message.isDeterministic || message.role !== 'assistant') return null;

    return (
      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 inline-flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        Live Data
      </span>
    );
  }, [message.isDeterministic, message.role]);

  return (
    <div
      className={twMerge(
        'group flex w-full vox-mb-4 vox-gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500',
        isAssistant ? 'justify-start' : 'justify-end'
      )}
      style={{
        marginBottom: 'var(--vox-space-4)',
        gap: 'var(--vox-space-3)',
      }}
      role="article"
      aria-label={`${isAssistant ? 'Assistant' : 'User'} message`}
    >
      {/* Assistant Avatar - Fluid sizing */}
      {isAssistant && (
        <div
          className="rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center shrink-0 vox-border-thin border-brand-100 dark:border-brand-800"
          style={{
            width: 'clamp(2rem, 2.5vw + 1rem, 2.5rem)',
            height: 'clamp(2rem, 2.5vw + 1rem, 2.5rem)',
            borderRadius: 'var(--vox-radius-lg)',
          }}
        >
          <Bot
            className="text-brand-600 dark:text-brand-400"
            style={{ width: 'clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)', height: 'clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)' }}
          />
        </div>
      )}

      {/* 2026 Golden Ratio: Message Bubble - 85% max-width for 65-80 char/line readability */}
      <div
        className="relative vox-bubble vox-bubble-golden flex flex-col"
        style={{
          maxWidth: 'var(--vox-bubble-max)',
          gap: 'var(--vox-space-2)',
        }}
      >
        <div
          className={clsx(
            'relative leading-relaxed transition-all duration-300 vox-text-sm',
            isAssistant
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-tl-none'
              : 'bg-brand-600 text-white rounded-tr-none'
          )}
          style={{
            padding: 'var(--vox-space-3) var(--vox-space-4)',
            borderRadius: 'var(--vox-radius-xl)',
            fontSize: 'var(--vox-text-sm)',
            borderTopLeftRadius: isAssistant ? '0' : undefined,
            borderTopRightRadius: !isAssistant ? '0' : undefined,
            // Soft shadows instead of hard borders
            boxShadow: isAssistant
              ? '0 1px 3px -1px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.06)'
              : '0 2px 8px -2px rgba(22, 163, 74, 0.25), 0 4px 12px -4px rgba(22, 163, 74, 0.15)',
          }}
        >
          {renderedContent}
          {confidenceBadge}
          {liveDataBadge}
          {progressBar}
        </div>

        {/* Action buttons - Fluid touch targets */}
        <div
          className={clsx(
            'flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300',
            isAssistant ? 'justify-start' : 'justify-end'
          )}
          style={{ gap: 'var(--vox-space-2)' }}
        >
          <button
            onClick={handleCopy}
            className="text-zinc-400 hover:text-brand-500 focus:text-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 rounded transition-colors vox-touch-target flex items-center justify-center"
            style={{
              padding: 'var(--vox-space-2)',
              minWidth: 'var(--vox-touch-min)',
              minHeight: 'var(--vox-touch-min)',
            }}
            title="Copy message"
            aria-label={copied ? 'Copied!' : 'Copy message'}
            tabIndex={0}
          >
            {copied ? (
              <Check style={{ width: 'var(--vox-text-sm)', height: 'var(--vox-text-sm)' }} />
            ) : (
              <Copy style={{ width: 'var(--vox-text-sm)', height: 'var(--vox-text-sm)' }} />
            )}
          </button>
          {!isAssistant && (
            <button
              className="text-zinc-400 hover:text-brand-500 focus:text-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 rounded transition-colors vox-touch-target flex items-center justify-center"
              style={{
                padding: 'var(--vox-space-2)',
                minWidth: 'var(--vox-touch-min)',
                minHeight: 'var(--vox-touch-min)',
              }}
              title="Edit message"
              aria-label="Edit message"
              tabIndex={0}
            >
              <Edit2 style={{ width: 'var(--vox-text-sm)', height: 'var(--vox-text-sm)' }} />
            </button>
          )}
        </div>
      </div>

      {/* User Icon REMOVED for minimalist aesthetic */}
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
