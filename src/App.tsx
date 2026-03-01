// 2026 Standard: VoxAI App with Golden Ratio Layout System
// Responsive from 320px to 4K displays with Zero Layout Shift

import React, { useState, useCallback, useMemo, useRef, useEffect, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import Header from './components/Header';
import { useAppLogic } from './hooks/useAppLogic';

// Code Splitting: Lazy load heavy components for better initial load
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const VoiceTranslator = lazy(() => import('./components/VoiceTranslator').then(m => ({ default: m.VoiceTranslator })));
import { useTitleSync } from './hooks/useTitleSync';
import { useMobileSidebar } from './hooks/useMobileSidebar';
import { useKeyboardShortcuts, SHORTCUTS } from './hooks/useKeyboardShortcuts';
import { useErrorManager } from './hooks/useErrorManager';
import { AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';

import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorToastContainer } from './components/ErrorToast';

// App view types
type AppView = 'chat' | 'translator';

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
    // 2026: Column reveal animation
    columnRevealMessageId,
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // App view state for navigation between chat and translator
  const [currentView, setCurrentView] = useState<AppView>('chat');

  // 2026 Premium: Global error management
  const {
    errors,
    showError,
    dismissError,
  } = useErrorManager();

  // Sync voiceAgent errors to premium error system
  useEffect(() => {
    if (voiceAgent.voxError) {
      showError(voiceAgent.voxError);
    }
  }, [voiceAgent.voxError, showError]);

  // 2026: Keyboard shortcuts - trigger search from sidebar ref
  const triggerSearchOpen = useCallback(() => {
    // If in focus mode or mobile closed, expand first
    if (settings.focusMode) {
      updateSettings({ focusMode: false });
    }
    if (isMobile && !isMobileSidebarOpen) {
      toggleSidebar();
    }
    setIsSearchOpen(true);
  }, [settings.focusMode, updateSettings, isMobile, isMobileSidebarOpen, toggleSidebar]);

  // Toggle focus mode handler
  const toggleFocusMode = useCallback(() => {
    updateSettings({ focusMode: !settings.focusMode });
  }, [settings.focusMode, updateSettings]);

  // Toggle speak responses handler (Ctrl/Cmd + M)
  const toggleSpeakResponses = useCallback(() => {
    updateSettings({ speakResponses: !settings.speakResponses });
  }, [settings.speakResponses, updateSettings]);

  // Handle switching to translator view
  const openTranslator = useCallback(() => {
    setCurrentView('translator');
    closeSidebar();
  }, [closeSidebar]);

  // Handle returning to chat view
  const closeTranslator = useCallback(() => {
    setCurrentView('chat');
  }, []);

  // 2026: Global keyboard shortcuts
  useKeyboardShortcuts({
    onNewChat: createConversation,
    onOpenSettings: () => setIsSettingsOpen(true),
    onToggleSidebar: toggleSidebar,
    onToggleFocusMode: toggleFocusMode,
    onOpenSearch: triggerSearchOpen,
    onOpenTranslator: openTranslator,
    onToggleSpeakResponses: toggleSpeakResponses,
    disabled: {
      // Disable sidebar toggle in focus mode (use focus mode toggle instead)
      sidebar: settings.focusMode,
    },
  });

  // Handle theme toggle for translator
  const handleThemeToggle = useCallback(() => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: nextTheme });
  }, [settings.theme, updateSettings]);

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

  // Render Voice Translator view
  if (currentView === 'translator') {
    return (
      <ErrorBoundary>
        <div className="h-screen w-screen bg-white dark:bg-zinc-950">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse text-zinc-500">Loading translator...</div>
            </div>
          }>
            <VoiceTranslator
              theme={settings.theme}
              onThemeToggle={handleThemeToggle}
              onBack={closeTranslator}
            />
          </Suspense>
        </div>
      </ErrorBoundary>
    );
  }

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
              onOpenTranslator={openTranslator}
              isMobile={isMobile}
              isMobileOpen={isMobileSidebarOpen}
              onMobileClose={closeSidebar}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onSearchClear={handleSearchClear}
              isSearchOpen={isSearchOpen}
              onSearchOpenChange={setIsSearchOpen}
              shortcuts={SHORTCUTS}
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

          {/* 2026 Premium Error Toast System */}
          <ErrorToastContainer
            errors={errors}
            onDismiss={dismissError}
            onRetry={() => voiceAgent.startListening()}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />

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
            columnRevealMessageId={columnRevealMessageId}
          />
        </main>

        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdate={updateSettings}
            onReset={handleReset}
            onExport={handleExport}
            onImport={handleImport}
          />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
