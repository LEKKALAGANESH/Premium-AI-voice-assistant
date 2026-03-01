// TranslationHistory - 2026 Standard Conversation Display Component
// Displays translated conversation history with visual distinction between speakers

import React, { memo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import type { TranslationEntry, Participant } from '../../types/translator';

interface TranslationHistoryProps {
  history: TranslationEntry[];
  className?: string;
}

interface TranslationBubbleProps {
  entry: TranslationEntry;
  index: number;
}

/**
 * Individual translation bubble component
 */
const TranslationBubble = memo(function TranslationBubble({
  entry,
  index,
}: TranslationBubbleProps) {
  const isPersonA = entry.speaker === 'A';

  // Color scheme based on speaker
  const bubbleBg = isPersonA
    ? 'bg-blue-50 dark:bg-blue-900/20'
    : 'bg-emerald-50 dark:bg-emerald-900/20';
  const borderColor = isPersonA
    ? 'border-blue-100 dark:border-blue-800/50'
    : 'border-emerald-100 dark:border-emerald-800/50';
  const labelColor = isPersonA
    ? 'text-blue-600 dark:text-blue-400'
    : 'text-emerald-600 dark:text-emerald-400';
  const originalBg = isPersonA
    ? 'bg-blue-100/50 dark:bg-blue-800/30'
    : 'bg-emerald-100/50 dark:bg-emerald-800/30';

  const timeAgo = formatDistanceToNow(entry.timestamp, { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={clsx(
        'flex flex-col gap-2 p-4 rounded-xl border',
        bubbleBg,
        borderColor
      )}
    >
      {/* Header with speaker label and timestamp */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
              isPersonA ? 'bg-blue-500' : 'bg-emerald-500',
              'text-white'
            )}
          >
            {entry.speaker}
          </div>
          <span className={clsx('text-sm font-medium', labelColor)}>
            Person {entry.speaker}
          </span>
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {timeAgo}
        </span>
      </div>

      {/* Original text (smaller, muted) */}
      <div
        className={clsx(
          'px-3 py-2 rounded-lg text-sm',
          originalBg,
          'text-zinc-600 dark:text-zinc-400'
        )}
      >
        <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 block mb-1">
          Original ({entry.originalLanguage}):
        </span>
        {entry.originalText}
      </div>

      {/* Translated text (prominent) */}
      <div className="text-zinc-900 dark:text-zinc-100 font-medium">
        <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 block mb-1">
          Translation ({entry.targetLanguage}):
        </span>
        {entry.translatedText}
      </div>

      {/* Confidence indicator */}
      {entry.confidence !== undefined && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${entry.confidence * 100}%` }}
              transition={{ duration: 0.5 }}
              className={clsx(
                'h-full rounded-full',
                entry.confidence > 0.8
                  ? 'bg-green-500'
                  : entry.confidence > 0.6
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              )}
            />
          </div>
          <span className="text-xs text-zinc-400">
            {Math.round(entry.confidence * 100)}%
          </span>
        </div>
      )}
    </motion.div>
  );
});

/**
 * Empty state component
 */
const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-zinc-400 dark:text-zinc-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
        No translations yet
      </h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">
        Start speaking and the translations will appear here. Person A speaks
        first.
      </p>
    </div>
  );
});

/**
 * Main TranslationHistory component
 */
export const TranslationHistory = memo(function TranslationHistory({
  history,
  className,
}: TranslationHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new translations are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length]);

  return (
    <div
      ref={scrollRef}
      className={clsx(
        'flex flex-col gap-3 overflow-y-auto vox-ghost-scroll',
        className
      )}
    >
      <AnimatePresence mode="popLayout">
        {history.length === 0 ? (
          <EmptyState />
        ) : (
          history.map((entry, index) => (
            <TranslationBubble key={entry.id} entry={entry} index={index} />
          ))
        )}
      </AnimatePresence>
    </div>
  );
});

export default TranslationHistory;
