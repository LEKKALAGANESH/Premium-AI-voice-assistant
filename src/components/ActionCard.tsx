// ActionCard.tsx — Elegant Interaction Engine: Actionable Reminder Cards
// Parses AI responses for actionable items and renders premium interactive cards
// Pattern: [ACTION: title | description] or detected reminder/task patterns

import React, { memo, useCallback, useState } from 'react';
import { Bell, CheckCircle2, Clock, CalendarCheck } from 'lucide-react';

// ============================================================================
// ACTION ITEM PARSER
// ============================================================================

export interface ActionItem {
  title: string;
  description?: string;
  type: 'reminder' | 'task' | 'suggestion';
}

// Match explicit [ACTION: title | description] tags from AI
const ACTION_TAG_REGEX = /\[ACTION:\s*(.+?)(?:\s*\|\s*(.+?))?\]/g;

// Match natural reminder patterns like "Remind you to...", "Don't forget to..."
const REMINDER_PATTERNS = [
  /(?:remind(?:er)?|don'?t forget|remember)\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
  /(?:set a reminder|make a note)\s+(?:to\s+|for\s+)?(.+?)(?:\.|$)/gi,
];

/**
 * Extract actionable items from AI response text.
 * Returns the items and the cleaned text with action tags removed.
 */
export function extractActionItems(content: string): {
  items: ActionItem[];
  cleanedContent: string;
} {
  const items: ActionItem[] = [];
  let cleanedContent = content;

  // 1. Extract explicit [ACTION:] tags
  let match;
  while ((match = ACTION_TAG_REGEX.exec(content)) !== null) {
    items.push({
      title: match[1].trim(),
      description: match[2]?.trim(),
      type: 'reminder',
    });
  }
  // Remove tags from display text
  cleanedContent = cleanedContent.replace(ACTION_TAG_REGEX, '').trim();

  // 2. If no explicit tags, detect natural reminder patterns
  if (items.length === 0) {
    for (const pattern of REMINDER_PATTERNS) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const title = match[1].trim();
        if (title.length > 3 && title.length < 100) {
          items.push({ title, type: 'reminder' });
        }
      }
    }
  }

  return { items, cleanedContent };
}

// ============================================================================
// ACTION CARD COMPONENT
// ============================================================================

const TYPE_CONFIG = {
  reminder: { icon: Bell, label: 'Reminder', color: 'amber' },
  task: { icon: CalendarCheck, label: 'Task', color: 'blue' },
  suggestion: { icon: Clock, label: 'Suggestion', color: 'indigo' },
} as const;

interface ActionCardProps {
  item: ActionItem;
}

const ActionCard = memo(({ item }: ActionCardProps) => {
  const [activated, setActivated] = useState(false);
  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;

  const handleSetNow = useCallback(() => {
    setActivated(true);

    // Attempt to use system notification if available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`VoxAI Reminder: ${item.title}`, {
        body: item.description || 'Tap to view',
        icon: '/favicon.ico',
      });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(`VoxAI Reminder: ${item.title}`, {
            body: item.description || 'Tap to view',
            icon: '/favicon.ico',
          });
        }
      });
    }
  }, [item.title, item.description]);

  return (
    <div className="vox-action-card">
      <div className="vox-action-card-icon">
        {activated ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <Icon className={`w-4 h-4 text-${config.color}-500`} />
        )}
      </div>
      <div className="vox-action-card-content">
        <span className="vox-action-card-title">{item.title}</span>
        {item.description && (
          <span className="vox-action-card-desc">{item.description}</span>
        )}
      </div>
      <button
        onClick={handleSetNow}
        disabled={activated}
        className={`vox-action-card-btn ${activated ? 'activated' : ''}`}
        aria-label={activated ? 'Reminder set' : `Set reminder: ${item.title}`}
      >
        {activated ? 'Done' : 'Set Now'}
      </button>
    </div>
  );
});

ActionCard.displayName = 'ActionCard';

// ============================================================================
// ACTION CARD LIST (renders multiple cards)
// ============================================================================

interface ActionCardListProps {
  items: ActionItem[];
}

export const ActionCardList = memo(({ items }: ActionCardListProps) => {
  if (items.length === 0) return null;

  return (
    <div className="vox-action-card-list">
      {items.map((item, index) => (
        <ActionCard key={`${item.title}-${index}`} item={item} />
      ))}
    </div>
  );
});

ActionCardList.displayName = 'ActionCardList';

export default ActionCard;
