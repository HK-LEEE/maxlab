/**
 * Authentication Error Handling Hook
 * 
 * Centralized hook for handling authentication errors across the application
 * with automatic retry, fallback actions, and user notifications
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthError } from '../components/common/AuthErrorHandler';
import { authErrorInterceptor } from '../services/authErrorInterceptor';
import { authService } from '../services/authService';

export interface AuthErrorHandlingConfig {
  enableAutoRetry: boolean;
  enableAutoRedirect: boolean;
  enableGlobalErrorListener: boolean;
  language: 'en' | 'ko' | 'ja' | 'zh';
}

const defaultConfig: AuthErrorHandlingConfig = {
  enableAutoRetry: true,
  enableAutoRedirect: true,
  enableGlobalErrorListener: true,
  language: 'en'
};

export const useAuthErrorHandling = (config: Partial<AuthErrorHandlingConfig> = {}) => {
  const navigate = useNavigate();
  const { handleError, clearErrors } = useAuthError();
  const fullConfig = { ...defaultConfig, ...config };

  // Handle authentication redirect events
  const handleRedirectRequired = useCallback((event: CustomEvent) => {
    const { errorData, reason } = event.detail;
    
    console.log('🔄 Auth redirect required:', { errorData, reason });
    
    // Clear current errors
    clearErrors();
    
    // Navigate based on error type
    switch (reason) {
      case 'AUTH_001':
      case 'AUTH_002':
      case 'AUTH_003':
      case 'AUTH_004':
      case 'AUTH_005':
        // Authentication errors - go to login
        navigate('/login', { 
          state: { 
            from: window.location.pathname,
            errorCode: reason,
            message: errorData.user_message
          }
        });
        break;
        
      case 'PERM_001':
      case 'PERM_002':
      case 'PERM_003':
        // Permission errors - show error page or go back
        navigate('/error', {
          state: {
            errorCode: reason,
            message: errorData.user_message,
            canGoBack: true
          }
        });
        break;
        
      default:
        // Other errors - try to go to home or show error page
        navigate('/error', {
          state: {
            errorCode: reason,
            message: errorData.user_message,
            canGoBack: true
          }
        });
        break;
    }
  }, [navigate, clearErrors]);

  // Handle authentication errors from interceptor
  const handleAuthError = useCallback((event: CustomEvent) => {
    const { errorData, originalError, shouldRetry, shouldRedirect } = event.detail;
    
    console.log('🔐 Auth error event:', { 
      errorData, 
      shouldRetry, 
      shouldRedirect,
      originalError: originalError.message 
    });
    
    // Only show error if it's not being handled automatically
    if (!shouldRetry && !shouldRedirect) {
      handleError(originalError, {
        showModal: errorData.severity === 'high' || errorData.severity === 'critical',
        showToast: errorData.severity === 'low' || errorData.severity === 'medium',
        context: 'Global Error Handler'
      });
    }
  }, [handleError]);

  // Handle authentication logout events
  const handleAuthLogout = useCallback((event: CustomEvent) => {
    const { reason, attempts, error } = event.detail;
    
    console.log('🚪 Auth logout event:', { reason, attempts, error });
    
    // Clear all errors
    clearErrors();
    
    // Navigate to login with appropriate message
    let message = 'You have been logged out.';
    
    switch (reason) {
      case 'token_refresh_failed':
        message = 'Your session could not be renewed. Please log in again.';
        break;
      case 'refresh_token_invalid':
        message = 'Your session has expired. Please log in again.';
        break;
      case 'critical_error':
        message = 'A critical error occurred. Please log in again.';
        break;
      default:
        message = 'You have been logged out. Please log in again.';
        break;
    }
    
    navigate('/login', {
      state: {
        from: window.location.pathname,
        message,
        reason,
        autoLogout: true
      }
    });
  }, [navigate, clearErrors]);

  // Handle refresh token expiring events
  const handleRefreshTokenExpiring = useCallback((event: CustomEvent) => {
    const { timeToExpiry, message } = event.detail;
    
    console.log('⏰ Refresh token expiring:', { timeToExpiry, message });
    
    // Show warning notification
    handleError(new Error(message), {
      showToast: true,
      showModal: false,
      context: 'Refresh Token Expiring'
    });
  }, [handleError]);

  // Handle refresh token invalid events
  const handleRefreshTokenInvalid = useCallback((event: CustomEvent) => {
    const { message, reason, action } = event.detail;
    
    console.log('❌ Refresh token invalid:', { message, reason, action });
    
    // Show error and redirect to login
    handleError(new Error(message), {
      showModal: true,
      showToast: false,
      context: 'Refresh Token Invalid',
      onRetry: action === 'login_required' ? () => navigate('/login') : undefined
    });
  }, [handleError, navigate]);

  // Setup global error listeners
  useEffect(() => {
    if (!fullConfig.enableGlobalErrorListener) return;

    // Add event listeners
    window.addEventListener('auth:redirect_required', handleRedirectRequired as EventListener);
    window.addEventListener('auth:error', handleAuthError as EventListener);
    window.addEventListener('auth:logout', handleAuthLogout as EventListener);
    window.addEventListener('auth:refresh_token_expiring', handleRefreshTokenExpiring as EventListener);
    window.addEventListener('auth:refresh_token_invalid', handleRefreshTokenInvalid as EventListener);

    // Cleanup listeners
    return () => {
      window.removeEventListener('auth:redirect_required', handleRedirectRequired as EventListener);
      window.removeEventListener('auth:error', handleAuthError as EventListener);
      window.removeEventListener('auth:logout', handleAuthLogout as EventListener);
      window.removeEventListener('auth:refresh_token_expiring', handleRefreshTokenExpiring as EventListener);
      window.removeEventListener('auth:refresh_token_invalid', handleRefreshTokenInvalid as EventListener);
    };
  }, [
    fullConfig.enableGlobalErrorListener,
    handleRedirectRequired,
    handleAuthError,
    handleAuthLogout,
    handleRefreshTokenExpiring,
    handleRefreshTokenInvalid
  ]);

  // Update interceptor configuration
  useEffect(() => {
    authErrorInterceptor.updateConfig({
      enableAutoRetry: fullConfig.enableAutoRetry,
      enableAutoRedirect: fullConfig.enableAutoRedirect,
      language: fullConfig.language
    });
  }, [fullConfig]);

  // Manual error handling functions
  const handleApiError = useCallback((error: any, options: {
    showModal?: boolean;
    showToast?: boolean;
    context?: string;
    onRetry?: () => void;
  } = {}) => {
    const errorData = authErrorInterceptor.parseError(error);
    
    handleError(error, {
      showModal: options.showModal ?? (errorData.severity === 'high' || errorData.severity === 'critical'),
      showToast: options.showToast ?? (errorData.severity === 'low' || errorData.severity === 'medium'),
      context: options.context || 'Manual Error Handler',
      onRetry: options.onRetry
    });
  }, [handleError]);

  const handleLoginRequired = useCallback((message?: string) => {
    navigate('/login', {
      state: {
        from: window.location.pathname,
        message: message || 'Please log in to continue',
        loginRequired: true
      }
    });
  }, [navigate]);

  const handlePermissionDenied = useCallback((message?: string) => {
    navigate('/error', {
      state: {
        errorCode: 'PERM_001',
        message: message || 'You don\'t have permission to access this resource',
        canGoBack: true
      }
    });
  }, [navigate]);

  const handleRetryWithLogin = useCallback(async (originalAction: () => Promise<any>) => {
    try {
      // Try to refresh token first
      const refreshSuccess = await authService.refreshToken();
      
      if (refreshSuccess) {
        // Token refreshed, retry original action
        return await originalAction();
      } else {
        // Token refresh failed, redirect to login
        handleLoginRequired('Your session has expired. Please log in to continue.');
        return null;
      }
    } catch (error) {
      // Handle refresh error
      handleApiError(error, {
        context: 'Retry with Login'
      });
      return null;
    }
  }, [handleApiError, handleLoginRequired]);

  return {
    // Error handling functions
    handleApiError,
    handleLoginRequired,
    handlePermissionDenied,
    handleRetryWithLogin,
    clearErrors,
    
    // Configuration
    config: fullConfig,
    
    // Utilities
    isAuthenticated: authService.isAuthenticated,
    getCurrentUser: authService.getStoredUser,
    
    // Debug info
    getDebugInfo: () => ({
      config: fullConfig,
      interceptor: authErrorInterceptor.getDebugInfo(),
      auth: authService.getAuthDebugInfo()
    })
  };
};

// Helper hook for component-level error handling
export const useComponentErrorHandling = () => {
  const { handleApiError, handleLoginRequired, handlePermissionDenied } = useAuthErrorHandling();

  const withErrorHandling = useCallback(<T extends any[]>(
    asyncFn: (...args: T) => Promise<any>,
    options: {
      showModal?: boolean;
      showToast?: boolean;
      context?: string;
      onError?: (error: any) => void;
    } = {}
  ) => {
    return async (...args: T) => {
      try {
        return await asyncFn(...args);
      } catch (error) {
        if (options.onError) {
          options.onError(error);
        } else {
          handleApiError(error, options);
        }
        throw error;
      }
    };
  }, [handleApiError]);

  return {
    withErrorHandling,
    handleApiError,
    handleLoginRequired,
    handlePermissionDenied
  };
};

export default useAuthErrorHandling;