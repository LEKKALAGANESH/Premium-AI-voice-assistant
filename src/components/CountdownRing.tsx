// 2026 Standard: Countdown Ring for Smart-Silence Visualization
// Shows depleting ring around Super-Button during 2.5s silence countdown

import React, { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface CountdownRingProps {
  /** Progress value from 0-100 (0 = full ring, 100 = ring depleted) */
  progress: number;
  /** Whether the countdown is actively running */
  isActive: boolean;
  /** Size of the ring in pixels (default: 64) */
  size?: number;
  /** Stroke width of the ring (default: 3) */
  strokeWidth?: number;
  /** Whether in stable silence state (changes color) */
  isStableSilence?: boolean;
  /** Custom className for container */
  className?: string;
}

const CountdownRing = memo(({
  progress,
  isActive,
  size = 64,
  strokeWidth = 3,
  isStableSilence = false,
  className = '',
}: CountdownRingProps) => {
  // Calculate SVG properties
  const center = size / 2;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Ring depletes as progress increases (100 - progress for visual depletion effect)
  const strokeDashoffset = useMemo(() => {
    const normalizedProgress = Math.min(Math.max(progress, 0), 100);
    return circumference - (normalizedProgress / 100) * circumference;
  }, [progress, circumference]);

  // Color changes based on progress
  const ringColor = useMemo(() => {
    if (!isStableSilence) return 'url(#countdown-gradient-active)';

    // Progress-based color: green -> yellow -> orange -> red
    if (progress < 40) return 'url(#countdown-gradient-safe)';
    if (progress < 70) return 'url(#countdown-gradient-warning)';
    return 'url(#countdown-gradient-urgent)';
  }, [isStableSilence, progress]);

  // Pulse animation when near submission
  const shouldPulse = isStableSilence && progress > 70;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`absolute inset-0 -rotate-90 pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/* Gradient definitions */}
      <defs>
        {/* Active capturing gradient (brand colors) */}
        <linearGradient id="countdown-gradient-active" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>

        {/* Safe zone gradient (green) */}
        <linearGradient id="countdown-gradient-safe" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>

        {/* Warning zone gradient (yellow to orange) */}
        <linearGradient id="countdown-gradient-warning" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>

        {/* Urgent zone gradient (orange to red) */}
        <linearGradient id="countdown-gradient-urgent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>

        {/* Glow filter for urgent state */}
        <filter id="countdown-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background track ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-zinc-200 dark:text-zinc-800 opacity-50"
      />

      {/* Animated progress ring */}
      <AnimatePresence>
        {isActive && (
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: 0, opacity: 0 }}
            animate={{
              strokeDashoffset,
              opacity: 1,
              scale: shouldPulse ? [1, 1.02, 1] : 1,
            }}
            exit={{ opacity: 0 }}
            transition={{
              strokeDashoffset: { duration: 0.1, ease: 'linear' },
              opacity: { duration: 0.2 },
              scale: shouldPulse
                ? { repeat: Infinity, duration: 0.5, ease: 'easeInOut' }
                : {},
            }}
            filter={shouldPulse ? 'url(#countdown-glow)' : undefined}
          />
        )}
      </AnimatePresence>

      {/* Tick marks at 25%, 50%, 75% (optional visual guides) */}
      {isStableSilence && (
        <g className="opacity-30">
          {[0.25, 0.5, 0.75].map((fraction, i) => {
            const angle = (fraction * 360 - 90) * (Math.PI / 180);
            const x1 = center + (radius - 4) * Math.cos(angle);
            const y1 = center + (radius - 4) * Math.sin(angle);
            const x2 = center + (radius + 1) * Math.cos(angle);
            const y2 = center + (radius + 1) * Math.sin(angle);

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth={1}
                className="text-zinc-400 dark:text-zinc-600"
              />
            );
          })}
        </g>
      )}
    </svg>
  );
});

CountdownRing.displayName = 'CountdownRing';

export default CountdownRing;

// === UTILITY: Countdown Ring with Label ===
interface CountdownRingWithLabelProps extends CountdownRingProps {
  /** Label to show (e.g., remaining seconds) */
  label?: string;
  /** Label position */
  labelPosition?: 'inside' | 'below';
}

export const CountdownRingWithLabel = memo(({
  label,
  labelPosition = 'below',
  ...ringProps
}: CountdownRingWithLabelProps) => {
  const { size = 64, isActive, progress, isStableSilence } = ringProps;

  // Calculate remaining time for label
  const remainingSeconds = useMemo(() => {
    if (!isActive) return null;
    const remaining = ((100 - progress) / 100) * 2.5;
    return Math.max(0, Math.ceil(remaining * 10) / 10).toFixed(1);
  }, [isActive, progress]);

  return (
    <div className="relative inline-flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <CountdownRing {...ringProps} />
      </div>

      {/* Label below ring */}
      <AnimatePresence>
        {isStableSilence && labelPosition === 'below' && remainingSeconds && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 whitespace-nowrap"
          >
            {label || `${remainingSeconds}s`}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
});

CountdownRingWithLabel.displayName = 'CountdownRingWithLabel';
