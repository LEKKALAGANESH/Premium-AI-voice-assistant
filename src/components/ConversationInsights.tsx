/**
 * ConversationInsights.tsx
 * 2026 Analytics: Conversation-level analytics panel
 *
 * Displays:
 * - Total duration
 * - Average response speed
 * - Message counts (user/bot)
 * - Start date
 * - Source breakdown (typed vs voice)
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, Bot, User, Zap, Clock, Calendar, Mic, Keyboard } from 'lucide-react';
import { clsx } from 'clsx';
import { Conversation } from '../types';
import {
  computeConversationAnalytics,
  formatDuration,
  formatLatency,
  formatMessageDate,
  formatMessageTime,
} from '../hooks/useAnalytics';

interface ConversationInsightsProps {
  conversation: Conversation | null;
  isOpen: boolean;
  onClose: () => void;
}

const ConversationInsights: React.FC<ConversationInsightsProps> = ({
  conversation,
  isOpen,
  onClose,
}) => {
  // Compute analytics (if not already computed or stale)
  const analytics = useMemo(() => {
    if (!conversation) return null;
    // Use stored analytics or compute fresh
    return conversation.analytics || computeConversationAnalytics(conversation.messages);
  }, [conversation]);

  // Source breakdown
  const sourceBreakdown = useMemo(() => {
    if (!conversation) return { typed: 0, voice: 0, suggestion: 0 };

    const userMessages = conversation.messages.filter(m => m.role === 'user');
    return {
      typed: userMessages.filter(m => m.source === 'typed' || !m.source).length,
      voice: userMessages.filter(m => m.source === 'voice').length,
      suggestion: userMessages.filter(m => m.source === 'suggestion').length,
    };
  }, [conversation]);

  // Latency distribution
  const latencyStats = useMemo(() => {
    if (!conversation) return { min: 0, max: 0, fast: 0, slow: 0 };

    const latencies = conversation.messages
      .filter(m => m.role === 'assistant' && m.latency)
      .map(m => m.latency as number);

    if (latencies.length === 0) return { min: 0, max: 0, fast: 0, slow: 0 };

    return {
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      fast: latencies.filter(l => l < 1000).length,
      slow: latencies.filter(l => l >= 1000).length,
    };
  }, [conversation]);

  if (!conversation || !analytics) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-80 max-w-full bg-white dark:bg-zinc-900 z-50 overflow-y-auto"
            style={{
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.1)',
            }}
          >
            {/* Header */}
            <div
              className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
              style={{ padding: 'var(--vox-space-4)' }}
            >
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 vox-text-lg">
                Conversation Insights
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Close insights"
              >
                <X className="w-5 h-5 text-zinc-500" />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: 'var(--vox-space-4)' }} className="space-y-6">
              {/* Title */}
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Conversation
                </p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {conversation.title}
                </p>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Total Messages */}
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-4 h-4 text-brand-500" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Messages</span>
                  </div>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {analytics.totalMessages}
                  </p>
                </div>

                {/* Average Latency */}
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Avg Speed</span>
                  </div>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {analytics.averageLatency > 0 ? formatLatency(analytics.averageLatency) : '—'}
                  </p>
                </div>

                {/* User Messages */}
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">You</span>
                  </div>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {analytics.userMessageCount}
                  </p>
                </div>

                {/* Bot Messages */}
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Bot className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">AI</span>
                  </div>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {analytics.botMessageCount}
                  </p>
                </div>
              </div>

              {/* Duration */}
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Session Duration
                  </span>
                </div>
                <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                  {analytics.sessionDuration > 0 ? formatDuration(analytics.sessionDuration) : '—'}
                </p>
                {analytics.firstMessageAt && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                    Started {formatMessageDate(analytics.firstMessageAt)} at{' '}
                    {formatMessageTime(analytics.firstMessageAt)}
                  </p>
                )}
              </div>

              {/* Source Breakdown */}
              {(sourceBreakdown.typed > 0 || sourceBreakdown.voice > 0) && (
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
                    Input Methods
                  </p>
                  <div className="space-y-2">
                    {sourceBreakdown.typed > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Keyboard className="w-4 h-4 text-zinc-400" />
                          <span className="text-sm text-zinc-700 dark:text-zinc-300">Typed</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {sourceBreakdown.typed}
                        </span>
                      </div>
                    )}
                    {sourceBreakdown.voice > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Mic className="w-4 h-4 text-brand-500" />
                          <span className="text-sm text-zinc-700 dark:text-zinc-300">Voice</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {sourceBreakdown.voice}
                        </span>
                      </div>
                    )}
                    {sourceBreakdown.suggestion > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-blue-400" />
                          <span className="text-sm text-zinc-700 dark:text-zinc-300">Suggestions</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {sourceBreakdown.suggestion}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Performance Distribution */}
              {(latencyStats.fast > 0 || latencyStats.slow > 0) && (
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
                    Response Performance
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          Fast (&lt;1s)
                        </span>
                      </div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {latencyStats.fast}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          Slower (&ge;1s)
                        </span>
                      </div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {latencyStats.slow}
                      </span>
                    </div>
                    {latencyStats.min > 0 && (
                      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 mt-2">
                        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span>Fastest: {formatLatency(latencyStats.min)}</span>
                          <span>Slowest: {formatLatency(latencyStats.max)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ID (for debugging) */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate">
                  ID: {conversation.id}
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ConversationInsights;
