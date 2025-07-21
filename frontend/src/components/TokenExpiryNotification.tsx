/**
 * Token Expiry Notification Component
 * Displays user-friendly notifications for token status and expiry
 */

import React, { useState, useEffect } from 'react';
import { useTokenExpiryNotification } from '../hooks/useAuthRefresh';
import { authService } from '../services/authService';

interface NotificationProps {
  type: 'warning' | 'info' | 'error';
  message: string;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

const NotificationBanner: React.FC<NotificationProps> = ({
  type,
  message,
  action,
  onAction,
  onDismiss
}) => {
  const bgColor = {
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
    error: 'bg-red-50 border-red-200'
  }[type];

  const textColor = {
    warning: 'text-yellow-800',
    info: 'text-blue-800',
    error: 'text-red-800'
  }[type];

  const buttonColor = {
    warning: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800',
    info: 'bg-blue-100 hover:bg-blue-200 text-blue-800',
    error: 'bg-red-100 hover:bg-red-200 text-red-800'
  }[type];

  const iconColor = {
    warning: 'text-yellow-400',
    info: 'text-blue-400',
    error: 'text-red-400'
  }[type];

  const Icon = () => {
    switch (type) {
      case 'warning':
        return (
          <svg className={`h-5 w-5 ${iconColor}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
        return (
          <svg className={`h-5 w-5 ${iconColor}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className={`h-5 w-5 ${iconColor}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getActionText = () => {
    switch (action) {
      case 'login':
        return 'Log In';
      case 'refresh':
        return 'Refresh';
      case 'save':
        return 'Save Work';
      default:
        return 'OK';
    }
  };

  return (
    <div className={`border-l-4 p-4 ${bgColor} border-l-4`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon />
        </div>
        <div className="ml-3 flex-1">
          <p className={`text-sm ${textColor}`}>
            {message}
          </p>
        </div>
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5 flex">
            {action && onAction && (
              <button
                type="button"
                className={`inline-flex rounded-md p-1.5 text-sm font-medium ${buttonColor} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-yellow-50 focus:ring-yellow-600`}
                onClick={onAction}
              >
                {getActionText()}
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                className={`ml-2 inline-flex rounded-md p-1.5 ${textColor} hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-yellow-50 focus:ring-yellow-600`}
                onClick={onDismiss}
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TokenExpiryNotification: React.FC = () => {
  const notifications = useTokenExpiryNotification();
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());

  // 자동으로 일부 알림 제거 (중복 방지)
  const activeNotifications = notifications.filter(notification => 
    !dismissedNotifications.has(notification.message)
  );

  const handleAction = async (action: string) => {
    switch (action) {
      case 'login':
        // 로그인 페이지로 리다이렉트
        const currentPath = window.location.pathname + window.location.search;
        const returnUrl = encodeURIComponent(currentPath);
        window.location.href = `/login?return=${returnUrl}`;
        break;
      
      case 'refresh':
        // 수동 토큰 갱신 시도
        try {
          const success = await authService.refreshToken();
          if (!success) {
            // 갱신 실패 시 로그인 페이지로
            handleAction('login');
          }
        } catch (error) {
          console.error('Manual token refresh failed:', error);
          handleAction('login');
        }
        break;
      
      case 'save':
        // 사용자에게 작업 저장 알림 (구체적 구현은 애플리케이션에 따라)
        console.log('User should save their work');
        // 여기서 애플리케이션별 저장 로직 호출
        break;
    }
  };

  const handleDismiss = (message: string) => {
    setDismissedNotifications(prev => new Set([...prev, message]));
  };

  // 알림이 변경되면 기존 해제된 알림 목록 리셋
  useEffect(() => {
    setDismissedNotifications(new Set());
  }, [notifications.length]);

  if (activeNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 space-y-2 p-4">
      {activeNotifications.map((notification, index) => (
        <NotificationBanner
          key={`${notification.type}-${notification.message}-${index}`}
          type={notification.type}
          message={notification.message}
          action={notification.action}
          onAction={notification.action ? () => handleAction(notification.action!) : undefined}
          onDismiss={() => handleDismiss(notification.message)}
        />
      ))}
    </div>
  );
};


export default TokenExpiryNotification;