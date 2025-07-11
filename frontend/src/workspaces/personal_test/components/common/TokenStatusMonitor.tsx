import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Clock, AlertTriangle } from 'lucide-react';
import { useTokenStatus } from '../../../../hooks/useAuthRefresh';
import { authService } from '../../../../services/authService';

interface TokenStatusMonitorProps {
  onTokenExpiring?: (timeToExpiry: number) => void;
  onTokenExpired?: () => void;
  onSaveBeforeExpiry?: () => void;
}

export const TokenStatusMonitor: React.FC<TokenStatusMonitorProps> = ({
  onTokenExpiring,
  onTokenExpired,
  onSaveBeforeExpiry
}) => {
  const [hasShownWarning, setHasShownWarning] = useState(false);
  const [hasShownUrgentWarning, setHasShownUrgentWarning] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showApiErrorModal, setShowApiErrorModal] = useState(false);

  useEffect(() => {
    const checkTokenStatus = () => {
      const timeToExpiry = authService.getTokenTimeToExpiry();
      const isAuthenticated = authService.isAuthenticated();

      if (!isAuthenticated) {
        if (onTokenExpired) {
          onTokenExpired();
        }
        return;
      }

      // 토큰 만료 5분 전 경고
      if (timeToExpiry <= 300 && timeToExpiry > 60 && !hasShownWarning) {
        setHasShownWarning(true);
        if (onTokenExpiring) {
          onTokenExpiring(timeToExpiry);
        }
        toast.error(
          `토큰이 ${Math.floor(timeToExpiry / 60)}분 후 만료됩니다. 작업을 저장해주세요.`,
          {
            duration: 6000,
            icon: '⏰',
          }
        );
      }

      // 토큰 만료 1분 전 긴급 경고
      if (timeToExpiry <= 60 && timeToExpiry > 0 && !hasShownUrgentWarning) {
        setHasShownUrgentWarning(true);
        setShowTokenModal(true);
        toast.error(
          `토큰이 1분 후 만료됩니다! 즉시 저장하세요.`,
          {
            duration: 8000,
            icon: '🚨',
          }
        );
      }

      // 토큰 만료됨
      if (timeToExpiry <= 0 && isAuthenticated) {
        if (onTokenExpired) {
          onTokenExpired();
        }
      }
    };

    // 30초마다 토큰 상태 확인
    const interval = setInterval(checkTokenStatus, 30000);
    
    // 초기 확인
    checkTokenStatus();

    return () => clearInterval(interval);
  }, [hasShownWarning, hasShownUrgentWarning, onTokenExpiring, onTokenExpired]);

  // API 에러로 인한 토큰 만료 이벤트 리스너
  useEffect(() => {
    const handleApiTokenError = (event: CustomEvent) => {
      console.log('🚨 API token error detected:', event.detail);
      setShowApiErrorModal(true);
    };

    window.addEventListener('auth:token-expired', handleApiTokenError as EventListener);
    
    return () => {
      window.removeEventListener('auth:token-expired', handleApiTokenError as EventListener);
    };
  }, []);

  const handleSaveAndContinue = () => {
    if (onSaveBeforeExpiry) {
      onSaveBeforeExpiry();
    }
    setShowTokenModal(false);
    toast.success('저장 완료. 토큰이 자동으로 갱신됩니다.', {
      icon: '✅',
    });
  };

  const handleLoginRedirect = () => {
    // 현재 페이지 정보를 저장하고 로그인 페이지로 이동
    const currentPath = window.location.pathname + window.location.search;
    const returnUrl = encodeURIComponent(currentPath);
    window.location.href = `/login?return=${returnUrl}`;
  };

  const handleApiErrorSave = () => {
    if (onSaveBeforeExpiry) {
      onSaveBeforeExpiry();
    }
    setShowApiErrorModal(false);
    toast.success('작업이 저장되었습니다. 재로그인하세요.', {
      icon: '💾',
    });
  };

  const handleApiErrorLogin = () => {
    handleLoginRedirect();
  };

  // API 에러 모달 렌더링
  if (showApiErrorModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center space-x-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                인증 오류
              </h3>
              <p className="text-sm text-gray-600">
                토큰이 만료되었습니다
              </p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-gray-700 mb-3">
              저장 요청이 실패했습니다. 토큰이 만료되어 서버에 접근할 수 없습니다.
            </p>
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-800">
                  작업을 잃지 않으려면 재로그인이 필요합니다
                </span>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleApiErrorSave}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              로컬 저장 후 로그인
            </button>
            <button
              onClick={handleApiErrorLogin}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              바로 로그인
            </button>
          </div>

          <button
            onClick={() => setShowApiErrorModal(false)}
            className="w-full mt-3 text-gray-500 text-sm hover:text-gray-700 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  if (!showTokenModal) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center space-x-3 mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              토큰 만료 임박
            </h3>
            <p className="text-sm text-gray-600">
              세션이 곧 만료됩니다
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-gray-700 mb-3">
            인증 토큰이 1분 내에 만료됩니다. 작업 내용을 잃지 않으려면 즉시 저장하거나 재로그인하세요.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                토큰 만료 후에는 저장할 수 없습니다
              </span>
            </div>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleSaveAndContinue}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            저장하고 계속
          </button>
          <button
            onClick={handleLoginRedirect}
            className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
          >
            재로그인
          </button>
        </div>

        <button
          onClick={() => setShowTokenModal(false)}
          className="w-full mt-3 text-gray-500 text-sm hover:text-gray-700 transition-colors"
        >
          나중에 처리
        </button>
      </div>
    </div>
  );
};