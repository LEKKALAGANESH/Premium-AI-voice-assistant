// 2026 Standard: Chat Window Header
// Left: VoxAI brand (permanent) | Center: Chat title (conditional)

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface HeaderProps {
  chatTitle?: string;
  hasActiveConversation: boolean;
}

const Header = ({
  chatTitle,
  hasActiveConversation,
}: HeaderProps) => {
  return (
    <header
      className="vox-chat-header flex items-center bg-white dark:bg-zinc-950"
      style={{
        height: 'var(--vox-header-height)',
        padding: '0 var(--vox-space-4)',
      }}
    >
      {/* LEFT ZONE: VoxAI Brand (permanent) */}
      <div className="flex items-center" style={{ minWidth: '80px' }}>
        <h1
          className="font-bold text-brand-600"
          style={{ fontSize: 'var(--vox-text-lg)' }}
        >
          VoxAI
        </h1>
      </div>

      {/* CENTER ZONE: Active Chat Title (Conditional) */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-4">
        <AnimatePresence mode="wait">
          {hasActiveConversation && chatTitle && (
            <motion.h2
              key="chat-title"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
              className="text-zinc-600 dark:text-zinc-400 truncate max-w-[400px] text-center"
              style={{ fontSize: 'var(--vox-text-sm)' }}
            >
              {chatTitle}
            </motion.h2>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT ZONE: Empty spacer for balance */}
      <div style={{ minWidth: '80px' }} />
    </header>
  );
};

export default Header;
