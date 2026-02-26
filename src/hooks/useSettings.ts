import { useState, useCallback, useEffect } from 'react';
import { AppSettings } from '../types';
import { storageService } from '../services/storage';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  sidebarCollapsed: false,
  voiceEnabled: true,
  voiceName: 'Charon',
  whisperMode: false,
  speechRate: 1.0,
  // 2026 Standard: Accessibility settings
  accessibilityAnnouncements: true,
  reducedMotion: false,
  // 2026 Standard: Global UI scale factor
  uiScale: 1.0,
  // 2026 Standard: Zen Focus Mode
  focusMode: false,
};

// Apply UI scale to CSS custom property
const applyUIScale = (scale: number) => {
  document.documentElement.style.setProperty('--vox-scale', String(scale));
};

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const load = async () => {
      const saved = await storageService.getSettings();
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...saved });
        applyUIScale(saved.uiScale ?? DEFAULT_SETTINGS.uiScale);
      }
    };
    load();
  }, []);

  // Apply scale changes to CSS
  useEffect(() => {
    applyUIScale(settings.uiScale);
  }, [settings.uiScale]);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      storageService.saveSettings(updated);
      return updated;
    });
  }, []);

  return {
    settings,
    updateSettings
  };
};
