// LanguageSelector - 2026 Standard Language Dropdown Component
// Premium styled dropdown for selecting translation languages

import React, { memo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { ChevronDown, Check, Globe } from 'lucide-react';
import type { LanguageConfig, LanguageCode, Participant } from '../../types/translator';
import { SUPPORTED_LANGUAGES } from '../../types/translator';

interface LanguageSelectorProps {
  participant: Participant;
  selectedLanguage: LanguageConfig;
  onSelect: (language: LanguageConfig) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Premium language selector dropdown
 */
export const LanguageSelector = memo(function LanguageSelector({
  participant,
  selectedLanguage,
  onSelect,
  disabled = false,
  className,
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Color scheme based on participant
  const colorScheme = participant === 'A' ? 'blue' : 'emerald';
  const bgColor = participant === 'A' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20';
  const borderColor = participant === 'A' ? 'border-blue-200 dark:border-blue-800' : 'border-emerald-200 dark:border-emerald-800';
  const accentColor = participant === 'A' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400';

  // Filter languages based on search
  const filteredLanguages = SUPPORTED_LANGUAGES.filter(
    (lang) =>
      lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lang.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (language: LanguageConfig) => {
    onSelect(language);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={dropdownRef} className={clsx('relative', className)}>
      {/* Participant label */}
      <div
        className={clsx(
          'text-xs font-medium uppercase tracking-wider mb-2',
          accentColor
        )}
      >
        Person {participant}
      </div>

      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'w-full flex items-center justify-between gap-3 px-4 py-3',
          'rounded-xl border transition-all duration-200',
          bgColor,
          borderColor,
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:border-opacity-70 cursor-pointer'
        )}
        style={{ minHeight: 'var(--vox-touch-min)' }}
      >
        <div className="flex items-center gap-3">
          <Globe
            className={clsx('w-5 h-5', accentColor)}
            aria-hidden="true"
          />
          <div className="text-left">
            <div className="font-medium text-zinc-900 dark:text-zinc-100">
              {selectedLanguage.nativeName}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {selectedLanguage.code}
            </div>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown
            className="w-5 h-5 text-zinc-400"
            aria-hidden="true"
          />
        </motion.div>
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={clsx(
              'absolute z-50 w-full mt-2 py-2',
              'bg-white dark:bg-zinc-900 rounded-xl',
              'border border-zinc-200 dark:border-zinc-700',
              'shadow-lg max-h-80 overflow-hidden'
            )}
          >
            {/* Search input */}
            <div className="px-3 pb-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search languages..."
                className={clsx(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-zinc-100 dark:bg-zinc-800',
                  'border-none outline-none',
                  'placeholder:text-zinc-400 dark:placeholder:text-zinc-500'
                )}
              />
            </div>

            {/* Language list */}
            <div className="overflow-y-auto max-h-56 vox-ghost-scroll">
              {filteredLanguages.length === 0 ? (
                <div className="px-4 py-3 text-sm text-zinc-500 text-center">
                  No languages found
                </div>
              ) : (
                filteredLanguages.map((language) => {
                  const isSelected = language.code === selectedLanguage.code;

                  return (
                    <button
                      key={language.code}
                      type="button"
                      onClick={() => handleSelect(language)}
                      className={clsx(
                        'w-full flex items-center justify-between px-4 py-2.5',
                        'transition-colors duration-100',
                        isSelected
                          ? bgColor
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      )}
                    >
                      <div className="text-left">
                        <div
                          className={clsx(
                            'font-medium',
                            isSelected
                              ? accentColor
                              : 'text-zinc-900 dark:text-zinc-100'
                          )}
                        >
                          {language.nativeName}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {language.name} ({language.code})
                        </div>
                      </div>
                      {isSelected && (
                        <Check
                          className={clsx('w-4 h-4', accentColor)}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default LanguageSelector;
