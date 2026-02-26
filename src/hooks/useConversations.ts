// 2026 State Integrity: Conversation Management with Hydration Guardrails
// Implements: Active ID persistence, race condition prevention, strict save-order

import { useState, useCallback, useEffect, useRef } from 'react';
import { Conversation, Message } from '../types';
import { storageService } from '../services/storage';

// Hydration state machine
type HydrationState = 'INITIALIZING' | 'HYDRATING' | 'READY' | 'ERROR';

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const [hydrationState, setHydrationState] = useState<HydrationState>('INITIALIZING');

  // Refs to prevent stale closures and race conditions
  const isHydratingRef = useRef(true);
  const pendingOperationsRef = useRef<Array<() => Promise<void>>>([]);

  // === CRITICAL: Persist activeConversationId on EVERY change ===
  const setCurrentId = useCallback((id: string | null) => {
    setCurrentIdState(id);
    // Immediate sync to storage - no waiting
    storageService.setActiveConversationIdSync(id);
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

  // === STRICT SAVE-ORDER: Add message with immediate persistence ===
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

    // Find conversation
    const convIndex = conversations.findIndex(c => c.id === convId);

    // If conversation doesn't exist in memory, reload from storage
    let targetConv: Conversation | null = null;
    if (convIndex === -1) {
      const storedConversations = await storageService.getConversations();
      targetConv = storedConversations.find(c => c.id === convId) || null;
      if (!targetConv) {
        console.error('[useConversations] Cannot add message: conversation not found', convId);
        return;
      }
      // Update local state with the conversation
      setConversations(prev => [targetConv!, ...prev.filter(c => c.id !== convId)]);
    } else {
      targetConv = conversations[convIndex];
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

    // STRICT SAVE-ORDER: Persist to storage FIRST
    await storageService.saveConversation(updatedConv);

    // Then update local state
    setConversations(prev => {
      const index = prev.findIndex(c => c.id === convId);
      if (index === -1) return [updatedConv, ...prev];

      const updated = [...prev];
      updated[index] = updatedConv;
      return updated;
    });
  }, [conversations]);

  // === Delete conversation ===
  const deleteConversation = useCallback(async (id: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await deleteConversation(id);
      });
      return;
    }

    await storageService.deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));

    if (currentId === id) {
      // Find next conversation to select
      const remaining = conversations.filter(c => c.id !== id);
      const nextId = remaining.length > 0
        ? [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0].id
        : null;
      setCurrentId(nextId);
    }
  }, [currentId, conversations, setCurrentId]);

  // === Clear messages ===
  const clearMessages = useCallback(async (convId: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await clearMessages(convId);
      });
      return;
    }

    const updatedConv = conversations.find(c => c.id === convId);
    if (!updatedConv) return;

    const cleared = { ...updatedConv, messages: [], updatedAt: Date.now() };

    // Persist first
    await storageService.saveConversation(cleared);

    // Then update state
    setConversations(prev => {
      const index = prev.findIndex(c => c.id === convId);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = cleared;
      return updated;
    });
  }, [conversations]);

  // === Rename conversation ===
  const renameConversation = useCallback(async (id: string, newTitle: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await renameConversation(id, newTitle);
      });
      return;
    }

    const conv = conversations.find(c => c.id === id);
    if (!conv) return;

    const renamed = { ...conv, title: newTitle.trim() || 'Untitled', updatedAt: Date.now() };

    // Persist first
    await storageService.saveConversation(renamed);

    // Then update state
    setConversations(prev => {
      const index = prev.findIndex(c => c.id === id);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = renamed;
      return updated;
    });
  }, [conversations]);

  // === Toggle pin ===
  const togglePin = useCallback(async (id: string) => {
    if (isHydratingRef.current) {
      pendingOperationsRef.current.push(async () => {
        await togglePin(id);
      });
      return;
    }

    const conv = conversations.find(c => c.id === id);
    if (!conv) return;

    const toggled = { ...conv, isPinned: !conv.isPinned };

    // Persist first
    await storageService.saveConversation(toggled);

    // Then update state
    setConversations(prev => {
      const index = prev.findIndex(c => c.id === id);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = toggled;
      return updated;
    });
  }, [conversations]);

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
  };
};
