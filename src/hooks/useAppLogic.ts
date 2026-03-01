// 2026 State Integrity: App Logic with Strict Save-Order Protocol
// REFACTORED: Unified Message Pipeline - Single Path Mandate
// Implements: Atomic conversation creation, hydration guardrails, sequential persistence

import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useConversations } from './useConversations';
import { useVoiceAgent } from './useVoiceAgent';
import { useSettings } from './useSettings';
import { useSpeechTextSync, SyncState } from './useSpeechTextSync';
import { useAnalytics } from './useAnalytics';
import { chatService } from '../services/chat';
import { storageService } from '../services/storage';
import { Message, InputMode, FailedMessage, Conversation, MessageSource } from '../types';

// 2026 UNIFIED PIPELINE: Internal message source types for single-path routing
type InternalMessageSource = 'text' | 'voice' | 'suggestion' | 'deterministic';

// 2026 Analytics: Map internal source to analytics source type
const mapToAnalyticsSource = (source: InternalMessageSource): MessageSource => {
  switch (source) {
    case 'voice': return 'voice';
    case 'suggestion': return 'suggestion';
    case 'deterministic': return 'override';
    default: return 'typed';
  }
};

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
    // 2026 UNIFIED PIPELINE: New state integrity exports
    acquirePipelineLock,
    releasePipelineLock,
    isPipelineLocked,
    getLockedConversationId,
    updateMessageContent,
    getConversationById,
    // 2026 Analytics: Conversation analytics update
    updateConversationWithAnalytics,
  } = useConversations();

  const { settings, updateSettings } = useSettings();

  // 2026 Analytics: Latency engine hook
  const {
    startLatencyTimer,
    stopLatencyTimer,
    cancelLatencyTimer,
  } = useAnalytics();
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

  // 2026: Column reveal animation state (when speakResponses is OFF)
  const [columnRevealMessageId, setColumnRevealMessageId] = useState<string | null>(null);

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

  // ============================================================================
  // 2026 UNIFIED MESSAGE PIPELINE: Single-Path Master Function
  // ============================================================================
  // ALL message inputs MUST route through this function. No shortcuts allowed.
  // Atomic Sequence: Lock → Context → User Insert → Persist → AI → Insert → Persist → Unlock
  // ============================================================================
  const sendMessage = useCallback(
    async (text: string, source: InternalMessageSource = 'text'): Promise<boolean> => {
      // VALIDATION: Empty messages are silently rejected
      if (!text.trim()) {
        return false;
      }

      // GUARDRAIL 1: Block until hydration complete
      if (!isHydrationReady) {
        console.warn('[UNIFIED PIPELINE] Blocked: hydration not complete');
        return false;
      }

      // GUARDRAIL 2: Check if pipeline is already locked (concurrent send prevention)
      if (isPipelineLocked()) {
        console.warn('[UNIFIED PIPELINE] Blocked: pipeline already locked for',
          getLockedConversationId());
        return false;
      }

      // Generate unique operation ID for this pipeline execution
      const operationId = uuidv4();

      // Track source-specific behavior (using internal source types)
      const isVoiceFlow = source === 'voice';
      const isTextFlow = (source as InternalMessageSource) === 'text' || source === 'suggestion';

      if (isTextFlow) {
        voiceFlowRef.current = false;
        setIsTextInputActive(true);
      } else if (isVoiceFlow) {
        voiceFlowRef.current = true;
      }

      // ========================================
      // STEP 1: ATOMIC CONVERSATION CREATION
      // ========================================
      // If no active conversation, create one IMMEDIATELY and persist to storage
      let activeId = currentId;

      if (!activeId) {
        // ATOMIC: Create and persist in single operation - NO RACE CONDITIONS
        const newConv = await createConversation();
        activeId = newConv.id;
        // activeId is now persisted to localStorage via createConversation
      }

      // ========================================
      // STEP 2: ACQUIRE PIPELINE LOCK
      // ========================================
      // Lock the conversation to prevent mid-stream corruption
      const lockAcquired = acquirePipelineLock(activeId, operationId);
      if (!lockAcquired) {
        console.error('[UNIFIED PIPELINE] Failed to acquire lock');
        if (isTextFlow) setIsTextInputActive(false);
        return false;
      }

      // Get fresh conversation state (avoids stale closure)
      let activeConv = getConversationById(activeId);

      // Safety check - should never happen with proper hydration
      if (!activeConv) {
        console.error('[UNIFIED PIPELINE] Critical: No active conversation after creation');
        releasePipelineLock(operationId);
        if (isTextFlow) setIsTextInputActive(false);
        return false;
      }

      // Get conversation history AFTER ensuring conversation exists
      const history: Message[] = activeConv.messages;

      // ========================================
      // STEP 3: CREATE & PERSIST USER MESSAGE
      // ========================================
      const userMsgId = uuidv4();
      const now = Date.now();
      const analyticsSource = mapToAnalyticsSource(source);

      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: now,
        createdAt: now, // 2026 Analytics: Absolute timestamp
        source: analyticsSource, // 2026 Analytics: Message source
        confidence: isVoiceFlow ? voiceConfidenceRef.current : undefined,
      };

      // 2026 Analytics: Start latency timer when user message is submitted
      startLatencyTimer(userMsgId, analyticsSource);

      // STRICT SAVE-ORDER: Persist user message FIRST (await confirmation)
      await addMessage(activeId, userMsg);

      // Clear input state AFTER user message is persisted
      setInputText('');
      setStreamingText('');
      setIsThinking(true);

      try {
        // ========================================
        // STEP 4: GENERATE AI RESPONSE
        // ========================================
        const aiResponse = await chatService.generateResponse(text, history);

        // ========================================
        // STEP 5: CREATE & PERSIST ASSISTANT PLACEHOLDER
        // ========================================
        const assistantMsgId = uuidv4();
        const assistantTimestamp = Date.now();
        const assistantMsg: Message = {
          id: assistantMsgId,
          role: 'assistant',
          content: '', // Will be filled progressively
          timestamp: assistantTimestamp,
          createdAt: assistantTimestamp, // 2026 Analytics: Absolute timestamp
          isDeterministic: aiResponse.includes('[LIVE DATA]'),
          // latency will be set at final persistence
        };

        // STRICT SAVE-ORDER: Persist assistant placeholder FIRST
        await addMessage(activeId, assistantMsg);

        setIsThinking(false);

        // Setup sync engine for this message
        setActiveSyncText(aiResponse);
        setActiveSyncMessageId(assistantMsgId);

        // Start TTS for responses - voice flows always speak, text flows use speakResponses setting
        const shouldSpeak = settings.voiceEnabled && voiceAgentRef.current &&
          (isVoiceFlow || settings.speakResponses);
        if (shouldSpeak) {
          voiceAgentRef.current.speak(aiResponse).catch(console.error);
        }

        // ========================================
        // STEP 6: RENDERING (Progressive vs Instant based on TTS)
        // ========================================
        // 2026: When speakResponses is OFF in text flow, use instant reveal
        // with smooth column animation instead of word-by-word streaming
        const useInstantReveal = isTextFlow && !settings.speakResponses;

        if (useInstantReveal) {
          // INSTANT REVEAL: Show full text immediately with column animation
          // Rows appear fully, columns reveal with 100ms stagger via CSS
          setColumnRevealMessageId(assistantMsgId);
          await updateMessageContent(activeId, assistantMsgId, aiResponse, false);

          // Brief pause to allow animation to start before clearing states
          await new Promise((resolve) => setTimeout(resolve, 50));
        } else {
          // PROGRESSIVE RENDERING: Word-by-word with 5-word look-ahead
          const words = aiResponse.split(' ');
          const BUFFER_SIZE = 5;

          for (let i = 0; i < words.length; i++) {
            // GUARDRAIL: Check if lock is still ours (defensive)
            if (getLockedConversationId() !== activeId) {
              console.error('[UNIFIED PIPELINE] Lock stolen during rendering');
              break;
            }

            // Render with buffer look-ahead
            const visibleEndIndex = Math.min(i + BUFFER_SIZE, words.length);
            const currentText = words.slice(0, visibleEndIndex).join(' ');

            // Use updateMessageContent for efficient in-place update (no persist during stream)
            await updateMessageContent(activeId, assistantMsgId, currentText, false);

            // Typing speed - 150ms per word (synced with TTS estimation)
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }

        // Clear sync state
        setActiveSyncText('');
        setActiveSyncMessageId(null);

        // Clear column reveal after animation completes (~700ms)
        if (useInstantReveal) {
          setTimeout(() => setColumnRevealMessageId(null), 700);
        }

        // ========================================
        // STEP 7: FINAL PERSISTENCE WITH ANALYTICS
        // ========================================
        // 2026 Analytics: Stop latency timer and capture response time
        const latency = stopLatencyTimer(userMsgId);

        // Update with complete response, latency, AND persist
        await updateMessageContent(activeId, assistantMsgId, aiResponse, true, latency || undefined);

        // 2026 Analytics: Update conversation-level analytics
        if (updateConversationWithAnalytics) {
          await updateConversationWithAnalytics(activeId, latency || undefined);
        }

        // Reset text input state
        if (isTextFlow) {
          setIsTextInputActive(false);
        }

        // ========================================
        // STEP 8: RELEASE PIPELINE LOCK
        // ========================================
        releasePipelineLock(operationId);
        return true;

      } catch (error: unknown) {
        // ERROR HANDLING: Clean up state and release lock
        setIsThinking(false);
        setActiveSyncText('');
        setActiveSyncMessageId(null);

        // 2026 Analytics: Cancel latency timer on error
        cancelLatencyTimer(userMsgId);

        const message = error instanceof Error ? error.message : 'Failed to get response';
        voiceAgentRef.current?.setError(message);

        // Save failed message for retry
        if (isTextFlow) {
          setTextInputFailed({
            text,
            retryCount: (textInputFailed?.retryCount || 0) + 1,
            timestamp: Date.now(),
          });
          setIsTextInputActive(false);
        }

        // CRITICAL: Always release lock on error
        releasePipelineLock(operationId);
        return false;
      }
    },
    [
      currentId,
      createConversation,
      addMessage,
      settings.voiceEnabled,
      settings.speakResponses,
      textInputFailed,
      isHydrationReady,
      acquirePipelineLock,
      releasePipelineLock,
      isPipelineLocked,
      getLockedConversationId,
      updateMessageContent,
      getConversationById,
      // 2026 Analytics
      startLatencyTimer,
      stopLatencyTimer,
      cancelLatencyTimer,
      updateConversationWithAnalytics,
    ]
  );

  // ============================================================================
  // 2026 UNIFIED PIPELINE: Public Send Interface (LEGACY COMPATIBILITY)
  // ============================================================================
  // This wraps sendMessage to maintain backward compatibility with existing code
  const handleSend = useCallback(
    async (textOverride?: string, source: 'text' | 'voice' = 'text') => {
      const text = textOverride || inputText;
      await sendMessage(text, source as InternalMessageSource);
    },
    [inputText, sendMessage]
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

  // ============================================================================
  // 2026 UNIFIED PIPELINE: Text-Specific Entry Point
  // ============================================================================
  // Routes text input and suggestion clicks through the unified pipeline
  const handleTextSend = useCallback(
    (textOverride?: string) => {
      const text = textOverride || inputText;
      if (!text.trim()) return;
      // Determine source: if textOverride provided, it's likely a suggestion click
      const source: InternalMessageSource = textOverride ? 'suggestion' : 'text';
      sendMessage(text, source);
    },
    [inputText, sendMessage]
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
    // 2026: Column reveal animation (when speakResponses is OFF)
    columnRevealMessageId,
    // 2026: State integrity exports
    isHydrationReady,
    hydrationState,
    // 2026 UNIFIED PIPELINE: Direct access for advanced use cases
    sendMessage,
    isPipelineLocked,
  };
};
