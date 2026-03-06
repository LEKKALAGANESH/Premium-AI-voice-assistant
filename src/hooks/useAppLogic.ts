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
import { StreamProcessor } from '../lib/StreamProcessor';
import { VoiceQueue } from '../lib/VoiceQueue';
import { detectLocale } from '../lib/localeDetector';
import { Message, InputMode, FailedMessage, Conversation, MessageSource } from '../types';
import { getMode, VoxMode } from '../lib/modes';

// World-Wide Vox: Cloud TTS fallback — calls /api/ai/tts when no local voice exists
const cloudTtsFallback = async (text: string, lang: string): Promise<string | null> => {
  try {
    const response = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.audio || null;
  } catch {
    return null;
  }
};

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
    beginSpeaking: () => void;
    finishSpeaking: () => void;
    setError: (err: string | null) => void;
    isSpeaking: boolean;
    wordsBuffer: string[];
    currentSpokenWordIndex: number;
  } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  // Track intentional aborts (barge-in) vs unexpected ones
  const intentionalAbortRef = useRef(false);

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

  // Zero-Wait Engine: Live transcript shown in chat bubble while user speaks
  const [liveTranscript, setLiveTranscript] = useState('');

  // 2026: Handle transcript with confidence tracking
  const handleTranscript = useCallback(
    (text: string, isFinal: boolean, confidence: number) => {
      voiceConfidenceRef.current = confidence;
      if (isFinal) {
        setInputText('');
        setLiveTranscript('');
        voiceFlowRef.current = true;
      } else {
        setStreamingText(text);
        setLiveTranscript(text);
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
      setLiveTranscript('');
      setIsThinking(true);

      try {
        // ========================================
        // STEP 4: CREATE ASSISTANT PLACEHOLDER (before response)
        // ========================================
        const assistantMsgId = uuidv4();
        const assistantTimestamp = Date.now();
        const assistantMsg: Message = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: assistantTimestamp,
          createdAt: assistantTimestamp,
          isDeterministic: false,
        };
        await addMessage(activeId, assistantMsg);

        let aiResponse: string = '';

        // ========================================
        // STEP 5: GENERATE AI RESPONSE (branching)
        // ========================================
        // Versatility Engine: Resolve active mode config for TTS tuning + API routing
        const activeMode = getMode((settings.activeMode || 'assistant') as VoxMode);
        const modeSpeechRate = activeMode.speechRate;

        if (isVoiceFlow && settings.voiceEnabled && voiceAgentRef.current) {
          // ==============================================================
          // STREAMING VOICE PATH — Sub-second time-to-first-audio
          //
          // Pipeline: SSE chunks → StreamProcessor → VoiceQueue → speech
          // Voice starts the millisecond the first sentence boundary
          // (. ! ?) is detected — no waiting for the full response.
          // ==============================================================
          console.log('[PIPELINE] 🔊 Voice path activated — streaming TTS enabled');

          // Audio Priming: warm the browser's audio engine during API latency
          // VOICE RECOVERY: Use a single space ' ' instead of empty string ''
          // — empty string corrupts Chrome's speech engine state, causing silent drops.
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
            const primer = new SpeechSynthesisUtterance(' ');
            primer.volume = 0;
            window.speechSynthesis.speak(primer);
          }

          // Zero-Wait Engine: Ultra-aggressive sentence detection for sub-second TTFA
          const processor = new StreamProcessor({
            minSpeakableLength: 4,
            clauseThreshold: 20,
            maxBufferSize: 60,
            splitOnNewline: true,
          });

          // Promise that resolves when all queued speech finishes
          let resolveSpeechDone: (() => void) | null = null;
          const speechDone = new Promise<void>(r => { resolveSpeechDone = r; });
          let firstSentenceSpoken = false;

          const queue = new VoiceQueue({
            rate: modeSpeechRate,
            lang: 'en-US',
            cloudTtsFallback,
            onSpeakStart: () => {
              if (!firstSentenceSpoken) {
                firstSentenceSpoken = true;
                voiceAgentRef.current?.beginSpeaking();
              }
            },
            onDrained: () => {
              resolveSpeechDone?.();
              // Neural Orb: reset lip sync intensity when speech ends
              (window as any).__voxVowelIntensity = 0;
            },
            onWordBoundary: (word) => {
              // Neural Orb Lip Sync: compute vowel intensity for current word
              const vowels = (word.match(/[aeiouAEIOU]/g) || []).length;
              (window as any).__voxVowelIntensity = Math.min(vowels / 3, 1);
            },
          });

          const streamAbort = new AbortController();
          streamAbortRef.current = streamAbort;

          setIsThinking(false);

          let accumulatedText = '';
          let localeDetected = false;
          const MAX_RETRIES = 1;
          let retries = 0;
          let streamSuccess = false;

          while (!streamSuccess && retries <= MAX_RETRIES) {
            try {
              const streamAbortInner = retries > 0 ? new AbortController() : streamAbort;
              if (retries > 0) streamAbortRef.current = streamAbortInner;

              aiResponse = await chatService.streamResponse(
                text,
                history,
                (chunk) => {
                  accumulatedText += chunk;
                  // Progressive text rendering as chunks arrive
                  updateMessageContent(activeId, assistantMsgId, accumulatedText, false);
                  setStreamingText(accumulatedText);

                  // World-Wide Vox: Detect locale from first ~50 chars of response
                  if (!localeDetected && accumulatedText.length >= 50) {
                    localeDetected = true;
                    const { locale } = detectLocale(accumulatedText);
                    if (locale !== 'en-US') {
                      console.log('[PIPELINE] 🌍 Locale detected:', locale);
                      queue.updateConfig({ lang: locale });
                    }
                  }

                  // First-Period Trigger: detect sentence boundaries, enqueue immediately
                  const { segments } = processor.processChunk(chunk);
                  for (const seg of segments) {
                    console.log('[PIPELINE] 🔊 Enqueuing sentence (voice):', seg.text.substring(0, 50));
                    queue.enqueue(seg.text);
                  }
                },
                streamAbortInner.signal,
                settings.activeMode,
              );
              streamSuccess = true;
            } catch (err) {
              // AbortError from barge-in: clean up silently, don't retry
              if (err instanceof DOMException && err.name === 'AbortError') {
                queue.destroy();
                processor.reset();
                streamAbortRef.current = null;
                // Use whatever text we accumulated — exit the voice flow gracefully
                aiResponse = accumulatedText || text;
                streamSuccess = true; // don't retry aborts
                // Skip the TTS finalization below
                break;
              }

              retries++;
              if (retries > MAX_RETRIES) {
                queue.destroy();
                processor.reset();
                streamAbortRef.current = null;
                throw err;
              }
              // Brief pause before retry
              await new Promise(r => setTimeout(r, 500));
              console.warn(`[PIPELINE] Stream failed, retrying (${retries}/${MAX_RETRIES})...`);
            }
          }

          // Flush remaining text in the processor buffer
          const lastSegment = processor.flush();
          if (lastSegment) queue.enqueue(lastSegment.text);

          // Signal: no more sentences coming. onDrained fires after last sentence.
          queue.markStreamComplete();

          // Wait for ALL speech to finish before continuing
          await speechDone;

          queue.destroy();
          processor.reset();
          streamAbortRef.current = null;

          // Signal voice agent: done speaking, trigger loop-back to listening
          console.log('[PIPELINE] ✅ Voice path complete — all speech drained, calling finishSpeaking');
          voiceAgentRef.current.finishSpeaking();

          // Setup sync engine
          setActiveSyncText(aiResponse);
          setActiveSyncMessageId(assistantMsgId);

        } else {
          // ==============================================================
          // STREAMING TEXT PATH — Sub-second TTFT via SSE
          //
          // Pipeline: SSE chunks → progressive text update → immediate render
          // Text appears word-by-word as LLM generates. TTS starts in parallel.
          // ==============================================================

          const streamAbort = new AbortController();
          streamAbortRef.current = streamAbort;

          // Clear thinking indicator as soon as first chunk arrives
          let firstChunkReceived = false;
          let accumulatedText = '';

          // TTS setup: if speakResponses enabled, pipe through StreamProcessor + VoiceQueue
          const shouldSpeak = settings.voiceEnabled && voiceAgentRef.current && settings.speakResponses;
          console.log('[PIPELINE] Text path — shouldSpeak:', shouldSpeak);

          let ttsProcessor: StreamProcessor | null = null;
          let ttsQueue: VoiceQueue | null = null;
          let resolveTtsDone: (() => void) | null = null;
          let ttsDone: Promise<void> | null = null;
          let firstTtsSentence = false;

          if (shouldSpeak) {
            // VOX RECOVERY: Prime audio context for text-path TTS
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              window.speechSynthesis.cancel();
              if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
              }
              const primer = new SpeechSynthesisUtterance(' ');
              primer.volume = 0;
              window.speechSynthesis.speak(primer);
            }

            ttsProcessor = new StreamProcessor({
              minSpeakableLength: 5,
              clauseThreshold: 35,
              maxBufferSize: 100,
              splitOnNewline: true,
            });

            ttsDone = new Promise<void>(r => { resolveTtsDone = r; });

            ttsQueue = new VoiceQueue({
              rate: modeSpeechRate,
              lang: 'en-US',
              cloudTtsFallback,
              onSpeakStart: () => {
                if (!firstTtsSentence) {
                  firstTtsSentence = true;
                  voiceAgentRef.current?.beginSpeaking();
                }
              },
              onDrained: () => {
                resolveTtsDone?.();
                (window as any).__voxVowelIntensity = 0;
              },
              onWordBoundary: (word) => {
                const vowels = (word.match(/[aeiouAEIOU]/g) || []).length;
                (window as any).__voxVowelIntensity = Math.min(vowels / 3, 1);
              },
            });
          }

          let textLocaleDetected = false;

          try {
            aiResponse = await chatService.streamResponse(
              text,
              history,
              (chunk) => {
                if (!firstChunkReceived) {
                  firstChunkReceived = true;
                  setIsThinking(false);
                }
                accumulatedText += chunk;

                // AGENT 2: Incremental rendering — update bubble word-by-word as chunks arrive
                updateMessageContent(activeId, assistantMsgId, accumulatedText, false);

                // World-Wide Vox: Detect locale from first ~50 chars of response
                if (!textLocaleDetected && accumulatedText.length >= 50 && ttsQueue) {
                  textLocaleDetected = true;
                  const { locale } = detectLocale(accumulatedText);
                  if (locale !== 'en-US') {
                    console.log('[PIPELINE] 🌍 Text path locale detected:', locale);
                    ttsQueue.updateConfig({ lang: locale });
                  }
                }

                // AGENT 3: Parallel TTS — pipe text to speech without blocking text display
                if (shouldSpeak && ttsProcessor && ttsQueue) {
                  const { segments } = ttsProcessor.processChunk(chunk);
                  for (const seg of segments) {
                    console.log('[PIPELINE] 🔊 Enqueuing sentence (text):', seg.text.substring(0, 50));
                    ttsQueue.enqueue(seg.text);
                  }
                }
              },
              streamAbort.signal,
              settings.activeMode,
            );
          } catch (err) {
            ttsQueue?.destroy();
            ttsProcessor?.reset();
            streamAbortRef.current = null;
            throw err;
          }

          // If isThinking never got cleared (empty response edge case)
          if (!firstChunkReceived) {
            setIsThinking(false);
          }

          // Flush TTS buffer and wait for speech to finish
          if (shouldSpeak && ttsProcessor && ttsQueue) {
            const lastSeg = ttsProcessor.flush();
            if (lastSeg) {
              console.log('[PIPELINE] 🔊 Flushing last segment (text):', lastSeg.text.substring(0, 50));
              ttsQueue.enqueue(lastSeg.text);
            }
            ttsQueue.markStreamComplete();
            await ttsDone;
            ttsQueue.destroy();
            ttsProcessor.reset();
            console.log('[PIPELINE] ✅ Text path TTS complete — calling finishSpeaking');
            voiceAgentRef.current?.finishSpeaking();
          }

          streamAbortRef.current = null;

          // Setup sync engine
          setActiveSyncText(aiResponse);
          setActiveSyncMessageId(assistantMsgId);
        }

        // ========================================
        // STEP 7: CLEAR SYNC + FINAL PERSISTENCE
        // ========================================
        setActiveSyncText('');
        setActiveSyncMessageId(null);

        const latency = stopLatencyTimer(userMsgId);
        await updateMessageContent(activeId, assistantMsgId, aiResponse, true, latency || undefined);

        if (updateConversationWithAnalytics) {
          await updateConversationWithAnalytics(activeId, latency || undefined);
        }

        // ========================================
        // STEP 7b: SEMANTIC TITLE GENERATION
        // ========================================
        // Fire after first exchange (conversation had 0 msgs before this send)
        // Non-blocking: runs in background, updates sidebar when ready
        if (history.length === 0 && aiResponse) {
          chatService.generateTitle(text, aiResponse).then((title) => {
            if (title && title !== 'Chat') {
              renameConversation(activeId, title);
            }
          }).catch(() => {}); // swallow — title is non-critical
        }

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

        // AbortError from barge-in is intentional — suppress silently
        if (error instanceof DOMException && error.name === 'AbortError') {
          console.log('[PIPELINE] Stream aborted (barge-in) — suppressed');
          intentionalAbortRef.current = false;
          releasePipelineLock(operationId);
          if (isTextFlow) setIsTextInputActive(false);
          return false;
        }

        const message = error instanceof Error ? error.message : 'Failed to get response';

        // For voice flow: auto-restart listening after error instead of killing the loop
        if (isVoiceFlow && voiceAgentRef.current) {
          console.warn('[PIPELINE] Voice flow error, scheduling auto-recovery:', message);
          // Don't show error to user for transient failures — just restart listening
          setTimeout(() => {
            if (voiceAgentRef.current) {
              voiceAgentRef.current.setError(null);
            }
          }, 2000);
        }

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
      renameConversation,
      settings.voiceEnabled,
      settings.speakResponses,
      settings.speechRate,
      settings.activeMode,
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

  // Explicit barge-in handler: abort stream when user interrupts
  const handleInterrupt = useCallback(() => {
    if (streamAbortRef.current) {
      intentionalAbortRef.current = true;
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
  }, []);

  // Voice agent with state machine and sync integration
  const voiceAgent = useVoiceAgent({
    settings,
    onTranscript: handleTranscript,
    onResponseStart: () => setIsThinking(true),
    onResponseComplete: (text) => handleSend(text, 'voice'),
    onSyncWordChange: handleSyncWordChange,
    onInterrupt: handleInterrupt,
  });

  // Keep ref in sync with voiceAgent methods
  useEffect(() => {
    voiceAgentRef.current = {
      speak: voiceAgent.speak,
      beginSpeaking: voiceAgent.beginSpeaking,
      finishSpeaking: voiceAgent.finishSpeaking,
      setError: voiceAgent.setError,
      isSpeaking: voiceAgent.isSpeaking,
      wordsBuffer: voiceAgent.wordsBuffer,
      currentSpokenWordIndex: voiceAgent.currentSpokenWordIndex,
    };
  }, [
    voiceAgent.speak,
    voiceAgent.beginSpeaking,
    voiceAgent.finishSpeaking,
    voiceAgent.setError,
    voiceAgent.isSpeaking,
    voiceAgent.wordsBuffer,
    voiceAgent.currentSpokenWordIndex,
  ]);

  // Abort streaming fetch ONLY on explicit barge-in interrupt
  // Normal idle transitions (from finishSpeaking) must NOT abort — stream is already done
  useEffect(() => {
    if (voiceAgent.state === 'error') {
      // Error state: abort any active stream
      if (streamAbortRef.current) {
        intentionalAbortRef.current = true;
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
    }
    // idle state: DON'T abort — the voice pipeline manages its own lifecycle
    // streamAbortRef is cleared to null in the normal flow before finishSpeaking()
  }, [voiceAgent.state]);

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
    // Zero-Wait Engine: Live transcript for real-time user bubble
    liveTranscript,
    // 2026: State integrity exports
    isHydrationReady,
    hydrationState,
    // 2026 UNIFIED PIPELINE: Direct access for advanced use cases
    sendMessage,
    isPipelineLocked,
  };
};
