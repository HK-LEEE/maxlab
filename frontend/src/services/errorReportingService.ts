/**
 * Error Reporting Service
 * Centralized error reporting and analytics for the application
 */

export interface ErrorReport {
  id: string;
  timestamp: string;
  level: 'critical' | 'error' | 'warning' | 'info';
  component: string;
  message: string;
  stack?: string;
  componentStack?: string;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
  buildVersion?: string;
  context?: Record<string, any>;
  tags?: string[];
}

export interface ErrorStats {
  totalErrors: number;
  criticalErrors: number;
  recentErrors: number;
  mostCommonErrors: Array<{ message: string; count: number }>;
  errorsByComponent: Array<{ component: string; count: number }>;
}

export class ErrorReportingService {
  private reports: ErrorReport[] = [];
  private maxReports = 100;
  private sessionId: string;
  private buildVersion: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.buildVersion = import.meta.env.VITE_BUILD_VERSION || 'development';
    this.loadStoredReports();
    this.setupGlobalErrorHandlers();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Load previously stored error reports
   */
  private loadStoredReports(): void {
    try {
      const stored = localStorage.getItem('errorReports');
      if (stored) {
        this.reports = JSON.parse(stored);
        // Clean old reports (older than 7 days)
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.reports = this.reports.filter(report => 
          new Date(report.timestamp).getTime() > sevenDaysAgo
        );
      }
    } catch (error) {
      console.warn('Failed to load stored error reports:', error);
      this.reports = [];
    }
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Global error handler
    window.addEventListener('error', (event) => {
      // Filter out ResizeObserver loop errors - these are harmless performance warnings
      if (event.message && event.message.includes('ResizeObserver loop completed with undelivered notifications')) {
        return; // Suppress ResizeObserver loop errors
      }
      
      this.reportError({
        component: 'Global',
        message: event.message,
        stack: event.error?.stack,
        level: 'error',
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.reportError({
        component: 'Promise',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        level: 'error',
        context: {
          reason: event.reason
        }
      });
    });

    // React error boundary integration
    (window as any).__REACT_ERROR_BOUNDARY_REPORTER__ = (error: Error, errorInfo: any) => {
      this.reportError({
        component: errorInfo.componentStack?.split('\n')[1]?.trim() || 'React Component',
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        level: 'error',
        context: errorInfo
      });
    };
  }

  /**
   * Report an error
   */
  reportError(params: {
    component: string;
    message: string;
    stack?: string;
    componentStack?: string;
    level?: 'critical' | 'error' | 'warning' | 'info';
    context?: Record<string, any>;
    tags?: string[];
  }): string {
    const report: ErrorReport = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      level: params.level || 'error',
      component: params.component,
      message: params.message,
      stack: params.stack,
      componentStack: params.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.getCurrentUserId(),
      sessionId: this.sessionId,
      buildVersion: this.buildVersion,
      context: params.context,
      tags: params.tags
    };

    // Add to reports array
    this.reports.push(report);

    // Maintain max reports limit
    if (this.reports.length > this.maxReports) {
      this.reports = this.reports.slice(-this.maxReports);
    }

    // Store in localStorage
    this.storeReports();

    // Log to console
    this.logError(report);

    // Send to external service (if configured)
    this.sendToExternalService(report);

    // Show critical errors to user
    if (report.level === 'critical') {
      this.notifyUser(report);
    }

    return report.id;
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get current user ID
   */
  private getCurrentUserId(): string | undefined {
    try {
      const user = localStorage.getItem('user');
      if (user) {
        return JSON.parse(user).id;
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  /**
   * Store reports in localStorage
   */
  private storeReports(): void {
    try {
      localStorage.setItem('errorReports', JSON.stringify(this.reports));
    } catch (error) {
      console.warn('Failed to store error reports:', error);
    }
  }

  /**
   * Log error to console with formatting
   */
  private logError(report: ErrorReport): void {
    const emoji = {
      critical: '🔴',
      error: '🟠',
      warning: '🟡',
      info: '🔵'
    }[report.level];

    console.group(`${emoji} Error Report [${report.level.toUpperCase()}] - ${report.component}`);
    console.error('Message:', report.message);
    console.error('ID:', report.id);
    console.error('Timestamp:', report.timestamp);
    console.error('URL:', report.url);
    console.error('Session:', report.sessionId);
    
    if (report.context) {
      console.error('Context:', report.context);
    }
    
    if (report.stack) {
      console.error('Stack:', report.stack);
    }
    
    if (report.componentStack) {
      console.error('Component Stack:', report.componentStack);
    }
    
    console.groupEnd();
  }

  /**
   * Send error to external service (Sentry, LogRocket, etc.)
   */
  private async sendToExternalService(report: ErrorReport): Promise<void> {
    // In a real application, you would send to services like:
    // - Sentry
    // - LogRocket
    // - Bugsnag
    // - Custom logging endpoint

    if (process.env.NODE_ENV === 'development') {
      // Don't send in development
      return;
    }

    try {
      // Example: Send to custom logging endpoint
      const endpoint = import.meta.env.VITE_ERROR_REPORTING_ENDPOINT;
      if (endpoint) {
        await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(report)
        });
      }
    } catch (error) {
      console.warn('Failed to send error report to external service:', error);
    }
  }

  /**
   * Notify user of critical errors
   */
  private notifyUser(report: ErrorReport): void {
    // Show user notification for critical errors
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Critical Error Detected', {
        body: `An error occurred in ${report.component}: ${report.message}`,
        icon: '/favicon.ico'
      });
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(timeframe?: number): ErrorStats {
    const since = timeframe ? Date.now() - timeframe : 0;
    const recentReports = this.reports.filter(report => 
      new Date(report.timestamp).getTime() > since
    );

    // Count errors by message
    const errorCounts = new Map<string, number>();
    recentReports.forEach(report => {
      const count = errorCounts.get(report.message) || 0;
      errorCounts.set(report.message, count + 1);
    });

    // Count errors by component
    const componentCounts = new Map<string, number>();
    recentReports.forEach(report => {
      const count = componentCounts.get(report.component) || 0;
      componentCounts.set(report.component, count + 1);
    });

    return {
      totalErrors: recentReports.length,
      criticalErrors: recentReports.filter(r => r.level === 'critical').length,
      recentErrors: recentReports.filter(r => 
        new Date(r.timestamp).getTime() > Date.now() - (24 * 60 * 60 * 1000)
      ).length,
      mostCommonErrors: Array.from(errorCounts.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      errorsByComponent: Array.from(componentCounts.entries())
        .map(([component, count]) => ({ component, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
  }

  /**
   * Get all error reports
   */
  getAllReports(): ErrorReport[] {
    return [...this.reports];
  }

  /**
   * Get recent error reports
   */
  getRecentReports(limit = 20): ErrorReport[] {
    return this.reports
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Clear all error reports
   */
  clearReports(): void {
    this.reports = [];
    localStorage.removeItem('errorReports');
  }

  /**
   * Export error reports
   */
  exportReports(): string {
    return JSON.stringify(this.reports, null, 2);
  }

  /**
   * Search error reports
   */
  searchReports(query: string): ErrorReport[] {
    const lowerQuery = query.toLowerCase();
    return this.reports.filter(report =>
      report.message.toLowerCase().includes(lowerQuery) ||
      report.component.toLowerCase().includes(lowerQuery) ||
      report.stack?.toLowerCase().includes(lowerQuery)
    );
  }
}

// Create singleton instance
export const errorReportingService = new ErrorReportingService();