// Browser-compatible logger for React applications
// Custom timestamp format: YYYY-MM-DD HH:MM:SS.fff
const timestampFormat = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
};

// Log levels
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

// Environment detection
const isDevelopment = (): boolean => {
  if (typeof window !== 'undefined') {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname.includes('dev');
  }
  return process.env.NODE_ENV !== 'production';
};

// Environment-based log level configuration
const getLogLevel = (): LogLevel => {
  return isDevelopment() ? LogLevel.DEBUG : LogLevel.WARN;
};

const currentLogLevel = getLogLevel();

// Format log message with timestamp and metadata
const formatMessage = (level: string, message: string, meta?: any): string => {
  const timestamp = timestampFormat();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
};

// Console styling for different log levels
const getConsoleStyle = (level: string): string => {
  switch (level.toLowerCase()) {
    case 'error': return 'color: #ef4444; font-weight: bold;';
    case 'warn': return 'color: #f59e0b; font-weight: bold;';
    case 'info': return 'color: #10b981;';
    case 'debug': return 'color: #6b7280;';
    default: return '';
  }
};

// Browser-compatible logger implementation
class BrowserLogger {
  private shouldLog(targetLevel: LogLevel): boolean {
    return targetLevel <= currentLogLevel;
  }

  private logToConsole(level: string, message: string, meta?: any): void {
    const formattedMessage = formatMessage(level, message, meta);
    const style = getConsoleStyle(level);
    
    if (style) {
      console.log(`%c${formattedMessage}`, style);
    } else {
      console.log(formattedMessage);
    }
  }

  private async logToServer(level: string, message: string, meta?: any): Promise<void> {
    // In a real application, you would send logs to a logging service
    // For now, we'll just store in localStorage with rotation
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        message,
        meta: meta || {},
        url: window.location.href,
        userAgent: navigator.userAgent
      };

      // Store in localStorage with key rotation (keep last 100 entries)
      const logKey = `app_log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(logKey, JSON.stringify(logEntry));

      // Clean up old logs (keep only last 100)
      const allKeys = Object.keys(localStorage).filter(key => key.startsWith('app_log_'));
      if (allKeys.length > 100) {
        allKeys.sort();
        const keysToRemove = allKeys.slice(0, allKeys.length - 100);
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    } catch (error) {
      // Silently fail if localStorage is not available
      console.warn('Failed to store log entry:', error);
    }
  }

  error(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.logToConsole('error', message, meta);
      this.logToServer('error', message, meta);
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.logToConsole('warn', message, meta);
      this.logToServer('warn', message, meta);
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.logToConsole('info', message, meta);
      this.logToServer('info', message, meta);
    }
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.logToConsole('debug', message, meta);
      // Don't send debug logs to server/storage in production
      if (currentLogLevel === LogLevel.DEBUG) {
        this.logToServer('debug', message, meta);
      }
    }
  }
}

// Create logger instance
const logger = new BrowserLogger();

// Helper functions for different log levels
export const log = {
  error: (message: string, meta?: any) => logger.error(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
};

// Development-only logging functions (no-op in production)
export const devLog = {
  log: isDevelopment() ? console.log : () => {},
  info: isDevelopment() ? console.info : () => {},
  debug: isDevelopment() ? console.debug : () => {},
  warn: console.warn, // Always show warnings
  error: console.error, // Always show errors
};

// Export logger instance for advanced usage
export { logger, isDevelopment };

// Default export
export default log;