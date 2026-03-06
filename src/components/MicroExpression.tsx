/**
 * MicroExpression.tsx
 * Humanoid feedback labels: "Listening...", "Thinking...", "Speaking..."
 * Renders below the voice button with fade-in/out transitions.
 */

import React, { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VoiceState } from '../types';

interface MicroExpressionProps {
  state: VoiceState;
  isConversationActive?: boolean;
  detectedLang?: string;
}

const STATE_LABELS: Record<VoiceState, string> = {
  idle: '',
  listening: 'Listening...',
  processing: 'Thinking...',
  speaking: 'Speaking...',
  error: 'Something went wrong',
};

const STATE_COLORS: Record<VoiceState, string> = {
  idle: 'text-zinc-400 dark:text-zinc-500',
  listening: 'text-brand-600 dark:text-brand-400',
  processing: 'text-amber-600 dark:text-amber-400',
  speaking: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-500 dark:text-red-400',
};

const MicroExpression: React.FC<MicroExpressionProps> = memo(({
  state,
  isConversationActive = false,
  detectedLang,
}) => {
  const label = useMemo(() => {
    if (state === 'idle' && isConversationActive) return 'Ready...';
    return STATE_LABELS[state];
  }, [state, isConversationActive]);

  const colorClass = useMemo(() => {
    if (state === 'idle' && isConversationActive) return 'text-brand-500 dark:text-brand-400';
    return STATE_COLORS[state];
  }, [state, isConversationActive]);

  const showLabel = label.length > 0;

  return (
    <AnimatePresence mode="wait">
      {showLabel && (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`text-center vox-text-xs font-medium tracking-wide ${colorClass}`}
          style={{ minHeight: '1.25rem' }}
          aria-live="polite"
        >
          {label}
          {detectedLang && state === 'listening' && (
            <span className="ml-1 opacity-60 uppercase text-[9px] tracking-widest">
              [{detectedLang}]
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

MicroExpression.displayName = 'MicroExpression';

export default MicroExpression;
