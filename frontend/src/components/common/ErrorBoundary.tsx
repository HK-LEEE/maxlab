/**
 * React Error Boundary Component
 * Provides comprehensive error handling and recovery for React components
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId: string;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: ErrorInfo, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'component' | 'critical';
  name?: string;
  showDetails?: boolean;
  enableRetry?: boolean;
  enableRefresh?: boolean;
  enableHome?: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId?: NodeJS.Timeout;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorId: this.generateErrorId()
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: Date.now().toString(36) + Math.random().toString(36).substr(2)
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error to console
    console.group(`🚨 Error Boundary Caught Error [${this.props.name || 'Unknown'}]`);
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();

    // Report error to external service
    this.reportError(error, errorInfo);

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private generateErrorId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // In a real application, you would send this to an error reporting service
    // like Sentry, LogRocket, or Bugsnag
    const errorReport = {
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
      level: this.props.level || 'component',
      component: this.props.name || 'Unknown',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).id : 'anonymous'
    };

    // Store locally for debugging
    const existingReports = JSON.parse(localStorage.getItem('errorReports') || '[]');
    existingReports.push(errorReport);
    
    // Keep only last 50 error reports
    if (existingReports.length > 50) {
      existingReports.splice(0, existingReports.length - 50);
    }
    
    localStorage.setItem('errorReports', JSON.stringify(existingReports));

    console.log('📋 Error Report Generated:', errorReport);
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorId: this.generateErrorId()
    });
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private getErrorTitle(): string {
    const { level, name } = this.props;
    
    if (level === 'critical') {
      return 'Critical System Error';
    } else if (level === 'page') {
      return 'Page Error';
    } else {
      return `${name || 'Component'} Error`;
    }
  }

  private getErrorMessage(): string {
    const { error } = this.state;
    const { level } = this.props;

    if (!error) return 'An unknown error occurred';

    if (level === 'critical') {
      return 'A critical error has occurred that prevents the application from functioning properly. Please refresh the page or contact support.';
    } else if (level === 'page') {
      return 'An error occurred while loading this page. You can try refreshing the page or navigate to a different section.';
    } else {
      return 'An error occurred in this component. The rest of the application should continue to work normally.';
    }
  }

  private renderDefaultFallback = (): ReactNode => {
    const { level, showDetails, enableRetry, enableRefresh, enableHome } = this.props;
    const { error, errorInfo, errorId } = this.state;

    const showRetry = enableRetry !== false && level !== 'critical';
    const showRefresh = enableRefresh !== false;
    const showHome = enableHome !== false && level === 'critical';

    return (
      <div className={`p-6 text-center ${level === 'critical' ? 'min-h-screen flex items-center justify-center bg-red-50' : 'border border-red-200 bg-red-50 rounded-lg'}`}>
        <div className="max-w-md mx-auto">
          <div className="flex justify-center mb-4">
            <div className={`rounded-full p-3 ${level === 'critical' ? 'bg-red-200' : 'bg-red-100'}`}>
              <AlertTriangle className={`w-8 h-8 ${level === 'critical' ? 'text-red-700' : 'text-red-600'}`} />
            </div>
          </div>

          <h3 className={`text-lg font-semibold mb-2 ${level === 'critical' ? 'text-red-900' : 'text-red-800'}`}>
            {this.getErrorTitle()}
          </h3>

          <p className={`mb-4 ${level === 'critical' ? 'text-red-800' : 'text-red-700'}`}>
            {this.getErrorMessage()}
          </p>

          {showDetails && error && (
            <details className="mb-4 text-left">
              <summary className="cursor-pointer text-sm font-medium text-red-700 hover:text-red-900">
                Technical Details
              </summary>
              <div className="mt-2 p-3 bg-red-100 rounded border text-xs">
                <p><strong>Error ID:</strong> {errorId}</p>
                <p><strong>Message:</strong> {error.message}</p>
                {error.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-600">Stack Trace</summary>
                    <pre className="mt-1 text-xs overflow-auto whitespace-pre-wrap">
                      {error.stack}
                    </pre>
                  </details>
                )}
                {errorInfo && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-600">Component Stack</summary>
                    <pre className="mt-1 text-xs overflow-auto whitespace-pre-wrap">
                      {errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            </details>
          )}

          <div className="space-y-2">
            {showRetry && (
              <button
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </button>
            )}

            {showRefresh && (
              <button
                onClick={this.handleRefresh}
                className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Page
              </button>
            )}

            {showHome && (
              <button
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Home
              </button>
            )}
          </div>

          {level !== 'critical' && (
            <p className="mt-4 text-xs text-red-600">
              If this problem persists, please contact support with Error ID: {errorId}
            </p>
          )}
        </div>
      </div>
    );
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error && errorInfo) {
      if (fallback) {
        return fallback(error, errorInfo, this.handleRetry);
      }
      return this.renderDefaultFallback();
    }

    return children;
  }
}

// Higher-order component for easy wrapping
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Specialized error boundaries for different use cases
export const PageErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    level="page"
    name="Page"
    showDetails={process.env.NODE_ENV === 'development'}
    enableRetry={true}
    enableRefresh={true}
    enableHome={false}
  >
    {children}
  </ErrorBoundary>
);

export const ComponentErrorBoundary: React.FC<{ children: ReactNode; name?: string }> = ({ children, name }) => (
  <ErrorBoundary
    level="component"
    name={name}
    showDetails={process.env.NODE_ENV === 'development'}
    enableRetry={true}
    enableRefresh={false}
    enableHome={false}
  >
    {children}
  </ErrorBoundary>
);

export const CriticalErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    level="critical"
    name="Application"
    showDetails={process.env.NODE_ENV === 'development'}
    enableRetry={false}
    enableRefresh={true}
    enableHome={true}
  >
    {children}
  </ErrorBoundary>
);