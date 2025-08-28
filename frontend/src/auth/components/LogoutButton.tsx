/**
 * 로그아웃 버튼 컴포넌트
 * 안전한 로그아웃 기능과 확인 다이얼로그 제공
 */

import React, { useState, useCallback } from 'react';
import SessionManager from '../session.js';

interface LogoutButtonProps {
  /** 버튼 텍스트 */
  children?: React.ReactNode;
  /** 로그아웃 후 리다이렉트할 경로 */
  redirectTo?: string;
  /** 확인 다이얼로그 표시 여부 */
  showConfirmDialog?: boolean;
  /** 전역 로그아웃 여부 (모든 탭에서 로그아웃) */
  globalLogout?: boolean;
  /** 로그아웃 성공 콜백 */
  onLogoutSuccess?: () => void;
  /** 로그아웃 실패 콜백 */
  onLogoutFailure?: (error: any) => void;
  /** 커스텀 스타일 클래스 */
  className?: string;
  /** 로딩 상태 */
  loading?: boolean;
  /** 비활성화 상태 */
  disabled?: boolean;
  /** 버튼 변형 */
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  /** 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 아이콘만 표시 */
  iconOnly?: boolean;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({
  children = '로그아웃',
  redirectTo = '/login',
  showConfirmDialog = true,
  globalLogout = true,
  onLogoutSuccess,
  onLogoutFailure,
  className = '',
  loading = false,
  disabled = false,
  variant = 'secondary',
  size = 'md',
  iconOnly = false
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  // 스타일 클래스 구성
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    outline: 'bg-transparent text-gray-600 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
  };

  const sizeClasses = {
    sm: iconOnly ? 'p-2' : 'px-3 py-2 text-sm',
    md: iconOnly ? 'p-2.5' : 'px-4 py-2 text-base',
    lg: iconOnly ? 'p-3' : 'px-6 py-3 text-lg'
  };

  const finalClasses = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    (loading || isLoading || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    className
  ].join(' ');

  /**
   * 로그아웃 처리
   */
  const handleLogout = useCallback(async () => {
    if (loading || isLoading || disabled) {
      return;
    }

    // 확인 다이얼로그 표시
    if (showConfirmDialog && !showDialog) {
      setShowDialog(true);
      return;
    }

    try {
      setIsLoading(true);
      setShowDialog(false);

      console.log('🔓 Initiating logout...', {
        globalLogout,
        redirectTo
      });

      // 세션 매니저를 통한 로그아웃
      const sessionManager = new SessionManager();
      await sessionManager.logout(globalLogout);

      console.log('✅ Logout successful');

      // 성공 콜백 호출
      if (onLogoutSuccess) {
        onLogoutSuccess();
      }

      // 짧은 지연 후 리다이렉트 (정리 작업 완료 대기)
      setTimeout(() => {
        window.location.href = redirectTo;
      }, 500);

    } catch (error: any) {
      console.error('❌ Logout failed:', error);

      // 실패 콜백 호출
      if (onLogoutFailure) {
        onLogoutFailure(error);
      }

      // 오류가 발생해도 로컬 정리는 수행되므로 리다이렉트
      setTimeout(() => {
        window.location.href = redirectTo;
      }, 1000);

    } finally {
      setIsLoading(false);
    }
  }, [
    loading,
    isLoading,
    disabled,
    showConfirmDialog,
    showDialog,
    globalLogout,
    redirectTo,
    onLogoutSuccess,
    onLogoutFailure
  ]);

  /**
   * 확인 다이얼로그 취소
   */
  const handleCancel = useCallback(() => {
    setShowDialog(false);
  }, []);

  /**
   * 로그아웃 아이콘 SVG
   */
  const LogoutIcon = () => (
    <svg
      className={iconOnly ? 'w-5 h-5' : 'w-4 h-4 mr-2'}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );

  return (
    <>
      {/* 로그아웃 버튼 */}
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading || isLoading || disabled}
        className={finalClasses}
        aria-label={iconOnly ? '로그아웃' : (typeof children === 'string' ? children : '로그아웃')}
        title={iconOnly ? '로그아웃' : undefined}
      >
        {/* 로딩 상태 또는 일반 상태 아이콘 */}
        {(loading || isLoading) ? (
          <svg
            className={iconOnly ? 'w-5 h-5 animate-spin' : 'w-4 h-4 mr-2 animate-spin'}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <LogoutIcon />
        )}
        
        {/* 버튼 텍스트 (아이콘 전용이 아닐 때) */}
        {!iconOnly && (
          <span>
            {(loading || isLoading) ? '로그아웃 중...' : children}
          </span>
        )}
      </button>

      {/* 확인 다이얼로그 */}
      {showDialog && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* 배경 오버레이 */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={handleCancel}
            />

            {/* 다이얼로그 정렬 헬퍼 */}
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" />

            {/* 다이얼로그 내용 */}
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  {/* 경고 아이콘 */}
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg
                      className="h-6 w-6 text-red-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.104 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                  </div>

                  {/* 다이얼로그 텍스트 */}
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      로그아웃 확인
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        정말 로그아웃하시겠습니까?
                        {globalLogout && (
                          <span className="block mt-1">
                            모든 탭에서 로그아웃됩니다.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 다이얼로그 버튼 */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      로그아웃 중...
                    </>
                  ) : (
                    '로그아웃'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LogoutButton;