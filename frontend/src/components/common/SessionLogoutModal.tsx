/**
 * Session Logout Modal Component
 * Allows users to choose between logging out current session or all sessions
 */

import React, { useState, useEffect } from 'react';
import { X, Monitor, Smartphone, Tablet, AlertTriangle, MapPin, Clock, Shield } from 'lucide-react';
import { sessionService } from '../../services/sessionService';

// Define types locally to avoid import issues
type LogoutType = 'current' | 'all';

interface SessionInfo {
  session_id: string;
  client_id: string;
  client_name: string;
  created_at: string;
  last_used_at: string;
  ip_address?: string;
  user_agent?: string;
  device_info?: {
    device_type: 'desktop' | 'mobile' | 'tablet';
    browser: string;
    os: string;
  };
  location?: {
    country: string;
    city: string;
  };
  is_current_session: boolean;
  is_suspicious: boolean;
}

interface SessionLogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionsData: any | null;
  isLoading: boolean;
  onLogout: (logoutType: LogoutType) => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
}

export const SessionLogoutModal: React.FC<SessionLogoutModalProps> = ({
  isOpen,
  onClose,
  sessionsData,
  isLoading,
  onLogout,
  fetchActiveSessions
}) => {
  const [logoutType, setLogoutType] = useState<LogoutType>('current');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch sessions when modal opens
  useEffect(() => {
    if (isOpen && !sessionsData) {
      fetchActiveSessions();
    }
  }, [isOpen, sessionsData, fetchActiveSessions]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setLogoutType('current');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleLogout = async () => {
    setIsSubmitting(true);
    try {
      await onLogout(logoutType);
    } catch (error) {
      // Error is handled in the hook
      setIsSubmitting(false);
    }
  };

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="w-4 h-4" />;
      case 'tablet':
        return <Tablet className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  const renderSessionItem = (session: SessionInfo, isCurrent = false) => {
    const info = sessionService.formatSessionInfo(session);
    const age = sessionService.getSessionAge(session);

    return (
      <div
        key={session.session_id}
        className={`
          border rounded-lg p-4 space-y-2
          ${isCurrent ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}
          ${session.is_suspicious ? 'border-red-500 bg-red-50' : ''}
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getDeviceIcon(session.device_info?.device_type)}
            <span className="font-medium text-gray-900">{info.displayName}</span>
            {isCurrent && (
              <span className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded">
                현재 세션
              </span>
            )}
            {session.is_suspicious && (
              <span className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3" />
                <span>의심스러운 활동</span>
              </span>
            )}
          </div>
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <div className="flex items-center space-x-2">
            <Monitor className="w-3 h-3" />
            <span>{info.deviceDescription}</span>
          </div>
          {session.location && (
            <div className="flex items-center space-x-2">
              <MapPin className="w-3 h-3" />
              <span>{info.locationDescription}</span>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <Clock className="w-3 h-3" />
            <span>마지막 사용: {info.lastUsedDescription} ({age})</span>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">로그아웃 옵션 선택</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 transition-colors"
                disabled={isSubmitting}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : sessionsData ? (
              <div className="space-y-6">
                {/* Session Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-700">
                    총 <span className="font-semibold">{sessionsData.total_sessions}개</span>의 활성 세션이 있습니다.
                  </p>
                  {sessionsData.suspicious_sessions > 0 && (
                    <div className="mt-3 flex items-start space-x-2 p-3 bg-red-100 border border-red-300 rounded-md">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-800">
                        <p className="font-semibold">
                          {sessionsData.suspicious_sessions}개의 의심스러운 세션이 감지되었습니다.
                        </p>
                        <p className="mt-1">
                          보안을 위해 모든 세션에서 로그아웃하는 것을 권장합니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Logout Options */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-900">로그아웃 옵션:</h3>
                  
                  <label className="relative block cursor-pointer">
                    <input
                      type="radio"
                      name="logoutType"
                      value="current"
                      checked={logoutType === 'current'}
                      onChange={(e) => setLogoutType(e.target.value as LogoutType)}
                      className="sr-only"
                    />
                    <div className={`
                      border-2 rounded-lg p-4 transition-all
                      ${logoutType === 'current' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                      }
                    `}>
                      <div className="flex items-start space-x-3">
                        <div className={`
                          w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5
                          ${logoutType === 'current' 
                            ? 'border-blue-500' 
                            : 'border-gray-300'
                          }
                        `}>
                          {logoutType === 'current' && (
                            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">현재 세션만 로그아웃</p>
                          <p className="mt-1 text-sm text-gray-600">
                            이 디바이스/브라우저에서만 로그아웃됩니다. 다른 디바이스의 세션은 유지됩니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  </label>

                  <label className="relative block cursor-pointer">
                    <input
                      type="radio"
                      name="logoutType"
                      value="all"
                      checked={logoutType === 'all'}
                      onChange={(e) => setLogoutType(e.target.value as LogoutType)}
                      className="sr-only"
                    />
                    <div className={`
                      border-2 rounded-lg p-4 transition-all
                      ${logoutType === 'all' 
                        ? 'border-red-500 bg-red-50' 
                        : 'border-gray-200 hover:border-gray-300'
                      }
                    `}>
                      <div className="flex items-start space-x-3">
                        <div className={`
                          w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5
                          ${logoutType === 'all' 
                            ? 'border-red-500' 
                            : 'border-gray-300'
                          }
                        `}>
                          {logoutType === 'all' && (
                            <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">모든 세션에서 로그아웃</p>
                          <p className="mt-1 text-sm text-gray-600">
                            모든 디바이스와 브라우저에서 로그아웃됩니다. 다시 로그인해야 합니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Current Session */}
                {sessionsData.current_session && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">현재 세션:</h4>
                    {renderSessionItem(sessionsData.current_session, true)}
                  </div>
                )}

                {/* Other Sessions */}
                {sessionsData.other_sessions?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      다른 활성 세션 ({sessionsData.other_sessions.length}개):
                    </h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {sessionsData.other_sessions.map((session: SessionInfo) => 
                        renderSessionItem(session)
                      )}
                    </div>
                  </div>
                )}

                {/* Security Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                      <p className="font-medium mb-2">보안 권고사항:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>공용 컴퓨터나 의심스러운 디바이스에서 로그인한 경우 모든 세션에서 로그아웃하세요.</li>
                        <li>정기적으로 활성 세션을 확인하고 인식하지 못하는 세션을 제거하세요.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                세션 정보를 불러올 수 없습니다.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleLogout}
                disabled={isSubmitting || isLoading}
                className={`
                  px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${logoutType === 'all' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                  }
                `}
              >
                {isSubmitting 
                  ? '로그아웃 중...' 
                  : (logoutType === 'current' ? '현재 세션 로그아웃' : '모든 세션 로그아웃')
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};