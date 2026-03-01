import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useAnalytics,
  computeConversationAnalytics,
  formatLatency,
  formatDuration,
  formatMessageTime,
  formatMessageDate,
} from '../../hooks/useAnalytics';
import { Message, Conversation } from '../../types';

// Helper to create test messages with required fields
const createMessage = (overrides: Partial<Message> & { id: string; role: 'user' | 'assistant'; content: string }): Message => ({
  timestamp: Date.now(),
  createdAt: Date.now(),
  ...overrides,
});

describe('computeConversationAnalytics', () => {
  it('should count messages correctly', () => {
    const messages: Message[] = [
      createMessage({ id: '1', role: 'user', content: 'Hello', timestamp: 1000, createdAt: 1000 }),
      createMessage({ id: '2', role: 'assistant', content: 'Hi', timestamp: 2000, createdAt: 2000 }),
      createMessage({ id: '3', role: 'user', content: 'How are you?', timestamp: 3000, createdAt: 3000 }),
      createMessage({ id: '4', role: 'assistant', content: 'I am fine', timestamp: 4000, createdAt: 4000 }),
    ];

    const analytics = computeConversationAnalytics(messages);
    expect(analytics.totalMessages).toBe(4);
    expect(analytics.userMessageCount).toBe(2);
    expect(analytics.botMessageCount).toBe(2);
  });

  it('should calculate average latency from messages', () => {
    const messages: Message[] = [
      createMessage({ id: '1', role: 'user', content: 'Hello', timestamp: 1000, createdAt: 1000 }),
      createMessage({ id: '2', role: 'assistant', content: 'Hi', timestamp: 2000, createdAt: 2000, latency: 100 }),
      createMessage({ id: '3', role: 'user', content: 'Test', timestamp: 3000, createdAt: 3000 }),
      createMessage({ id: '4', role: 'assistant', content: 'Response', timestamp: 4000, createdAt: 4000, latency: 200 }),
    ];

    const analytics = computeConversationAnalytics(messages);
    expect(analytics.averageLatency).toBe(150);
  });

  it('should include new latency in calculation', () => {
    const messages: Message[] = [
      createMessage({ id: '1', role: 'assistant', content: 'Hi', timestamp: 1000, createdAt: 1000, latency: 100 }),
    ];

    const analytics = computeConversationAnalytics(messages, 300);
    expect(analytics.averageLatency).toBe(200); // (100 + 300) / 2
  });

  it('should calculate session duration', () => {
    const messages: Message[] = [
      createMessage({ id: '1', role: 'user', content: 'Hello', timestamp: 1000, createdAt: 1000 }),
      createMessage({ id: '2', role: 'assistant', content: 'Hi', timestamp: 5000, createdAt: 5000 }),
    ];

    const analytics = computeConversationAnalytics(messages);
    expect(analytics.sessionDuration).toBe(4000);
  });

  it('should handle empty messages array', () => {
    const analytics = computeConversationAnalytics([]);
    expect(analytics.totalMessages).toBe(0);
    expect(analytics.userMessageCount).toBe(0);
    expect(analytics.botMessageCount).toBe(0);
    expect(analytics.averageLatency).toBe(0);
    expect(analytics.sessionDuration).toBe(0);
  });

  it('should set firstMessageAt and lastMessageAt', () => {
    const messages: Message[] = [
      createMessage({ id: '1', role: 'user', content: 'First', timestamp: 1000, createdAt: 1000 }),
      createMessage({ id: '2', role: 'user', content: 'Last', timestamp: 5000, createdAt: 5000 }),
    ];

    const analytics = computeConversationAnalytics(messages);
    expect(analytics.firstMessageAt).toBe(1000);
    expect(analytics.lastMessageAt).toBe(5000);
  });

  it('should ignore zero or negative latencies', () => {
    const messages: Message[] = [
      createMessage({ id: '1', role: 'assistant', content: 'Hi', timestamp: 1000, createdAt: 1000, latency: 0 }),
      createMessage({ id: '2', role: 'assistant', content: 'There', timestamp: 2000, createdAt: 2000, latency: -100 }),
      createMessage({ id: '3', role: 'assistant', content: 'Test', timestamp: 3000, createdAt: 3000, latency: 200 }),
    ];

    const analytics = computeConversationAnalytics(messages);
    expect(analytics.averageLatency).toBe(200);
  });
});

describe('formatLatency', () => {
  it('should format milliseconds under 1 second', () => {
    expect(formatLatency(500)).toBe('500ms');
    expect(formatLatency(100)).toBe('100ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('should format seconds with one decimal', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(1500)).toBe('1.5s');
    expect(formatLatency(2500)).toBe('2.5s');
  });

  it('should handle zero', () => {
    expect(formatLatency(0)).toBe('0ms');
  });
});

describe('formatDuration', () => {
  it('should format seconds under a minute', () => {
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('should format minutes under an hour', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(3540000)).toBe('59m 0s');
  });

  it('should format hours', () => {
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(5400000)).toBe('1h 30m');
    expect(formatDuration(7200000)).toBe('2h 0m');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('formatMessageTime', () => {
  it('should format time in 12-hour format', () => {
    const date = new Date('2024-01-15T14:30:00');
    const result = formatMessageTime(date.getTime());
    expect(result).toMatch(/2:30\s*PM/i);
  });

  it('should format morning time', () => {
    const date = new Date('2024-01-15T09:15:00');
    const result = formatMessageTime(date.getTime());
    expect(result).toMatch(/9:15\s*AM/i);
  });
});

describe('formatMessageDate', () => {
  it('should return "Today" for today', () => {
    const now = Date.now();
    const result = formatMessageDate(now);
    expect(result).toBe('Today');
  });

  it('should return "Yesterday" for yesterday', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    const result = formatMessageDate(yesterday);
    expect(result).toBe('Yesterday');
  });

  it('should return weekday name for last week', () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const result = formatMessageDate(threeDaysAgo);
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(weekdays).toContain(result);
  });
});

describe('useAnalytics hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should start and stop latency timer', () => {
    const { result } = renderHook(() => useAnalytics());

    // Start timer
    act(() => {
      result.current.startLatencyTimer('msg-1', 'typed');
    });

    // Advance time
    vi.advanceTimersByTime(100);

    // Stop timer
    let latency: number | null = null;
    act(() => {
      latency = result.current.stopLatencyTimer('msg-1');
    });

    expect(latency).toBe(100);
  });

  it('should return null for non-existent timer', () => {
    const { result } = renderHook(() => useAnalytics());

    let latency: number | null = null;
    act(() => {
      latency = result.current.stopLatencyTimer('non-existent');
    });

    expect(latency).toBeNull();
  });

  it('should get timer source', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.startLatencyTimer('msg-1', 'voice');
    });

    expect(result.current.getTimerSource('msg-1')).toBe('voice');
    expect(result.current.getTimerSource('non-existent')).toBeNull();
  });

  it('should cancel latency timer', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.startLatencyTimer('msg-1', 'typed');
    });

    act(() => {
      result.current.cancelLatencyTimer('msg-1');
    });

    expect(result.current.getTimerSource('msg-1')).toBeNull();
  });

  it('should update conversation analytics', () => {
    const { result } = renderHook(() => useAnalytics());

    const conversation: Conversation = {
      id: 'conv-1',
      title: 'Test',
      messages: [
        createMessage({ id: '1', role: 'user', content: 'Hi', timestamp: 1000, createdAt: 1000 }),
        createMessage({ id: '2', role: 'assistant', content: 'Hello', timestamp: 2000, createdAt: 2000, latency: 100 }),
      ],
      updatedAt: Date.now(),
      isPinned: false,
    };

    let updated: Conversation | null = null;
    act(() => {
      updated = result.current.updateConversationAnalytics(conversation, 200);
    });

    expect(updated?.analytics).toBeDefined();
    expect(updated?.analytics?.averageLatency).toBe(150);
  });

  it('should create analytics message', () => {
    const { result } = renderHook(() => useAnalytics());

    let message: Message | null = null;
    act(() => {
      message = result.current.createAnalyticsMessage(
        { id: '1', role: 'user', content: 'Test', timestamp: 0 },
        'typed',
        100
      );
    });

    expect(message?.source).toBe('typed');
    expect(message?.latency).toBe(100);
    expect(message?.createdAt).toBeDefined();
  });

  it('should handle multiple concurrent timers', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.startLatencyTimer('msg-1', 'typed');
    });

    vi.advanceTimersByTime(50);

    act(() => {
      result.current.startLatencyTimer('msg-2', 'voice');
    });

    vi.advanceTimersByTime(50);

    let latency1: number | null = null;
    let latency2: number | null = null;
    act(() => {
      latency1 = result.current.stopLatencyTimer('msg-1');
      latency2 = result.current.stopLatencyTimer('msg-2');
    });

    expect(latency1).toBe(100);
    expect(latency2).toBe(50);
  });
});

describe('integration tests', () => {
  it('should handle full conversation flow', () => {
    const now = Date.now();
    const messages: Message[] = [];

    // Add user message
    messages.push(createMessage({
      id: '1',
      role: 'user',
      content: 'Hello',
      timestamp: now,
      createdAt: now,
      source: 'typed',
    }));

    // Add assistant response with latency
    messages.push(createMessage({
      id: '2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: now + 150,
      createdAt: now + 150,
      latency: 150,
    }));

    // Add another user message
    messages.push(createMessage({
      id: '3',
      role: 'user',
      content: 'How are you?',
      timestamp: now + 5000,
      createdAt: now + 5000,
      source: 'voice',
    }));

    // Add assistant response
    messages.push(createMessage({
      id: '4',
      role: 'assistant',
      content: 'I am doing great!',
      timestamp: now + 5200,
      createdAt: now + 5200,
      latency: 200,
    }));

    const analytics = computeConversationAnalytics(messages);

    expect(analytics.totalMessages).toBe(4);
    expect(analytics.userMessageCount).toBe(2);
    expect(analytics.botMessageCount).toBe(2);
    expect(analytics.averageLatency).toBe(175); // (150 + 200) / 2
  });
});
