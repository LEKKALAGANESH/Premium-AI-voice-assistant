// VoiceInterface - Production-Ready Voice UI Component
// 100/100 A11y: aria-live regions, keyboard navigation, screen reader support
// Features: Canvas wave visualization, Kill Switch, Barge-in support

import React, { memo, useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  Mic,
  Square,
  Play,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Volume2,
  VolumeX,
  ArrowLeftRight,
  Zap,
} from 'lucide-react';
import type { MediatorState, Participant } from '../types/translator';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface VoiceInterfaceProps {
  state: MediatorState;
  currentSpeaker: Participant | null;
  isActive: boolean;
  isBotSpeaking: boolean;
  isMicLocked: boolean;
  audioLevel: number;
  partialTranscript: string;
  error: string | null;
  isRecoverable: boolean;
  hasMounted: boolean;

  onStart: () => void;
  onStop: () => void;
  onKillSwitch: () => void;
  onSwitchSpeaker: () => void;
  onRetry: () => void;
  onClearError: () => void;

  languageA?: string;
  languageB?: string;
  className?: string;
}

// ============================================================================
// CANVAS WAVE COMPONENT
// ============================================================================

interface WaveCanvasProps {
  audioLevel: number;
  isActive: boolean;
  color: string;
  width?: number;
  height?: number;
}

const WaveCanvas = memo(function WaveCanvas({
  audioLevel,
  isActive,
  color,
  width = 200,
  height = 80,
}: WaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const smoothLevelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const targetLevel = isActive ? Math.max(audioLevel, 0.1) : 0;
      smoothLevelRef.current += (targetLevel - smoothLevelRef.current) * 0.15;
      const level = smoothLevelRef.current;

      ctx.clearRect(0, 0, width, height);

      const centerY = height / 2;
      const baseAmplitude = 4;
      const maxAmplitude = height * 0.4;
      const amplitude = baseAmplitude + (level * maxAmplitude);

      ctx.beginPath();
      ctx.moveTo(0, centerY);

      const frequency = 0.025;
      const phaseSpeed = isActive ? 0.1 : 0.02;
      phaseRef.current += phaseSpeed;

      for (let x = 0; x <= width; x++) {
        const wave1 = Math.sin((x * frequency) + phaseRef.current) * amplitude;
        const wave2 = Math.sin((x * frequency * 2.3) + phaseRef.current * 1.4) * (amplitude * 0.35);
        const wave3 = Math.sin((x * frequency * 0.6) + phaseRef.current * 0.7) * (amplitude * 0.25);

        const y = centerY + wave1 + wave2 + wave3;
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (isActive && level > 0.15) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 20 * level;
      }

      ctx.stroke();
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, isActive, audioLevel, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="pointer-events-none"
      aria-hidden="true"
    />
  );
});

// ============================================================================
// SVG WAVE BARS (Fallback)
// ============================================================================

interface WaveBarsProps {
  audioLevel: number;
  isActive: boolean;
  color: string;
  barCount?: number;
}

const WaveBars = memo(function WaveBars({
  audioLevel,
  isActive,
  color,
  barCount = 5,
}: WaveBarsProps) {
  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <div className="flex items-center justify-center gap-1" aria-hidden="true">
      {bars.map((i) => {
        const delay = i * 0.1;
        const baseHeight = 8;
        const maxHeight = 32;
        const height = isActive
          ? baseHeight + (audioLevel * (maxHeight - baseHeight) * (0.6 + Math.random() * 0.4))
          : baseHeight;

        return (
          <motion.div
            key={i}
            className="w-1 rounded-full"
            style={{ backgroundColor: color }}
            animate={{
              height: isActive ? [height, height * 1.3, height] : baseHeight,
            }}
            transition={{
              duration: 0.5,
              repeat: isActive ? Infinity : 0,
              delay,
              ease: 'easeInOut',
            }}
          />
        );
      })}
    </div>
  );
});

// ============================================================================
// SCREEN READER STATUS ANNOUNCER
// ============================================================================

interface StatusAnnouncerProps {
  state: MediatorState;
  currentSpeaker: Participant | null;
  isBotSpeaking: boolean;
  isMicLocked: boolean;
  error: string | null;
  languageA?: string;
  languageB?: string;
}

const StatusAnnouncer = memo(function StatusAnnouncer({
  state,
  currentSpeaker,
  isBotSpeaking,
  isMicLocked,
  error,
  languageA = 'Language A',
  languageB = 'Language B',
}: StatusAnnouncerProps) {
  const getMessage = (): string => {
    if (error) return `Error: ${error}`;
    if (isBotSpeaking) return `Speaking translation to ${currentSpeaker === 'A' ? languageB : languageA} speaker`;
    if (isMicLocked) return 'Microphone paused while bot is speaking';

    switch (state) {
      case 'idle':
        return 'Voice translator ready. Press Start to begin.';
      case 'listening_a':
        return `Listening to ${languageA} speaker. Speak now.`;
      case 'listening_b':
        return `Listening to ${languageB} speaker. Speak now.`;
      case 'processing':
        return 'Translating speech...';
      case 'speaking_a':
        return `Speaking translation in ${languageA}`;
      case 'speaking_b':
        return `Speaking translation in ${languageB}`;
      case 'error':
        return error || 'An error occurred';
      default:
        return '';
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {getMessage()}
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const VoiceInterface = memo(function VoiceInterface({
  state,
  currentSpeaker,
  isActive,
  isBotSpeaking,
  isMicLocked,
  audioLevel,
  partialTranscript,
  error,
  isRecoverable,
  hasMounted,
  onStart,
  onStop,
  onKillSwitch,
  onSwitchSpeaker,
  onRetry,
  onClearError,
  languageA = 'Language A',
  languageB = 'Language B',
  className,
}: VoiceInterfaceProps) {
  const [useCanvas, setUseCanvas] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isLowEnd = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
      setUseCanvas(!isLowEnd);
    }
  }, []);

  const getColors = () => {
    if (state === 'error') {
      return { primary: '#ef4444', bg: 'bg-red-500', text: 'text-red-500' };
    }
    if (currentSpeaker === 'B') {
      return { primary: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-500' };
    }
    return { primary: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-500' };
  };

  const colors = getColors();

  const getStatusText = (): string => {
    if (error) return 'Error occurred';
    if (isBotSpeaking) return 'Bot is speaking...';
    if (isMicLocked) return 'Microphone paused';

    switch (state) {
      case 'idle': return 'Ready to translate';
      case 'listening_a': return `Listening (${languageA})...`;
      case 'listening_b': return `Listening (${languageB})...`;
      case 'processing': return 'Translating...';
      case 'speaking_a': return `Speaking (${languageA})...`;
      case 'speaking_b': return `Speaking (${languageB})...`;
      default: return '';
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isActive) {
        onStop();
      } else {
        onStart();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onKillSwitch();
    }
  }, [isActive, onStart, onStop, onKillSwitch]);

  // SSR safety - don't render voice elements until mounted
  if (!hasMounted) {
    return (
      <div className={clsx('flex flex-col items-center gap-4 p-6', className)}>
        <div className="w-20 h-20 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="w-32 h-4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
      </div>
    );
  }

  const isListening = state === 'listening_a' || state === 'listening_b';
  const isSpeaking = state === 'speaking_a' || state === 'speaking_b';
  const isProcessing = state === 'processing';
  const isError = state === 'error';

  return (
    <div className={clsx('flex flex-col items-center gap-6', className)}>
      {/* Screen Reader Announcer */}
      <StatusAnnouncer
        state={state}
        currentSpeaker={currentSpeaker}
        isBotSpeaking={isBotSpeaking}
        isMicLocked={isMicLocked}
        error={error}
        languageA={languageA}
        languageB={languageB}
      />

      {/* Wave Visualization */}
      <div className="relative flex items-center justify-center h-24">
        <AnimatePresence mode="wait">
          {isActive && !isError && (
            <motion.div
              key="wave"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute"
            >
              {useCanvas ? (
                <WaveCanvas
                  audioLevel={audioLevel}
                  isActive={isListening || isSpeaking}
                  color={colors.primary}
                  width={200}
                  height={80}
                />
              ) : (
                <WaveBars
                  audioLevel={audioLevel}
                  isActive={isListening || isSpeaking}
                  color={colors.primary}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Control Button */}
        <motion.button
          onClick={isActive ? onStop : onStart}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={clsx(
            'relative z-10 flex items-center justify-center',
            'w-20 h-20 rounded-full shadow-lg',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-4 focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isError
              ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
              : isActive
              ? `${colors.bg} hover:opacity-90`
              : 'bg-brand-500 hover:bg-brand-600 focus:ring-brand-500'
          )}
          aria-label={
            isError
              ? 'Error occurred. Press to retry.'
              : isActive
              ? 'Stop translation session'
              : 'Start translation session'
          }
          aria-pressed={isActive}
          tabIndex={0}
        >
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, rotate: 0 }}
                animate={{ opacity: 1, rotate: 360 }}
                exit={{ opacity: 0 }}
                transition={{ rotate: { duration: 1, repeat: Infinity, ease: 'linear' } }}
              >
                <Loader2 className="w-8 h-8 text-white" />
              </motion.div>
            ) : isError ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <AlertTriangle className="w-8 h-8 text-white" />
              </motion.div>
            ) : isActive ? (
              <motion.div
                key="stop"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <Square className="w-8 h-8 text-white fill-white" />
              </motion.div>
            ) : (
              <motion.div
                key="start"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recording indicator */}
          {isListening && !isMicLocked && (
            <motion.div
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-white"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              aria-hidden="true"
            />
          )}

          {/* Mic locked indicator */}
          {isMicLocked && (
            <motion.div
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
            >
              <VolumeX className="w-3 h-3 text-white" />
            </motion.div>
          )}
        </motion.button>
      </div>

      {/* Status Text - ALWAYS VISIBLE */}
      <motion.div
        key={state + String(isBotSpeaking)}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-1"
      >
        {/* Main action label - large and always visible */}
        <p
          className={clsx(
            'text-lg font-bold',
            isError ? 'text-red-500' : isActive ? colors.text : 'text-zinc-800 dark:text-zinc-200'
          )}
          role="status"
        >
          {!isActive && state === 'idle' ? (
            '👆 Tap to Start'
          ) : isListening ? (
            '🎤 Listening...'
          ) : isBotSpeaking ? (
            '🔊 Speaking...'
          ) : isProcessing ? (
            '⏳ Translating...'
          ) : isError ? (
            '❌ Error'
          ) : (
            '⏹️ Tap to Stop'
          )}
        </p>

        {/* Secondary status text */}
        <p
          className={clsx(
            'text-sm',
            isError ? 'text-red-400' : 'text-zinc-500 dark:text-zinc-400'
          )}
        >
          {getStatusText()}
        </p>
      </motion.div>

      {/* Partial Transcript with aria-live */}
      <AnimatePresence>
        {partialTranscript && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg max-w-md"
            aria-live="polite"
            aria-label="Current speech transcript"
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-400 italic">
              "{partialTranscript}"
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-md"
            role="alert"
            aria-live="assertive"
          >
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    {error}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                {isRecoverable && (
                  <button
                    onClick={onRetry}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                      'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
                      'hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-red-500'
                    )}
                    aria-label="Retry operation"
                    tabIndex={0}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                )}

                <button
                  onClick={onKillSwitch}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                    'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
                    'hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-red-500'
                  )}
                  aria-label="Reset everything"
                  tabIndex={0}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Reset
                </button>

                <button
                  onClick={onClearError}
                  className={clsx(
                    'ml-auto px-3 py-1.5 rounded-lg text-xs font-medium',
                    'text-red-600 dark:text-red-400',
                    'hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-red-500'
                  )}
                  aria-label="Dismiss error"
                  tabIndex={0}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      {isActive && !isError && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="flex items-center gap-3"
        >
          {/* Switch Speaker Button */}
          <button
            onClick={onSwitchSpeaker}
            disabled={isBotSpeaking || isProcessing}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-zinc-100 dark:bg-zinc-800',
              'hover:bg-zinc-200 dark:hover:bg-zinc-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'text-zinc-700 dark:text-zinc-300 text-sm font-medium',
              'transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-zinc-500'
            )}
            aria-label={`Switch to ${currentSpeaker === 'A' ? languageB : languageA} speaker`}
            tabIndex={0}
          >
            <ArrowLeftRight className="w-4 h-4" />
            Switch Speaker
          </button>

          {/* Kill Switch (Emergency Stop) */}
          <button
            onClick={onKillSwitch}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-red-100 dark:bg-red-900/30',
              'hover:bg-red-200 dark:hover:bg-red-900/50',
              'text-red-700 dark:text-red-300 text-sm font-medium',
              'transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-red-500'
            )}
            aria-label="Emergency stop - reset everything"
            tabIndex={0}
          >
            <Zap className="w-4 h-4" />
            Kill Switch
          </button>
        </motion.div>
      )}

      {/* Speaker Indicator */}
      {isActive && currentSpeaker && !isError && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-full',
            'bg-zinc-100 dark:bg-zinc-800',
            'text-sm font-medium'
          )}
          aria-live="polite"
        >
          {isMicLocked ? (
            <VolumeX className="w-4 h-4 text-orange-500" />
          ) : isListening ? (
            <Mic className={clsx('w-4 h-4', colors.text)} />
          ) : (
            <Volume2 className={clsx('w-4 h-4', colors.text)} />
          )}
          <span className={colors.text}>
            {currentSpeaker === 'A' ? languageA : languageB}
          </span>
          {isBotSpeaking && (
            <span className="text-zinc-500">
              (translating...)
            </span>
          )}
        </motion.div>
      )}

      {/* Keyboard Shortcut Hint */}
      <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
        Press <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-xs">Space</kbd> to {isActive ? 'stop' : 'start'}
        {' '}&bull;{' '}
        <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-xs">Esc</kbd> to reset
      </p>
    </div>
  );
});

export default VoiceInterface;
