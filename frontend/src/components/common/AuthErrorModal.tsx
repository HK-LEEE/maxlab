/**
 * Authentication Error Modal Component
 * 
 * Displays user-friendly error messages for authentication failures
 * with localized messages and appropriate action buttons
 */

import React, { useEffect } from 'react';
import { 
  AlertTriangle, 
  RefreshCw, 
  LogIn, 
  Shield, 
  Wifi, 
  Settings, 
  HelpCircle,
  X 
} from 'lucide-react';

import type { ErrorCodeDefinition, AuthErrorData } from '../../types/errors';

// Re-export types for backward compatibility
export type { ErrorCodeDefinition, AuthErrorData } from '../../types/errors';

export interface AuthErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: AuthErrorData | null;
  onRetry?: () => void;
  onLogin?: () => void;
  onContactSupport?: () => void;
  language?: 'en' | 'ko' | 'ja' | 'zh';
}

// Error code to icon mapping
const ERROR_ICONS = {
  AUTH: LogIn,
  PERM: Shield,
  CONN: Wifi,
  CONFIG: Settings,
  VALID: AlertTriangle,
  SYS: AlertTriangle,
} as const;

// Severity to color mapping
const SEVERITY_COLORS = {
  low: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: 'text-blue-600',
    button: 'bg-blue-600 hover:bg-blue-700'
  },
  medium: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    icon: 'text-yellow-600',
    button: 'bg-yellow-600 hover:bg-yellow-700'
  },
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: 'text-red-600',
    button: 'bg-red-600 hover:bg-red-700'
  },
  critical: {
    bg: 'bg-red-100',
    border: 'border-red-300',
    text: 'text-red-900',
    icon: 'text-red-700',
    button: 'bg-red-700 hover:bg-red-800'
  }
} as const;

// Default error messages for fallback
const DEFAULT_MESSAGES = {
  en: {
    title: 'Authentication Error',
    message: 'An authentication error occurred. Please try again.',
    actions: {
      login_required: 'Please log in again',
      retry_allowed: 'You can try again',
      contact_support: 'Please contact support',
      wait_and_retry: 'Please wait and try again',
      no_action: 'No action required'
    },
    buttons: {
      login: 'Log In',
      retry: 'Try Again',
      support: 'Contact Support',
      close: 'Close',
      details: 'Show Details'
    }
  },
  ko: {
    title: '인증 오류',
    message: '인증 오류가 발생했습니다. 다시 시도해 주세요.',
    actions: {
      login_required: '다시 로그인해 주세요',
      retry_allowed: '다시 시도할 수 있습니다',
      contact_support: '지원팀에 문의해 주세요',
      wait_and_retry: '잠시 후 다시 시도해 주세요',
      no_action: '추가 조치가 필요하지 않습니다'
    },
    buttons: {
      login: '로그인',
      retry: '다시 시도',
      support: '지원팀 문의',
      close: '닫기',
      details: '상세 정보'
    }
  },
  ja: {
    title: '認証エラー',
    message: '認証エラーが発生しました。再度お試しください。',
    actions: {
      login_required: '再度ログインしてください',
      retry_allowed: '再試行できます',
      contact_support: 'サポートにお問い合わせください',
      wait_and_retry: 'しばらくしてから再度お試しください',
      no_action: '追加の操作は必要ありません'
    },
    buttons: {
      login: 'ログイン',
      retry: '再試行',
      support: 'サポートに連絡',
      close: '閉じる',
      details: '詳細情報'
    }
  },
  zh: {
    title: '身份验证错误',
    message: '发生了身份验证错误。请重试。',
    actions: {
      login_required: '请重新登录',
      retry_allowed: '您可以重试',
      contact_support: '请联系支持',
      wait_and_retry: '请稍后再试',
      no_action: '无需额外操作'
    },
    buttons: {
      login: '登录',
      retry: '重试',
      support: '联系支持',
      close: '关闭',
      details: '显示详细信息'
    }
  }
} as const;

export const AuthErrorModal: React.FC<AuthErrorModalProps> = ({
  isOpen,
  onClose,
  error,
  onRetry,
  onLogin,
  onContactSupport,
  language = 'en'
}) => {
  const [showDetails, setShowDetails] = React.useState(false);
  const messages = DEFAULT_MESSAGES[language];

  // Auto-close modal after 30 seconds for non-critical errors
  useEffect(() => {
    if (!isOpen || !error || error.severity === 'critical') return;

    const timer = setTimeout(() => {
      onClose();
    }, 30000);

    return () => clearTimeout(timer);
  }, [isOpen, error, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !error) return null;

  const severity = error.severity as keyof typeof SEVERITY_COLORS;
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.medium;
  const category = error.category as keyof typeof ERROR_ICONS;
  const IconComponent = ERROR_ICONS[category] || AlertTriangle;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getActionButton = () => {
    switch (error.user_action) {
      case 'login_required':
        return onLogin && (
          <button
            onClick={onLogin}
            className={`flex items-center justify-center px-4 py-2 ${colors.button} text-white rounded-lg transition-colors font-medium`}
          >
            <LogIn className="w-4 h-4 mr-2" />
            {messages.buttons.login}
          </button>
        );
      case 'retry_allowed':
        return onRetry && (
          <button
            onClick={onRetry}
            className={`flex items-center justify-center px-4 py-2 ${colors.button} text-white rounded-lg transition-colors font-medium`}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {messages.buttons.retry}
          </button>
        );
      case 'contact_support':
        return onContactSupport && (
          <button
            onClick={onContactSupport}
            className={`flex items-center justify-center px-4 py-2 ${colors.button} text-white rounded-lg transition-colors font-medium`}
          >
            <HelpCircle className="w-4 h-4 mr-2" />
            {messages.buttons.support}
          </button>
        );
      case 'wait_and_retry':
        return (
          <button
            onClick={onRetry}
            className={`flex items-center justify-center px-4 py-2 ${colors.button} text-white rounded-lg transition-colors font-medium`}
            disabled={!onRetry}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {messages.buttons.retry}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className={`relative ${colors.bg} ${colors.border} border-2 rounded-lg max-w-md w-full p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full ${colors.bg} border ${colors.border}`}>
              <IconComponent className={`w-5 h-5 ${colors.icon}`} />
            </div>
            <h3 className={`text-lg font-semibold ${colors.text}`}>
              {error.error_title || messages.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`${colors.text} hover:opacity-70 transition-opacity`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Message */}
        <div className="mb-6">
          <p className={`${colors.text} mb-3 leading-relaxed`}>
            {error.user_message || messages.message}
          </p>
          
          {/* Action message */}
          {error.user_action && (
            <p className={`text-sm ${colors.text} opacity-80`}>
              {messages.actions[error.user_action as keyof typeof messages.actions]}
            </p>
          )}
        </div>

        {/* Details Section */}
        {(error.error_code || error.request_id) && (
          <div className="mb-6">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className={`text-sm ${colors.text} hover:opacity-70 transition-opacity flex items-center`}
            >
              <HelpCircle className="w-4 h-4 mr-1" />
              {messages.buttons.details}
            </button>
            
            {showDetails && (
              <div className={`mt-2 p-3 ${colors.bg} border ${colors.border} rounded text-sm`}>
                {error.error_code && (
                  <p><strong>Error Code:</strong> {error.error_code}</p>
                )}
                {error.request_id && (
                  <p><strong>Request ID:</strong> {error.request_id}</p>
                )}
                {error.additional_details && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium">Additional Details</summary>
                    <pre className="mt-1 text-xs overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(error.additional_details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col space-y-2">
          {getActionButton()}
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            {messages.buttons.close}
          </button>
        </div>

        {/* Footer */}
        {error.severity !== 'critical' && (
          <p className={`mt-4 text-xs ${colors.text} opacity-70 text-center`}>
            This dialog will close automatically in 30 seconds
          </p>
        )}
      </div>
    </div>
  );
};

// Hook for managing auth error state
export const useAuthErrorModal = () => {
  const [error, setError] = React.useState<AuthErrorData | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);

  const showError = (errorData: AuthErrorData) => {
    setError(errorData);
    setIsOpen(true);
  };

  const hideError = () => {
    setIsOpen(false);
    setTimeout(() => setError(null), 300); // Allow animation to complete
  };

  const createErrorFromResponse = (response: any, defaultCode = 'SYS_001'): AuthErrorData => {
    return {
      error_code: response.error_code || defaultCode,
      error_title: response.error_title || 'Error',
      user_message: response.user_message || 'An error occurred',
      user_action: response.user_action || 'retry_allowed',
      severity: response.severity || 'medium',
      category: response.category || 'SYS',
      request_id: response.request_id,
      additional_details: response.additional_details
    };
  };

  return {
    error,
    isOpen,
    showError,
    hideError,
    createErrorFromResponse
  };
};

// Global error handler for authentication errors
export const handleAuthError = (
  error: any,
  showError: (errorData: AuthErrorData) => void,
  options: {
    onLogin?: () => void;
    onRetry?: () => void;
    onContactSupport?: () => void;
  } = {}
) => {
  // Handle different error formats
  let errorData: AuthErrorData;

  if (error.response?.data?.error_code) {
    // Backend structured error
    errorData = error.response.data;
  } else if (error.response?.status === 401) {
    // Unauthorized - likely need to login
    errorData = {
      error_code: 'AUTH_001',
      error_title: 'Authentication Required',
      user_message: 'Your session has expired. Please log in again.',
      user_action: 'login_required',
      severity: 'medium',
      category: 'AUTH'
    };
  } else if (error.response?.status === 403) {
    // Forbidden - permission error
    errorData = {
      error_code: 'PERM_001',
      error_title: 'Access Denied',
      user_message: 'You don\'t have permission to perform this action.',
      user_action: 'contact_support',
      severity: 'medium',
      category: 'PERM'
    };
  } else if (error.code === 'NETWORK_ERROR' || !error.response) {
    // Network error
    errorData = {
      error_code: 'CONN_001',
      error_title: 'Connection Error',
      user_message: 'Unable to connect to the server. Please check your internet connection and try again.',
      user_action: 'retry_allowed',
      severity: 'medium',
      category: 'CONN'
    };
  } else {
    // Generic error
    errorData = {
      error_code: 'SYS_001',
      error_title: 'System Error',
      user_message: 'An unexpected error occurred. Please try again.',
      user_action: 'retry_allowed',
      severity: 'medium',
      category: 'SYS'
    };
  }

  showError(errorData);
};

export default AuthErrorModal;