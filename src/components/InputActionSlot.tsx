/**
 * InputActionSlot.tsx
 * 2026 Standard: Single Action Slot Architecture
 *
 * ARCHITECTURE RULES:
 * 1. Single 48px fixed-dimension action slot at right edge
 * 2. Conditional pivot: AI Core (empty) ↔ Send Arrow (has text)
 * 3. PROHIBITION: No position:absolute, no vertical flex columns, no simultaneous rendering
 * 4. Zero-shift layout: Textarea width remains 100% stable during morph
 *
 * FLEXBOX PROTOCOL:
 * - Input wrapper: flex-row, align-items: center
 * - Textarea: flex: 1 (fills available space)
 * - Action Slot: fixed 48px width/height
 */

import React, { useCallback, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { clsx } from 'clsx';
import { VoiceState } from '../types';
import AICoreButton from './AICoreButton';

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

const slotMorphTransitionOut = {
  duration: 0.15,
  ease: 'easeOut' as const,
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

  // Live transcription
  streamingText?: string;
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

  streamingText,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const regionId = useId();

  // Determine which button to show: Send (has text) or AI Core (empty)
  const hasText = inputText.trim().length > 0;
  const showSendButton = hasText && !isVoiceLocked;

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

  // Dynamic placeholder based on state
  const dynamicPlaceholder = isVoiceLocked
    ? 'Voice active...'
    : voiceState === 'speaking'
    ? 'AI speaking...'
    : placeholder;

  return (
    <div className="vox-input-container-golden">
      {/* WCAG 2.2 - Aria-live region for streaming text */}
      <div
        id={regionId}
        aria-live="polite"
        aria-atomic="false"
        className="sr-only"
      >
        {streamingText && `Transcribing: ${streamingText}`}
      </div>

      {/*
        MAIN INPUT WRAPPER
        Flexbox Protocol: flex-row, align-items: center
        Zero-shift guarantee: Textarea flex:1, Action Slot fixed 48px
      */}
      <div
        className={clsx(
          'vox-unified-input flex flex-row items-center transition-all',
          isVoiceLocked && 'ring-2 ring-brand-500/30'
        )}
        style={{
          gap: 'var(--vox-space-2)',
          padding: 'var(--vox-space-2)',
        }}
      >
        {/*
          TEXTAREA ZONE
          flex: 1 - Occupies all available horizontal space
          Width remains 100% stable regardless of action slot content
        */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Live transcription preview */}
          {streamingText && (
            <div
              className="text-zinc-400 italic vox-text-sm truncate"
              style={{
                padding: 'var(--vox-space-2) var(--vox-space-3) 0',
                fontSize: 'var(--vox-text-sm)',
              }}
              aria-live="polite"
            >
              <span className="animate-pulse">{streamingText}</span>
            </div>
          )}

          {/* Textarea - Independent text thread */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={dynamicPlaceholder}
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
          ACTION SLOT
          Fixed 48px x 48px container
          Single button at a time - conditional pivot via AnimatePresence

          PROHIBITION COMPLIANCE:
          - No position: absolute
          - No vertical flex column
          - No simultaneous button rendering
        */}
        <div
          className="flex items-center justify-center shrink-0"
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
