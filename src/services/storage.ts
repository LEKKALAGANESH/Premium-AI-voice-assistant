// 2026 State Integrity: Storage Service with Active ID Persistence
// Implements: Atomic operations, hydration support, strict save-order

import { Conversation, AppSettings } from '../types';
import { LocalStorageAdapter } from '../adapters/storage';

class StorageService {
  private adapter: LocalStorageAdapter;

  constructor(adapter: LocalStorageAdapter) {
    this.adapter = adapter;
  }

  // === CONVERSATION CRUD ===

  async getConversations(): Promise<Conversation[]> {
    return this.adapter.getConversations();
  }

  async saveConversation(conv: Conversation): Promise<void> {
    return this.adapter.saveConversation(conv);
  }

  async deleteConversation(id: string): Promise<void> {
    return this.adapter.deleteConversation(id);
  }

  // === ACTIVE CONVERSATION ID ===

  getActiveConversationIdSync(): string | null {
    return this.adapter.getActiveConversationIdSync();
  }

  async getActiveConversationId(): Promise<string | null> {
    return this.adapter.getActiveConversationId();
  }

  setActiveConversationIdSync(id: string | null): void {
    this.adapter.setActiveConversationIdSync(id);
  }

  async setActiveConversationId(id: string | null): Promise<void> {
    return this.adapter.setActiveConversationId(id);
  }

  // === ATOMIC OPERATIONS ===

  async createAndPersistConversation(title?: string): Promise<Conversation> {
    return this.adapter.createAndPersistConversation(title);
  }

  // === HYDRATION HELPERS ===

  async getMostRecentConversationId(): Promise<string | null> {
    return this.adapter.getMostRecentConversationId();
  }

  async validateActiveConversationId(id: string | null): Promise<string | null> {
    return this.adapter.validateActiveConversationId(id);
  }

  // === SETTINGS ===

  async getSettings(): Promise<AppSettings | null> {
    return this.adapter.getSettings();
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    return this.adapter.saveSettings(settings);
  }
}

// Singleton instance with default adapter
export const storageService = new StorageService(new LocalStorageAdapter());
