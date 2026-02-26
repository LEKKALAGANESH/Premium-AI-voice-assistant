import { clsx } from "clsx";
import { AlertCircle, Loader2, Mic, RotateCcw, X, VolumeX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useCallback, useId } from "react";
import { VoiceState } from "../types";

interface SuperButtonProps {
  state: VoiceState;
  onClick: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  progress?: number; // VAD countdown ring (0-100)
  disabled?: boolean;
  hasRetry?: boolean; // 2026: Show retry glow for failed messages
  onRetry?: () => void; // 2026: Retry callback
  size?: "default" | "large"; // Voice bot can use larger size
  // 2026: Audio wake-up protocol
  audioMuted?: boolean; // True if audio needs user gesture to enable
  onAudioWakeUp?: () => Promise<boolean>; // Callback to wake up audio engine
}

// 2026 Standard: Enhanced waveform visualization for voice bot
const WaveformVisualization = ({ size }: { size: "default" | "large" }) => {
  const barCount = size === "large" ? 5 : 3;
  const heights =
    size === "large"
      ? [
          [8, 24, 8],
          [16, 36, 16],
          [24, 44, 24],
          [16, 36, 16],
          [8, 24, 8],
        ]
      : [
          [8, 24, 8],
          [16, 36, 16],
          [8, 24, 8],
        ];

  return (
    <div className="flex items-center gap-0.75" aria-hidden="true">
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ height: heights[i] }}
          transition={{
            repeat: Infinity,
            duration: 0.6,
            delay: i * 0.08,
            ease: "easeInOut",
          }}
          className={clsx(
            "bg-white rounded-full",
            size === "large" ? "w-1.5" : "w-1",
          )}
        />
      ))}
    </div>
  );
};

// 2026 Standard: Morphing icon with spring physics for voice bot
const MorphingVoiceIcon = ({
  state,
  hasRetry,
  size,
  audioMuted,
}: {
  state: VoiceState;
  hasRetry?: boolean;
  size: "default" | "large";
  audioMuted?: boolean;
}) => {
  const springTransition = {
    type: "spring" as const,
    stiffness: 400,
    damping: 25,
  };

  const iconSize = size === "large" ? "w-10 h-10" : "w-8 h-8";
  const smallIconSize = size === "large" ? "w-8 h-8" : "w-6 h-6";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
        transition={springTransition}
        className="flex flex-col items-center justify-center"
      >
        {state === "idle" && !audioMuted && (
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          >
            <Mic className={iconSize} />
          </motion.div>
        )}

        {state === "idle" && audioMuted && (
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          >
            <VolumeX className={iconSize} />
          </motion.div>
        )}

        {state === "listening" && (
          <div className="flex items-center gap-2">
            <WaveformVisualization size={size} />
            <span
              className={clsx(
                "font-bold tracking-tight uppercase",
                size === "large" ? "text-sm" : "text-xs",
              )}
            >
              End
            </span>
          </div>
        )}

        {state === "processing" && (
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
          >
            <Loader2 className={clsx(iconSize, "animate-spin")} />
          </motion.div>
        )}

        {state === "speaking" && <X className={iconSize} strokeWidth={2.5} />}

        {state === "error" && (
          <motion.div
            animate={hasRetry ? { scale: [1, 1.15, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
            className="flex flex-col items-center gap-1"
          >
            {hasRetry ? (
              <RotateCcw className={smallIconSize} />
            ) : (
              <AlertCircle className={iconSize} />
            )}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

const SuperButton = ({
  state,
  onClick,
  onLongPressStart,
  onLongPressEnd,
  progress = 0,
  disabled,
  hasRetry,
  onRetry,
  size = "default",
  audioMuted = false,
  onAudioWakeUp,
}: SuperButtonProps) => {
  const buttonId = useId();

  // 2026 Standard: Intelligent hover tooltips (no permanent labels)
  const tooltip = audioMuted
    ? "Click to enable audio"
    : {
        idle: "Tap to speak",
        listening: "Tap to end",
        processing: "Thinking...",
        speaking: "Tap to interrupt",
        error: hasRetry ? "Tap to retry" : "Tap to reset",
      }[state];

  // WCAG 2.2: Aria-live announcement
  const ariaLive = {
    idle: "Voice assistant ready. Tap or press Enter to start speaking.",
    listening: "Listening to your voice. Tap or press Enter to finish.",
    processing: "Processing your request. Please wait.",
    speaking: "AI is speaking. Tap or press Enter to interrupt.",
    error: hasRetry
      ? "An error occurred. Tap or press Enter to retry."
      : "An error occurred. Tap or press Enter to reset.",
  }[state];

  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isLongPress = React.useRef(false);

  const handlePointerDown = useCallback(() => {
    if (state !== "idle") return;
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPressStart?.();
    }, 500);
  }, [state, onLongPressStart]);

  const handlePointerUp = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isLongPress.current) {
      onLongPressEnd?.();
      isLongPress.current = false;
    } else {
      // 2026: Audio wake-up protocol - wake up audio engine on first click
      // This satisfies browser autoplay policies by initializing from user gesture
      if (onAudioWakeUp) {
        const audioReady = await onAudioWakeUp();
        if (!audioReady) {
          console.warn('[SuperButton] Audio wake-up failed');
          // Still proceed with click action
        }
      }

      if (state === "error" && hasRetry && onRetry) {
        onRetry();
      } else {
        onClick();
      }
    }
  }, [onClick, onLongPressEnd, state, hasRetry, onRetry, onAudioWakeUp]);

  const handlePointerCancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    isLongPress.current = false;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (state === "error" && hasRetry && onRetry) {
          onRetry();
        } else {
          onClick();
        }
      }
    },
    [onClick, state, hasRetry, onRetry],
  );

  // Button dimensions based on size
  const buttonSize = size === "large" ? 96 : 80; // 24x24 or 20x20 in tailwind units
  const ringRadius = size === "large" ? 42 : 36;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group">
        {/* 2026: Intelligent Hover Tooltip */}
        <div
          role="tooltip"
          id={`${buttonId}-tooltip`}
          className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold uppercase tracking-wider rounded-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-2xl"
        >
          {tooltip}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-zinc-900 dark:border-t-zinc-100" />
        </div>

        {/* WCAG 2.2: Aria-live region */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {ariaLive}
        </div>

        {/* 2026: Enhanced Countdown Ring with glow */}
        <svg
          className="absolute inset-0 -rotate-90 w-full h-full pointer-events-none"
          viewBox={`0 0 ${buttonSize} ${buttonSize}`}
          aria-hidden="true"
        >
          {/* Glow effect for listening state */}
          {state === "listening" && (
            <defs>
              <filter
                id="ring-glow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
          )}

          {/* Background ring */}
          <circle
            cx={buttonSize / 2}
            cy={buttonSize / 2}
            r={ringRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-zinc-200 dark:text-zinc-800"
          />

          {/* Progress ring */}
          {state === "listening" && (
            <motion.circle
              cx={buttonSize / 2}
              cy={buttonSize / 2}
              r={ringRadius}
              fill="none"
              stroke="url(#super-countdown-gradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              filter="url(#ring-glow)"
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 0.1, ease: "linear" }}
            />
          )}

          {/* Retry glow ring */}
          {state === "error" && hasRetry && (
            <motion.circle
              cx={buttonSize / 2}
              cy={buttonSize / 2}
              r={ringRadius}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-red-500"
              animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.02, 1] }}
              transition={{
                repeat: Infinity,
                duration: 1.2,
                ease: "easeInOut",
              }}
            />
          )}

          <defs>
            <linearGradient
              id="super-countdown-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>

        {/* 2026: Morphing Super-Button for Voice Bot */}
        <motion.button
          id={buttonId}
          aria-label={tooltip}
          aria-describedby={`${buttonId}-tooltip`}
          aria-busy={state === "processing"}
          aria-pressed={state === "listening"}
          disabled={disabled}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
          onKeyDown={handleKeyDown}
          whileHover={{ scale: disabled ? 1 : 1.05 }}
          whileTap={{ scale: disabled ? 1 : 0.95 }}
          className={clsx(
            "relative rounded-full flex items-center justify-center transition-all duration-200 shadow-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-brand-500",
            size === "large" ? "w-24 h-24" : "w-20 h-20",
            {
              "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700":
                state === "idle",
              "bg-brand-500 text-white shadow-brand-500/40":
                state === "listening",
              "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900":
                state === "processing",
              "bg-red-500 text-white hover:bg-red-600 shadow-red-500/30":
                state === "speaking",
              "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400":
                state === "error" && !hasRetry,
              "bg-red-500 text-white shadow-red-500/50":
                state === "error" && hasRetry,
            },
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <MorphingVoiceIcon state={state} hasRetry={hasRetry} size={size} audioMuted={audioMuted} />
        </motion.button>
      </div>
    </div>
  );
};

export default SuperButton;
