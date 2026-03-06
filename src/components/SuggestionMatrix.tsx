// Discovery Engine: Animated 2x2 Suggestion Card Grid
// Context-aware cards with glassmorphism, staggered entry, and auto-fill on click

import React, { useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { getSuggestions } from '../lib/suggestions';
import type { VoxMode } from '../lib/modes';
import {
  Sun, Calendar, Coffee, Zap, Lightbulb, ListChecks,
  UtensilsCrossed, Music, Heart, Moon, Brain, Star,
  Sparkles, Globe, Rocket, PenTool, MessageCircle, BookOpen,
  Target, Route, MessageSquare, FileText, TrendingUp, GraduationCap,
  Languages, Repeat, Mic, Compass, Search, Skull, WandSparkles,
  Bug, Puzzle, FileCode2, GitBranch, Layout, Database, Swords,
} from 'lucide-react';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  sun: Sun,
  calendar: Calendar,
  coffee: Coffee,
  zap: Zap,
  lightbulb: Lightbulb,
  'list-checks': ListChecks,
  'utensils-crossed': UtensilsCrossed,
  music: Music,
  heart: Heart,
  moon: Moon,
  brain: Brain,
  star: Star,
  sparkles: Sparkles,
  globe: Globe,
  rocket: Rocket,
  'pen-tool': PenTool,
  'message-circle': MessageCircle,
  'book-open': BookOpen,
  target: Target,
  route: Route,
  'message-square': MessageSquare,
  'file-text': FileText,
  'trending-up': TrendingUp,
  'graduation-cap': GraduationCap,
  languages: Languages,
  repeat: Repeat,
  mic: Mic,
  compass: Compass,
  search: Search,
  skull: Skull,
  'wand-sparkles': WandSparkles,
  bug: Bug,
  puzzle: Puzzle,
  'file-code-2': FileCode2,
  'git-branch': GitBranch,
  layout: Layout,
  database: Database,
  swords: Swords,
};

interface SuggestionMatrixProps {
  activeMode: VoxMode;
  onInputChange: (text: string) => void;
  onSend: () => void;
}

const SuggestionMatrix: React.FC<SuggestionMatrixProps> = ({ activeMode, onInputChange, onSend }) => {
  // Memoize per mode — rotates on mount/mode-change
  const suggestions = useMemo(() => getSuggestions(activeMode), [activeMode]);

  // Auto-fill: type text into input, then trigger send after a beat
  const handleSelect = useCallback((prompt: string) => {
    onInputChange(prompt);
    // Short delay so user sees the text before it sends
    setTimeout(() => onSend(), 250);
  }, [onInputChange, onSend]);

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 w-full mx-auto"
      style={{ gap: 'var(--vox-space-3)', maxWidth: 'var(--vox-container-max)' }}
      role="group"
      aria-label="Suggested prompts"
    >
      {suggestions.map((s, i) => {
        const Icon = ICON_MAP[s.icon] || Sparkles;
        return (
          <motion.button
            key={`${activeMode}-${s.title}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: i * 0.1,
              duration: 0.4,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleSelect(s.prompt)}
            className="vox-suggestion-card text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 vox-touch-target"
            style={{
              padding: 'var(--vox-space-4)',
              borderRadius: 'var(--vox-radius-xl)',
              minHeight: 'var(--vox-touch-min)',
            }}
          >
            <div className="flex items-start" style={{ gap: 'var(--vox-space-3)' }}>
              <div
                className="vox-suggestion-icon shrink-0 flex items-center justify-center"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--vox-radius-lg)',
                }}
              >
                <Icon className="w-[18px] h-[18px]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span
                  className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors vox-text-sm"
                  style={{ fontSize: 'var(--vox-text-sm)', lineHeight: '1.4' }}
                >
                  {s.title}
                </span>
                <span
                  className="text-zinc-400 dark:text-zinc-500 vox-text-xs"
                  style={{ fontSize: 'var(--vox-text-xs)', lineHeight: '1.3' }}
                >
                  {s.subtitle}
                </span>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

export default SuggestionMatrix;
