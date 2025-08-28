/**
 * 로그인 버튼 컴포넌트
 * 다양한 로그인 옵션을 제공하는 통합 로그인 버튼
 */

import React, { useState, useCallback } from 'react';
import OIDCClient from '../oidc-client.js';
import SessionManager from '../session.js';

interface LoginButtonProps {
  /** 버튼 텍스트 */
  children?: React.ReactNode;
  /** 로그인 성공 후 리다이렉트할 경로 */
  redirectTo?: string;
  /** 계정 선택 강제 여부 */
  forceAccountSelection?: boolean;
  /** Remember Me 옵션 표시 여부 */
  showRememberMe?: boolean;
  /** 로그인 성공 콜백 */
  onLoginSuccess?: (userInfo: any) => void;
  /** 로그인 실패 콜백 */
  onLoginFailure?: (error: any) => void;
  /** 커스텀 스타일 클래스 */
  className?: string;
  /** 로딩 상태 */
  loading?: boolean;
  /** 비활성화 상태 */
  disabled?: boolean;
  /** 버튼 변형 */
  variant?: 'primary' | 'secondary' | 'outline';
  /** 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 전체 너비 */
  fullWidth?: boolean;
}

const LoginButton: React.FC<LoginButtonProps> = ({
  children = '로그인',
  redirectTo,
  forceAccountSelection = false,
  showRememberMe = false,
  onLoginSuccess,
  onLoginFailure,
  className = '',
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'md',
  fullWidth = false
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 스타일 클래스 구성
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    outline: 'bg-transparent text-blue-600 border border-blue-600 hover:bg-blue-50 focus:ring-blue-500'
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  const finalClasses = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    (loading || isLoading || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    className
  ].join(' ');

  /**
   * 로그인 처리
   */
  const handleLogin = useCallback(async () => {
    if (loading || isLoading || disabled) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log('🔐 Initiating login...', {
        forceAccountSelection,
        rememberMe,
        redirectTo
      });

      // OIDC 클라이언트 초기화
      const oidcClient = new OIDCClient();
      const sessionManager = new SessionManager();

      // 팝업 방식 로그인
      const authData = await oidcClient.createAuthorizationUrl({
        forceLogin: forceAccountSelection,
        selectAccount: forceAccountSelection
      });

      // 팝업 창 열기
      const popup = window.open(
        authData.authUrl,
        'oauth_login',
        'width=500,height=600,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
      );

      if (!popup) {
        throw new Error('팝업이 차단되었습니다. 팝업 차단을 해제하고 다시 시도해주세요.');
      }

      // 팝업 완료 대기
      const result = await waitForPopupComplete(popup, authData.state);

      if (result.error) {
        throw new Error(result.error);
      }

      // 토큰 교환
      const tokenResponse = await oidcClient.exchangeCodeForTokens(
        result.code,
        result.state
      );

      // ID Token 검증 및 사용자 정보 추출
      let userInfo = null;
      if (tokenResponse.id_token) {
        const idTokenClaims = await oidcClient.verifyIdToken(tokenResponse.id_token);
        userInfo = idTokenClaims;
      }

      // UserInfo 엔드포인트에서 추가 정보 조회
      if (tokenResponse.access_token) {
        const serverUserInfo = await oidcClient.getUserInfo(tokenResponse.access_token);
        userInfo = { ...userInfo, ...serverUserInfo };
      }

      // 세션 설정
      await sessionManager.login({
        tokens: tokenResponse,
        userInfo,
        loginMethod: 'oidc_popup'
      }, rememberMe);

      console.log('✅ Login successful');

      // 성공 콜백 호출
      if (onLoginSuccess) {
        onLoginSuccess(userInfo);
      }

      // 리다이렉트 처리
      if (redirectTo) {
        const returnUrl = new URL(redirectTo, window.location.origin);
        window.location.href = returnUrl.toString();
      } else {
        // URL에서 returnUrl 파라미터 확인
        const urlParams = new URLSearchParams(window.location.search);
        const returnUrl = urlParams.get('returnUrl');
        
        if (returnUrl) {
          window.location.href = returnUrl;
        } else {
          // 기본 대시보드로 이동
          window.location.href = '/dashboard';
        }
      }

    } catch (error: any) {
      console.error('❌ Login failed:', error);
      
      const errorMessage = error.message || '로그인 중 오류가 발생했습니다.';
      setError(errorMessage);

      // 실패 콜백 호출
      if (onLoginFailure) {
        onLoginFailure(error);
      }

      // 사용자에게 오류 표시
      if (errorMessage.includes('팝업')) {
        alert(errorMessage);
      } else {
        // 상세한 오류는 토스트나 모달로 표시
        console.error('Login error details:', error);
      }

    } finally {
      setIsLoading(false);
    }
  }, [
    loading, 
    isLoading, 
    disabled, 
    forceAccountSelection, 
    rememberMe, 
    redirectTo, 
    onLoginSuccess, 
    onLoginFailure
  ]);

  /**
   * 팝업 완료 대기
   */
  const waitForPopupComplete = useCallback((popup: Window, state: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          reject(new Error('사용자가 로그인을 취소했습니다.'));
        }
      }, 1000);

      const messageHandler = (event: MessageEvent) => {
        // 보안: 동일한 origin에서만 메시지 허용
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data.type === 'oauth_callback') {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          popup.close();

          if (event.data.error) {
            reject(new Error(event.data.error_description || event.data.error));
          } else if (event.data.code && event.data.state === state) {
            resolve({
              code: event.data.code,
              state: event.data.state
            });
          } else {
            reject(new Error('잘못된 OAuth 응답입니다.'));
          }
        }
      };

      window.addEventListener('message', messageHandler);

      // 타임아웃 설정 (5분)
      setTimeout(() => {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        if (!popup.closed) {
          popup.close();
        }
        reject(new Error('로그인 시간이 초과되었습니다.'));
      }, 5 * 60 * 1000);
    });
  }, []);

  return (
    <div className="space-y-2">
      {/* Remember Me 옵션 */}
      {showRememberMe && (
        <div className="flex items-center">
          <input
            id="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            disabled={loading || isLoading}
          />
          <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-700">
            로그인 상태 유지 (30일)
          </label>
        </div>
      )}

      {/* 로그인 버튼 */}
      <button
        type="button"
        onClick={handleLogin}
        disabled={loading || isLoading || disabled}
        className={finalClasses}
        aria-label={typeof children === 'string' ? children : '로그인'}
      >
        {/* 로딩 스피너 */}
        {(loading || isLoading) && (
          <svg
            className="w-4 h-4 mr-2 animate-spin"
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
        )}
        
        {/* 버튼 텍스트 */}
        <span>
          {(loading || isLoading) ? '로그인 중...' : children}
        </span>
      </button>

      {/* 오류 메시지 */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex items-start">
            <svg 
              className="w-4 h-4 mr-2 mt-0.5 text-red-500" 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path 
                fillRule="evenodd" 
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" 
                clipRule="evenodd" 
              />
            </svg>
            <div>
              <p className="font-medium">로그인 실패</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginButton;