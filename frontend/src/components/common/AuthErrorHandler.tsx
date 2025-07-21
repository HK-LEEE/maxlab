/**
 * Authentication Error Handler Component
 * 
 * Centralized error handling for authentication-related errors
 * with automatic retry, fallback actions, and user guidance
 */

import React, { useEffect, useContext, createContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthErrorModal, useAuthErrorModal } from './AuthErrorModal';
import type { AuthErrorData } from '../../types/errors';
import { AuthErrorToastContainer, useAuthErrorToast } from './AuthErrorToast';

// Error handling configuration
export interface AuthErrorConfig {
  enableModal: boolean;
  enableToast: boolean;
  enableRetry: boolean;
  enableAutoRedirect: boolean;
  maxRetries: number;
  retryDelay: number;
  toastPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  language: 'en' | 'ko' | 'ja' | 'zh';
}

const defaultConfig: AuthErrorConfig = {
  enableModal: true,
  enableToast: true,
  enableRetry: true,
  enableAutoRedirect: true,
  maxRetries: 3,
  retryDelay: 1000,
  toastPosition: 'top-right',
  language: 'en'
};

// Context for sharing error handling across components
interface AuthErrorContextType {
  handleError: (error: any, options?: {
    showModal?: boolean;
    showToast?: boolean;
    onRetry?: () => void;
    onSuccess?: () => void;
    context?: string;
  }) => void;
  clearErrors: () => void;
  retryCount: number;
  isHandlingError: boolean;
}

const AuthErrorContext = createContext<AuthErrorContextType | undefined>(undefined);

export const useAuthError = () => {
  const context = useContext(AuthErrorContext);
  if (!context) {
    throw new Error('useAuthError must be used within an AuthErrorProvider');
  }
  return context;
};

// Main error handler component
export interface AuthErrorHandlerProps {
  config?: Partial<AuthErrorConfig>;
  children: React.ReactNode;
  onLogin?: () => void;
  onContactSupport?: () => void;
  onUnauthorized?: () => void;
  onForbidden?: () => void;
  onNetworkError?: () => void;
}

export const AuthErrorHandler: React.FC<AuthErrorHandlerProps> = ({
  config = {},
  children,
  onLogin,
  onContactSupport,
  onUnauthorized,
  onForbidden,
  onNetworkError
}) => {
  const navigate = useNavigate();
  const fullConfig = { ...defaultConfig, ...config };
  
  const { error, isOpen, showError, hideError, createErrorFromResponse } = useAuthErrorModal();
  const { toasts, showToast, removeToast, clearAllToasts } = useAuthErrorToast();
  
  const [retryCount, setRetryCount] = React.useState(0);
  const [isHandlingError, setIsHandlingError] = React.useState(false);
  const [currentRetryCallback, setCurrentRetryCallback] = React.useState<(() => void) | null>(null);

  // Default handlers
  const defaultOnLogin = () => {
    navigate('/login');
  };

  const defaultOnContactSupport = () => {
    window.open('mailto:support@maxlab.com?subject=Authentication Error&body=Please describe the issue you encountered.');
  };

  const handleError = React.useCallback((
    error: any,
    options: {
      showModal?: boolean;
      showToast?: boolean;
      onRetry?: () => void;
      onSuccess?: () => void;
      context?: string;
    } = {}
  ) => {
    setIsHandlingError(true);
    
    // Parse error into structured format
    const errorData = createErrorFromResponse(error);
    
    // Log error for debugging
    console.error('🔐 Auth Error Handler:', {
      error: errorData,
      originalError: error,
      context: options.context,
      retryCount
    });

    // Store retry callback
    if (options.onRetry) {
      setCurrentRetryCallback(() => options.onRetry);
    }

    // Show modal if enabled and appropriate
    if ((options.showModal ?? fullConfig.enableModal) && shouldShowModal(errorData)) {
      showError(errorData);
    }

    // Show toast if enabled and appropriate
    if ((options.showToast ?? fullConfig.enableToast) && shouldShowToast(errorData)) {
      showToast(errorData, getToastDuration(errorData.severity));
    }

    // Handle specific error types
    handleSpecificError(errorData, options);

    setIsHandlingError(false);
  }, [
    createErrorFromResponse,
    showError,
    showToast,
    fullConfig,
    retryCount
  ]);

  const shouldShowModal = (errorData: AuthErrorData): boolean => {
    // Show modal for high/critical errors or when user action is required
    return (
      errorData.severity === 'high' ||
      errorData.severity === 'critical' ||
      errorData.user_action === 'login_required' ||
      errorData.user_action === 'contact_support'
    );
  };

  const shouldShowToast = (errorData: AuthErrorData): boolean => {
    // Show toast for less critical errors or as supplementary notification
    return (
      errorData.severity === 'low' ||
      errorData.severity === 'medium' ||
      errorData.user_action === 'retry_allowed' ||
      errorData.user_action === 'wait_and_retry'
    );
  };

  const getToastDuration = (severity: string): number => {
    switch (severity) {
      case 'low': return 3000;
      case 'medium': return 5000;
      case 'high': return 8000;
      case 'critical': return 0; // Don't auto-close
      default: return 5000;
    }
  };

  const handleSpecificError = (errorData: AuthErrorData, options: any) => {
    switch (errorData.category) {
      case 'AUTH':
        if (errorData.error_code === 'AUTH_001' || errorData.error_code === 'AUTH_002') {
          // Token expired or invalid
          if (onUnauthorized) {
            onUnauthorized();
          } else {
            // Auto-redirect to login after a delay
            setTimeout(() => {
              navigate('/login');
            }, 2000);
          }
        }
        break;
        
      case 'PERM':
        if (onForbidden) {
          onForbidden();
        } else {
          // Could redirect to a "no permission" page
          console.warn('User lacks permission for this action');
        }
        break;
        
      case 'CONN':
        if (onNetworkError) {
          onNetworkError();
        } else {
          // Could show offline indicator
          console.warn('Network connectivity issue');
        }
        break;
        
      default:
        // Handle other error types
        break;
    }
  };

  const handleRetry = React.useCallback(() => {
    if (currentRetryCallback && retryCount < fullConfig.maxRetries) {
      setRetryCount(prev => prev + 1);
      
      // Add delay before retry
      setTimeout(() => {
        currentRetryCallback();
      }, fullConfig.retryDelay);
    }
  }, [currentRetryCallback, retryCount, fullConfig]);

  const handleSuccess = React.useCallback(() => {
    // Reset retry count on success
    setRetryCount(0);
    setCurrentRetryCallback(null);
  }, []);

  const clearErrors = React.useCallback(() => {
    hideError();
    clearAllToasts();
    setRetryCount(0);
    setCurrentRetryCallback(null);
    setIsHandlingError(false);
  }, [hideError, clearAllToasts]);

  // Auto-clear errors when component unmounts
  useEffect(() => {
    return () => {
      clearErrors();
    };
  }, [clearErrors]);

  const contextValue: AuthErrorContextType = {
    handleError,
    clearErrors,
    retryCount,
    isHandlingError
  };

  return (
    <AuthErrorContext.Provider value={contextValue}>
      {children}
      
      {/* Error Modal */}
      {fullConfig.enableModal && (
        <AuthErrorModal
          isOpen={isOpen}
          onClose={hideError}
          error={error}
          onRetry={handleRetry}
          onLogin={onLogin || defaultOnLogin}
          onContactSupport={onContactSupport || defaultOnContactSupport}
          language={fullConfig.language}
        />
      )}
      
      {/* Error Toast Container */}
      {fullConfig.enableToast && (
        <AuthErrorToastContainer
          toasts={toasts}
          onRemoveToast={removeToast}
          position={fullConfig.toastPosition}
        />
      )}
    </AuthErrorContext.Provider>
  );
};

// HOC for automatic error handling
export const withAuthErrorHandler = <P extends object>(
  Component: React.ComponentType<P>,
  config?: Partial<AuthErrorConfig>
) => {
  const WrappedComponent = React.forwardRef<any, P>((props, ref) => (
    <AuthErrorHandler config={config}>
      <Component {...props} ref={ref} />
    </AuthErrorHandler>
  ));

  WrappedComponent.displayName = `withAuthErrorHandler(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Custom hook for handling API errors
export const useApiErrorHandler = () => {
  const { handleError } = useAuthError();

  const handleApiError = React.useCallback((error: any, context?: string) => {
    // Determine if this is an authentication/authorization error
    const isAuthError = error?.response?.status === 401 || error?.response?.status === 403;
    const isNetworkError = !error?.response && error?.code !== 'ECONNABORTED';
    
    if (isAuthError || isNetworkError || error?.response?.data?.error_code) {
      handleError(error, { context });
      return true; // Error was handled
    }
    
    return false; // Error was not handled
  }, [handleError]);

  return { handleApiError };
};

// Error boundary integration
export const AuthErrorBoundary: React.FC<{
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}> = ({ children, fallback: Fallback }) => {
  const { handleError } = useAuthError();

  const handleBoundaryError = React.useCallback((error: Error, errorInfo: any) => {
    // Convert React error to auth error format
    const authError = {
      error_code: 'SYS_001',
      error_title: 'Component Error',
      user_message: 'A component error occurred. Please refresh the page.',
      severity: 'high' as const,
      category: 'SYS' as const,
      user_action: 'retry_allowed' as const,
      additional_details: {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      }
    };

    handleError({ response: { data: authError } }, { 
      context: 'React Error Boundary',
      showModal: true 
    });
  }, [handleError]);

  return (
    <ErrorBoundary 
      onError={handleBoundaryError}
      fallback={Fallback}
    >
      {children}
    </ErrorBoundary>
  );
};

// Simple error boundary for React errors
class ErrorBoundary extends React.Component<
  { 
    children: React.ReactNode;
    onError: (error: Error, errorInfo: any) => void;
    fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
  },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    this.props.onError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error!} resetError={() => this.setState({ hasError: false, error: null })} />;
      }
      
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-semibold mb-2">Something went wrong</h3>
          <p className="text-red-700 mb-4">A component error occurred. Please refresh the page.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AuthErrorHandler;