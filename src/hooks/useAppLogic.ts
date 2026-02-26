// 2026 State Integrity: App Logic with Strict Save-Order Protocol
// Implements: Atomic conversation creation, hydration guardrails, sequential persistence

import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useConversations } from './useConversations';
import { useVoiceAgent } from './useVoiceAgent';
import { useSettings } from './useSettings';
import { useSpeechTextSync, SyncState } from './useSpeechTextSync';
import { chatService } from '../services/chat';
import { storageService } from '../services/storage';
import { Message, InputMode, FailedMessage, Conversation } from '../types';

export const useAppLogic = () => {
  const {
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
    isReady: isHydrationReady,
    hydrationState,
  } = useConversations();

  const { settings, updateSettings } = useSettings();
  const [inputText, setInputText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // 2026: Independent text thread state
  const [isTextInputActive, setIsTextInputActive] = useState(false);
  const [textInputFailed, setTextInputFailed] = useState<FailedMessage | null>(null);

  // 2026: Sync engine state for current speaking message
  const [activeSyncText, setActiveSyncText] = useState('');
  const [activeSyncMessageId, setActiveSyncMessageId] = useState<string | null>(null);

  // Refs to avoid stale closures
  const voiceFlowRef = useRef(false);
  const voiceConfidenceRef = useRef(1);
  const voiceAgentRef = useRef<{
    speak: (text: string) => Promise<void>;
    setError: (err: string | null) => void;
    isSpeaking: boolean;
    wordsBuffer: string[];
    currentSpokenWordIndex: number;
  } | null>(null);

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && !settings.sidebarCollapsed) {
        updateSettings({ sidebarCollapsed: true });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [settings.sidebarCollapsed, updateSettings]);

  // 2026: Handle transcript with confidence tracking
  const handleTranscript = useCallback(
    (text: string, isFinal: boolean, confidence: number) => {
      voiceConfidenceRef.current = confidence;
      if (isFinal) {
        setInputText('');
        voiceFlowRef.current = true;
      } else {
        setStreamingText(text);
      }
    },
    []
  );

  // 2026: Sync word change callback
  const handleSyncWordChange = useCallback((index: number, word: string) => {
    // Update sync state for message rendering
    // This is handled by the sync engine in MessageBubble
  }, []);

  // === 2026 STATE INTEGRITY: Strict Save-Order Protocol ===
  // Sequence: Create Conv → User Msg → Storage → API → AI Response → Storage
  const handleSend = useCallback(
    async (textOverride?: string, source: 'text' | 'voice' = 'text') => {
      const text = textOverride || inputText;
      if (!text.trim()) return;

      // GUARDRAIL: Block operations until hydration complete
      if (!isHydrationReady) {
        console.warn('[useAppLogic] Blocking send: hydration not complete');
        return;
      }

      // Independent threads - text input doesn't trigger voice timers
      if (source === 'text') {
        voiceFlowRef.current = false;
        setIsTextInputActive(true);
      }

      // === STEP 1: ATOMIC CONVERSATION CREATION ===
      // If no active conversation, create one IMMEDIATELY and persist to storage
      let activeId = currentId;
      let activeConv: Conversation | null = null;

      if (!activeId) {
        // ATOMIC: Create and persist in single operation - NO RACE CONDITIONS
        activeConv = await createConversation();
        activeId = activeConv.id;
        // activeId is now persisted to localStorage via createConversation
      } else {
        activeConv = conversations.find((c) => c.id === activeId) || null;
      }

      // Safety check - should never happen with proper hydration
      if (!activeId || !activeConv) {
        console.error('[useAppLogic] Critical: No active conversation after creation');
        return;
      }

      // Get conversation history AFTER ensuring conversation exists
      const history: Message[] = activeConv.messages;

      // === STEP 2: CREATE USER MESSAGE ===
      const userMsg: Message = {
        id: uuidv4(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        confidence: source === 'voice' ? voiceConfidenceRef.current : undefined,
      };

      // === STEP 3: PERSIST USER MESSAGE (Wait for confirmation) ===
      await addMessage(activeId, userMsg);

      // Clear input state
      setInputText('');
      setStreamingText('');
      setIsThinking(true);

      try {
        // === STEP 4: CALL GEMINI API ===
        const aiResponse = await chatService.generateResponse(text, history);

        // === STEP 5: CREATE ASSISTANT MESSAGE ===
        const assistantMsgId = uuidv4();
        const assistantMsg: Message = {
          id: assistantMsgId,
          role: 'assistant',
          content: '', // Will be filled progressively
          timestamp: Date.now(),
          isDeterministic: aiResponse.includes('[LIVE DATA]'),
        };

        // === STEP 6: PERSIST ASSISTANT MESSAGE PLACEHOLDER ===
        await addMessage(activeId, assistantMsg);

        setIsThinking(false);

        // 2026: Setup sync engine for this message
        setActiveSyncText(aiResponse);
        setActiveSyncMessageId(assistantMsgId);

        // Start TTS early for voice flows
        if (voiceFlowRef.current && settings.voiceEnabled && voiceAgentRef.current) {
          voiceAgentRef.current.speak(aiResponse).catch(console.error);
        }

        // 2026: 5-Word Look-Ahead text rendering
        const words = aiResponse.split(' ');
        const BUFFER_SIZE = 5;

        for (let i = 0; i < words.length; i++) {
          // Render with buffer look-ahead
          const visibleEndIndex = Math.min(i + BUFFER_SIZE, words.length);
          const currentText = words.slice(0, visibleEndIndex).join(' ');

          setConversations((prev) => {
            const index = prev.findIndex((c) => c.id === activeId);
            if (index === -1) return prev;
            const updated = [...prev];
            const conv = { ...updated[index] };
            conv.messages = conv.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, content: currentText } : m
            );
            updated[index] = conv;
            return updated;
          });

          // 2026: Typing speed - 150ms per word (synced with TTS estimation)
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        // Clear sync state
        setActiveSyncText('');
        setActiveSyncMessageId(null);

        // === STEP 7: FINAL PERSISTENCE WITH COMPLETE AI RESPONSE ===
        // Re-fetch conversation to get latest state
        setConversations((prev) => {
          const index = prev.findIndex((c) => c.id === activeId);
          if (index === -1) return prev;

          const updated = [...prev];
          const conv = { ...updated[index] };
          conv.messages = conv.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, content: aiResponse } : m
          );
          conv.updatedAt = Date.now();
          updated[index] = conv;

          // STRICT SAVE-ORDER: Persist final state
          storageService.saveConversation(conv);

          return updated;
        });

        // Reset text input active state
        if (source === 'text') {
          setIsTextInputActive(false);
        }
      } catch (error: unknown) {
        setIsThinking(false);
        setActiveSyncText('');
        setActiveSyncMessageId(null);
        const message = error instanceof Error ? error.message : 'Failed to get response';
        voiceAgentRef.current?.setError(message);

        // Save failed message for retry
        if (source === 'text') {
          setTextInputFailed({
            text,
            retryCount: (textInputFailed?.retryCount || 0) + 1,
            timestamp: Date.now(),
          });
          setIsTextInputActive(false);
        }
      }
    },
    [
      inputText,
      currentId,
      createConversation,
      addMessage,
      conversations,
      setConversations,
      settings.voiceEnabled,
      textInputFailed,
      isHydrationReady,
    ]
  );

  // Voice agent with state machine and sync integration
  const voiceAgent = useVoiceAgent({
    settings,
    onTranscript: handleTranscript,
    onResponseStart: () => setIsThinking(true),
    onResponseComplete: (text) => handleSend(text, 'voice'),
    onSyncWordChange: handleSyncWordChange,
  });

  // Keep ref in sync with voiceAgent methods
  useEffect(() => {
    voiceAgentRef.current = {
      speak: voiceAgent.speak,
      setError: voiceAgent.setError,
      isSpeaking: voiceAgent.isSpeaking,
      wordsBuffer: voiceAgent.wordsBuffer,
      currentSpokenWordIndex: voiceAgent.currentSpokenWordIndex,
    };
  }, [
    voiceAgent.speak,
    voiceAgent.setError,
    voiceAgent.isSpeaking,
    voiceAgent.wordsBuffer,
    voiceAgent.currentSpokenWordIndex,
  ]);

  // 2026: Build sync state for active speaking message
  const getSyncStateForMessage = useCallback(
    (messageId: string): SyncState | undefined => {
      if (messageId !== activeSyncMessageId || !activeSyncText) {
        return undefined;
      }

      // Build sync state from voice agent's current word buffer
      const words = activeSyncText.split(/\s+/).filter((w) => w.length > 0);
      const currentIndex = voiceAgent.currentSpokenWordIndex;
      const BUFFER_SIZE = 5;

      return {
        words: words.map((word, index) => ({
          word,
          index,
          state:
            index < currentIndex
              ? 'spoken'
              : index === currentIndex
              ? 'speaking'
              : index <= currentIndex + BUFFER_SIZE
              ? 'buffered'
              : 'pending',
        })),
        currentWordIndex: currentIndex,
        bufferEndIndex: Math.min(currentIndex + BUFFER_SIZE, words.length - 1),
        isPlaying: voiceAgent.isSpeaking,
        progress: words.length > 0 ? currentIndex / words.length : 0,
      };
    },
    [activeSyncMessageId, activeSyncText, voiceAgent.currentSpokenWordIndex, voiceAgent.isSpeaking]
  );

  // 2026: Handle text input changes - independent thread
  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
  }, []);

  // 2026: Text-specific send (bypasses voice entirely)
  const handleTextSend = useCallback(
    (textOverride?: string) => {
      const text = textOverride || inputText;
      if (!text.trim()) return;
      handleSend(text, 'text');
    },
    [inputText, handleSend]
  );

  // 2026: Retry failed text message
  const retryTextMessage = useCallback(() => {
    if (!textInputFailed) return;
    const text = textInputFailed.text;
    setTextInputFailed(null);
    handleSend(text, 'text');
  }, [textInputFailed, handleSend]);

  // Reset functionality
  const handleReset = useCallback(async () => {
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
      localStorage.clear();
      window.location.reload();
    }
  }, []);

  // Export conversations
  const handleExport = useCallback(async () => {
    const data = await storageService.getConversations();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxai_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }, []);

  // Import conversations
  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        for (const conv of data) {
          await storageService.saveConversation(conv);
        }
        window.location.reload();
      }
    } catch (error) {
      alert('Invalid JSON file');
    }
  }, []);

  // Theme effect
  useEffect(() => {
    const root = window.document.documentElement;
    const theme =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : settings.theme;

    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [settings.theme]);

  // 2026: Check if voice is locked (voice active = text disabled)
  const isVoiceLocked =
    voiceAgent.state === 'listening' || voiceAgent.state === 'processing';

  return {
    conversations,
    currentId,
    setCurrentId,
    currentConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    togglePin,
    inputText,
    setInputText: handleInputChange,
    voiceAgent,
    settings,
    updateSettings,
    isSettingsOpen,
    setIsSettingsOpen,
    isThinking,
    streamingText,
    handleSend: handleTextSend,
    handleReset,
    handleExport,
    handleImport,
    // 2026: New exports for sync engine and independent threads
    isVoiceLocked,
    isTextInputActive,
    textInputFailed,
    retryTextMessage,
    clearMessages,
    // 2026: Sync engine exports
    activeSyncMessageId,
    getSyncStateForMessage,
    // 2026: State integrity exports
    isHydrationReady,
    hydrationState,
  };
};
