/**
 * Logout Confirmation Dialog
 * Provides secure logout confirmation with options for current session or all sessions
 */

import React, { useState } from 'react';
import { AlertTriangle, LogOut, Shield, Loader2 } from 'lucide-react';

interface LogoutConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (logoutAll?: boolean) => Promise<void>;
  userEmail?: string;
}

export const LogoutConfirmationDialog: React.FC<LogoutConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  userEmail
}) => {
  const [logoutAll, setLogoutAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm(logoutAll);
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-4">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                로그아웃 확인
              </h3>
              <p className="text-sm text-gray-500">
                {userEmail && `${userEmail}에서 로그아웃`}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="mb-6">
            <p className="text-gray-700 mb-4">
              정말로 로그아웃 하시겠습니까? 진행 중인 작업이 저장되지 않을 수 있습니다.
            </p>

            {/* Logout Options */}
            <div className="space-y-3">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="logoutType"
                  checked={!logoutAll}
                  onChange={() => setLogoutAll(false)}
                  className="mt-1 text-blue-600"
                  disabled={isLoading}
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <LogOut className="w-4 h-4 text-gray-600" />
                    <span className="font-medium text-gray-900">현재 세션만 로그아웃</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    이 브라우저에서만 로그아웃됩니다. 다른 기기의 세션은 유지됩니다.
                  </p>
                </div>
              </label>

              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="logoutType"
                  checked={logoutAll}
                  onChange={() => setLogoutAll(true)}
                  className="mt-1 text-blue-600"
                  disabled={isLoading}
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-red-600" />
                    <span className="font-medium text-gray-900">모든 세션에서 로그아웃</span>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">보안</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    모든 기기와 브라우저에서 로그아웃됩니다. 보안상 권장됩니다.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Security Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
            <div className="flex items-start space-x-2">
              <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">보안 알림</p>
                <p className="mt-1">
                  로그아웃 시 모든 토큰이 안전하게 무효화되며, 서버에서 완전히 제거됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>로그아웃 중...</span>
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  <span>{logoutAll ? '모든 세션에서 로그아웃' : '로그아웃'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogoutConfirmationDialog;