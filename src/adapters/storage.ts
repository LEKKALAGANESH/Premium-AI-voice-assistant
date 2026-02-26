// 2026 State Integrity: StorageAdapter with Active ID Persistence
// Implements: Atomic storage, conversation hydration, race condition prevention

import { Conversation, AppSettings, StorageAdapter } from '../types';

const CONVERSATIONS_KEY = 'voxai_conversations';
const SETTINGS_KEY = 'voxai_settings';
const ACTIVE_CONVERSATION_KEY = 'voxai_active_conversation_id';

export class LocalStorageAdapter implements StorageAdapter {
  // === CONVERSATION CRUD ===

  async getConversations(): Promise<Conversation[]> {
    try {
      const data = localStorage.getItem(CONVERSATIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[StorageAdapter] Failed to load conversations', error);
      throw new Error('STORAGE_UNAVAILABLE');
    }
  }

  async saveConversation(conv: Conversation): Promise<void> {
    try {
      const conversations = await this.getConversations();
      const index = conversations.findIndex((c) => c.id === conv.id);
      if (index > -1) {
        conversations[index] = conv;
      } else {
        conversations.unshift(conv); // New conversations at top
      }
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    } catch (error) {
      console.error('[StorageAdapter] Failed to save conversation', error);
      throw new Error('STORAGE_UNAVAILABLE');
    }
  }

  async deleteConversation(id: string): Promise<void> {
    try {
      const conversations = await this.getConversations();
      const filtered = conversations.filter((c) => c.id !== id);
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(filtered));

      // Clear active ID if deleted conversation was active
      const activeId = this.getActiveConversationIdSync();
      if (activeId === id) {
        this.clearActiveConversationId();
      }
    } catch (error) {
      console.error('[StorageAdapter] Failed to delete conversation', error);
      throw new Error('STORAGE_UNAVAILABLE');
    }
  }

  // === ACTIVE CONVERSATION ID PERSISTENCE ===
  // Critical: Must be synchronous for immediate restoration on app init

  getActiveConversationIdSync(): string | null {
    try {
      return localStorage.getItem(ACTIVE_CONVERSATION_KEY);
    } catch {
      return null;
    }
  }

  async getActiveConversationId(): Promise<string | null> {
    return this.getActiveConversationIdSync();
  }

  setActiveConversationIdSync(id: string | null): void {
    try {
      if (id) {
        localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
      }
    } catch (error) {
      console.error('[StorageAdapter] Failed to save active conversation ID', error);
    }
  }

  async setActiveConversationId(id: string | null): Promise<void> {
    this.setActiveConversationIdSync(id);
  }

  clearActiveConversationId(): void {
    try {
      localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    } catch (error) {
      console.error('[StorageAdapter] Failed to clear active conversation ID', error);
    }
  }

  // === ATOMIC CONVERSATION CREATION ===
  // Creates and persists conversation in single operation

  async createAndPersistConversation(title: string = 'New Chat'): Promise<Conversation> {
    const { v4: uuidv4 } = await import('uuid');
    const newConv: Conversation = {
      id: uuidv4(),
      title,
      messages: [],
      updatedAt: Date.now(),
    };

    // Atomic: Save to storage BEFORE returning
    await this.saveConversation(newConv);

    // Atomic: Set as active IMMEDIATELY
    this.setActiveConversationIdSync(newConv.id);

    return newConv;
  }

  // === SETTINGS ===

  async getSettings(): Promise<AppSettings | null> {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('[StorageAdapter] Failed to save settings', error);
    }
  }

  // === HYDRATION HELPERS ===

  async getMostRecentConversationId(): Promise<string | null> {
    const conversations = await this.getConversations();
    if (conversations.length === 0) return null;

    // Sort by updatedAt descending, return most recent
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    return sorted[0].id;
  }

  async validateActiveConversationId(id: string | null): Promise<string | null> {
    if (!id) return null;

    const conversations = await this.getConversations();
    const exists = conversations.some((c) => c.id === id);

    if (!exists) {
      // Active ID points to deleted conversation - clear it
      this.clearActiveConversationId();
      return null;
    }

    return id;
  }
}

/**
 * SupabaseAdapter Placeholder
 * Future extension point for cloud sync
 */
export class SupabaseAdapter implements StorageAdapter {
  async getConversations(): Promise<Conversation[]> {
    throw new Error('Not implemented');
  }
  async saveConversation(): Promise<void> {
    throw new Error('Not implemented');
  }
  async deleteConversation(): Promise<void> {
    throw new Error('Not implemented');
  }
  async getSettings(): Promise<AppSettings | null> {
    throw new Error('Not implemented');
  }
  async saveSettings(): Promise<void> {
    throw new Error('Not implemented');
  }
}
