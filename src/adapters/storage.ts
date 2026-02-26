// 2026 State Integrity: StorageAdapter with Active ID Persistence
// REFACTORED: Transaction-safe operations for Unified Message Pipeline
// Implements: Atomic storage, conversation hydration, race condition prevention

import { Conversation, AppSettings, StorageAdapter, Message } from '../types';

const CONVERSATIONS_KEY = 'voxai_conversations';
const SETTINGS_KEY = 'voxai_settings';
const ACTIVE_CONVERSATION_KEY = 'voxai_active_conversation_id';

// 2026 UNIFIED PIPELINE: Operation lock for preventing concurrent storage writes
let storageLock = false;
const pendingWrites: Array<() => Promise<void>> = [];

// 2026 UNIFIED PIPELINE: Queue-based write executor to prevent race conditions
const executeWithLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  if (storageLock) {
    // Queue this operation and wait
    return new Promise((resolve, reject) => {
      pendingWrites.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  storageLock = true;
  try {
    const result = await operation();
    return result;
  } finally {
    storageLock = false;
    // Process next queued operation
    const next = pendingWrites.shift();
    if (next) {
      next();
    }
  }
};

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

  // 2026 UNIFIED PIPELINE: Thread-safe save with queue-based locking
  async saveConversation(conv: Conversation): Promise<void> {
    return executeWithLock(async () => {
      try {
        const conversations = await this.getConversationsInternal();
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
    });
  }

  // 2026 UNIFIED PIPELINE: Atomic message addition (read-modify-write in single lock)
  async addMessageToConversation(convId: string, message: Message): Promise<Conversation | null> {
    return executeWithLock(async () => {
      try {
        const conversations = await this.getConversationsInternal();
        const index = conversations.findIndex((c) => c.id === convId);
        if (index === -1) {
          console.error('[StorageAdapter] Conversation not found:', convId);
          return null;
        }

        // Atomic update
        const conv = conversations[index];
        const updatedConv: Conversation = {
          ...conv,
          messages: [...conv.messages, message],
          updatedAt: Date.now(),
        };

        // Auto-title on first user message
        if (updatedConv.title === 'New Chat' && message.role === 'user') {
          updatedConv.title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
        }

        conversations[index] = updatedConv;
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));

        return updatedConv;
      } catch (error) {
        console.error('[StorageAdapter] Failed to add message', error);
        throw new Error('STORAGE_UNAVAILABLE');
      }
    });
  }

  // Internal method without locking (for use within locked operations)
  private async getConversationsInternal(): Promise<Conversation[]> {
    try {
      const data = localStorage.getItem(CONVERSATIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[StorageAdapter] Failed to load conversations', error);
      throw new Error('STORAGE_UNAVAILABLE');
    }
  }

  // 2026 UNIFIED PIPELINE: Thread-safe delete with locking
  async deleteConversation(id: string): Promise<void> {
    return executeWithLock(async () => {
      try {
        const conversations = await this.getConversationsInternal();
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
    });
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
  // 2026 UNIFIED PIPELINE: Creates and persists conversation in single locked operation

  async createAndPersistConversation(title: string = 'New Chat'): Promise<Conversation> {
    return executeWithLock(async () => {
      const { v4: uuidv4 } = await import('uuid');
      const newConv: Conversation = {
        id: uuidv4(),
        title,
        messages: [],
        updatedAt: Date.now(),
      };

      // Atomic: Save to storage within the same lock
      const conversations = await this.getConversationsInternal();
      conversations.unshift(newConv);
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));

      // Atomic: Set as active IMMEDIATELY (still within lock)
      this.setActiveConversationIdSync(newConv.id);

      return newConv;
    });
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
