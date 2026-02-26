// 2026 State Integrity: Conversation Management with Hydration Guardrails
// Implements: Active ID persistence, race condition prevention, strict save-order
// REFACTORED: Unified Message Pipeline with functional state updates throughout

import { useState, useCallback, useEffect, useRef } from 'react';
import { Conversation, Message, ConversationAnalytics } from '../types';
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

  // 2026 UNIFIED PIPELINE: Conversation state ref for functional access
  const conversationsRef = useRef<Conversation[]>([]);

  // 2026 UNIFIED PIPELINE: Active ID lock to prevent mid-stream corruption
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
  // 2026 UNIFIED PIPELINE: Respects active ID lock during message streams
  const setCurrentId = useCallback((id: string | null, force: boolean = false) => {
    // GUARDRAIL: Prevent conversation switching during active message pipeline
    if (!force && pipelineLockRef.current.locked) {
      console.warn('[useConversations] Blocked conversation switch: pipeline locked for',
        pipelineLockRef.current.activeConversationId);
      return false;
    }
    setCurrentIdState(id);
    // Immediate sync to storage - no waiting
    storageService.setActiveConversationIdSync(id);
    return true;
  }, []);

  // === 2026 UNIFIED PIPELINE: Lock/Unlock functions for message operations ===
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

  // === HYDRATION: Non-Destructive Loading ===
  const hydrate = useCallback(async () => {
    setHydrationState('HYDRATING');
    isHydratingRef.current = true;

    try {
      // Step 1: Load all conversations from storage
      const storedConversations = await storageService.getConversations();

      // Step 2: Get persisted activeConversationId
      const storedActiveId = storageService.getActiveConversationIdSync();

      // Step 3: Validate the active ID exists in conversations
      let validActiveId: string | null = null;

      if (storedActiveId) {
        const exists = storedConversations.some(c => c.id === storedActiveId);
        if (exists) {
          validActiveId = storedActiveId;
        } else {
          // Active ID points to deleted conversation - clear it
          storageService.setActiveConversationIdSync(null);
        }
      }

      // Step 4: GUARDRAIL - If no valid activeId but conversations exist, use most recent
      if (!validActiveId && storedConversations.length > 0) {
        const sorted = [...storedConversations].sort((a, b) => b.updatedAt - a.updatedAt);
        validActiveId = sorted[0].id;
        // Persist the recovered ID
        storageService.setActiveConversationIdSync(validActiveId);
      }

      // Step 5: Set state atomically
      setConversations(storedConversations);
      setCurrentIdState(validActiveId);

      // Mark hydration complete
      isHydratingRef.current = false;
      setHydrationState('READY');

      // Execute any pending operations that were queued during hydration
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
    // GUARDRAIL: Block if hydration not complete
    if (isHydratingRef.current) {
      return new Promise((resolve) => {
        pendingOperationsRef.current.push(async () => {
          const conv = await createConversation(title);
          resolve(conv);
        });
      });
    }

    // ATOMIC: Create and persist in single operation
    const newConv = await storageService.createAndPersistConversation(title);

    // Update local state AFTER storage confirms
    setConversations(prev => [newConv, ...prev]);
    setCurrentIdState(newConv.id);

    return newConv;
  }, []);

  // === 2026 UNIFIED PIPELINE: Add message with FUNCTIONAL state access ===
  // CRITICAL FIX: Uses conversationsRef to avoid stale closure race conditions
  const addMessage = useCallback(async (convId: string, message: Message): Promise<void> => {
    // GUARDRAIL: Block if hydration not complete
    if (isHydratingRef.current) {
      return new Promise((resolve) => {
        pendingOperationsRef.current.push(async () => {
          await addMessage(convId, message);
          resolve();
        });
      });
    }

    // 2026 FIX: Read from REF to get latest state (avoids stale closure)
    const currentConversations = conversationsRef.current;
    const convIndex = currentConversations.findIndex(c => c.id === convId);

    // If conversation doesn't exist in memory, reload from storage
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

    // Build updated conversation
    const updatedConv: Conversation = {
      ...targetConv,
      messages: [...targetConv.messages, message],
      updatedAt: Date.now(),
    };

    // Auto-rename if title is "New Chat" and it's the first user message
    if (updatedConv.title === 'New Chat' && message.role === 'user') {
      updatedConv.title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
    }

    // STRICT SAVE-ORDER: Persist to storage FIRST - MUST AWAIT
    await storageService.saveConversation(updatedConv);

    // 2026 FIX: Use FUNCTIONAL update to ensure atomic state merge
    setConversations(prev => {
      const index = prev.findIndex(c => c.id === convId);
      if (index === -1) {
        // Conversation was added from storage - prepend it
        return [updatedConv, ...prev];
      }
      // Create new array with updated conversation at same position
      const updated = [...prev];
      updated[index] = updatedConv;
      return updated;
    });

    // 2026 FIX: Immediately sync ref for next operation in same pipeline
    conversationsRef.current = conversationsRef.current.map(c =>
      c.id === convId ? updatedConv : c
    );
    if (convIndex === -1) {
      conversationsRef.current = [updatedConv, ...conversationsRef.current];
    }
  }, []); // 2026: Empty deps - uses refs to avoid stale closures

  // === Delete conversation ===
  // 2026 FIX: Uses functional pattern to avoid stale closures
  const deleteConversation = useCallback(async (id: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await deleteConversation(id);
      });
      return;
    }

    // GUARDRAIL: Cannot delete conversation while pipeline is locked to it
    if (pipelineLockRef.current.locked && pipelineLockRef.current.activeConversationId === id) {
      console.warn('[useConversations] Cannot delete: conversation is pipeline-locked');
      return;
    }

    await storageService.deleteConversation(id);

    // 2026 FIX: Use functional update and read currentId from storage
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      // Update ref immediately
      conversationsRef.current = filtered;
      return filtered;
    });

    // Check if we need to switch active conversation
    const activeId = storageService.getActiveConversationIdSync();
    if (activeId === id) {
      // Find next conversation from ref (fresh data)
      const remaining = conversationsRef.current;
      const nextId = remaining.length > 0
        ? [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0].id
        : null;
      setCurrentId(nextId, true); // Force switch even if locked
    }
  }, [setCurrentId]); // 2026: Minimal deps

  // === Clear messages ===
  // 2026 FIX: Uses ref pattern to avoid stale closures
  const clearMessages = useCallback(async (convId: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await clearMessages(convId);
      });
      return;
    }

    // GUARDRAIL: Cannot clear while pipeline is locked
    if (pipelineLockRef.current.locked && pipelineLockRef.current.activeConversationId === convId) {
      console.warn('[useConversations] Cannot clear: conversation is pipeline-locked');
      return;
    }

    // 2026 FIX: Read from ref for fresh data
    const targetConv = conversationsRef.current.find(c => c.id === convId);
    if (!targetConv) return;

    const cleared = { ...targetConv, messages: [], updatedAt: Date.now() };

    // Persist first - MUST AWAIT
    await storageService.saveConversation(cleared);

    // Then update state with functional pattern
    setConversations(prev => {
      const index = prev.findIndex(c => c.id === convId);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = cleared;
      // Sync ref
      conversationsRef.current = updated;
      return updated;
    });
  }, []); // 2026: Empty deps - uses refs

  // === Rename conversation ===
  // 2026 FIX: Uses ref pattern to avoid stale closures
  const renameConversation = useCallback(async (id: string, newTitle: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await renameConversation(id, newTitle);
      });
      return;
    }

    // 2026 FIX: Read from ref for fresh data
    const conv = conversationsRef.current.find(c => c.id === id);
    if (!conv) return;

    const renamed = { ...conv, title: newTitle.trim() || 'Untitled', updatedAt: Date.now() };

    // Persist first - MUST AWAIT
    await storageService.saveConversation(renamed);

    // Then update state with functional pattern
    setConversations(prev => {
      const index = prev.findIndex(c => c.id === id);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = renamed;
      // Sync ref
      conversationsRef.current = updated;
      return updated;
    });
  }, []); // 2026: Empty deps - uses refs

  // === Toggle pin ===
  // 2026 FIX: Uses ref pattern to avoid stale closures
  const togglePin = useCallback(async (id: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await togglePin(id);
      });
      return;
    }

    // 2026 FIX: Read from ref for fresh data
    const conv = conversationsRef.current.find(c => c.id === id);
    if (!conv) return;

    const toggled = { ...conv, isPinned: !conv.isPinned };

    // Persist first - MUST AWAIT
    await storageService.saveConversation(toggled);

    // Then update state with functional pattern
    setConversations(prev => {
      const index = prev.findIndex(c => c.id === id);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = toggled;
      // Sync ref
      conversationsRef.current = updated;
      return updated;
    });
  }, []); // 2026: Empty deps - uses refs

  // 2026 UNIFIED PIPELINE: Update message in-place for streaming
  // 2026 Analytics: Now accepts optional latency parameter
  const updateMessageContent = useCallback(async (
    convId: string,
    messageId: string,
    content: string,
    persist: boolean = false,
    latency?: number // 2026 Analytics: Response time in ms
  ): Promise<void> => {
    // Use functional update to avoid race conditions
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

      // Sync ref immediately
      conversationsRef.current = updated;

      // Optionally persist (only final update should persist)
      if (persist) {
        storageService.saveConversation(conv);
      }

      return updated;
    });
  }, []);

  // 2026 Analytics: Update conversation with computed analytics
  const updateConversationWithAnalytics = useCallback(async (
    convId: string,
    newLatency?: number
  ): Promise<void> => {
    // COMPUTATION GUARD: All analytics calculations happen here, outside render
    setConversations(prev => {
      const convIndex = prev.findIndex(c => c.id === convId);
      if (convIndex === -1) return prev;

      const updated = [...prev];
      const conv = { ...updated[convIndex] };

      // Compute fresh analytics from messages
      conv.analytics = computeConversationAnalytics(conv.messages, newLatency);
      conv.updatedAt = Date.now();
      updated[convIndex] = conv;

      // Sync ref immediately
      conversationsRef.current = updated;

      // Persist analytics update
      storageService.saveConversation(conv);

      return updated;
    });
  }, []);

  // 2026 UNIFIED PIPELINE: Get fresh conversation state (avoids stale closure)
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
    // 2026 UNIFIED PIPELINE: New exports for state integrity
    acquirePipelineLock,
    releasePipelineLock,
    isPipelineLocked,
    getLockedConversationId,
    updateMessageContent,
    getConversationById,
    // 2026 Analytics: Conversation analytics update
    updateConversationWithAnalytics,
  };
};
