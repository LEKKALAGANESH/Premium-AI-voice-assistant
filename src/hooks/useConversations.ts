// 2026 State Integrity: Conversation Management with Hydration Guardrails
// Implements: Active ID persistence, race condition prevention, strict save-order
// REFACTORED: Unified Message Pipeline with functional state updates throughout
// REFACTORED: Extracted mutateConversation helper to eliminate duplication

import { useState, useCallback, useEffect, useRef } from 'react';
import { Conversation, Message } from '../types';
import { storageService } from '../services/storage';
import { computeConversationAnalytics } from './useAnalytics';

// Hydration state machine
type HydrationState = 'INITIALIZING' | 'HYDRATING' | 'READY' | 'ERROR';

// Message pipeline lock state
type PipelineLockState = {
  locked: boolean;
  activeConversationId: string | null;
  operationId: string | null;
};

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const [hydrationState, setHydrationState] = useState<HydrationState>('INITIALIZING');

  // Refs to prevent stale closures and race conditions
  const isHydratingRef = useRef(true);
  const pendingOperationsRef = useRef<Array<() => Promise<void>>>([]);

  // Conversation state ref for functional access
  const conversationsRef = useRef<Conversation[]>([]);

  // Active ID lock to prevent mid-stream corruption
  const pipelineLockRef = useRef<PipelineLockState>({
    locked: false,
    activeConversationId: null,
    operationId: null,
  });

  // Keep conversationsRef in sync with state
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // === CRITICAL: Persist activeConversationId on EVERY change ===
  const setCurrentId = useCallback((id: string | null, force: boolean = false) => {
    if (!force && pipelineLockRef.current.locked) {
      console.warn('[useConversations] Blocked conversation switch: pipeline locked for',
        pipelineLockRef.current.activeConversationId);
      return false;
    }
    setCurrentIdState(id);
    storageService.setActiveConversationIdSync(id);
    return true;
  }, []);

  // === Lock/Unlock functions for message operations ===
  const acquirePipelineLock = useCallback((conversationId: string, operationId: string): boolean => {
    if (pipelineLockRef.current.locked) {
      console.warn('[useConversations] Pipeline already locked by', pipelineLockRef.current.operationId);
      return false;
    }
    pipelineLockRef.current = {
      locked: true,
      activeConversationId: conversationId,
      operationId,
    };
    return true;
  }, []);

  const releasePipelineLock = useCallback((operationId: string): boolean => {
    if (pipelineLockRef.current.operationId !== operationId) {
      console.warn('[useConversations] Cannot release lock: operation mismatch');
      return false;
    }
    pipelineLockRef.current = {
      locked: false,
      activeConversationId: null,
      operationId: null,
    };
    return true;
  }, []);

  const isPipelineLocked = useCallback((): boolean => {
    return pipelineLockRef.current.locked;
  }, []);

  const getLockedConversationId = useCallback((): string | null => {
    return pipelineLockRef.current.activeConversationId;
  }, []);

  // ============================================================================
  // EXTRACTED: mutateConversation — shared guardrail + persist + setState + ref-sync
  // Eliminates ~120 lines of duplicated boilerplate across rename, pin, clear
  // ============================================================================
  const mutateConversation = useCallback(
    async (
      convId: string,
      updater: (conv: Conversation) => Conversation,
      opts?: { allowWhileLocked?: boolean },
    ): Promise<void> => {
      // Hydration guardrail
      if (isHydratingRef.current) {
        return new Promise<void>((resolve) => {
          pendingOperationsRef.current.push(async () => {
            const conv = conversationsRef.current.find((c) => c.id === convId);
            if (conv) {
              const updated = updater(conv);
              await storageService.saveConversation(updated);
              setConversations((prev) => prev.map((c) => (c.id === convId ? updated : c)));
              conversationsRef.current = conversationsRef.current.map((c) => (c.id === convId ? updated : c));
            }
            resolve();
          });
        });
      }

      // Pipeline lock guardrail
      if (!opts?.allowWhileLocked && pipelineLockRef.current.locked && pipelineLockRef.current.activeConversationId === convId) {
        console.warn('[useConversations] Blocked: conversation is pipeline-locked');
        return;
      }

      const conv = conversationsRef.current.find((c) => c.id === convId);
      if (!conv) return;

      const updated = updater(conv);
      await storageService.saveConversation(updated);

      setConversations((prev) => {
        const result = prev.map((c) => (c.id === convId ? updated : c));
        conversationsRef.current = result;
        return result;
      });
    },
    [],
  );

  // === HYDRATION: Non-Destructive Loading ===
  const hydrate = useCallback(async () => {
    setHydrationState('HYDRATING');
    isHydratingRef.current = true;

    try {
      const storedConversations = await storageService.getConversations();
      const storedActiveId = storageService.getActiveConversationIdSync();

      let validActiveId: string | null = null;

      if (storedActiveId) {
        const exists = storedConversations.some(c => c.id === storedActiveId);
        if (exists) {
          validActiveId = storedActiveId;
        } else {
          storageService.setActiveConversationIdSync(null);
        }
      }

      if (!validActiveId && storedConversations.length > 0) {
        const sorted = [...storedConversations].sort((a, b) => b.updatedAt - a.updatedAt);
        validActiveId = sorted[0].id;
        storageService.setActiveConversationIdSync(validActiveId);
      }

      setConversations(storedConversations);
      setCurrentIdState(validActiveId);

      isHydratingRef.current = false;
      setHydrationState('READY');

      const pending = pendingOperationsRef.current;
      pendingOperationsRef.current = [];
      for (const op of pending) {
        await op();
      }
    } catch (error) {
      console.error('[useConversations] Hydration failed:', error);
      isHydratingRef.current = false;
      setHydrationState('ERROR');
    }
  }, []);

  // Run hydration on mount - ONCE
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Derived state
  const currentConversation = conversations.find(c => c.id === currentId) || null;
  const isReady = hydrationState === 'READY';
  const loading = hydrationState === 'INITIALIZING' || hydrationState === 'HYDRATING';

  // === ATOMIC: Create conversation and persist BEFORE returning ===
  const createConversation = useCallback(async (title: string = 'New Chat'): Promise<Conversation> => {
    if (isHydratingRef.current) {
      return new Promise((resolve) => {
        pendingOperationsRef.current.push(async () => {
          const conv = await createConversation(title);
          resolve(conv);
        });
      });
    }

    const newConv = await storageService.createAndPersistConversation(title);
    setConversations(prev => [newConv, ...prev]);
    setCurrentIdState(newConv.id);

    return newConv;
  }, []);

  // === Add message with FUNCTIONAL state access ===
  const addMessage = useCallback(async (convId: string, message: Message): Promise<void> => {
    if (isHydratingRef.current) {
      return new Promise((resolve) => {
        pendingOperationsRef.current.push(async () => {
          await addMessage(convId, message);
          resolve();
        });
      });
    }

    const currentConversations = conversationsRef.current;
    const convIndex = currentConversations.findIndex(c => c.id === convId);

    let targetConv: Conversation | null = null;
    if (convIndex === -1) {
      const storedConversations = await storageService.getConversations();
      targetConv = storedConversations.find(c => c.id === convId) || null;
      if (!targetConv) {
        console.error('[useConversations] Cannot add message: conversation not found', convId);
        return;
      }
    } else {
      targetConv = currentConversations[convIndex];
    }

    const updatedConv: Conversation = {
      ...targetConv,
      messages: [...targetConv.messages, message],
      updatedAt: Date.now(),
    };

    if (updatedConv.title === 'New Chat' && message.role === 'user') {
      // Silent Swap: Instant optimistic title from first user message
      const snippet = message.content.trim().substring(0, 25);
      updatedConv.title = snippet + (message.content.trim().length > 25 ? '...' : '');
    }

    await storageService.saveConversation(updatedConv);

    setConversations(prev => {
      const index = prev.findIndex(c => c.id === convId);
      if (index === -1) {
        return [updatedConv, ...prev];
      }
      const updated = [...prev];
      updated[index] = updatedConv;
      return updated;
    });

    conversationsRef.current = conversationsRef.current.map(c =>
      c.id === convId ? updatedConv : c
    );
    if (convIndex === -1) {
      conversationsRef.current = [updatedConv, ...conversationsRef.current];
    }
  }, []);

  // === Delete conversation ===
  const deleteConversation = useCallback(async (id: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await deleteConversation(id);
      });
      return;
    }

    if (pipelineLockRef.current.locked && pipelineLockRef.current.activeConversationId === id) {
      console.warn('[useConversations] Cannot delete: conversation is pipeline-locked');
      return;
    }

    await storageService.deleteConversation(id);

    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      conversationsRef.current = filtered;
      return filtered;
    });

    const activeId = storageService.getActiveConversationIdSync();
    if (activeId === id) {
      const remaining = conversationsRef.current;
      const nextId = remaining.length > 0
        ? [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0].id
        : null;
      setCurrentId(nextId, true);
    }
  }, [setCurrentId]);

  // === Rename, Pin, Clear — now one-liners via mutateConversation ===

  const renameConversation = useCallback(
    (id: string, newTitle: string) =>
      mutateConversation(id, (conv) => ({ ...conv, title: newTitle.trim() || 'Untitled', updatedAt: Date.now() }), { allowWhileLocked: true }),
    [mutateConversation],
  );

  const togglePin = useCallback(
    (id: string) =>
      mutateConversation(id, (conv) => ({ ...conv, isPinned: !conv.isPinned })),
    [mutateConversation],
  );

  const clearMessages = useCallback(
    (convId: string) =>
      mutateConversation(convId, (conv) => ({ ...conv, messages: [], updatedAt: Date.now() })),
    [mutateConversation],
  );

  // Update message in-place for streaming
  const updateMessageContent = useCallback(async (
    convId: string,
    messageId: string,
    content: string,
    persist: boolean = false,
    latency?: number
  ): Promise<void> => {
    setConversations(prev => {
      const convIndex = prev.findIndex(c => c.id === convId);
      if (convIndex === -1) return prev;

      const updated = [...prev];
      const conv = { ...updated[convIndex] };
      conv.messages = conv.messages.map(m =>
        m.id === messageId
          ? { ...m, content, ...(latency !== undefined && { latency }) }
          : m
      );
      conv.updatedAt = Date.now();
      updated[convIndex] = conv;

      conversationsRef.current = updated;

      if (persist) {
        storageService.saveConversation(conv);
      }

      return updated;
    });
  }, []);

  // Update conversation with computed analytics
  const updateConversationWithAnalytics = useCallback(async (
    convId: string,
    newLatency?: number
  ): Promise<void> => {
    setConversations(prev => {
      const convIndex = prev.findIndex(c => c.id === convId);
      if (convIndex === -1) return prev;

      const updated = [...prev];
      const conv = { ...updated[convIndex] };

      conv.analytics = computeConversationAnalytics(conv.messages, newLatency);
      conv.updatedAt = Date.now();
      updated[convIndex] = conv;

      conversationsRef.current = updated;
      storageService.saveConversation(conv);

      return updated;
    });
  }, []);

  // Get fresh conversation state (avoids stale closure)
  const getConversationById = useCallback((convId: string): Conversation | null => {
    return conversationsRef.current.find(c => c.id === convId) || null;
  }, []);

  return {
    conversations,
    currentId,
    setCurrentId,
    currentConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    togglePin,
    addMessage,
    clearMessages,
    setConversations,
    loading,
    isReady,
    hydrationState,
    acquirePipelineLock,
    releasePipelineLock,
    isPipelineLocked,
    getLockedConversationId,
    updateMessageContent,
    getConversationById,
    updateConversationWithAnalytics,
  };
};
