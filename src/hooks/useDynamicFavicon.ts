// Tab-Synergy Engine: Dynamic Favicon Generator
// Canvas-drawn favicons with state overlays, Base64 cached for zero network requests
// States: idle (standard), listening (red REC blink), speaking (blue wave), processing (amber dot)

import { useEffect, useRef } from 'react';
import { VoiceState } from '../types';

// Cache generated data URLs — never re-draw the same state
const FAVICON_CACHE = new Map<string, string>();

// Brand palette (matches Neural Orb / index.html favicon)
const BRAND_INDIGO = '#6366f1';
const REC_RED = '#ef4444';
const WAVE_BLUE = '#818cf8'; // indigo-400
const PROC_AMBER = '#f59e0b';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBaseLogo(ctx: CanvasRenderingContext2D, s: number) {
  // Indigo rounded square background
  drawRoundedRect(ctx, 0, 0, s, s, s * 0.2);
  ctx.fillStyle = BRAND_INDIGO;
  ctx.fill();

  // White audio bars (matching the SVG in index.html)
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.08);

  const cx = s / 2;
  const bars: [number, number, number][] = [
    [cx, 0.25, 0.75],           // center (tallest)
    [cx - s * 0.15, 0.35, 0.65], // inner left
    [cx + s * 0.15, 0.35, 0.65], // inner right
    [cx - s * 0.25, 0.45, 0.55], // outer left (shortest)
    [cx + s * 0.25, 0.45, 0.55], // outer right
  ];

  for (const [x, top, bot] of bars) {
    ctx.beginPath();
    ctx.moveTo(x, s * top);
    ctx.lineTo(x, s * bot);
    ctx.stroke();
  }
}

function drawCornerDot(
  ctx: CanvasRenderingContext2D, s: number, color: string, radius: number
) {
  const cx = s - radius - 1;
  const cy = s - radius - 1;

  // White border for contrast
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Colored dot
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSpeakingWave(ctx: CanvasRenderingContext2D, s: number) {
  // Blue wave curves in bottom-right quadrant
  const baseY = s * 0.78;
  ctx.strokeStyle = WAVE_BLUE;
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.lineCap = 'round';

  // Two concentric arcs (like sound emanating)
  for (let i = 0; i < 2; i++) {
    const r = s * (0.12 + i * 0.09);
    const cx = s - s * 0.18;
    const cy = baseY;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.globalAlpha = 1 - i * 0.35;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function generateFavicon(key: string): string {
  const cached = FAVICON_CACHE.get(key);
  if (cached) return cached;

  const s = 32;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  drawBaseLogo(ctx, s);

  switch (key) {
    case 'listening':
      drawCornerDot(ctx, s, REC_RED, s * 0.14);
      break;
    case 'speaking':
      drawSpeakingWave(ctx, s);
      break;
    case 'processing':
      drawCornerDot(ctx, s, PROC_AMBER, s * 0.11);
      break;
    // 'idle' — no overlay
  }

  const url = canvas.toDataURL('image/png');
  FAVICON_CACHE.set(key, url);
  return url;
}

export function useDynamicFavicon(voiceState: VoiceState) {
  const linkRef = useRef<HTMLLinkElement | null>(null);
  const blinkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevKeyRef = useRef('');

  // Grab the favicon <link> element on mount
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    linkRef.current = link;

    return () => {
      // Reset to idle favicon on unmount
      if (blinkRef.current) clearInterval(blinkRef.current);
      const idle = generateFavicon('idle');
      if (idle && linkRef.current) {
        linkRef.current.href = idle;
        linkRef.current.type = 'image/png';
      }
    };
  }, []);

  // Swap favicon when voice state changes
  useEffect(() => {
    const key = voiceState === 'error' ? 'idle' : voiceState;

    // Skip if same state
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    // Clear previous blink interval
    if (blinkRef.current) {
      clearInterval(blinkRef.current);
      blinkRef.current = null;
    }

    const setFavicon = (faviconKey: string) => {
      const url = generateFavicon(faviconKey);
      if (url && linkRef.current) {
        linkRef.current.type = 'image/png';
        linkRef.current.href = url;
      }
    };

    if (key === 'listening') {
      // Blink the REC dot: alternate between listening (dot) and idle (no dot)
      let on = true;
      setFavicon('listening');
      blinkRef.current = setInterval(() => {
        on = !on;
        setFavicon(on ? 'listening' : 'idle');
      }, 1000);
    } else {
      setFavicon(key);
    }

    return () => {
      if (blinkRef.current) {
        clearInterval(blinkRef.current);
        blinkRef.current = null;
      }
    };
  }, [voiceState]);
}

export default useDynamicFavicon;
