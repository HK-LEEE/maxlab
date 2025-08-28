import React, { useState, useCallback, useEffect } from 'react';

interface OAuthLoginButtonProps {
  /** 버튼 텍스트 */
  children?: React.ReactNode;
  /** 버튼 스타일 타입 */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  /** 버튼 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 리다이렉트 URL (선택적) */
  redirectUri?: string;
  /** 요청할 스코프 */
  scope?: string[];
  /** 로그인 성공 콜백 */
  onSuccess?: (tokens: { access_token: string; id_token: string }) => void;
  /** 로그인 실패 콜백 */
  onError?: (error: string) => void;
  /** 다른 사용자로 로그인 강제 */
  forceLogin?: boolean;
  /** 계정 선택 모드 */
  prompt?: 'login' | 'consent' | 'select_account' | 'none';
  /** 추가 CSS 클래스 */
  className?: string;
  /** 비활성화 상태 */
  disabled?: boolean;
  /** 로딩 상태 표시 */
  loading?: boolean;
}

/**
 * MAX Platform OAuth 로그인 버튼 컴포넌트
 * 
 * 기능:
 * - 원클릭 OAuth 로그인
 * - 팝업 및 리다이렉트 방식 지원
 * - 에러 처리 및 복구
 * - 접근성 최적화
 * - 반응형 디자인
 */
const OAuthLoginButton: React.FC<OAuthLoginButtonProps> = ({
  children = '로그인',
  variant = 'primary',
  size = 'md',
  redirectUri,
  scope = ['openid', 'profile', 'email'],
  onSuccess,
  onError,
  forceLogin = false,
  prompt,
  className = '',
  disabled = false,
  loading = false,
}) => {
  const [isLoading, setIsLoading] = useState(loading);
  const [error, setError] = useState<string | null>(null);

  // 환경 설정
  const config = {
    authUrl: process.env.REACT_APP_MAX_PLATFORM_AUTH_URL || 'https://max.dwchem.co.kr/auth',
    clientId: process.env.REACT_APP_MAX_PLATFORM_CLIENT_ID || 'maxlab',
    redirectUri: redirectUri || `${window.location.origin}/oauth/callback`,
    scope: scope.join(' '),
  };

  // PKCE 코드 생성
  const generateCodeVerifier = () => {
    const array = new Uint32Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (dec) => ('0' + dec.toString(16)).substr(-2)).join('');
  };

  const generateCodeChallenge = async (verifier: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  // OAuth 상태 생성
  const generateState = () => {
    return crypto.getRandomValues(new Uint32Array(4)).join('');
  };

  // OAuth URL 생성
  const createOAuthUrl = useCallback(async () => {
    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateState();

      // PKCE 정보 저장
      sessionStorage.setItem('oauth_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...(forceLogin && { prompt: 'login' }),
        ...(prompt && { prompt }),
      });

      return `${config.authUrl}?${params.toString()}`;
    } catch (err) {
      console.error('OAuth URL 생성 실패:', err);
      throw new Error('로그인 URL 생성에 실패했습니다.');
    }
  }, [config, forceLogin, prompt]);

  // 팝업 로그인 처리
  const handlePopupLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const oauthUrl = await createOAuthUrl();
      
      // 팝업 창 열기
      const popup = window.open(
        oauthUrl,
        'max_oauth_popup',
        'width=500,height=600,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
      );

      if (!popup) {
        throw new Error('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
      }

      // 팝업 모니터링
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsLoading(false);
          
          // 토큰 확인
          const tokens = sessionStorage.getItem('oauth_tokens');
          if (tokens) {
            const parsedTokens = JSON.parse(tokens);
            sessionStorage.removeItem('oauth_tokens');
            onSuccess?.(parsedTokens);
          } else {
            onError?.('로그인이 취소되었습니다.');
          }
        }
      }, 1000);

      // 메시지 리스너 (콜백 페이지에서 전송)
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'OAUTH_SUCCESS') {
          clearInterval(checkClosed);
          popup.close();
          setIsLoading(false);
          onSuccess?.(event.data.tokens);
        } else if (event.data.type === 'OAUTH_ERROR') {
          clearInterval(checkClosed);
          popup.close();
          setIsLoading(false);
          setError(event.data.error);
          onError?.(event.data.error);
        }
      };

      window.addEventListener('message', messageHandler);

      // 정리 함수
      return () => {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        if (!popup.closed) popup.close();
      };

    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [createOAuthUrl, onSuccess, onError]);

  // 리다이렉트 로그인 처리
  const handleRedirectLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const oauthUrl = await createOAuthUrl();
      window.location.href = oauthUrl;
    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [createOAuthUrl, onError]);

  // 로그인 방식 결정 및 실행
  const handleLogin = useCallback(async () => {
    if (disabled || isLoading) return;

    // 모바일 디바이스는 리다이렉트 방식 사용
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

    if (isMobile || redirectUri) {
      await handleRedirectLogin();
    } else {
      await handlePopupLogin();
    }
  }, [disabled, isLoading, redirectUri, handleRedirectLogin, handlePopupLogin]);

  // 키보드 접근성
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleLogin();
    }
  }, [handleLogin]);

  // 로딩 상태 업데이트
  useEffect(() => {
    setIsLoading(loading);
  }, [loading]);

  // 스타일 클래스 생성
  const getButtonClasses = () => {
    const baseClasses = [
      'max-oauth-btn',
      `max-oauth-btn-${variant}`,
      `max-oauth-btn-${size}`,
      className,
    ];

    if (disabled || isLoading) {
      baseClasses.push('max-oauth-btn-disabled');
    }

    if (error) {
      baseClasses.push('max-oauth-btn-error');
    }

    return baseClasses.filter(Boolean).join(' ');
  };

  return (
    <div className="max-oauth-btn-wrapper">
      <button
        type="button"
        className={getButtonClasses()}
        onClick={handleLogin}
        onKeyDown={handleKeyDown}
        disabled={disabled || isLoading}
        aria-label={`MAX Platform ${children} 버튼`}
        aria-describedby={error ? 'oauth-error' : undefined}
      >
        {isLoading ? (
          <>
            <div className="max-oauth-spinner" />
            <span>로그인 중...</span>
          </>
        ) : (
          <>
            <svg className="max-oauth-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            {children}
          </>
        )}
      </button>

      {error && (
        <div 
          id="oauth-error" 
          className="max-oauth-error"
          role="alert"
          aria-live="polite"
        >
          {error}
          <button
            type="button"
            className="max-oauth-error-close"
            onClick={() => setError(null)}
            aria-label="오류 메시지 닫기"
          >
            ×
          </button>
        </div>
      )}

      <style jsx>{`
        .max-oauth-btn-wrapper {
          display: inline-block;
          position: relative;
        }

        .max-oauth-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.75rem;
          font-size: 1rem;
          font-weight: 600;
          font-family: inherit;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          min-height: 2.75rem;
          white-space: nowrap;
        }

        .max-oauth-btn:focus {
          outline: 2px solid #4f46e5;
          outline-offset: 2px;
        }

        .max-oauth-btn:not(:disabled):hover {
          transform: translateY(-1px);
        }

        .max-oauth-btn:not(:disabled):active {
          transform: translateY(0);
        }

        /* 버튼 변형 스타일 */
        .max-oauth-btn-primary {
          background: #4f46e5;
          color: white;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .max-oauth-btn-primary:not(:disabled):hover {
          background: #4338ca;
          box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
        }

        .max-oauth-btn-secondary {
          background: #6b7280;
          color: white;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .max-oauth-btn-secondary:not(:disabled):hover {
          background: #4b5563;
        }

        .max-oauth-btn-outline {
          background: transparent;
          color: #4f46e5;
          border: 2px solid #4f46e5;
        }

        .max-oauth-btn-outline:not(:disabled):hover {
          background: #4f46e5;
          color: white;
        }

        .max-oauth-btn-ghost {
          background: transparent;
          color: #6b7280;
          border: 2px solid transparent;
        }

        .max-oauth-btn-ghost:not(:disabled):hover {
          background: #f9fafb;
          color: #4f46e5;
        }

        /* 버튼 크기 */
        .max-oauth-btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          min-height: 2.25rem;
        }

        .max-oauth-btn-md {
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          min-height: 2.75rem;
        }

        .max-oauth-btn-lg {
          padding: 1rem 2rem;
          font-size: 1.125rem;
          min-height: 3.25rem;
        }

        /* 비활성화 상태 */
        .max-oauth-btn-disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }

        /* 아이콘 */
        .max-oauth-icon {
          width: 1.25rem;
          height: 1.25rem;
          flex-shrink: 0;
        }

        .max-oauth-btn-sm .max-oauth-icon {
          width: 1rem;
          height: 1rem;
        }

        .max-oauth-btn-lg .max-oauth-icon {
          width: 1.5rem;
          height: 1.5rem;
        }

        /* 스피너 */
        .max-oauth-spinner {
          width: 1.25rem;
          height: 1.25rem;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* 에러 메시지 */
        .max-oauth-error {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #fee2e2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          font-size: 0.875rem;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          margin-top: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          animation: slideDown 0.3s ease-out;
          z-index: 10;
        }

        .max-oauth-error-close {
          background: none;
          border: none;
          color: #b91c1c;
          cursor: pointer;
          font-size: 1.25rem;
          padding: 0;
          margin-left: 0.5rem;
          border-radius: 0.25rem;
          width: 1.5rem;
          height: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .max-oauth-error-close:hover {
          background: rgba(185, 28, 28, 0.1);
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-0.5rem);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* 다크 모드 지원 */
        @media (prefers-color-scheme: dark) {
          .max-oauth-btn-ghost:not(:disabled):hover {
            background: #374151;
            color: #6366f1;
          }

          .max-oauth-error {
            background: #3f1f1f;
            border-color: #7f1d1d;
            color: #fca5a5;
          }

          .max-oauth-error-close {
            color: #fca5a5;
          }

          .max-oauth-error-close:hover {
            background: rgba(248, 113, 113, 0.1);
          }
        }

        /* 반응형 */
        @media (max-width: 640px) {
          .max-oauth-btn {
            width: 100%;
            justify-content: center;
          }

          .max-oauth-error {
            font-size: 0.8125rem;
          }
        }

        /* 고대비 모드 */
        @media (prefers-contrast: high) {
          .max-oauth-btn {
            border: 2px solid currentColor;
          }
          
          .max-oauth-error {
            border-width: 2px;
          }
        }

        /* 감소된 모션 */
        @media (prefers-reduced-motion: reduce) {
          .max-oauth-btn,
          .max-oauth-spinner,
          .max-oauth-error {
            transition: none;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
};

export default OAuthLoginButton;