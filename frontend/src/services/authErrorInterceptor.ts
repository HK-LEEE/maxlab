/**
 * Authentication Error Interceptor
 * 
 * Integrates with API client to automatically handle authentication errors
 * and provide user-friendly error messages with appropriate actions
 */

import type { AuthErrorData } from '../types/errors';
import { authService } from './authService';

export interface ErrorInterceptorConfig {
  enableAutoRedirect: boolean;
  enableAutoRetry: boolean;
  maxRetries: number;
  retryDelay: number;
  language: 'en' | 'ko' | 'ja' | 'zh';
}

const defaultConfig: ErrorInterceptorConfig = {
  enableAutoRedirect: true,
  enableAutoRetry: true,
  maxRetries: 3,
  retryDelay: 1000,
  language: 'en'
};

// Error message mappings based on backend error codes
const ERROR_MAPPINGS = {
  'AUTH_001': {
    en: 'Your session appears to be invalid. Please log in again.',
    ko: '세션이 유효하지 않습니다. 다시 로그인해 주세요.',
    ja: 'セッションが無効です。再度ログインしてください。',
    zh: '您的会话似乎无效。请重新登录。'
  },
  'AUTH_002': {
    en: 'Your session has expired. Please log in to continue.',
    ko: '세션이 만료되었습니다. 계속하려면 로그인해 주세요.',
    ja: 'セッションが期限切れです。続行するにはログインしてください。',
    zh: '您的会话已过期。请登录以继续。'
  },
  'AUTH_003': {
    en: 'We couldn\'t verify your session. Please log in again.',
    ko: '세션을 확인할 수 없습니다. 다시 로그인해 주세요.',
    ja: 'セッションを確認できませんでした。再度ログインしてください。',
    zh: '我们无法验证您的会话。请重新登录。'
  },
  'AUTH_004': {
    en: 'Authentication is required to access this resource.',
    ko: '인증이 필요한 리소스입니다. 로그인해 주세요.',
    ja: 'このリソースにアクセスするには認証が必要です。',
    zh: '访问此资源需要身份验证。'
  },
  'AUTH_005': {
    en: 'Your session has been terminated. Please log in again.',
    ko: '세션이 종료되었습니다. 다시 로그인해 주세요.',
    ja: 'セッションが終了されました。再度ログインしてください。',
    zh: '您的会话已被终止。请重新登录。'
  },
  'PERM_001': {
    en: 'You don\'t have permission to perform this action.',
    ko: '이 작업을 수행할 권한이 없습니다.',
    ja: 'この操作を実行する権限がありません。',
    zh: '您没有执行此操作的权限。'
  },
  'PERM_002': {
    en: 'Administrator privileges are required for this action.',
    ko: '이 작업에는 관리자 권한이 필요합니다.',
    ja: 'この操作には管理者権限が必要です。',
    zh: '此操作需要管理员权限。'
  },
  'PERM_003': {
    en: 'You don\'t have access to this workspace.',
    ko: '이 워크스페이스에 접근할 권한이 없습니다.',
    ja: 'このワークスペースへのアクセス権限がありません。',
    zh: '您没有访问此工作空间的权限。'
  },
  'CONN_001': {
    en: 'We\'re having trouble connecting to our authentication service. Please try again in a moment.',
    ko: '인증 서비스에 연결하는 데 문제가 있습니다. 잠시 후 다시 시도해 주세요.',
    ja: '認証サービスへの接続に問題があります。しばらくしてから再度お試しください。',
    zh: '我们在连接身份验证服务时遇到问题。请稍后再试。'
  },
  'CONN_002': {
    en: 'The authentication service is taking longer than expected. Please try again.',
    ko: '인증 서비스 응답이 예상보다 오래 걸리고 있습니다. 다시 시도해 주세요.',
    ja: '認証サービスの応答が予想より時間がかかっています。再度お試しください。',
    zh: '身份验证服务响应时间比预期长。请重试。'
  },
  'SYS_001': {
    en: 'Something went wrong on our end. Please try again later.',
    ko: '서버에서 예상치 못한 오류가 발생했습니다. 나중에 다시 시도해 주세요.',
    ja: 'サーバーで予期しないエラーが発生しました。後でもう一度お試しください。',
    zh: '我们这边出了点问题。请稍后再试。'
  }
} as const;

export class AuthErrorInterceptor {
  private config: ErrorInterceptorConfig;
  private retryCount = new Map<string, number>();
  private isHandling = false;

  constructor(config: Partial<ErrorInterceptorConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Parse error response and create structured error data
   */
  parseError(error: any): AuthErrorData {
    // If error already has structured data from backend
    if (error.response?.data?.error_code) {
      return {
        error_code: error.response.data.error_code,
        error_title: error.response.data.error_title || this.getErrorTitle(error.response.data.error_code),
        user_message: error.response.data.user_message || this.getErrorMessage(error.response.data.error_code),
        user_action: error.response.data.user_action || this.getDefaultAction(error.response.data.error_code),
        severity: error.response.data.severity || 'medium',
        category: error.response.data.category || this.getErrorCategory(error.response.data.error_code),
        request_id: error.response.data.request_id,
        additional_details: error.response.data.additional_details
      };
    }

    // Handle standard HTTP errors
    const status = error.response?.status;
    const requestId = error.response?.headers?.['x-request-id'] || `req_${Date.now()}`;

    switch (status) {
      case 401:
        return {
          error_code: 'AUTH_001',
          error_title: 'Authentication Required',
          user_message: this.getErrorMessage('AUTH_001'),
          user_action: 'login_required',
          severity: 'medium',
          category: 'AUTH',
          request_id: requestId,
          additional_details: {
            originalError: error.message,
            statusCode: status,
            endpoint: error.config?.url
          }
        };

      case 403:
        return {
          error_code: 'PERM_001',
          error_title: 'Access Denied',
          user_message: this.getErrorMessage('PERM_001'),
          user_action: 'contact_support',
          severity: 'medium',
          category: 'PERM',
          request_id: requestId,
          additional_details: {
            originalError: error.message,
            statusCode: status,
            endpoint: error.config?.url
          }
        };

      case 404:
        return {
          error_code: 'SYS_001',
          error_title: 'Resource Not Found',
          user_message: 'The requested resource was not found.',
          user_action: 'retry_allowed',
          severity: 'low',
          category: 'SYS',
          request_id: requestId,
          additional_details: {
            originalError: error.message,
            statusCode: status,
            endpoint: error.config?.url
          }
        };

      case 500:
      case 502:
      case 503:
      case 504:
        return {
          error_code: 'SYS_001',
          error_title: 'Server Error',
          user_message: this.getErrorMessage('SYS_001'),
          user_action: 'retry_allowed',
          severity: 'high',
          category: 'SYS',
          request_id: requestId,
          additional_details: {
            originalError: error.message,
            statusCode: status,
            endpoint: error.config?.url
          }
        };

      default:
        // Network errors or unknown errors
        if (!error.response) {
          return {
            error_code: 'CONN_001',
            error_title: 'Connection Error',
            user_message: this.getErrorMessage('CONN_001'),
            user_action: 'retry_allowed',
            severity: 'medium',
            category: 'CONN',
            request_id: requestId,
            additional_details: {
              originalError: error.message,
              code: error.code,
              endpoint: error.config?.url
            }
          };
        }

        return {
          error_code: 'SYS_001',
          error_title: 'Unknown Error',
          user_message: this.getErrorMessage('SYS_001'),
          user_action: 'retry_allowed',
          severity: 'medium',
          category: 'SYS',
          request_id: requestId,
          additional_details: {
            originalError: error.message,
            statusCode: status,
            endpoint: error.config?.url
          }
        };
    }
  }

  /**
   * Handle error with automatic retry and recovery
   */
  async handleError(error: any, originalRequest?: any): Promise<{
    shouldRetry: boolean;
    shouldRedirect: boolean;
    errorData: AuthErrorData;
    recoveryAction?: () => Promise<any>;
  }> {
    if (this.isHandling) {
      return {
        shouldRetry: false,
        shouldRedirect: false,
        errorData: this.parseError(error)
      };
    }

    this.isHandling = true;

    try {
      const errorData = this.parseError(error);
      const requestKey = this.getRequestKey(originalRequest);
      const currentRetryCount = this.retryCount.get(requestKey) || 0;

      // Log error for debugging
      console.error('🔐 Auth Error Interceptor:', {
        error: errorData,
        originalError: error,
        requestKey,
        retryCount: currentRetryCount
      });

      // Handle specific error categories
      let shouldRetry = false;
      let shouldRedirect = false;
      let recoveryAction: (() => Promise<any>) | undefined;

      switch (errorData.category) {
        case 'AUTH':
          // 🔒 Check if current page is a public page
          const currentPath = window.location.pathname;
          const isPublicPage = currentPath.startsWith('/public/flow/') || 
                               currentPath.startsWith('/workspaces/personal_test/monitor/public/');
          
          if (errorData.error_code === 'AUTH_001' || errorData.error_code === 'AUTH_002') {
            // 🚫 SIMPLIFIED: 401 에러 시 바로 MAX Platform으로 리다이렉트
            // 단, Public 페이지가 아닌 경우에만 리다이렉트
            if (!isPublicPage) {
              console.warn('🚨 Authentication failed - redirecting to MAX Platform');
              
              // 모든 스토리지 클리어
              localStorage.clear();
              sessionStorage.clear();
              
              // MAX Platform으로 직접 리다이렉트
              // Original hardcoded: window.location.href = 'https://max.dwchem.co.kr/login';
              window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
            } else {
              console.log('📊 Authentication error on public page - continuing without redirect');
            }
            return { shouldRetry: false, shouldRedirect: false, errorData, recoveryAction };
          } else if (errorData.error_code === 'AUTH_004') {
            // Authentication required - MAX Platform으로 리다이렉트 (public 페이지 제외)
            if (!isPublicPage) {
              console.warn('🚨 Authentication required - redirecting to MAX Platform');
              // Original hardcoded: window.location.href = 'https://max.dwchem.co.kr/login';
              window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
            } else {
              console.log('📊 Authentication required on public page - continuing without redirect');
            }
            return { shouldRetry: false, shouldRedirect: false, errorData, recoveryAction };
          } else if (errorData.error_code === 'AUTH_005') {
            // Token revoked - force logout and redirect (public 페이지 제외)
            if (!isPublicPage) {
              await authService.logout();
              // Original hardcoded: window.location.href = 'https://max.dwchem.co.kr/login';
              window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
            } else {
              console.log('📊 Token revoked on public page - continuing without redirect');
            }
            return { shouldRetry: false, shouldRedirect: false, errorData, recoveryAction };
          }
          break;

        case 'CONN':
          // Connection errors - retry with exponential backoff
          if (currentRetryCount < this.config.maxRetries && this.config.enableAutoRetry) {
            recoveryAction = async () => {
              const delay = this.config.retryDelay * Math.pow(2, currentRetryCount);
              await new Promise(resolve => setTimeout(resolve, delay));
              this.retryCount.set(requestKey, currentRetryCount + 1);
              return true;
            };
            shouldRetry = true;
          }
          break;

        case 'SYS':
          // System errors - limited retry
          if (currentRetryCount < Math.min(this.config.maxRetries, 1) && this.config.enableAutoRetry) {
            recoveryAction = async () => {
              await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
              this.retryCount.set(requestKey, currentRetryCount + 1);
              return true;
            };
            shouldRetry = true;
          }
          break;

        case 'PERM':
          // Permission errors - no retry
          break;

        default:
          break;
      }

      return {
        shouldRetry,
        shouldRedirect,
        errorData,
        recoveryAction
      };
    } finally {
      this.isHandling = false;
    }
  }

  /**
   * Reset retry count for successful requests
   */
  onRequestSuccess(request: any): void {
    const requestKey = this.getRequestKey(request);
    this.retryCount.delete(requestKey);
  }

  /**
   * Get error message in configured language
   */
  private getErrorMessage(errorCode: string): string {
    const messages = ERROR_MAPPINGS[errorCode as keyof typeof ERROR_MAPPINGS];
    return messages?.[this.config.language] || messages?.en || 'An error occurred';
  }

  /**
   * Get error title based on error code
   */
  private getErrorTitle(errorCode: string): string {
    if (errorCode.startsWith('AUTH_')) return 'Authentication Error';
    if (errorCode.startsWith('PERM_')) return 'Permission Error';
    if (errorCode.startsWith('CONN_')) return 'Connection Error';
    if (errorCode.startsWith('CONFIG_')) return 'Configuration Error';
    if (errorCode.startsWith('VALID_')) return 'Validation Error';
    if (errorCode.startsWith('SYS_')) return 'System Error';
    return 'Error';
  }

  /**
   * Get error category based on error code
   */
  private getErrorCategory(errorCode: string): AuthErrorData['category'] {
    if (errorCode.startsWith('AUTH_')) return 'AUTH';
    if (errorCode.startsWith('PERM_')) return 'PERM';
    if (errorCode.startsWith('CONN_')) return 'CONN';
    if (errorCode.startsWith('CONFIG_')) return 'CONFIG';
    if (errorCode.startsWith('VALID_')) return 'VALID';
    return 'SYS';
  }

  /**
   * Get default action based on error code
   */
  private getDefaultAction(errorCode: string): AuthErrorData['user_action'] {
    if (errorCode.startsWith('AUTH_')) return 'login_required';
    if (errorCode.startsWith('PERM_')) return 'contact_support';
    if (errorCode.startsWith('CONN_')) return 'retry_allowed';
    if (errorCode.startsWith('CONFIG_')) return 'contact_support';
    if (errorCode.startsWith('VALID_')) return 'retry_allowed';
    return 'retry_allowed';
  }

  /**
   * Generate unique key for request retry tracking
   */
  private getRequestKey(request: any): string {
    if (!request) return 'unknown';
    return `${request.method || 'GET'}_${request.url || 'unknown'}`;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErrorInterceptorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear retry counts
   */
  clearRetryHistory(): void {
    this.retryCount.clear();
  }

  /**
   * Get debug information
   */
  getDebugInfo(): {
    config: ErrorInterceptorConfig;
    retryCount: Record<string, number>;
    isHandling: boolean;
  } {
    return {
      config: this.config,
      retryCount: Object.fromEntries(this.retryCount),
      isHandling: this.isHandling
    };
  }
}

// Global instance
export const authErrorInterceptor = new AuthErrorInterceptor();

// Helper function to integrate with axios
export const setupAxiosInterceptor = (axiosInstance: any) => {
  // Request interceptor
  axiosInstance.interceptors.request.use(
    (config: any) => {
      // Add request ID for tracking
      config.headers['X-Request-ID'] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return config;
    },
    (error: any) => Promise.reject(error)
  );

  // Response interceptor
  axiosInstance.interceptors.response.use(
    (response: any) => {
      // Reset retry count on successful response
      authErrorInterceptor.onRequestSuccess(response.config);
      return response;
    },
    async (error: any) => {
      const originalRequest = error.config;

      // Avoid infinite loops - check both our custom counter and the interceptor marker
      if (originalRequest._authErrorHandled || originalRequest._retryCount >= 3) {
        return Promise.reject(error);
      }

      // Mark this request as handled by our interceptor
      originalRequest._authErrorHandled = true;

      // Don't handle errors for certain status codes that shouldn't be retried
      const status = error.response?.status;
      if (status && [400, 404, 422, 500, 502, 503].includes(status)) {
        // For these errors, just emit the error event without retry
        const errorData = authErrorInterceptor.parseError(error);
        
        window.dispatchEvent(new CustomEvent('auth:error', {
          detail: {
            errorData,
            originalError: error,
            shouldRetry: false,
            shouldRedirect: false
          }
        }));
        
        return Promise.reject(error);
      }

      const result = await authErrorInterceptor.handleError(error, originalRequest);

      if (result.shouldRetry && result.recoveryAction) {
        originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
        
        try {
          const recoverySuccess = await result.recoveryAction();
          if (recoverySuccess) {
            // Remove the handled marker for the retry
            delete originalRequest._authErrorHandled;
            // Retry the original request
            return axiosInstance.request(originalRequest);
          }
        } catch (recoveryError) {
          console.error('Recovery action failed:', recoveryError);
        }
      }

      // If we should redirect, emit an event for the app to handle
      if (result.shouldRedirect) {
        window.dispatchEvent(new CustomEvent('auth:redirect_required', {
          detail: {
            errorData: result.errorData,
            reason: result.errorData.error_code
          }
        }));
      }

      // Emit error event for UI components to handle
      window.dispatchEvent(new CustomEvent('auth:error', {
        detail: {
          errorData: result.errorData,
          originalError: error,
          shouldRetry: result.shouldRetry,
          shouldRedirect: result.shouldRedirect
        }
      }));

      return Promise.reject(error);
    }
  );
};

export default authErrorInterceptor;