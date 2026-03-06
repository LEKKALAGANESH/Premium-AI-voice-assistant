// Tab-Synergy Engine: Dynamic Title Sync with Breathing Animation
// Syncs document.title with voice state + conversation name
// Listening state: animated "..." dots cycling every 500ms

import { useEffect, useRef } from 'react';
import { Conversation } from '../types';

const APP_NAME = 'VoxAI';
const DEFAULT_TITLE = `${APP_NAME} | Your AI Mentor`;

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotCountRef = useRef(0);

  useEffect(() => {
    // Clear any previous dot animation
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const effectiveState = isThinking ? 'processing' : voiceState;

    if (effectiveState === 'listening') {
      // Breathing dots animation: "Listening", "Listening.", "Listening..", "Listening..."
      dotCountRef.current = 0;
      const update = () => {
        dotCountRef.current = (dotCountRef.current + 1) % 4;
        const dots = '.'.repeat(dotCountRef.current);
        document.title = `${APP_NAME} \u2022 Listening${dots}`;
      };
      update();
      intervalRef.current = setInterval(update, 500);
    } else if (effectiveState === 'speaking') {
      document.title = `${APP_NAME} \u2022 Speaking...`;
    } else if (effectiveState === 'processing') {
      document.title = `${APP_NAME} \u2022 Thinking...`;
    } else if (currentConversation) {
      const chatName = currentConversation.title || 'New Chat';
      document.title = `${chatName} | ${APP_NAME}`;
    } else {
      document.title = DEFAULT_TITLE;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [currentConversation, currentConversation?.title, isThinking, voiceState]);

  // Reset title on unmount
  useEffect(() => {
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);
};

export default useTitleSync;
