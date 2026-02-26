// 2026 Standard: Dynamic Title Sync Hook
// Syncs document.title with active conversation name

import { useEffect } from 'react';
import { Conversation } from '../types';

const DEFAULT_TITLE = 'VoxAI - Advanced Voice Assistant';
const APP_NAME = 'VoxAI';

interface UseTitleSyncOptions {
  currentConversation: Conversation | null | undefined;
  isThinking?: boolean;
  voiceState?: 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
}

export const useTitleSync = ({
  currentConversation,
  isThinking = false,
  voiceState = 'idle',
}: UseTitleSyncOptions) => {
  useEffect(() => {
    let title = DEFAULT_TITLE;

    if (currentConversation) {
      const chatName = currentConversation.title || 'New Chat';

      // Add status indicator prefix
      if (isThinking || voiceState === 'processing') {
        title = `⏳ ${chatName} | ${APP_NAME}`;
      } else if (voiceState === 'listening') {
        title = `🎤 ${chatName} | ${APP_NAME}`;
      } else if (voiceState === 'speaking') {
        title = `🔊 ${chatName} | ${APP_NAME}`;
      } else {
        title = `${chatName} | ${APP_NAME}`;
      }
    }

    document.title = title;

    // Cleanup: Reset to default on unmount
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [currentConversation, currentConversation?.title, isThinking, voiceState]);
};

export default useTitleSync;
