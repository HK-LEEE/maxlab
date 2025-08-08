import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { LogIn, Shield } from 'lucide-react';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';
import { devLog } from '../utils/logger';
import { browserSecurityCleanup } from '../utils/browserSecurityCleanup';
import { userIsolatedTokenStorage } from '../services/userIsolatedTokenStorage';
import { securityHeaders } from '../services/securityHeaders';
import { OAuthReturnHandler } from '../utils/oauthReturnHandler';
import { DifferentUserLoginButton } from '../components/DifferentUserLoginButton';

const MLLogo: React.FC = () => (
  <div className="w-16 h-16 bg-gray-900 rounded-xl flex items-center justify-center">
    <span className="text-white font-bold text-2xl">ML</span>
  </div>
);

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [silentLoginAttempting, setSilentLoginAttempting] = useState(false); // 🔧 기본값을 false로 변경
  const authAttemptRef = useRef(false);
  const mountedRef = useRef(true);
  const hasLoggedOutRef = useRef(false); // 🔧 로그아웃 추적
  
  // 🔥 DEBUG: Log current state on every render
  console.log('🔥 Login component render - current state:', {
    isAuthenticated,
    oauthLoading,
    silentLoginAttempting,
    hasLoggedOutRef: hasLoggedOutRef.current,
    authAttemptRef: authAttemptRef.current
  });
  
  // Traditional login state
  const [showTraditionalLogin, setShowTraditionalLogin] = useState(false);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [traditionalLoading, setTraditionalLoading] = useState(false);
  const [authMethods] = useState({ oauth: true, traditional: false, methods: ['oauth'] });

  // URL 매개변수에서 return URL 가져오기
  const getReturnUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('return');
    return returnUrl ? decodeURIComponent(returnUrl) : '/';
  };
  
  // URL 파라미터 확인
  const urlParams = new URLSearchParams(window.location.search);
  const forceNewLogin = urlParams.get('force_new_login') === 'true';
  const oauthReturn = urlParams.get('oauth_return');
  const forceLogin = urlParams.get('force_login') === 'true';

  // 컴포넌트 언마운트 감지 및 초기화
  useEffect(() => {
    // 🔥 CRITICAL: Ensure oauthLoading is false on mount
    console.log('🔥 Component mounted, current oauthLoading:', oauthLoading);
    if (oauthLoading) {
      console.log('🔥 Resetting oauthLoading to false on mount');
      setOauthLoading(false);
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 이미 인증된 사용자 리다이렉트 (OAuth 진행 중이 아닐 때만)
  useEffect(() => {
    if (isAuthenticated && !oauthLoading && !hasLoggedOutRef.current) {
      // OAuth return flow인 경우 OAuth authorize로 리다이렉트
      if (OAuthReturnHandler.isOAuthReturnFlow()) {
        console.log('🔄 User authenticated, continuing OAuth return flow...');
        OAuthReturnHandler.continueOAuthFlow();
        return;
      }
      
      const returnUrl = getReturnUrl();
      navigate(returnUrl, { replace: true });
      return;
    }
  }, [isAuthenticated, navigate, oauthLoading]);

  // 로그아웃 감지 및 컴포넌트 리셋
  useEffect(() => {
    if (!isAuthenticated) {
      if (authAttemptRef.current || silentLoginAttempting) {
        // 로그아웃 감지 - 컴포넌트 상태 리셋
        console.log('🔄 Logout detected, resetting login component state');
        authAttemptRef.current = false;
        hasLoggedOutRef.current = true; // 🔧 로그아웃 플래그 설정
        setSilentLoginAttempting(false); // 즉시 로그인 UI 표시
        setOauthLoading(false);
      }
    }
  }, [isAuthenticated, silentLoginAttempting]);

  // OAuth return 처리 - OAuth 서버에서 로그인 페이지로 리다이렉트된 경우
  useEffect(() => {
    const oauthReturnInfo = OAuthReturnHandler.handleLoginPageLoad();
    if (oauthReturnInfo.isOAuthReturn) {
      console.log('🔄 OAuth return flow detected');
      if (oauthReturnInfo.message) {
        toast(oauthReturnInfo.message, { duration: 5000 });
      }
    }
  }, []);

  // 페이지 로드 시 인증 방법 체크 및 Silent 로그인 시도
  useEffect(() => {
    
    // 이미 시도했거나 이미 인증된 경우 또는 로그아웃한 경우 또는 강제 새 로그인인 경우 스킵
    if (authAttemptRef.current || isAuthenticated || hasLoggedOutRef.current || forceNewLogin) {
      setSilentLoginAttempting(false);
      return;
    }

    authAttemptRef.current = true;
    setSilentLoginAttempting(true); // 🔧 Silent login 시작 시 설정

    const attemptSilentLogin = async () => {
      try {
        // 🔒 강제 계정 선택이 요청된 경우 silent login 건너뛰기
        if (sessionStorage.getItem('oauth_force_account_selection') === 'true') {
          console.log('🚫 Force account selection detected, skipping silent login');
          return;
        }
        
        // 기존 토큰 확인
        const existingToken = localStorage.getItem('accessToken');
        if (existingToken && authService.isAuthenticated()) {
          const storedUser = authService.getStoredUser();
          if (storedUser) {
            setAuth(existingToken, storedUser);
            toast.success(`환영합니다, ${storedUser.full_name || storedUser.username}!`);
            if (mountedRef.current) {
              const returnUrl = getReturnUrl();
              navigate(returnUrl, { replace: true });
            }
            return;
          }
        }

        // Silent 로그인 시도
        const result = await authService.attemptSilentLogin();
        
        if (result.success && result.user && mountedRef.current) {
          const token = localStorage.getItem('accessToken') || '';
          setAuth(token, result.user);
          
          // OAuth return flow인 경우 OAuth authorize로 리다이렉트
          if (OAuthReturnHandler.isOAuthReturnFlow()) {
            console.log('🔄 Silent login successful, continuing OAuth return flow...');
            toast.success('자동 로그인되었습니다. OAuth 인증을 계속합니다...');
            OAuthReturnHandler.continueOAuthFlow();
            return;
          }
          
          toast.success(`자동 로그인되었습니다. 환영합니다, ${result.user.full_name || result.user.username}!`);
          const returnUrl = getReturnUrl();
          navigate(returnUrl, { replace: true });
        } else {
          devLog.debug('Silent login failed, showing manual login options');
        }
      } catch (error) {
        devLog.debug('Silent login error:', error);
      } finally {
        if (mountedRef.current) {
          setSilentLoginAttempting(false);
        }
      }
    };

    // 약간의 지연을 두어 중복 호출 방지
    const timeoutId = setTimeout(attemptSilentLogin, 100);
    
    return () => clearTimeout(timeoutId);
  }, [navigate, setAuth]); // 🔧 CRITICAL: isAuthenticated 제거 - 로그아웃 시 재실행 방지

  const handleOAuthLogin = async (forceAccountSelection = false) => {
    console.log('🔥 handleOAuthLogin called with forceAccountSelection:', forceAccountSelection);
    console.log('🔥 Current oauthLoading state:', oauthLoading);
    console.log('🔥 Current isAuthenticated state:', isAuthenticated);
    
    // 중복 OAuth 시도 방지
    if (oauthLoading) {
      console.log('🚫 OAuth already in progress, skipping...');
      return;
    }
    
    // 강제 계정 선택이 아닌 경우에만 인증 상태 체크
    if (!forceAccountSelection && isAuthenticated) {
      console.log('🚫 User already authenticated, skipping normal login...');
      return;
    }

    console.log('🔥 Setting oauthLoading to true');
    setOauthLoading(true);
    
    // 🔧 CRITICAL FIX: Declare authToast at function start to prevent scoping issues
    let authToast: string | null = null;
    
    try {
      devLog.debug(`🚀 Login.tsx: Starting OAuth login (force account selection: ${forceAccountSelection})...`);
      
      // If forcing account selection, perform comprehensive security cleanup
      if (forceAccountSelection) {
        console.log('🔄 Different user login requested, performing comprehensive security cleanup...');
        
        // 🔧 로그아웃 플래그 리셋 - 새로운 로그인 시도
        hasLoggedOutRef.current = false;
        
        // Show loading toast for cleanup
        const cleanupToast = toast.loading('보안 정리 중... 잠시만 기다려주세요.');
        
        try {
          // Step 1: Clear auth store first
          const { logout } = useAuthStore.getState();
          logout();
          
          // Step 2: 🔒 CRITICAL: Clear OAuth Provider Session BEFORE new authentication
          // This prevents OAuth server from auto-authenticating with previous session
          try {
            const { performOAuthProviderLogout, clearOAuthProviderCookies } = await import('../utils/oauthProviderLogout');
            
            console.log('🚪 Clearing OAuth provider session for different user login...');
            // 🔧 OAuth logout 엔드포인트가 없으므로 토큰 revocation만 수행
            const providerLogoutResult = await performOAuthProviderLogout({
              usePopup: false,  // 팝업 사용 안 함
              revokeTokens: true,  // 토큰 revocation만 수행
              postLogoutRedirectUri: window.location.href, // 현재 페이지 유지
              timeoutMs: 5000 // Shorter timeout for UX
            });
            
            if (providerLogoutResult.success) {
              console.log('✅ OAuth provider session cleared for different user login');
              console.log('📊 Logout method used:', providerLogoutResult.method);
            } else {
              console.warn('⚠️ OAuth provider session cleanup failed:', providerLogoutResult.error);
            }
            
            // Always clear cookies regardless of result
            clearOAuthProviderCookies();
            
          } catch (providerError) {
            console.error('❌ OAuth provider cleanup error:', providerError);
            // Continue with local cleanup even if provider cleanup fails
          }
          
          // Step 3: 🔒 SECURITY FIX: Perform comprehensive browser security cleanup
          // CRITICAL: Preserve active OAuth session keys to prevent authentication failure
          const cleanupResult = await browserSecurityCleanup.performSecurityCleanup({
            clearLocalStorage: true,
            clearSessionStorage: true,
            clearCookies: true,
            clearIndexedDB: true,
            clearCacheStorage: true,
            clearWebSQL: true,
            preserveKeys: [
              'theme', 'language', 'preferences', // User preferences
              'oauth_state', 'oauth_code_verifier', 'oauth_nonce', // OAuth PKCE keys
              'oauth_popup_mode', 'silent_oauth_state', 'silent_oauth_code_verifier', // OAuth mode keys
              // 🔧 CRITICAL: Preserve OAuth communication keys for popup-parent communication
              'oauth_result', 'oauth_success', 'oauth_token_data', 'oauth_access_token',
              'oauth_completion_timestamp', 'oauth_error', 'oauth_error_details',
              'oauth_ack', 'oauth_acknowledged', // Acknowledgment keys
              'oauth_force_account_selection', // Force account selection flag
              'oauth_channel_*' // Any channel-specific keys
            ], 
            cookieDomains: [window.location.hostname, '.localhost', 'localhost']
          });
          
          // Step 4: Clear user-isolated token storage
          await userIsolatedTokenStorage.clearAllTokens();
          
          // Step 5: Reset security headers session token
          securityHeaders.resetSessionToken();
          
          // Step 6: 🔒 ADDITIONAL: Clear any remaining OAuth-related data
          try {
            // Clear service worker caches if available
            if ('serviceWorker' in navigator && 'caches' in window) {
              const cacheNames = await caches.keys();
              await Promise.all(
                cacheNames.map(cacheName => {
                  if (cacheName.includes('oauth') || cacheName.includes('auth')) {
                    return caches.delete(cacheName);
                  }
                })
              );
              console.log('🗑️ OAuth-related caches cleared');
            }
            
            // Clear any remaining OAuth cookies with broader domain matching
            const authDomains = ['localhost', '.localhost', '127.0.0.1', window.location.hostname];
            authDomains.forEach(domain => {
              // Common OAuth cookie names
              ['session', 'oauth_session', 'auth_session', 'csrf_token', 'state'].forEach(cookieName => {
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${domain}; secure; samesite=strict`;
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${domain}; secure; samesite=strict`;
              });
            });
            
          } catch (additionalCleanupError) {
            console.warn('Additional cleanup error (non-critical):', additionalCleanupError);
          }
          
          toast.dismiss(cleanupToast);
          
          if (cleanupResult.success) {
            console.log('✅ Comprehensive security cleanup completed:', {
              localStorage: cleanupResult.cleared.localStorage,
              sessionStorage: cleanupResult.cleared.sessionStorage,
              cookies: cleanupResult.cleared.cookies,
              indexedDB: cleanupResult.cleared.indexedDB.length,
              duration: `${cleanupResult.duration.toFixed(2)}ms`
            });
            toast.success('보안 정리 완료. 새로운 계정으로 로그인할 수 있습니다.', {
              duration: 3000
            });
          } else {
            console.warn('⚠️ Security cleanup had errors:', cleanupResult.errors);
            toast.error('보안 정리 중 일부 오류가 발생했습니다. 계속 진행합니다.', {
              duration: 5000
            });
          }
          
          // 🔒 CRITICAL: Ensure cleanup is fully completed before OAuth starts
          // This prevents race conditions between cleanup and OAuth state generation
          await new Promise(resolve => setTimeout(resolve, 300)); // Reduced delay for better UX
          
          // 🔧 ENHANCED: Verify OAuth communication keys are preserved
          const preservedKeys = ['oauth_result', 'oauth_success', 'oauth_token_data', 'oauth_error', 'oauth_force_account_selection'];
          const verificationResults = preservedKeys.map(key => ({
            key,
            exists: sessionStorage.getItem(key) !== null,
            value: sessionStorage.getItem(key)
          }));
          
          console.log('🔍 OAuth communication keys verification:', verificationResults);
          console.log('🔐 Security cleanup completed, starting fresh OAuth flow...');
          
        } catch (cleanupError) {
          console.error('❌ Security cleanup error:', cleanupError);
          if (cleanupError instanceof Error) {
            console.error('❌ Error stack:', cleanupError.stack);
            console.error('❌ Error name:', cleanupError.name);
            console.error('❌ Error message:', cleanupError.message);
          }
          
          toast.dismiss(cleanupToast);
          toast.error('보안 정리 실패. 계속 진행합니다.', {
            duration: 3000
          });
          
          // 🔥 CRITICAL: Continue with login attempt anyway
          console.log('🔥 Security cleanup failed, but continuing with OAuth login...');
        }
      }
      
      // 🔧 SCOPE FIX: Create loading toast for OAuth authentication
      authToast = toast.loading('🔐 OAuth 팝업이 열렸습니다. 팝업에서 로그인을 완료해주세요.', {
        duration: 60000, // 60 seconds
        style: {
          maxWidth: '400px',
        }
      });
      
      console.log('🚀 About to call loginWithPopupOAuth with forceAccountSelection:', forceAccountSelection);
      console.log('📊 Current state:', {
        isAuthenticated,
        oauthLoading,
        hasAccessToken: !!localStorage.getItem('accessToken'),
        hasUser: !!localStorage.getItem('user'),
        forceAccountSelectionFlag: sessionStorage.getItem('oauth_force_account_selection')
      });
      
      // 🔧 ENHANCED: Log all OAuth-related sessionStorage keys for debugging
      if (forceAccountSelection) {
        const oauthKeys = Object.keys(sessionStorage).filter(key => key.includes('oauth'));
        console.log('🔍 OAuth SessionStorage keys before popup:', oauthKeys.map(key => ({
          key,
          value: sessionStorage.getItem(key)?.substring(0, 50) + '...'
        })));
      }
      
      // 🔧 FIX: Declare user variable outside try block for proper scoping
      let user;
      try {
        console.log('🔥 About to call authService.loginWithPopupOAuth');
        console.log('🔥 authService object:', authService);
        console.log('🔥 forceAccountSelection:', forceAccountSelection);
        
        user = await authService.loginWithPopupOAuth(forceAccountSelection);
        
        console.log('🔥 authService.loginWithPopupOAuth completed successfully');
        console.log('🔥 user result:', user);
        
        if (authToast) {
          toast.dismiss(authToast);
        }
        devLog.debug('✅ Login.tsx: OAuth login successful, user:', user);
      } catch (authError) {
        console.error('🔥 authService.loginWithPopupOAuth error:', authError);
        if (authError instanceof Error) {
          console.error('🔥 Error stack:', authError.stack);
        }
        
        // Dismiss the loading toast and re-throw the error
        if (authToast) {
          toast.dismiss(authToast);
        }
        throw authError;
      }
      
      devLog.debug('🔍 Login.tsx: mountedRef.current =', mountedRef.current);
      if (!mountedRef.current) {
        devLog.debug('⚠️ Login.tsx: Component unmounted, but continuing anyway for OAuth completion');
        // OAuth 완료를 위해 계속 진행
      }
      
      // Create token for compatibility with existing auth store
      const token = localStorage.getItem('accessToken') || '';
      devLog.debug('🔑 Login.tsx: Setting auth with token:', token.substring(0, 20) + '...');
      setAuth(token, user);
      devLog.debug('🎉 Login.tsx: Auth set successfully');
      
      // OAuth return flow인 경우 OAuth authorize로 리다이렉트
      if (OAuthReturnHandler.isOAuthReturnFlow()) {
        console.log('🔄 OAuth login successful, continuing OAuth return flow...');
        toast.success(`${user.full_name || user.username}님, 환영합니다! OAuth 인증을 계속합니다...`);
        OAuthReturnHandler.continueOAuthFlow();
        return;
      }
      
      toast.success(`Welcome back, ${user.full_name || user.username}!`);
      const returnUrl = getReturnUrl();
      navigate(returnUrl, { replace: true });
      
    } catch (error: any) {
      console.error('OAuth login error:', error);
      
      // 🔧 CRITICAL FIX: Safely dismiss the auth loading toast if it exists
      if (authToast) {
        toast.dismiss(authToast);
      }
      
      if (!mountedRef.current) {
        return;
      }
      
      // 🔧 ENHANCED: Handle login_required error with helpful guidance
      if ((error as any).code === 'LOGIN_REQUIRED' || error.message?.includes('Force re-authentication required')) {
        toast.error(
          '다른 사용자 로그인을 위해서는 먼저 MAX Platform에서 로그아웃이 필요합니다.\n\n' +
          '1. MAX Platform (localhost:8000)에 새 탭으로 접속\n' +
          '2. 완전히 로그아웃\n' +
          '3. 여기로 돌아와서 다시 시도\n\n' +
          '또는 일반 로그인 버튼을 사용해보세요.',
          {
            duration: 10000,
            style: {
              maxWidth: '500px',
              textAlign: 'left',
              whiteSpace: 'pre-line'
            }
          }
        );
      } else if ((error as any).code === 'ACCOUNT_SELECTION_REQUIRED') {
        // 🔧 NEW: Handle account selection required error
        toast.error(
          'OAuth 서버가 계정 선택을 요구하고 있습니다.\n\n' +
          '백엔드 팀에게 다음을 요청하세요:\n' +
          '1. OAuth 서버가 prompt=select_account를 지원하도록 수정\n' +
          '2. 계정 선택 UI 구현 (에러 반환 대신)\n\n' +
          '임시 해결책:\n' +
          '• MAX Platform에서 로그아웃 후 재시도\n' +
          '• 브라우저 쿠키 삭제 후 재시도',
          {
            duration: 15000,
            style: {
              maxWidth: '500px',
              textAlign: 'left',
              whiteSpace: 'pre-line'
            }
          }
        );
      } else if (error.message?.includes('blocked') || (error as any).code === 'POPUP_BLOCKED') {
        // 🔧 ENHANCED: Better popup blocking guidance
        const browser = (error as any).browser || 'your browser';
        toast.error(
          `팝업이 ${browser}에서 차단되었습니다.\n` +
          `주소창의 팝업 차단 아이콘(🚫)을 클릭하고\n` +
          `"이 사이트에서 항상 팝업 허용"을 선택해주세요.`, 
          {
            duration: 12000,
            style: {
              maxWidth: '400px',
              textAlign: 'left'
            }
          }
        );
      } else if (error.message?.includes('cancelled')) {
        toast('Login was cancelled by user.', { icon: 'ℹ️' });
      } else if (error.message?.includes('login_required')) {
        toast.error('Please log in to MAX Platform first, then try again.', {
          duration: 12000
        });
      } else {
        toast.error(error.message || 'OAuth login failed. Please try again.', {
          duration: 8000
        });
      }
    } finally {
      console.log('🔥 Finally block executed');
      console.log('🔥 mountedRef.current:', mountedRef.current);
      console.log('🔥 About to set oauthLoading to false');
      
      // 🔧 CRITICAL: Always reset loading state regardless of mount status
      // This prevents the button from being permanently disabled
      setOauthLoading(false);
      console.log('🔥 oauthLoading set to false');
    }
  };



  const handleSignupRedirect = () => {
    navigate('/register');
  };

  // Silent 로그인 진행 중 UI
  if (silentLoginAttempting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md w-full mx-4">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          
          <div className="flex flex-col items-center mb-4">
            <MLLogo />
            <h1 className="text-2xl font-bold mt-4 text-gray-900">MAX Lab</h1>
            <p className="text-gray-500 text-sm mt-1">Manufacturing AI & DX Platform</p>
          </div>
          
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            로그인 상태 확인 중
          </h2>
          <p className="text-gray-600 text-sm">
            MAX Platform 로그인 상태를 확인하고 있습니다...
          </p>
          <p className="text-gray-500 text-xs mt-2">
            이미 로그인되어 있다면 자동으로 연결됩니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Logo and Title */}
          <div className="flex flex-col items-center mb-8">
            <MLLogo />
            <h1 className="text-3xl font-bold mt-4 text-gray-900">MAX Lab</h1>
            <p className="text-gray-500 text-sm mt-1">Manufacturing AI & DX Platform</p>
          </div>

          {/* SSO Login Section */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-blue-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">보안 로그인</h2>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              MAX Platform 통합 인증으로 안전하게 로그인하세요
            </p>

            {/* OAuth Login Button */}
            {authMethods.oauth && (
              <div className="space-y-3">
                <button
                  onClick={() => handleOAuthLogin(false)}
                  disabled={oauthLoading || isAuthenticated}
                  className={`w-full py-4 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-colors flex items-center justify-center space-x-3 shadow-md ${
                    oauthLoading || isAuthenticated 
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <LogIn size={24} />
                  <span className="text-lg">
                    {oauthLoading ? 'MAX Platform 연결 중...' : 'MAX Platform으로 로그인'}
                  </span>
                </button>
                
                {/* Different User Login Button - Using dedicated component */}
                <DifferentUserLoginButton 
                  onLoginClick={() => handleOAuthLogin(false)} 
                />
                
              </div>
            )}

          </div>


          {/* Sign Up Link */}
          <div className="mt-6 text-center text-sm text-gray-600 border-t border-gray-200 pt-4">
            MAX Platform 계정이 없으신가요?{' '}
            <button 
              onClick={handleSignupRedirect}
              className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              회원가입하기
            </button>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 text-center text-xs text-gray-500">
          © 2025 MAX Platform. All rights reserved.
        </div>
      </div>
    </div>
  );
};