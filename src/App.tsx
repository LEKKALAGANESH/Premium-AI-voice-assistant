// 2026 Standard: VoxAI App with Golden Ratio Layout System
// Responsive from 320px to 4K displays with Zero Layout Shift

import React, { useState, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import SettingsModal from './components/SettingsModal';
import Header from './components/Header';
import { useAppLogic } from './hooks/useAppLogic';
import { useTitleSync } from './hooks/useTitleSync';
import { useMobileSidebar } from './hooks/useMobileSidebar';
import { AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';

import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const {
    conversations,
    currentId,
    setCurrentId,
    currentConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    togglePin,
    inputText,
    setInputText,
    voiceAgent,
    settings,
    updateSettings,
    isSettingsOpen,
    setIsSettingsOpen,
    isThinking,
    streamingText,
    handleSend,
    handleReset,
    handleExport,
    handleImport,
    // 2026: Independent text thread props
    isVoiceLocked,
    textInputFailed,
    retryTextMessage,
  } = useAppLogic();

  // 2026: Mobile sidebar state management
  const {
    isMobile,
    isOpen: isMobileSidebarOpen,
    toggleSidebar,
    closeSidebar,
  } = useMobileSidebar(
    settings.sidebarCollapsed,
    () => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })
  );

  // 2026: Dynamic title sync with conversation name
  useTitleSync({
    currentConversation,
    isThinking,
    voiceState: voiceAgent.state,
  });

  // 2026: Conversational search state
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(conv =>
      conv.title.toLowerCase().includes(query) ||
      conv.messages.some(msg => msg.content.toLowerCase().includes(query))
    );
  }, [conversations, searchQuery]);

  return (
    <ErrorBoundary>
      {/* 2026 Golden Ratio Layout Wrapper - CSS Grid for zero layout shift */}
      <div
        className={clsx(
          'vox-layout-wrapper bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans',
          settings.focusMode && 'focus-mode'
        )}
      >
        {/* Sidebar Container - Fixed width, CSS transition */}
        {!settings.focusMode && (
          <div
            className={clsx(
              'vox-sidebar-container',
              settings.sidebarCollapsed && !isMobile && 'collapsed',
              isMobile && (isMobileSidebarOpen ? 'mobile-open' : '')
            )}
          >
            <Sidebar
              conversations={filteredConversations}
              currentId={currentId}
              collapsed={settings.sidebarCollapsed}
              onSelect={setCurrentId}
              onCreate={createConversation}
              onDelete={deleteConversation}
              onRename={renameConversation}
              onPin={togglePin}
              onToggle={toggleSidebar}
              onOpenSettings={() => setIsSettingsOpen(true)}
              isMobile={isMobile}
              isMobileOpen={isMobileSidebarOpen}
              onMobileClose={closeSidebar}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onSearchClear={handleSearchClear}
            />
          </div>
        )}

        {/* Mobile backdrop for drawer */}
        <AnimatePresence>
          {isMobile && isMobileSidebarOpen && !settings.focusMode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeSidebar}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              aria-hidden="true"
            />
          )}
        </AnimatePresence>

        {/* Chat Wrapper - Fills remaining space, centers content */}
        <main className="vox-chat-wrapper relative">
          {/* Chat Header - VoxAI brand + conditional title */}
          <Header
            chatTitle={currentConversation?.title}
            hasActiveConversation={!!currentConversation && currentConversation.messages.length > 0}
          />

          {/* Error notification - centered in container */}
          <AnimatePresence>
            {voiceAgent.error && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4"
                style={{ width: 'var(--vox-container-width)', maxWidth: 'var(--vox-container-max)' }}
              >
                <div
                  className="bg-red-50 dark:bg-red-900/20 vox-border-thin border-red-200 dark:border-red-800 flex items-center shadow-xl"
                  style={{
                    padding: 'var(--vox-space-4)',
                    borderRadius: 'var(--vox-radius-xl)',
                    gap: 'var(--vox-space-3)',
                  }}
                >
                  <AlertCircle
                    className="text-red-600 dark:text-red-400 shrink-0"
                    style={{ width: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)', height: 'clamp(1.125rem, 1.25vw + 0.5rem, 1.25rem)' }}
                  />
                  <p
                    className="font-medium text-red-800 dark:text-red-200 flex-1 vox-text-sm"
                    style={{ fontSize: 'var(--vox-text-sm)' }}
                  >
                    {voiceAgent.error}
                  </p>
                  <button
                    onClick={() => voiceAgent.setError(null)}
                    className="hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors vox-touch-target flex items-center justify-center"
                    style={{
                      padding: 'var(--vox-space-1)',
                      borderRadius: 'var(--vox-radius-md)',
                      minWidth: 'var(--vox-touch-min)',
                      minHeight: 'var(--vox-touch-min)',
                    }}
                    aria-label="Dismiss error"
                  >
                    <X
                      className="text-red-600 dark:text-red-400"
                      style={{ width: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)', height: 'clamp(0.875rem, 1vw + 0.375rem, 1rem)' }}
                    />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ChatWindow
            messages={currentConversation?.messages || []}
            voiceAgent={voiceAgent}
            isThinking={isThinking}
            inputText={inputText}
            streamingText={streamingText}
            onInputChange={setInputText}
            onSend={(text) => handleSend(text)}
            isVoiceLocked={isVoiceLocked}
            textInputFailed={textInputFailed}
            retryTextMessage={retryTextMessage}
            focusMode={settings.focusMode}
          />
        </main>

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onUpdate={updateSettings}
          onReset={handleReset}
          onExport={handleExport}
          onImport={handleImport}
        />
      </div>
    </ErrorBoundary>
  );
}
