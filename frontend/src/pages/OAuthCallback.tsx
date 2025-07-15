/**
 * OAuth Callback Handler
 * Handles OAuth authorization code callbacks for both popup and silent authentication
 */

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { exchangeCodeForToken, isPopupMode } from '../utils/popupOAuth';

interface CallbackState {
  status: 'loading' | 'success' | 'error';
  message: string;
  error?: string;
}

export const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CallbackState>({
    status: 'loading',
    message: 'Processing OAuth callback...'
  });
  
  // 중복 실행 방지를 위한 ref
  const isProcessingRef = useRef(false);
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      // 중복 실행 방지 체크
      if (isProcessingRef.current || hasProcessedRef.current) {
        console.log('🚫 OAuth callback already processing or completed, skipping...');
        return;
      }
      
      isProcessingRef.current = true;
      
      // DOM에 OAuth 처리 중 상태 마킹 (다른 컴포넌트에서 감지 가능)
      document.body.setAttribute('data-oauth-processing', 'true');
      
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        
        const inPopupMode = isPopupMode();
        const isSilentAuth = sessionStorage.getItem('silent_oauth_state') !== null;
        
        if (error) {
          const errorMessage = errorDescription || `OAuth error: ${error}`;
          
          if (inPopupMode || isSilentAuth) {
            window.opener?.postMessage({
              type: 'OAUTH_ERROR',
              error: errorMessage
            }, window.location.origin);
            
            if (inPopupMode) window.close();
            return;
          } else {
            throw new Error(errorMessage);
          }
        }

        if (!code) {
          throw new Error('No authorization code received');
        }

        setState({
          status: 'loading',
          message: 'Exchanging authorization code for access token...'
        });

        if (inPopupMode || isSilentAuth) {
          try {
            // 상태 검증 (popup과 silent auth 모두 지원)
            const storedState = sessionStorage.getItem('oauth_state') || 
                               sessionStorage.getItem('silent_oauth_state');
            
            if (state !== storedState) {
              window.opener?.postMessage({
                type: 'OAUTH_ERROR',
                error: 'Invalid state parameter - possible security issue'
              }, window.location.origin);
              if (inPopupMode) window.close();
              return;
            }

            // 토큰 교환
            const tokenResponse = await exchangeCodeForToken(code);
            
            // 성공 표시
            hasProcessedRef.current = true;
            
            // 세션 정리 (완전 정리)
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('oauth_code_verifier');
            sessionStorage.removeItem('oauth_popup_mode');
            sessionStorage.removeItem('silent_oauth_state');
            sessionStorage.removeItem('silent_oauth_code_verifier');
            
            // 성공 메시지 전송
            window.opener?.postMessage({
              type: 'OAUTH_SUCCESS',
              token: tokenResponse.access_token,
              tokenData: tokenResponse
            }, window.location.origin);
            
            if (inPopupMode) window.close();
            
          } catch (error: any) {
            console.error('OAuth token exchange error:', error);
            
            // 특정 에러에 대한 처리
            let errorMessage = error.message || 'Token exchange failed';
            if (error.message?.includes('Invalid or expired authorization code')) {
              errorMessage = 'Authorization code has already been used. Please try logging in again.';
            } else if (error.message?.includes('Bad Request')) {
              errorMessage = 'Authentication request failed. Please try again.';
            }
            
            window.opener?.postMessage({
              type: 'OAUTH_ERROR',
              error: errorMessage
            }, window.location.origin);
            if (inPopupMode) window.close();
          }
        } else {
          // 일반 모드 (direct navigation to callback URL)
          try {
            const tokenResponse = await exchangeCodeForToken(code);
            
            // 성공 표시
            hasProcessedRef.current = true;
            
            // 토큰을 localStorage에 저장 (완전한 토큰 정보 저장)
            const currentTime = Date.now();
            const expiryTime = currentTime + (tokenResponse.expires_in * 1000);
            
            localStorage.setItem('accessToken', tokenResponse.access_token);
            localStorage.setItem('tokenType', tokenResponse.token_type);
            localStorage.setItem('expiresIn', tokenResponse.expires_in.toString());
            localStorage.setItem('tokenExpiryTime', expiryTime.toString());
            localStorage.setItem('tokenCreatedAt', currentTime.toString());
            localStorage.setItem('scope', tokenResponse.scope);
            
            // 세션 정리
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('oauth_code_verifier');
            sessionStorage.removeItem('oauth_popup_mode');
            
            setState({
              status: 'success',
              message: 'Authentication successful! Redirecting...'
            });

            toast.success('Successfully logged in!');
            
            setTimeout(() => {
              const redirectTo = sessionStorage.getItem('oauthRedirectTo') || '/';
              sessionStorage.removeItem('oauthRedirectTo');
              navigate(redirectTo, { replace: true });
            }, 2000);
            
          } catch (error: any) {
            throw error;
          }
        }

      } catch (error: any) {
        console.error('OAuth callback error:', error);
        
        // 에러 처리 완료 표시
        hasProcessedRef.current = true;
        
        // 특정 에러에 대한 메시지 개선
        let errorMessage = error.message || 'Authentication failed';
        if (error.message?.includes('Invalid or expired authorization code')) {
          errorMessage = 'This login session has expired. Please try logging in again.';
        } else if (error.message?.includes('Bad Request')) {
          errorMessage = 'Authentication request failed. Please try again.';
        }
        
        if (isPopupMode()) {
          window.opener?.postMessage({
            type: 'OAUTH_ERROR',
            error: errorMessage
          }, window.location.origin);
          window.close();
        } else {
          setState({
            status: 'error',
            message: 'Authentication failed',
            error: errorMessage
          });

          toast.error(errorMessage);

          setTimeout(() => {
            navigate('/login', { replace: true });
          }, 5000);
        }
      } finally {
        isProcessingRef.current = false;
        // DOM에서 OAuth 처리 중 상태 제거
        document.body.removeAttribute('data-oauth-processing');
      }
    };

    handleOAuthCallback();
  }, [navigate, searchParams]);

  const renderIcon = () => {
    switch (state.status) {
      case 'loading':
        return (
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
        );
      case 'success':
        return (
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
        );
    }
  };

  // 팝업 모드일 때는 간단한 UI
  if (isPopupMode()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Processing Authentication...
          </h1>
          <p className="text-sm text-gray-600">
            Please wait while we complete your login.
          </p>
        </div>
      </div>
    );
  }

  // 일반 모드 UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-6">
            {renderIcon()}
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {state.status === 'loading' && 'Authenticating...'}
            {state.status === 'success' && 'Login Successful!'}
            {state.status === 'error' && 'Authentication Failed'}
          </h1>
          
          <p className="text-gray-600 mb-6">
            {state.message}
          </p>
          
          {state.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">
                <strong>Error:</strong> {state.error}
              </p>
            </div>
          )}

          {state.status === 'loading' && (
            <div className="text-sm text-gray-500">
              This may take a few moments...
            </div>
          )}

          {state.status === 'success' && (
            <div className="text-sm text-gray-500">
              Redirecting you to the application...
            </div>
          )}

          {state.status === 'error' && (
            <div className="space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Return to Login
              </button>
              <div className="text-sm text-gray-500">
                Redirecting automatically in 5 seconds...
              </div>
            </div>
          )}
        </div>

        {/* Copyright */}
        <div className="mt-8 text-center text-xs text-gray-500">
          © 2025 MAX Lab. All rights reserved.
        </div>
      </div>
    </div>
  );
};