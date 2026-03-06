/**
 * InputActionSlot.tsx
 * 2026 Standard: Single Action Slot Architecture + Integrated Mode Selector
 *
 * ARCHITECTURE RULES:
 * 1. Single 48px fixed-dimension action slot at right edge
 * 2. Conditional pivot: AI Core (empty) <-> Send Arrow (has text)
 * 3. Mode selector: 36px fixed between textarea and action slot
 * 4. Zero-shift layout: Textarea width remains 100% stable during morph
 *
 * FLEXBOX PROTOCOL:
 * - Input wrapper: flex-row, align-items: center
 * - Textarea: flex: 1 (fills available space)
 * - Mode Selector: fixed 36px width
 * - Action Slot: fixed 48px width/height
 */

import React, { useCallback, useRef, useId, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { clsx } from 'clsx';
import { VoiceState } from '../types';
import AICoreButton from './AICoreButton';
import ModeSelector from './ModeSelector';
import type { VoxMode } from '../lib/modes';

// === ANIMATION CONFIG FOR SLOT MORPHING ===

const slotMorphInitial = {
  opacity: 0,
  scale: 0.8,
  rotate: -15,
};

const slotMorphAnimate = {
  opacity: 1,
  scale: 1,
  rotate: 0,
};

const slotMorphExit = {
  opacity: 0,
  scale: 0.8,
  rotate: 15,
};

const slotMorphTransitionIn = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 30,
};

// === INTERFACES ===

interface InputActionSlotProps {
  // Text input state
  inputText: string;
  onInputChange: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;

  // Voice state
  voiceState: VoiceState;
  vadProgress?: number;
  silenceProgress?: number;
  isSilenceCountdown?: boolean;
  isVoiceLocked?: boolean;

  // Voice callbacks
  onVoiceClick: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;

  // Error handling
  hasRetry?: boolean;
  onRetry?: () => void;

  // Language + conversation state for visualizer
  detectedLang?: string;
  isConversationActive?: boolean;

  // Versatility Engine: Mode selector
  activeMode?: VoxMode;
  onModeChange?: (mode: VoxMode) => void;
}

const InputActionSlot: React.FC<InputActionSlotProps> = ({
  inputText,
  onInputChange,
  onSend,
  placeholder = 'Ask anything...',
  disabled = false,

  voiceState,
  vadProgress = 0,
  silenceProgress = 0,
  isSilenceCountdown = false,
  isVoiceLocked = false,

  onVoiceClick,
  onLongPressStart,
  onLongPressEnd,

  hasRetry = false,
  onRetry,

  detectedLang,
  isConversationActive,

  activeMode = 'assistant',
  onModeChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const regionId = useId();

  // Brain Shift: 2-second glow on mode change
  const [brainShiftActive, setBrainShiftActive] = useState(false);
  const prevModeRef = useRef(activeMode);

  useEffect(() => {
    if (prevModeRef.current !== activeMode) {
      prevModeRef.current = activeMode;
      setBrainShiftActive(true);
      const timer = setTimeout(() => setBrainShiftActive(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [activeMode]);

  // Determine which button to show: Send (has text) or AI Core (empty)
  const hasText = inputText.trim().length > 0;
  const showSendButton = hasText && !isVoiceLocked;
  // Voice is actively engaged (listening, processing, or speaking)
  const isVoiceActive = voiceState === 'listening' || voiceState === 'processing' || voiceState === 'speaking';

  // Keyboard handler for Enter to send
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (hasText && !isVoiceLocked && !disabled) {
          onSend();
        }
      }
    },
    [onSend, hasText, isVoiceLocked, disabled]
  );

  // Auto-resize textarea (max 5 lines ~120px)
  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="vox-input-container-golden">
      {/* WCAG 2.2 - Aria-live region */}
      <div
        id={regionId}
        aria-live="polite"
        aria-atomic="false"
        className="sr-only"
      />

      {/*
        MAIN INPUT WRAPPER
        Flexbox: [ Textarea (flex:1) | ModeSelector (36px) | ActionSlot (48px) ]
        Brain Shift: green glow ring on mode change for 2s
      */}
      <div
        className={clsx(
          'vox-unified-input flex flex-row items-center transition-all',
          isVoiceLocked && 'ring-2 ring-brand-500/30',
          isVoiceActive && 'voice-active',
          brainShiftActive && 'vox-brain-shift'
        )}
        style={{
          gap: 'var(--vox-space-2)',
          padding: 'var(--vox-space-2)',
        }}
      >
        {/*
          TEXTAREA ZONE
          flex: 1 - Occupies all available horizontal space
        */}
        <div className="vox-textarea-zone flex-1 flex flex-col min-w-0">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={placeholder}
            disabled={isVoiceLocked || disabled}
            aria-label="Message input"
            aria-describedby={regionId}
            rows={1}
            className={clsx(
              'w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none resize-none custom-scrollbar transition-opacity vox-text-sm',
              (isVoiceLocked || disabled) && 'opacity-50 cursor-not-allowed'
            )}
            style={{
              padding: 'var(--vox-space-3) var(--vox-space-2)',
              fontSize: 'var(--vox-text-sm)',
              maxHeight: '7.5rem', // 5 lines max
              minHeight: 'var(--vox-touch-min)',
            }}
          />
        </div>

        {/*
          MODE SELECTOR
          Fixed 36px - shows current mode icon, opens dropdown on tap
        */}
        {onModeChange && (
          <ModeSelector
            activeMode={activeMode}
            onModeChange={onModeChange}
            disabled={disabled || isVoiceLocked}
          />
        )}

        {/*
          ACTION SLOT
          Fixed 48px x 48px container
          Single button at a time - conditional pivot via AnimatePresence
        */}
        <div
          className={clsx(
            'vox-action-slot flex items-center justify-center shrink-0',
            isVoiceActive && 'vox-core-glow rounded-full'
          )}
          style={{
            width: '48px',
            height: '48px',
            minWidth: '48px',
            minHeight: '48px',
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {showSendButton ? (
              /* SEND BUTTON - When input has text */
              <motion.button
                key="send-button"
                initial={slotMorphInitial}
                animate={slotMorphAnimate}
                exit={slotMorphExit}
                transition={slotMorphTransitionIn}
                onClick={onSend}
                disabled={disabled}
                aria-label="Send message"
                className={clsx(
                  'w-12 h-12 rounded-full flex items-center justify-center',
                  'bg-brand-600 text-white hover:bg-brand-700',
                  'transition-colors duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <ArrowUp
                  className="w-5 h-5"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              </motion.button>
            ) : (
              /* AI CORE BUTTON - When input is empty */
              <motion.div
                key="ai-core-button"
                initial={slotMorphInitial}
                animate={slotMorphAnimate}
                exit={slotMorphExit}
                transition={slotMorphTransitionIn}
              >
                <AICoreButton
                  state={voiceState}
                  onClick={onVoiceClick}
                  onLongPressStart={onLongPressStart}
                  onLongPressEnd={onLongPressEnd}
                  progress={isSilenceCountdown ? silenceProgress : vadProgress}
                  disabled={disabled}
                  hasRetry={hasRetry}
                  onRetry={onRetry}
                  detectedLang={detectedLang}
                  isConversationActive={isConversationActive}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* AI disclaimer text */}
      <div className="text-center" style={{ marginTop: 'var(--vox-space-2)' }}>
        <span
          className="text-zinc-400 dark:text-zinc-500 vox-text-xs"
          style={{ fontSize: 'var(--vox-text-xs)' }}
        >
          VoxAI can make mistakes. Please verify important information.
        </span>
      </div>
    </div>
  );
};

export default InputActionSlot;
