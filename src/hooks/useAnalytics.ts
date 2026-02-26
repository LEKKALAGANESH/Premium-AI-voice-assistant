/**
 * useAnalytics.ts
 * 2026 Data Architect Standard: Conversation Analytics & Latency Engine
 *
 * Features:
 * - Precision latency tracking (start → bot completion)
 * - Message source classification (typed, voice, suggestion, override)
 * - Conversation-level analytics aggregation
 * - Computation guard: All calculations outside render cycle
 */

import { useCallback, useRef } from 'react';
import { Message, Conversation, ConversationAnalytics, MessageSource } from '../types';

// Latency timer state
interface LatencyTimer {
  messageId: string;
  startTime: number;
  source: MessageSource;
}

// Analytics computation result
interface AnalyticsUpdate {
  analytics: ConversationAnalytics;
  assistantLatency?: number;
}

/**
 * Compute fresh analytics from conversation messages
 * CRITICAL: Called only at storage commitment, NOT during render
 */
export const computeConversationAnalytics = (
  messages: Message[],
  newAssistantLatency?: number
): ConversationAnalytics => {
  const userMessages = messages.filter(m => m.role === 'user');
  const botMessages = messages.filter(m => m.role === 'assistant');

  // Collect all bot latencies
  const latencies = botMessages
    .map(m => m.latency)
    .filter((l): l is number => l !== undefined && l > 0);

  // Add new latency if provided
  if (newAssistantLatency && newAssistantLatency > 0) {
    latencies.push(newAssistantLatency);
  }

  // Calculate average latency
  const averageLatency = latencies.length > 0
    ? Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length)
    : 0;

  // Get first and last message timestamps
  const timestamps = messages
    .map(m => m.createdAt || m.timestamp)
    .filter(t => t > 0)
    .sort((a, b) => a - b);

  const firstMessageAt = timestamps.length > 0 ? timestamps[0] : null;
  const lastMessageAt = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  // Calculate session duration
  const sessionDuration = firstMessageAt && lastMessageAt
    ? lastMessageAt - firstMessageAt
    : 0;

  return {
    totalMessages: messages.length,
    userMessageCount: userMessages.length,
    botMessageCount: botMessages.length,
    averageLatency,
    sessionDuration,
    firstMessageAt,
    lastMessageAt,
  };
};

/**
 * Format latency for display
 */
export const formatLatency = (latencyMs: number): string => {
  if (latencyMs < 1000) {
    return `${latencyMs}ms`;
  }
  return `${(latencyMs / 1000).toFixed(1)}s`;
};

/**
 * Format duration for display
 */
export const formatDuration = (durationMs: number): string => {
  if (durationMs < 60000) {
    return `${Math.round(durationMs / 1000)}s`;
  }
  if (durationMs < 3600000) {
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.round((durationMs % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(durationMs / 3600000);
  const mins = Math.round((durationMs % 3600000) / 60000);
  return `${hours}h ${mins}m`;
};

/**
 * Format timestamp for message display
 */
export const formatMessageTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Format date for conversation insights
 */
export const formatMessageDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

/**
 * useAnalytics Hook
 * Provides latency timing and analytics computation utilities
 */
export const useAnalytics = () => {
  // Active latency timers (keyed by user message ID that triggered the response)
  const activeTimersRef = useRef<Map<string, LatencyTimer>>(new Map());

  /**
   * Start latency timer when user message is submitted
   * Returns the timer ID for correlation
   */
  const startLatencyTimer = useCallback((
    userMessageId: string,
    source: MessageSource
  ): string => {
    const timer: LatencyTimer = {
      messageId: userMessageId,
      startTime: performance.now(),
      source,
    };
    activeTimersRef.current.set(userMessageId, timer);
    return userMessageId;
  }, []);

  /**
   * Stop latency timer when bot response is complete
   * Returns the latency in milliseconds
   */
  const stopLatencyTimer = useCallback((userMessageId: string): number | null => {
    const timer = activeTimersRef.current.get(userMessageId);
    if (!timer) {
      console.warn('[useAnalytics] No timer found for message:', userMessageId);
      return null;
    }

    const endTime = performance.now();
    const latency = Math.round(endTime - timer.startTime);

    // Clean up timer
    activeTimersRef.current.delete(userMessageId);

    return latency;
  }, []);

  /**
   * Get source from active timer
   */
  const getTimerSource = useCallback((userMessageId: string): MessageSource | null => {
    const timer = activeTimersRef.current.get(userMessageId);
    return timer?.source || null;
  }, []);

  /**
   * Cancel timer (on error or abort)
   */
  const cancelLatencyTimer = useCallback((userMessageId: string): void => {
    activeTimersRef.current.delete(userMessageId);
  }, []);

  /**
   * Update conversation with fresh analytics
   * CRITICAL: Call only at storage commitment point
   */
  const updateConversationAnalytics = useCallback((
    conversation: Conversation,
    newAssistantLatency?: number
  ): Conversation => {
    const analytics = computeConversationAnalytics(
      conversation.messages,
      newAssistantLatency
    );

    return {
      ...conversation,
      analytics,
    };
  }, []);

  /**
   * Create message with analytics metadata
   */
  const createAnalyticsMessage = useCallback((
    baseMessage: Omit<Message, 'createdAt'>,
    source?: MessageSource,
    latency?: number
  ): Message => {
    return {
      ...baseMessage,
      createdAt: Date.now(),
      source,
      latency,
    };
  }, []);

  return {
    // Timer operations
    startLatencyTimer,
    stopLatencyTimer,
    getTimerSource,
    cancelLatencyTimer,
    // Analytics operations
    updateConversationAnalytics,
    createAnalyticsMessage,
    computeConversationAnalytics,
    // Formatters
    formatLatency,
    formatDuration,
    formatMessageTime,
    formatMessageDate,
  };
};

export default useAnalytics;
