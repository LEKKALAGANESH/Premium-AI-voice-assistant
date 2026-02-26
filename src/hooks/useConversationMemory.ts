// 2026 Conversational Intelligence Layer: User Preference Memory Hook
// Implements: Location persistence, zero-friction retrieval, manual override

import { useState, useCallback, useEffect, useRef } from 'react';

// === TYPES ===
export interface UserPreferences {
  city: string | null;
  cityConfirmedAt: number | null;
  timezone: string | null;
  temperatureUnit: 'celsius' | 'fahrenheit';
  lastInteractionAt: number;
  conversationContext: ConversationContext;
}

export interface ConversationContext {
  lastTopic: string | null;
  lastIntent: string | null;
  pendingClarification: PendingClarification | null;
  recentEntities: RecentEntity[];
}

export interface PendingClarification {
  type: 'city' | 'confirmation' | 'choice';
  originalInput: string;
  suggestions: string[];
  confidence: number;
  timestamp: number;
}

export interface RecentEntity {
  type: 'city' | 'date' | 'time' | 'person' | 'location';
  value: string;
  confidence: number;
  timestamp: number;
}

export interface UseConversationMemoryReturn {
  preferences: UserPreferences;
  // City operations
  getCity: () => string | null;
  setCity: (city: string) => void;
  clearCity: () => void;
  hasCityStored: () => boolean;
  // Context operations
  setPendingClarification: (clarification: PendingClarification | null) => void;
  getPendingClarification: () => PendingClarification | null;
  addRecentEntity: (entity: Omit<RecentEntity, 'timestamp'>) => void;
  getRecentEntity: (type: RecentEntity['type']) => RecentEntity | null;
  // Intent tracking
  setLastIntent: (intent: string, topic?: string) => void;
  getLastIntent: () => { intent: string | null; topic: string | null };
  // Settings
  setTemperatureUnit: (unit: 'celsius' | 'fahrenheit') => void;
  // Utilities
  resetMemory: () => void;
  exportMemory: () => string;
  importMemory: (json: string) => boolean;
}

// === CONSTANTS ===
const STORAGE_KEY = 'voxai_user_preferences';
const MAX_RECENT_ENTITIES = 10;
const ENTITY_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

// === DEFAULT STATE ===
const DEFAULT_PREFERENCES: UserPreferences = {
  city: null,
  cityConfirmedAt: null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  temperatureUnit: 'celsius',
  lastInteractionAt: Date.now(),
  conversationContext: {
    lastTopic: null,
    lastIntent: null,
    pendingClarification: null,
    recentEntities: [],
  },
};

// === HOOK ===
export function useConversationMemory(): UseConversationMemoryReturn {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserPreferences;
        // Migrate old data if needed
        return {
          ...DEFAULT_PREFERENCES,
          ...parsed,
          conversationContext: {
            ...DEFAULT_PREFERENCES.conversationContext,
            ...parsed.conversationContext,
          },
        };
      }
    } catch (e) {
      console.warn('[ConversationMemory] Failed to load preferences:', e);
    }
    return DEFAULT_PREFERENCES;
  });

  // Ref for avoiding stale closures
  const preferencesRef = useRef(preferences);

  // Keep ref in sync
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (e) {
      console.warn('[ConversationMemory] Failed to save preferences:', e);
    }
  }, [preferences]);

  // Clean up expired entities periodically
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      setPreferences(prev => ({
        ...prev,
        conversationContext: {
          ...prev.conversationContext,
          recentEntities: prev.conversationContext.recentEntities.filter(
            e => now - e.timestamp < ENTITY_EXPIRY_MS
          ),
        },
      }));
    };

    const interval = setInterval(cleanup, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  // === CITY OPERATIONS ===
  const getCity = useCallback((): string | null => {
    return preferencesRef.current.city;
  }, []);

  const setCity = useCallback((city: string) => {
    const normalizedCity = city.trim();
    if (!normalizedCity) return;

    setPreferences(prev => ({
      ...prev,
      city: normalizedCity,
      cityConfirmedAt: Date.now(),
      lastInteractionAt: Date.now(),
      conversationContext: {
        ...prev.conversationContext,
        pendingClarification: null, // Clear any pending city clarification
      },
    }));
  }, []);

  const clearCity = useCallback(() => {
    setPreferences(prev => ({
      ...prev,
      city: null,
      cityConfirmedAt: null,
      lastInteractionAt: Date.now(),
    }));
  }, []);

  const hasCityStored = useCallback((): boolean => {
    return preferencesRef.current.city !== null;
  }, []);

  // === CONTEXT OPERATIONS ===
  const setPendingClarification = useCallback((clarification: PendingClarification | null) => {
    setPreferences(prev => ({
      ...prev,
      lastInteractionAt: Date.now(),
      conversationContext: {
        ...prev.conversationContext,
        pendingClarification: clarification,
      },
    }));
  }, []);

  const getPendingClarification = useCallback((): PendingClarification | null => {
    const clarification = preferencesRef.current.conversationContext.pendingClarification;
    // Expire clarifications after 2 minutes
    if (clarification && Date.now() - clarification.timestamp > 120000) {
      setPendingClarification(null);
      return null;
    }
    return clarification;
  }, [setPendingClarification]);

  const addRecentEntity = useCallback((entity: Omit<RecentEntity, 'timestamp'>) => {
    setPreferences(prev => {
      const newEntity: RecentEntity = {
        ...entity,
        timestamp: Date.now(),
      };

      // Remove duplicates of same type/value, keep most recent
      const filtered = prev.conversationContext.recentEntities.filter(
        e => !(e.type === entity.type && e.value.toLowerCase() === entity.value.toLowerCase())
      );

      // Add new entity and limit size
      const updated = [newEntity, ...filtered].slice(0, MAX_RECENT_ENTITIES);

      return {
        ...prev,
        lastInteractionAt: Date.now(),
        conversationContext: {
          ...prev.conversationContext,
          recentEntities: updated,
        },
      };
    });
  }, []);

  const getRecentEntity = useCallback((type: RecentEntity['type']): RecentEntity | null => {
    const entities = preferencesRef.current.conversationContext.recentEntities;
    const now = Date.now();

    // Find most recent non-expired entity of type
    const entity = entities.find(
      e => e.type === type && now - e.timestamp < ENTITY_EXPIRY_MS
    );

    return entity || null;
  }, []);

  // === INTENT TRACKING ===
  const setLastIntent = useCallback((intent: string, topic?: string) => {
    setPreferences(prev => ({
      ...prev,
      lastInteractionAt: Date.now(),
      conversationContext: {
        ...prev.conversationContext,
        lastIntent: intent,
        lastTopic: topic ?? prev.conversationContext.lastTopic,
      },
    }));
  }, []);

  const getLastIntent = useCallback(() => {
    const ctx = preferencesRef.current.conversationContext;
    return {
      intent: ctx.lastIntent,
      topic: ctx.lastTopic,
    };
  }, []);

  // === SETTINGS ===
  const setTemperatureUnit = useCallback((unit: 'celsius' | 'fahrenheit') => {
    setPreferences(prev => ({
      ...prev,
      temperatureUnit: unit,
      lastInteractionAt: Date.now(),
    }));
  }, []);

  // === UTILITIES ===
  const resetMemory = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const exportMemory = useCallback((): string => {
    return JSON.stringify(preferencesRef.current, null, 2);
  }, []);

  const importMemory = useCallback((json: string): boolean => {
    try {
      const parsed = JSON.parse(json) as UserPreferences;
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...parsed,
        conversationContext: {
          ...DEFAULT_PREFERENCES.conversationContext,
          ...parsed.conversationContext,
        },
      });
      return true;
    } catch (e) {
      console.error('[ConversationMemory] Import failed:', e);
      return false;
    }
  }, []);

  return {
    preferences,
    getCity,
    setCity,
    clearCity,
    hasCityStored,
    setPendingClarification,
    getPendingClarification,
    addRecentEntity,
    getRecentEntity,
    setLastIntent,
    getLastIntent,
    setTemperatureUnit,
    resetMemory,
    exportMemory,
    importMemory,
  };
}

export default useConversationMemory;
