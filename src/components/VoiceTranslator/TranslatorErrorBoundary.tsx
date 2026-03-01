// TranslatorErrorBoundary - 2026 Standard Error Boundary for Voice Translator
// Catches and displays errors gracefully with recovery options

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, RefreshCw, ArrowLeft, Bug, Wifi, Mic, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface TranslatorErrorInfo {
  type: 'browser' | 'permission' | 'network' | 'audio' | 'runtime' | 'unknown';
  title: string;
  message: string;
  suggestion: string;
  recoverable: boolean;
  icon: ReactNode;
}

// Error classification based on error message patterns
const classifyError = (error: Error): TranslatorErrorInfo => {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Browser/API not supported
  if (
    message.includes('speechrecognition') ||
    message.includes('not supported') ||
    message.includes('undefined is not a constructor')
  ) {
    return {
      type: 'browser',
      title: 'Browser Not Supported',
      message: 'Your browser does not support the required speech features.',
      suggestion: 'Please use a modern browser like Chrome, Edge, or Safari.',
      recoverable: false,
      icon: <Bug className="w-8 h-8" />,
    };
  }

  // Permission errors
  if (
    message.includes('permission') ||
    message.includes('not allowed') ||
    message.includes('denied') ||
    name.includes('notallowed')
  ) {
    return {
      type: 'permission',
      title: 'Permission Required',
      message: 'Microphone access is required for voice translation.',
      suggestion: 'Please allow microphone access in your browser settings and try again.',
      recoverable: true,
      icon: <Mic className="w-8 h-8" />,
    };
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('offline') ||
    name.includes('typeerror')
  ) {
    return {
      type: 'network',
      title: 'Connection Error',
      message: 'Unable to connect to the translation service.',
      suggestion: 'Please check your internet connection and try again.',
      recoverable: true,
      icon: <Wifi className="w-8 h-8" />,
    };
  }

  // Audio errors
  if (
    message.includes('audio') ||
    message.includes('microphone') ||
    message.includes('speech') ||
    message.includes('voice')
  ) {
    return {
      type: 'audio',
      title: 'Audio Error',
      message: 'There was a problem with audio input or output.',
      suggestion: 'Please check your microphone and speaker settings.',
      recoverable: true,
      icon: <Volume2 className="w-8 h-8" />,
    };
  }

  // Runtime/JavaScript errors
  if (
    name.includes('reference') ||
    name.includes('type') ||
    name.includes('syntax') ||
    name.includes('range')
  ) {
    return {
      type: 'runtime',
      title: 'Application Error',
      message: 'An unexpected error occurred in the application.',
      suggestion: 'Please refresh the page. If the problem persists, contact support.',
      recoverable: true,
      icon: <Bug className="w-8 h-8" />,
    };
  }

  // Unknown/default
  return {
    type: 'unknown',
    title: 'Something Went Wrong',
    message: error.message || 'An unexpected error occurred.',
    suggestion: 'Please try again. If the problem persists, refresh the page.',
    recoverable: true,
    icon: <AlertTriangle className="w-8 h-8" />,
  };
};

// ============================================================================
// ERROR BOUNDARY PROPS & STATE
// ============================================================================

interface TranslatorErrorBoundaryProps {
  children: ReactNode;
  onBack?: () => void;
  onReset?: () => void;
  fallback?: ReactNode;
}

interface TranslatorErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  classifiedError: TranslatorErrorInfo | null;
  retryCount: number;
}

// ============================================================================
// ERROR BOUNDARY COMPONENT
// ============================================================================

export class TranslatorErrorBoundary extends Component<
  TranslatorErrorBoundaryProps,
  TranslatorErrorBoundaryState
> {
  constructor(props: TranslatorErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      classifiedError: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<TranslatorErrorBoundaryState> {
    return {
      hasError: true,
      error,
      classifiedError: classifyError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error for debugging
    console.error('[TranslatorErrorBoundary] Caught error:', error);
    console.error('[TranslatorErrorBoundary] Component stack:', errorInfo.componentStack);

    // You could also send to an error reporting service here
  }

  handleRetry = (): void => {
    const { onReset } = this.props;
    const { retryCount } = this.state;

    // Limit retries to prevent infinite loops
    if (retryCount >= 3) {
      console.warn('[TranslatorErrorBoundary] Max retries reached');
      return;
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      classifiedError: null,
      retryCount: retryCount + 1,
    });

    onReset?.();
  };

  handleBack = (): void => {
    const { onBack } = this.props;
    onBack?.();
  };

  handleRefresh = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { children, fallback, onBack } = this.props;
    const { hasError, classifiedError, error, retryCount } = this.state;

    if (hasError && classifiedError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      const canRetry = classifiedError.recoverable && retryCount < 3;
      const iconColorClass = {
        browser: 'text-orange-500',
        permission: 'text-yellow-500',
        network: 'text-blue-500',
        audio: 'text-purple-500',
        runtime: 'text-red-500',
        unknown: 'text-zinc-500',
      }[classifiedError.type];

      const bgColorClass = {
        browser: 'bg-orange-50 dark:bg-orange-900/20',
        permission: 'bg-yellow-50 dark:bg-yellow-900/20',
        network: 'bg-blue-50 dark:bg-blue-900/20',
        audio: 'bg-purple-50 dark:bg-purple-900/20',
        runtime: 'bg-red-50 dark:bg-red-900/20',
        unknown: 'bg-zinc-50 dark:bg-zinc-900/20',
      }[classifiedError.type];

      return (
        <div className="h-full w-full flex items-center justify-center bg-white dark:bg-zinc-950 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full"
          >
            {/* Error Card */}
            <div
              className={clsx(
                'rounded-2xl p-6 text-center',
                bgColorClass
              )}
            >
              {/* Icon */}
              <div
                className={clsx(
                  'mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center',
                  'bg-white dark:bg-zinc-800',
                  iconColorClass
                )}
              >
                {classifiedError.icon}
              </div>

              {/* Title */}
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                {classifiedError.title}
              </h2>

              {/* Message */}
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                {classifiedError.message}
              </p>

              {/* Suggestion */}
              <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-6">
                {classifiedError.suggestion}
              </p>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                {canRetry && (
                  <button
                    onClick={this.handleRetry}
                    className={clsx(
                      'flex items-center justify-center gap-2 px-6 py-3 rounded-xl',
                      'bg-brand-500 text-white font-medium',
                      'hover:bg-brand-600 transition-colors'
                    )}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                    {retryCount > 0 && (
                      <span className="text-xs opacity-75">
                        ({3 - retryCount} attempts left)
                      </span>
                    )}
                  </button>
                )}

                {!canRetry && (
                  <button
                    onClick={this.handleRefresh}
                    className={clsx(
                      'flex items-center justify-center gap-2 px-6 py-3 rounded-xl',
                      'bg-brand-500 text-white font-medium',
                      'hover:bg-brand-600 transition-colors'
                    )}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh Page
                  </button>
                )}

                {onBack && (
                  <button
                    onClick={this.handleBack}
                    className={clsx(
                      'flex items-center justify-center gap-2 px-6 py-3 rounded-xl',
                      'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
                      'hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors'
                    )}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Go Back to Chat
                  </button>
                )}
              </div>
            </div>

            {/* Technical Details (collapsible for debugging) */}
            {process.env.NODE_ENV === 'development' && error && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600">
                  Technical Details
                </summary>
                <pre className="mt-2 p-3 bg-zinc-100 dark:bg-zinc-900 rounded-lg text-xs overflow-auto max-h-40">
                  {error.stack || error.message}
                </pre>
              </details>
            )}
          </motion.div>
        </div>
      );
    }

    return children;
  }
}

export default TranslatorErrorBoundary;
