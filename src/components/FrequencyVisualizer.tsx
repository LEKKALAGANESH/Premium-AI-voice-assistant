/**
 * FrequencyVisualizer.tsx
 * Dynamic waveform visualizer that changes color based on voice state.
 * Uses Canvas API for smooth 60fps rendering.
 *
 * Language-based color scheme:
 *   Default/English: Brand green (#22c55e)
 *   Hindi:           Saffron (#f97316)
 *   Telugu:          Teal (#14b8a6)
 *   Spanish:         Red (#ef4444)
 *   French:          Blue (#3b82f6)
 *   Generic active:  Brand pulse
 */

import React, { useRef, useEffect, useCallback, memo } from 'react';
import { VoiceState } from '../types';

// Language -> color mapping
const LANG_COLORS: Record<string, string> = {
  en: '#22c55e',   // Brand green
  hi: '#f97316',   // Saffron
  te: '#14b8a6',   // Teal
  es: '#ef4444',   // Red
  fr: '#3b82f6',   // Blue
  de: '#eab308',   // Yellow
  ja: '#ec4899',   // Pink
  ko: '#8b5cf6',   // Purple
  zh: '#f43f5e',   // Rose
  ar: '#06b6d4',   // Cyan
  default: '#22c55e',
};

interface FrequencyVisualizerProps {
  state: VoiceState;
  detectedLang?: string;
  size?: number;
  barCount?: number;
  className?: string;
}

const FrequencyVisualizer: React.FC<FrequencyVisualizerProps> = memo(({
  state,
  detectedLang,
  size = 120,
  barCount = 32,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);

  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isActive = isListening || isSpeaking;
  const isProcessing = state === 'processing';

  // Resolve color from detected language
  const langPrefix = detectedLang?.split('-')[0]?.toLowerCase() || 'default';
  const primaryColor = LANG_COLORS[langPrefix] || LANG_COLORS.default;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = size;
    const h = size;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = w * 0.28;

    phaseRef.current += isActive ? 0.04 : isProcessing ? 0.02 : 0.005;

    if (isActive || isProcessing) {
      // Draw frequency bars in a radial layout
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2;
        const noise = Math.sin(phaseRef.current + i * 0.5) * 0.5 +
                      Math.sin(phaseRef.current * 1.3 + i * 0.3) * 0.3 +
                      Math.sin(phaseRef.current * 2.1 + i * 0.7) * 0.2;

        // Neural Orb Lip Sync: modulate amplitude with vowel intensity when speaking
        const vowelIntensity = isSpeaking
          ? ((window as any).__voxVowelIntensity || 0) as number
          : 0;
        const lipSyncBoost = isSpeaking ? 0.2 + vowelIntensity * 0.5 : 0;

        const amplitude = isActive
          ? 0.3 + noise * (0.7 + lipSyncBoost)
          : 0.15 + noise * 0.25;

        const barLength = baseRadius * amplitude;
        const innerR = baseRadius - 2;
        const outerR = baseRadius + barLength;

        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * outerR;
        const y2 = cy + Math.sin(angle) * outerR;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = primaryColor;
        ctx.globalAlpha = 0.4 + amplitude * 0.6;
        ctx.lineWidth = Math.max(1.5, (w / barCount) * 0.6);
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Inner glow circle
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius - 4, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();

      // Pulsing outer ring
      const pulseRadius = baseRadius + 4 + Math.sin(phaseRef.current * 2) * 3;
      ctx.globalAlpha = 0.2 + Math.sin(phaseRef.current * 2) * 0.1;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Idle: subtle breathing circle
      const breathe = Math.sin(phaseRef.current) * 2;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius + breathe, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();

      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius + breathe, 0, Math.PI * 2);
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    animRef.current = requestAnimationFrame(draw);
  }, [isActive, isListening, isSpeaking, isProcessing, primaryColor, size, barCount]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  );
});

FrequencyVisualizer.displayName = 'FrequencyVisualizer';

export default FrequencyVisualizer;
export { LANG_COLORS };
