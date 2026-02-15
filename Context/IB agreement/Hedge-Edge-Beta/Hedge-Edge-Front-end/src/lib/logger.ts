/**
 * Centralized Logging Utility
 * ============================
 * Provides consistent logging across the application with:
 * - Log levels (debug, info, warn, error)
 * - Structured logging with context
 * - Production-safe (no sensitive data leakage)
 * - Optional remote logging support
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Component or module name */
  component?: string;
  /** User action that triggered the log */
  action?: string;
  /** Additional metadata (avoid sensitive data) */
  metadata?: Record<string, unknown>;
  /** Error object if applicable */
  error?: Error | unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

// Configuration
const isDev = import.meta.env.DEV;
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum log level based on environment
const MIN_LOG_LEVEL: LogLevel = isDev ? 'debug' : 'warn';

// In-memory log buffer for debugging (last 100 entries)
const LOG_BUFFER_SIZE = 100;
const logBuffer: LogEntry[] = [];

/**
 * Format error for safe logging (no stack traces in production)
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    if (isDev) {
      return `${error.name}: ${error.message}\n${error.stack || ''}`;
    }
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Sanitize context to remove potentially sensitive data
 */
function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined;
  
  const sanitized: LogContext = { ...context };
  
  // Remove error stack traces in production
  if (sanitized.error && !isDev) {
    sanitized.error = formatError(sanitized.error);
  }
  
  // Remove potentially sensitive metadata keys
  if (sanitized.metadata) {
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'credential'];
    const cleanMetadata: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(sanitized.metadata)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        cleanMetadata[key] = '[REDACTED]';
      } else {
        cleanMetadata[key] = value;
      }
    }
    sanitized.metadata = cleanMetadata;
  }
  
  return sanitized;
}

/**
 * Create a log entry
 */
function createLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: sanitizeContext(context),
  };
}

/**
 * Add entry to buffer (circular buffer)
 */
function addToBuffer(entry: LogEntry): void {
  if (logBuffer.length >= LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
  logBuffer.push(entry);
}

/**
 * Output log to console with appropriate styling
 */
function outputLog(entry: LogEntry): void {
  const { timestamp, level, message, context } = entry;
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const componentPrefix = context?.component ? `[${context.component}]` : '';
  const fullMessage = `${prefix}${componentPrefix} ${message}`;
  
  const styles: Record<LogLevel, string> = {
    debug: 'color: #888',
    info: 'color: #2196F3',
    warn: 'color: #FF9800',
    error: 'color: #F44336; font-weight: bold',
  };
  
  const consoleMethod = level === 'error' ? console.error :
                        level === 'warn' ? console.warn :
                        level === 'debug' ? console.debug :
                        console.log;
  
  if (isDev) {
    consoleMethod(`%c${fullMessage}`, styles[level], context?.metadata || '');
    if (context?.error) {
      consoleMethod('Error details:', context.error);
    }
  } else {
    // Simpler output in production
    consoleMethod(fullMessage);
  }
}

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  // Check if this level should be logged
  if (LOG_LEVELS[level] < LOG_LEVELS[MIN_LOG_LEVEL]) {
    return;
  }
  
  const entry = createLogEntry(level, message, context);
  addToBuffer(entry);
  outputLog(entry);
}

// ============================================================================
// Public API
// ============================================================================

export const logger = {
  /**
   * Debug level - development only, verbose information
   */
  debug: (message: string, context?: LogContext): void => {
    log('debug', message, context);
  },

  /**
   * Info level - general information about app flow
   */
  info: (message: string, context?: LogContext): void => {
    log('info', message, context);
  },

  /**
   * Warn level - potential issues that don't break functionality
   */
  warn: (message: string, context?: LogContext): void => {
    log('warn', message, context);
  },

  /**
   * Error level - errors that affect functionality
   */
  error: (message: string, context?: LogContext): void => {
    log('error', message, context);
  },

  /**
   * Get recent log entries (for debugging)
   */
  getRecentLogs: (count = 50): LogEntry[] => {
    return logBuffer.slice(-count);
  },

  /**
   * Clear log buffer
   */
  clearLogs: (): void => {
    logBuffer.length = 0;
  },

  /**
   * Create a scoped logger with a fixed component name
   */
  scope: (component: string) => ({
    debug: (message: string, context?: Omit<LogContext, 'component'>): void => {
      log('debug', message, { ...context, component });
    },
    info: (message: string, context?: Omit<LogContext, 'component'>): void => {
      log('info', message, { ...context, component });
    },
    warn: (message: string, context?: Omit<LogContext, 'component'>): void => {
      log('warn', message, { ...context, component });
    },
    error: (message: string, context?: Omit<LogContext, 'component'>): void => {
      log('error', message, { ...context, component });
    },
  }),
};

// ============================================================================
// Global Error Handlers
// ============================================================================

/**
 * Setup global error handlers for uncaught errors
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled Promise Rejection', {
      component: 'GlobalErrorHandler',
      error: event.reason,
      metadata: {
        type: 'unhandledrejection',
      },
    });
  });

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    logger.error('Uncaught Error', {
      component: 'GlobalErrorHandler',
      error: event.error,
      metadata: {
        type: 'error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  logger.info('Global error handlers initialized', {
    component: 'GlobalErrorHandler',
  });
}

export default logger;
