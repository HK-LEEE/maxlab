/**
 * Authentication Error Toast Component
 * 
 * Lightweight toast notifications for authentication errors
 * that don't require user interaction
 */

import React, { useEffect } from 'react';
import { 
  AlertTriangle, 
  LogIn, 
  Shield, 
  Wifi, 
  Settings, 
  X,
  CheckCircle,
  Info
} from 'lucide-react';
import type { ErrorCategory } from '../../types/errors';

export interface AuthErrorToastProps {
  isVisible: boolean;
  onClose: () => void;
  error: {
    error_code: string;
    error_title: string;
    user_message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'AUTH' | 'PERM' | 'CONN' | 'CONFIG' | 'VALID' | 'SYS';
  };
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  duration?: number; // Auto-close duration in milliseconds
  showCloseButton?: boolean;
  clickToClose?: boolean;
}

// Icon mapping for different categories
const CATEGORY_ICONS = {
  AUTH: LogIn,
  PERM: Shield,
  CONN: Wifi,
  CONFIG: Settings,
  VALID: AlertTriangle,
  SYS: AlertTriangle,
} as const;

// Severity to styling mapping
const SEVERITY_STYLES = {
  low: {
    bg: 'bg-blue-100 border-blue-200',
    text: 'text-blue-800',
    icon: 'text-blue-600',
    progress: 'bg-blue-500'
  },
  medium: {
    bg: 'bg-yellow-100 border-yellow-200',
    text: 'text-yellow-800',
    icon: 'text-yellow-600',
    progress: 'bg-yellow-500'
  },
  high: {
    bg: 'bg-red-100 border-red-200',
    text: 'text-red-800',
    icon: 'text-red-600',
    progress: 'bg-red-500'
  },
  critical: {
    bg: 'bg-red-200 border-red-300',
    text: 'text-red-900',
    icon: 'text-red-700',
    progress: 'bg-red-600'
  }
} as const;

// Position to CSS class mapping
const POSITION_STYLES = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2'
} as const;

export const AuthErrorToast: React.FC<AuthErrorToastProps> = ({
  isVisible,
  onClose,
  error,
  position = 'top-right',
  duration = 5000,
  showCloseButton = true,
  clickToClose = true
}) => {
  const [isClosing, setIsClosing] = React.useState(false);
  const [progress, setProgress] = React.useState(100);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const progressRef = React.useRef<NodeJS.Timeout | null>(null);

  const styles = SEVERITY_STYLES[error.severity];
  const IconComponent = CATEGORY_ICONS[error.category] || AlertTriangle;
  const positionClass = POSITION_STYLES[position];

  // Auto-close timer
  useEffect(() => {
    if (!isVisible || duration <= 0) return;

    // Start progress animation
    const progressInterval = 50; // Update every 50ms
    const progressStep = (progressInterval / duration) * 100;

    progressRef.current = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev - progressStep;
        if (newProgress <= 0) {
          handleClose();
          return 0;
        }
        return newProgress;
      });
    }, progressInterval);

    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, [isVisible, duration]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setProgress(100);
    }, 300); // Animation duration
  };

  const handleClick = () => {
    if (clickToClose) {
      handleClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed z-50 ${positionClass} transition-all duration-300 ${
        isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
      style={{ maxWidth: '400px', minWidth: '300px' }}
    >
      <div
        className={`${styles.bg} border rounded-lg shadow-lg p-4 ${
          clickToClose ? 'cursor-pointer' : ''
        } relative overflow-hidden`}
        onClick={handleClick}
      >
        {/* Progress bar */}
        {duration > 0 && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200">
            <div
              className={`h-full ${styles.progress} transition-all duration-50 ease-linear`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex items-start space-x-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <IconComponent className={`w-5 h-5 ${styles.icon}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className={`text-sm font-medium ${styles.text} mb-1`}>
              {error.error_title}
            </h4>
            <p className={`text-sm ${styles.text} opacity-90`}>
              {error.user_message}
            </p>
            
            {/* Error code */}
            <p className={`text-xs ${styles.text} opacity-60 mt-1`}>
              Error: {error.error_code}
            </p>
          </div>

          {/* Close button */}
          {showCloseButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className={`flex-shrink-0 ${styles.text} hover:opacity-70 transition-opacity`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Toast container for managing multiple toasts
export interface ToastData {
  id: string;
  error: {
    error_code: string;
    error_title: string;
    user_message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'AUTH' | 'PERM' | 'CONN' | 'CONFIG' | 'VALID' | 'SYS';
  };
  duration?: number;
}

export interface AuthErrorToastContainerProps {
  toasts: ToastData[];
  onRemoveToast: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
}

export const AuthErrorToastContainer: React.FC<AuthErrorToastContainerProps> = ({
  toasts,
  onRemoveToast,
  position = 'top-right',
  maxToasts = 5
}) => {
  // Show only the most recent toasts
  const displayToasts = toasts.slice(-maxToasts);

  return (
    <div className="fixed z-50 pointer-events-none">
      {displayToasts.map((toast, index) => (
        <div
          key={toast.id}
          className="pointer-events-auto"
          style={{
            marginBottom: index > 0 ? '12px' : '0',
            zIndex: 50 - index
          }}
        >
          <AuthErrorToast
            isVisible={true}
            onClose={() => onRemoveToast(toast.id)}
            error={toast.error}
            position={position}
            duration={toast.duration}
          />
        </div>
      ))}
    </div>
  );
};

// Hook for managing toast notifications
export const useAuthErrorToast = () => {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);

  const showToast = (error: ToastData['error'], duration = 5000) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newToast: ToastData = {
      id,
      error,
      duration
    };

    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration + animation time
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration + 300);
    }

    return id;
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const clearAllToasts = () => {
    setToasts([]);
  };

  const showAuthError = (errorCode: string, message: string, severity: ToastData['error']['severity'] = 'medium') => {
    const category: ErrorCategory = errorCode.startsWith('AUTH') ? 'AUTH' :
                   errorCode.startsWith('PERM') ? 'PERM' :
                   errorCode.startsWith('CONN') ? 'CONN' :
                   errorCode.startsWith('CONFIG') ? 'CONFIG' :
                   errorCode.startsWith('VALID') ? 'VALID' : 'SYS';

    const error = {
      error_code: errorCode,
      error_title: getErrorTitle(category),
      user_message: message,
      severity,
      category
    };

    return showToast(error);
  };

  const getErrorTitle = (category: string): string => {
    switch (category) {
      case 'AUTH': return 'Authentication Error';
      case 'PERM': return 'Permission Error';
      case 'CONN': return 'Connection Error';
      case 'CONFIG': return 'Configuration Error';
      case 'VALID': return 'Validation Error';
      case 'SYS': return 'System Error';
      default: return 'Error';
    }
  };

  return {
    toasts,
    showToast,
    showAuthError,
    removeToast,
    clearAllToasts
  };
};

// Success toast variant
export const AuthSuccessToast: React.FC<{
  isVisible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  position?: AuthErrorToastProps['position'];
  duration?: number;
}> = ({ isVisible, onClose, title, message, position = 'top-right', duration = 3000 }) => {
  const [isClosing, setIsClosing] = React.useState(false);

  useEffect(() => {
    if (!isVisible || duration <= 0) return;

    const timer = setTimeout(() => {
      setIsClosing(true);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed z-50 ${POSITION_STYLES[position]} transition-all duration-300 ${
        isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
      style={{ maxWidth: '400px', minWidth: '300px' }}
    >
      <div className="bg-green-100 border border-green-200 rounded-lg shadow-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-0.5">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-green-800 mb-1">
              {title}
            </h4>
            <p className="text-sm text-green-800 opacity-90">
              {message}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-green-800 hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthErrorToast;