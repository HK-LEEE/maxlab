import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface OAuthCallbackProps {
  /** 로그인 성공 시 리다이렉트 URL */
  redirectTo?: string;
  /** 로그인 성공 콜백 */
  onSuccess?: (tokens: { access_token: string; id_token: string; user?: any }) => void;
  /** 로그인 실패 콜백 */
  onError?: (error: string) => void;
  /** 토큰 저장 방식 (localStorage, sessionStorage, memory) */
  tokenStorage?: 'localStorage' | 'sessionStorage' | 'memory';
  /** 자동 리다이렉트 비활성화 */
  disableAutoRedirect?: boolean;
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * OAuth 콜백 처리 컴포넌트
 * 
 * 기능:
 * - Authorization Code 교환
 * - PKCE 검증
 * - 토큰 저장
 * - 사용자 정보 취득
 * - 에러 처리 및 복구
 * - 팝업/리다이렉트 모드 지원
 */
const OAuthCallback: React.FC<OAuthCallbackProps> = ({
  redirectTo = '/',
  onSuccess,
  onError,
  tokenStorage = 'localStorage',
  disableAutoRedirect = false,
}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // 환경 설정
  const config = {
    tokenUrl: process.env.REACT_APP_MAX_PLATFORM_TOKEN_URL || 'https://max.dwchem.co.kr/token',
    userInfoUrl: process.env.REACT_APP_MAX_PLATFORM_USERINFO_URL || 'https://max.dwchem.co.kr/me',
    clientId: process.env.REACT_APP_MAX_PLATFORM_CLIENT_ID || 'maxlab',
  };

  // 토큰 저장
  const storeTokens = useCallback((tokens: TokenResponse) => {
    const tokenData = {
      access_token: tokens.access_token,
      id_token: tokens.id_token,
      token_type: tokens.token_type,
      expires_at: Date.now() + (tokens.expires_in * 1000),
      scope: tokens.scope,
    };

    const tokenString = JSON.stringify(tokenData);

    switch (tokenStorage) {
      case 'localStorage':
        localStorage.setItem('max_auth_tokens', tokenString);
        break;
      case 'sessionStorage':
        sessionStorage.setItem('max_auth_tokens', tokenString);
        break;
      case 'memory':
        // 메모리에만 저장 (전역 변수 또는 상태 관리자 사용)
        (window as any).__maxAuthTokens = tokenData;
        break;
    }
  }, [tokenStorage]);

  // 사용자 정보 취득
  const fetchUserInfo = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch(config.userInfoUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`사용자 정보 취득 실패: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.warn('사용자 정보를 가져올 수 없습니다:', err);
      return null;
    }
  }, [config.userInfoUrl]);

  // Authorization Code를 토큰으로 교환
  const exchangeCodeForTokens = useCallback(async (code: string, state: string) => {
    try {
      setProgress(25);

      // 저장된 PKCE 정보 확인
      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
      const savedState = sessionStorage.getItem('oauth_state');

      if (!codeVerifier || !savedState) {
        throw new Error('PKCE 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
      }

      if (savedState !== state) {
        throw new Error('State 매개변수가 일치하지 않습니다. 보안을 위해 로그인을 다시 시도해주세요.');
      }

      setProgress(50);

      // 토큰 요청
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code,
        redirect_uri: window.location.origin + '/oauth/callback',
        code_verifier: codeVerifier,
      });

      const tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(errorData.error_description || `토큰 교환 실패: ${tokenResponse.status}`);
      }

      const tokens: TokenResponse = await tokenResponse.json();
      setProgress(75);

      // 토큰 저장
      storeTokens(tokens);

      // 사용자 정보 취득
      const userInfo = await fetchUserInfo(tokens.access_token);
      setProgress(100);

      // PKCE 정보 정리
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('oauth_state');

      return { tokens, userInfo };
    } catch (err) {
      console.error('토큰 교환 오류:', err);
      throw err;
    }
  }, [config, storeTokens, fetchUserInfo]);

  // 팝업 모드에서 부모 창에 메시지 전송
  const sendMessageToParent = useCallback((type: 'success' | 'error', data: any) => {
    if (window.opener) {
      const message = type === 'success' 
        ? { type: 'OAUTH_SUCCESS', tokens: data.tokens, user: data.userInfo }
        : { type: 'OAUTH_ERROR', error: data };
      
      window.opener.postMessage(message, window.location.origin);
    }
  }, []);

  // 리다이렉트 처리
  const handleRedirect = useCallback((tokens: TokenResponse, userInfo: any) => {
    if (disableAutoRedirect) return;

    // 저장된 리다이렉트 URL 확인
    const savedRedirect = sessionStorage.getItem('oauth_redirect_to') || redirectTo;
    sessionStorage.removeItem('oauth_redirect_to');

    setTimeout(() => {
      navigate(savedRedirect, { replace: true });
    }, 2000);
  }, [disableAutoRedirect, redirectTo, navigate]);

  // OAuth 콜백 처리
  useEffect(() => {
    const processCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // 에러 파라미터 확인
        if (error) {
          const errorMsg = errorDescription || `OAuth 오류: ${error}`;
          setError(errorMsg);
          setStatus('error');
          onError?.(errorMsg);
          sendMessageToParent('error', errorMsg);
          return;
        }

        // 필수 파라미터 확인
        if (!code || !state) {
          const errorMsg = '잘못된 OAuth 응답입니다. Authorization Code 또는 State가 없습니다.';
          setError(errorMsg);
          setStatus('error');
          onError?.(errorMsg);
          sendMessageToParent('error', errorMsg);
          return;
        }

        // 토큰 교환 처리
        const result = await exchangeCodeForTokens(code, state);
        
        setStatus('success');
        onSuccess?.(result.tokens);
        
        // 팝업 모드 처리
        if (window.opener) {
          sendMessageToParent('success', result);
          // 팝업 자동 닫기
          setTimeout(() => window.close(), 1000);
        } else {
          // 리다이렉트 모드 처리
          handleRedirect(result.tokens, result.userInfo);
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.';
        setError(errorMessage);
        setStatus('error');
        onError?.(errorMessage);
        sendMessageToParent('error', errorMessage);
      }
    };

    processCallback();
  }, [searchParams, exchangeCodeForTokens, onSuccess, onError, sendMessageToParent, handleRedirect]);

  // 재시도 함수
  const handleRetry = useCallback(() => {
    window.location.href = '/login';
  }, []);

  // 홈으로 가기
  const handleGoHome = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="max-oauth-callback">
      <div className="max-oauth-callback-container">
        <div className="max-oauth-callback-card">
          {/* 로고 */}
          <div className="max-oauth-callback-logo">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7v10c0 5.55 3.84 9.739 9 11 5.16-1.261 9-5.45 9-11V7l-10-5z"/>
              <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
            </svg>
          </div>

          {/* 제목 */}
          <h1 className="max-oauth-callback-title">
            {status === 'loading' && 'MAX Platform 로그인 중...'}
            {status === 'success' && '로그인 성공!'}
            {status === 'error' && '로그인 오류'}
          </h1>

          {/* 내용 */}
          <div className="max-oauth-callback-content">
            {status === 'loading' && (
              <div className="max-oauth-callback-loading">
                <div className="max-oauth-progress-bar">
                  <div 
                    className="max-oauth-progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="max-oauth-loading-text">
                  {progress < 25 && '인증 정보를 확인하는 중...'}
                  {progress >= 25 && progress < 50 && 'PKCE 보안 검증 중...'}
                  {progress >= 50 && progress < 75 && '액세스 토큰 요청 중...'}
                  {progress >= 75 && progress < 100 && '사용자 정보 로딩 중...'}
                  {progress >= 100 && '로그인 완료!'}
                </p>
                <div className="max-oauth-spinner" />
              </div>
            )}

            {status === 'success' && (
              <div className="max-oauth-callback-success">
                <div className="max-oauth-success-icon">✓</div>
                <p className="max-oauth-success-text">
                  MAX Platform에 성공적으로 로그인했습니다.
                </p>
                {!disableAutoRedirect && !window.opener && (
                  <p className="max-oauth-redirect-text">
                    잠시 후 자동으로 이동합니다...
                  </p>
                )}
              </div>
            )}

            {status === 'error' && (
              <div className="max-oauth-callback-error">
                <div className="max-oauth-error-icon">⚠️</div>
                <p className="max-oauth-error-text">
                  {error}
                </p>
                
                <div className="max-oauth-error-actions">
                  <button
                    type="button"
                    className="max-oauth-retry-btn"
                    onClick={handleRetry}
                  >
                    다시 로그인
                  </button>
                  
                  <button
                    type="button"
                    className="max-oauth-home-btn"
                    onClick={handleGoHome}
                  >
                    홈으로 가기
                  </button>
                </div>

                <div className="max-oauth-error-help">
                  <p>문제가 지속되면 다음을 시도해보세요:</p>
                  <ul>
                    <li>브라우저 캐시와 쿠키 삭제</li>
                    <li>시크릿 모드에서 로그인</li>
                    <li>다른 브라우저 사용</li>
                    <li>
                      <a 
                        href="https://dwchem.co.kr/support" 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        기술 지원팀에 문의
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .max-oauth-callback {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
        }

        .max-oauth-callback-container {
          max-width: 480px;
          width: 100%;
        }

        .max-oauth-callback-card {
          background: white;
          border-radius: 1rem;
          box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
          padding: 2.5rem 2rem;
          text-align: center;
          animation: slideInUp 0.5s ease-out;
        }

        .max-oauth-callback-logo {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          border-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
          box-shadow: 0 10px 15px rgba(79, 70, 229, 0.3);
        }

        .max-oauth-callback-logo svg {
          width: 40px;
          height: 40px;
        }

        .max-oauth-callback-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0 0 1.5rem;
          letter-spacing: -0.025em;
        }

        .max-oauth-callback-content {
          min-height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* 로딩 상태 */
        .max-oauth-callback-loading {
          width: 100%;
        }

        .max-oauth-progress-bar {
          width: 100%;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 1.5rem;
        }

        .max-oauth-progress-fill {
          height: 100%;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border-radius: 4px;
          transition: width 0.5s ease;
          position: relative;
        }

        .max-oauth-progress-fill::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.2) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255, 255, 255, 0.2) 50%,
            rgba(255, 255, 255, 0.2) 75%,
            transparent 75%,
            transparent
          );
          background-size: 8px 8px;
          animation: progressStripe 1s linear infinite;
        }

        .max-oauth-loading-text {
          color: #6b7280;
          font-size: 1rem;
          margin: 0 0 1.5rem;
          font-weight: 500;
        }

        .max-oauth-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e5e7eb;
          border-top: 3px solid #4f46e5;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }

        /* 성공 상태 */
        .max-oauth-callback-success {
          width: 100%;
        }

        .max-oauth-success-icon {
          width: 80px;
          height: 80px;
          background: #d1fae5;
          color: #065f46;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          font-weight: bold;
          margin: 0 auto 1.5rem;
          animation: bounceIn 0.6s ease-out;
        }

        .max-oauth-success-text {
          color: #1f2937;
          font-size: 1.125rem;
          font-weight: 500;
          margin: 0 0 1rem;
          line-height: 1.6;
        }

        .max-oauth-redirect-text {
          color: #6b7280;
          font-size: 0.875rem;
          margin: 0;
          animation: pulse 2s infinite;
        }

        /* 에러 상태 */
        .max-oauth-callback-error {
          width: 100%;
        }

        .max-oauth-error-icon {
          width: 80px;
          height: 80px;
          background: #fee2e2;
          color: #dc2626;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          margin: 0 auto 1.5rem;
          animation: shakeX 0.5s ease-out;
        }

        .max-oauth-error-text {
          color: #dc2626;
          font-size: 1rem;
          font-weight: 500;
          margin: 0 0 2rem;
          line-height: 1.6;
          padding: 1rem;
          background: #fee2e2;
          border-radius: 0.5rem;
          border: 1px solid #fecaca;
        }

        .max-oauth-error-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-bottom: 2rem;
        }

        .max-oauth-retry-btn {
          background: #4f46e5;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 120px;
        }

        .max-oauth-retry-btn:hover {
          background: #4338ca;
          transform: translateY(-1px);
        }

        .max-oauth-home-btn {
          background: #6b7280;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 120px;
        }

        .max-oauth-home-btn:hover {
          background: #4b5563;
          transform: translateY(-1px);
        }

        .max-oauth-error-help {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1.5rem;
          text-align: left;
        }

        .max-oauth-error-help p {
          color: #6b7280;
          font-size: 0.875rem;
          font-weight: 500;
          margin: 0 0 0.75rem;
        }

        .max-oauth-error-help ul {
          color: #6b7280;
          font-size: 0.8125rem;
          line-height: 1.6;
          margin: 0;
          padding-left: 1.25rem;
        }

        .max-oauth-error-help li {
          margin-bottom: 0.25rem;
        }

        .max-oauth-error-help a {
          color: #4f46e5;
          text-decoration: none;
          font-weight: 500;
        }

        .max-oauth-error-help a:hover {
          text-decoration: underline;
        }

        /* 애니메이션 */
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(2rem);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes bounceIn {
          0% {
            opacity: 0;
            transform: scale(0.3);
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
          }
          70% {
            transform: scale(0.9);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes shakeX {
          0%, 100% {
            transform: translateX(0);
          }
          10%, 30%, 50%, 70%, 90% {
            transform: translateX(-10px);
          }
          20%, 40%, 60%, 80% {
            transform: translateX(10px);
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes progressStripe {
          from {
            background-position-x: 0;
          }
          to {
            background-position-x: 8px;
          }
        }

        /* 반응형 */
        @media (max-width: 640px) {
          .max-oauth-callback {
            padding: 0.5rem;
          }

          .max-oauth-callback-card {
            padding: 2rem 1.5rem;
          }

          .max-oauth-callback-title {
            font-size: 1.5rem;
          }

          .max-oauth-callback-logo {
            width: 64px;
            height: 64px;
          }

          .max-oauth-callback-logo svg {
            width: 32px;
            height: 32px;
          }

          .max-oauth-success-icon,
          .max-oauth-error-icon {
            width: 64px;
            height: 64px;
            font-size: 2rem;
          }

          .max-oauth-error-actions {
            flex-direction: column;
            align-items: center;
          }

          .max-oauth-retry-btn,
          .max-oauth-home-btn {
            width: 100%;
            max-width: 200px;
          }
        }

        /* 다크 모드 */
        @media (prefers-color-scheme: dark) {
          .max-oauth-callback-card {
            background: #1f2937;
            color: #f9fafb;
          }

          .max-oauth-callback-title {
            color: #f9fafb;
          }

          .max-oauth-loading-text,
          .max-oauth-redirect-text {
            color: #d1d5db;
          }

          .max-oauth-success-text {
            color: #f9fafb;
          }

          .max-oauth-error-help {
            background: #374151;
            border-color: #4b5563;
          }

          .max-oauth-error-help p,
          .max-oauth-error-help ul {
            color: #d1d5db;
          }

          .max-oauth-progress-bar {
            background: #374151;
          }

          .max-oauth-spinner {
            border-color: #374151;
            border-top-color: #6366f1;
          }
        }

        /* 감소된 모션 */
        @media (prefers-reduced-motion: reduce) {
          .max-oauth-callback-card,
          .max-oauth-progress-fill,
          .max-oauth-spinner,
          .max-oauth-success-icon,
          .max-oauth-error-icon,
          .max-oauth-redirect-text,
          .max-oauth-retry-btn,
          .max-oauth-home-btn {
            animation: none;
            transition: none;
          }
        }

        /* 고대비 모드 */
        @media (prefers-contrast: high) {
          .max-oauth-callback-card {
            border: 2px solid #000;
          }

          .max-oauth-retry-btn,
          .max-oauth-home-btn {
            border: 1px solid currentColor;
          }

          .max-oauth-error-text {
            border-width: 2px;
          }
        }
      `}</style>
    </div>
  );
};

export default OAuthCallback;