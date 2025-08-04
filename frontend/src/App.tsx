import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { authService } from './services/authService';
import { useAuthRefresh } from './hooks/useAuthRefresh';
import { Login } from './pages/Login';
import { OAuthCallback } from './pages/OAuthCallback';
import { Dashboard } from './pages/Dashboard';
import { QueryDetail } from './pages/QueryDetail';
import { WorkspaceManagement } from './pages/admin/WorkspaceManagement';
import { UserManagement } from './pages/admin/UserManagement';
import { PersonalTestWorkspace } from './pages/PersonalTestWorkspace';
import { ProcessFlowEditor } from './workspaces/personal_test/pages/ProcessFlowEditor';
import { ProcessFlowMonitor } from './workspaces/personal_test/pages/ProcessFlowMonitor';
import { ProcessFlowPublish } from './workspaces/personal_test/pages/ProcessFlowPublish';
import { PublicProcessFlowMonitor } from './workspaces/personal_test/pages/PublicProcessFlowMonitor';
import { Profile } from './pages/Profile';
import { isDevelopment, devLog } from './utils/logger';
import AuthDiagnostics from './utils/authDiagnostics';
import AuthInitDebugger from './utils/debugAuthInit';
import { authSyncService } from './services/authSyncService';
import './styles/index.css';

devLog.log('App.tsx loaded');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initState = useAuthStore((state) => state.initState);
  
  // 🔒 CRITICAL FIX: Don't redirect during initialization
  if (initState !== 'ready' && initState !== 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.is_admin || user?.role === 'admin';
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

const AuthRefreshProvider: React.FC = () => {
  useAuthRefresh();
  return null;
};

function App() {
  devLog.debug('App component rendering');
  
  // Enhanced auth state management
  const { 
    isAuthenticated,
    setAuth,
    setUser,
    logout,
    initState,
    error,
    isReady,
    canRetry,
    shouldShowError,
    getStatusMessage,
    setAuthState,
    setAuthError,
    clearError,
    incrementRetry,
    resetRetry,
    // Enhanced UX methods
    getProgressPercentage,
    getTimeInState,
    isNetworkIssue,
    getRecommendedAction
  } = useAuthStore();
  
  // 기존 isInitializing 대신 authStore의 상태 사용
  const isInitializing = initState !== 'ready' && initState !== 'error';
  
  // Auth Sync Service 초기화
  useEffect(() => {
    authSyncService.initialize({
      onLogout: (reason) => {
        console.log('📨 Received logout event from other tab:', reason);
        logout();
      },
      onLogin: (user, token) => {
        console.log('📨 Received login event from other tab');
        setAuth(token, user);
      },
      onTokenRefresh: (token) => {
        console.log('📨 Received token refresh event from other tab');
        // 토큰 갱신 처리
      },
      onSessionExpired: () => {
        console.log('📨 Received session expired event from other tab');
        logout();
      },
      onAuthError: (error) => {
        console.log('📨 Received auth error from other tab:', error);
        setAuthError({
          type: 'unknown',
          message: error,
          recoverable: true
        });
      }
    });
    
    return () => {
      authSyncService.destroy();
    };
  }, [logout, setAuth, setAuthError]);
  
  // 통합 인증 상태 관리 및 리다이렉트 시스템
  useEffect(() => {
    const handleAutoLogout = (event: CustomEvent) => {
      devLog.info('🔓 Auto logout triggered:', event.detail);
      
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const isPublicPage = currentPath.startsWith('/public/flow/');
      const isLoginPage = currentPath === '/login';
      const isOAuthCallback = currentPath === '/oauth/callback';
      
      // 이미 로그인 페이지나 OAuth 콜백 페이지에 있으면 추가 처리 불요
      if (isLoginPage || isOAuthCallback) {
        devLog.debug('Already on auth page, skipping redirect');
        logout();
        return;
      }
      
      logout();
      
      // Public 페이지가 아닌 경우에만 로그인 페이지로 리다이렉트
      if (!isPublicPage) {
        devLog.info('Session expired, redirecting to login...');
        // 현재 페이지를 기억해서 로그인 후 돌아올 수 있도록
        const returnUrl = encodeURIComponent(currentPath + currentSearch);
        window.location.href = `/login?return=${returnUrl}`;
      } else {
        devLog.info('Session expired on public page, staying on current page...');
      }
    };

    // 토큰 만료 경고 이벤트 리스너
    const handleTokenExpiring = (event: CustomEvent) => {
      devLog.warn('⚠️ Token expiring soon:', event.detail);
      // 알림 UI 제거 - 콘솔 로그만 유지
    };

    // Refresh Token 만료 임박 이벤트 리스너
    const handleRefreshTokenExpiring = (event: CustomEvent) => {
      console.log('⚠️ Refresh token expiring soon:', event.detail);
      // 알림 UI 제거 - 콘솔 로그만 유지
    };

    // 네트워크 오류로 인한 토큰 갱신 실패 이벤트 리스너
    const handleTokenRefreshNetworkError = (event: CustomEvent) => {
      console.log('🌐 Token refresh network error:', event.detail);
      
      // 네트워크 오류는 일시적일 수 있으므로 즉시 로그아웃하지 않음
      window.dispatchEvent(new CustomEvent('ui:show_network_warning', {
        detail: { 
          message: 'Connection issues detected. Your session may expire if the problem persists.',
          canRetry: true
        }
      }));
    };

    // Refresh Token 무효 이벤트 리스너
    const handleRefreshTokenInvalid = (event: CustomEvent) => {
      console.log('🔒 Refresh token invalid:', event.detail);
      
      // 중요한 오류이므로 사용자에게 강한 알림
      window.dispatchEvent(new CustomEvent('ui:show_critical_warning', {
        detail: { 
          message: event.detail.message || 'Your session has expired. Please log in again.',
          action: 'login',
          reason: 'refresh_token_invalid'
        }
      }));
    };

    // 이벤트 리스너 등록
    window.addEventListener('auth:logout', handleAutoLogout as EventListener);
    window.addEventListener('auth:token_expiring', handleTokenExpiring as EventListener);
    window.addEventListener('auth:refresh_token_expiring', handleRefreshTokenExpiring as EventListener);
    window.addEventListener('auth:network_error', handleTokenRefreshNetworkError as EventListener);
    window.addEventListener('auth:refresh_token_invalid', handleRefreshTokenInvalid as EventListener);
    
    return () => {
      window.removeEventListener('auth:logout', handleAutoLogout as EventListener);
      window.removeEventListener('auth:token_expiring', handleTokenExpiring as EventListener);
      window.removeEventListener('auth:refresh_token_expiring', handleRefreshTokenExpiring as EventListener);
      window.removeEventListener('auth:network_error', handleTokenRefreshNetworkError as EventListener);
      window.removeEventListener('auth:refresh_token_invalid', handleRefreshTokenInvalid as EventListener);
    };
  }, [logout]);
  
  // 개발 환경에서만 진단 도구 및 토큰 테스트 헬퍼 등록
  useEffect(() => {
    if (isDevelopment()) {
      // 🔍 Authentication diagnostics monitoring
      console.log('🧪 Starting authentication diagnostics...');
      AuthDiagnostics.logDiagnostics();
      
      const securityIssues = AuthDiagnostics.checkSecurityIssues();
      if (securityIssues.length > 0) {
        console.warn('⚠️ Security Issues Detected:');
        securityIssues.forEach(issue => console.warn(`  - ${issue}`));
      }
      
      const stopMonitoring = AuthDiagnostics.startMonitoring();
      
      // 🌐 Test API connectivity
      AuthDiagnostics.testAPIConnectivity().then(result => {
        console.group('🌐 API Connectivity Test');
        console.log('Auth Server:', result.authServer);
        console.log('API Server:', result.apiServer);
        console.groupEnd();
        
        if (result.authServer.status !== 'connected' || result.apiServer.status !== 'connected') {
          console.warn('⚠️ API connectivity issues detected - this may cause authentication problems');
        }
      }).catch(error => {
        console.error('❌ API connectivity test failed:', error);
      });

      // 🩺 Add debug helpers to global scope
      // Debug tools console logs removed
      
      // 동적 import로 개발 환경에서만 테스트 헬퍼들을 로드
      Promise.all([
        import('./utils/tokenTestUtils'),
        import('./utils/oauthServerTest'),
        import('./utils/sessionPersistenceTest'),
        import('./utils/tokenRotationTest'),
        import('./utils/encryptionTestUtils'),
        import('./utils/securityEventTestUtils'),
        import('./utils/tokenFlowAutomatedTest'),
        import('./utils/debugAuth'),
        import('./utils/debugRefreshToken'),
        import('./utils/testRefreshToken'),
        import('./utils/testRefreshTokenWithSecret'),
        import('./utils/debugTokenRefresh'),
        import('./utils/testRefreshService'),
        import('./utils/compareRequests'),
        import('./utils/checkOIDCConfig'),
      ]).then(([
        tokenTestUtils,
        oauthServerTest,
        sessionPersistenceTest,
        tokenRotationTest,
        encryptionTestUtils,
        securityEventTestUtils,
        tokenFlowAutomatedTest,
        debugAuth,
        debugRefreshToken,
        testRefreshToken,
        testRefreshTokenWithSecret,
        debugTokenRefresh,
        testRefreshService,
        compareRequests,
        checkOIDCConfig
      ]) => {
        tokenTestUtils.registerGlobalTokenTestHelpers();
        oauthServerTest.registerOAuthTestHelpers();
        sessionPersistenceTest.registerSessionTestHelpers();
        tokenRotationTest.registerTokenRotationTestHelpers();
        encryptionTestUtils.registerEncryptionTestHelpers();
        securityEventTestUtils.registerSecurityEventTestHelpers();
        tokenFlowAutomatedTest.registerTokenFlowTestHelpers();
        devLog.debug('🧪 Development test helpers loaded');
      }).catch((error) => {
        devLog.warn('Failed to load test helpers:', error);
      });
      
      // Cleanup function
      return () => {
        stopMonitoring();
      };
    }
  }, []);
  
  // Enhanced App 시작 시 스마트 인증 초기화
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // 🔒 CRITICAL FIX: Use ref values to prevent stale closures
        const currentInitState = useAuthStore.getState().initState;
        const currentIsAuthenticated = useAuthStore.getState().isAuthenticated;
        
        // 🔒 GUARD: Prevent duplicate initialization
        if (currentInitState === 'syncing' || currentInitState === 'silent_auth') {
          console.log('🛑 Authentication initialization already in progress:', currentInitState);
          return;
        }
        
        // 🔒 SECURITY: Skip initialization if already ready
        if (currentInitState === 'ready') {
          console.log('✅ Authentication already initialized');
          return;
        }
        
        // 🔧 CRITICAL FIX: Handle authenticated users with valid tokens
        if (currentIsAuthenticated) {
          const cachedToken = localStorage.getItem('accessToken');
          const tokenExpiry = localStorage.getItem('tokenExpiryTime');
          const currentTime = Date.now();
          
          // Check if token is actually valid
          if (cachedToken && tokenExpiry && currentTime < parseInt(tokenExpiry)) {
            devLog.info('✅ User has valid cached token, fetching fresh user info...');
            
            // Fetch fresh user info to restore admin status (stripped by partialize for security)
            try {
              setAuthState('syncing');
              const freshUser = await authService.getCurrentUser();
              setUser(freshUser);
              devLog.info('✅ Admin status restored from server:', { is_admin: freshUser.is_admin });
              setAuthState('ready');
              return;
            } catch (error) {
              devLog.warn('Failed to fetch fresh user info, continuing with cached data:', error);
              setAuthState('ready');
              return;
            }
          } else {
            devLog.warn('❌ Cached token invalid or expired, clearing auth');
            logout();  // Use the logout function from useAuthStore
            setAuthState('idle');
            // Continue to silent auth attempt below
          }
        }
        
        // 🔧 SECURITY FIX: Handle non-authenticated users with silent auth
        if (currentInitState === 'idle' || currentInitState === 'hydrating') {
          devLog.info('🔄 Attempting silent authentication...');
          setAuthState('silent_auth');
          
          const result = await authService.attemptSilentLogin();
          
          if (result.success && result.user) {
            const token = localStorage.getItem('accessToken') || '';
            setAuth(token, result.user);
            
            // Fetch fresh user info to restore admin status
            try {
              const freshUser = await authService.getCurrentUser();
              setUser(freshUser);
              devLog.info('✅ Admin status restored:', { is_admin: freshUser.is_admin });
            } catch (error) {
              devLog.warn('Failed to fetch fresh user info:', error);
            }
            
            resetRetry();
            devLog.info('✅ App initialized with silent login');
          } else {
            devLog.info('ℹ️ Silent login not available, user needs to login manually');
            
            if (result.error === 'silent_auth_timeout') {
              const authError = {
                type: 'silent_auth_timeout' as const,
                message: 'Automatic login timed out',
                recoverable: true
              };
              setAuthError(authError);
            }
          }
          
          setAuthState('ready'); // Always move to ready state after attempt
        }
      } catch (error: any) {
        devLog.warn('⚠️ Auth initialization error:', error);
        
        const authError = {
          type: 'unknown' as const,
          message: error.message || 'Authentication initialization failed',
          recoverable: false
        };
        
        setAuthError(authError);
        setAuthState('ready'); // Move to ready state even on error
      }
    };

    // 🔒 CRITICAL: Only run once on mount
    initializeAuth();
  }, []); // Empty dependency array to run only once
  
  // Enhanced 초기화 중 로딩 화면 with 스마트 상태 표시
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md w-full mx-4">
          {/* Enhanced 로딩 스피너 with 진행률 및 상태 표시 */}
          <div className="flex justify-center mb-6 relative">
            {/* Main loading spinner */}
            <div className="relative">
              <div className="w-12 h-12 border-4 border-blue-200 rounded-full"></div>
              <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
              
              {/* Progress ring for different states */}
              {initState === 'hydrating' && (
                <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-yellow-500 rounded-full animate-pulse"></div>
              )}
              {initState === 'syncing' && (
                <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-green-500 rounded-full animate-spin" 
                     style={{ animationDirection: 'reverse', animationDuration: '2s' }}></div>
              )}
              {initState === 'silent_auth' && (
                <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-purple-500 rounded-full animate-spin"
                     style={{ animationDuration: '1.5s' }}></div>
              )}
            </div>
            
            {/* Status indicator badges */}
            {initState === 'syncing' && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
              </div>
            )}
            {initState === 'silent_auth' && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full border-2 border-white animate-pulse flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
              </div>
            )}
            {error && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                <span className="text-white text-xs font-bold">!</span>
              </div>
            )}
          </div>
          
          {/* MAX Lab 브랜딩 */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-gray-900 rounded-xl flex items-center justify-center mb-4">
              <span className="text-white font-bold text-2xl">ML</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">MAX Lab</h1>
            <p className="text-gray-500 text-sm mt-1">Manufacturing AI & DX Platform</p>
          </div>
          
          {/* Enhanced 진행률 표시 */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${getProgressPercentage()}%` }}
            ></div>
          </div>
          
          {/* 동적 상태 메시지 with 진행률 */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {getStatusMessage()}
            </h2>
            
            {/* 진행률 텍스트 */}
            <div className="flex justify-between text-xs text-gray-500">
              <span>진행률: {getProgressPercentage()}%</span>
              {getTimeInState() > 0 && (
                <span>소요시간: {Math.round(getTimeInState() / 1000)}초</span>
              )}
            </div>
            
            {/* 상태별 세부 설명 */}
            {initState === 'hydrating' && (
              <p className="text-gray-600 text-sm">
                저장된 로그인 정보를 확인하고 있습니다
              </p>
            )}
            {initState === 'syncing' && (
              <p className="text-gray-600 text-sm">
                서버에서 최신 사용자 정보를 동기화하고 있습니다
              </p>
            )}
            {initState === 'silent_auth' && (
              <p className="text-gray-600 text-sm">
                자동 로그인을 시도하고 있습니다
              </p>
            )}
            
            {/* Enhanced 에러 상태 표시 with 사용자 가이드 */}
            {shouldShowError() && error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                <div className="flex items-center mb-2">
                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center mr-2">
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                  <p className="text-red-800 font-medium text-sm">
                    {error.type === 'network' && '네트워크 연결 문제'}
                    {error.type === 'silent_auth_timeout' && '자동 로그인 시간 초과'}
                    {error.type === 'server_error' && '서버 오류'}
                    {error.type === 'unknown' && '알 수 없는 오류'}
                  </p>
                </div>
                
                <p className="text-red-600 text-xs mb-3">{error.message}</p>
                
                {/* Enhanced 추천 액션 표시 */}
                {getRecommendedAction() && (
                  <div className={`rounded p-2 mb-3 border-l-4 ${
                    getRecommendedAction()?.priority === 'high' 
                      ? 'bg-red-100 border-red-500 text-red-700' 
                      : getRecommendedAction()?.priority === 'medium' 
                      ? 'bg-yellow-100 border-yellow-500 text-yellow-700'
                      : 'bg-blue-100 border-blue-500 text-blue-700'
                  }`}>
                    <div className="flex items-center">
                      <div className={`w-4 h-4 rounded-full mr-2 ${
                        getRecommendedAction()?.priority === 'high' 
                          ? 'bg-red-500' 
                          : getRecommendedAction()?.priority === 'medium' 
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                      }`}></div>
                      <p className="text-xs font-medium">추천: {getRecommendedAction()?.message}</p>
                    </div>
                  </div>
                )}
                
                {/* 상황별 사용자 가이드 */}
                <div className="bg-red-100 rounded p-2 mb-3">
                  <p className="text-red-700 text-xs font-medium mb-1">해결 방법:</p>
                  <ul className="text-red-600 text-xs space-y-1 list-disc list-inside">
                    {error.type === 'network' && (
                      <>
                        <li>인터넷 연결 상태를 확인해주세요</li>
                        <li>Wi-Fi 또는 모바일 데이터를 다시 연결해보세요</li>
                        <li>잠시 후 다시 시도해주세요</li>
                      </>
                    )}
                    {error.type === 'silent_auth_timeout' && (
                      <>
                        <li>네트워크 속도가 느릴 수 있습니다</li>
                        <li>다시 시도하거나 수동으로 로그인해주세요</li>
                      </>
                    )}
                    {error.type === 'server_error' && (
                      <>
                        <li>서버에 일시적 문제가 발생했습니다</li>
                        <li>몇 분 후 다시 시도해주세요</li>
                        <li>문제가 지속되면 관리자에게 문의하세요</li>
                      </>
                    )}
                    {error.type === 'unknown' && (
                      <>
                        <li>페이지를 새로고침해보세요</li>
                        <li>브라우저 캐시를 지워보세요</li>
                        <li>다른 브라우저를 사용해보세요</li>
                      </>
                    )}
                  </ul>
                </div>
                
                {canRetry() && (
                  <div className="flex items-center text-blue-600 text-xs">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span>자동으로 재시도 중... ({3 - (error.retryCount || 0)}/3)</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Enhanced 수동 재시도 버튼 with 추가 옵션 */}
            {error && !canRetry() && (
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => {
                    clearError();
                    resetRetry();
                    setAuthState('silent_auth');
                  }}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center"
                >
                  <div className="w-4 h-4 mr-2">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  다시 시도
                </button>
                
                {error.type !== 'network' && (
                  <button
                    onClick={() => {
                      clearError();
                      resetRetry();
                      setAuthState('ready'); // 수동 로그인으로 바로 이동
                    }}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium flex items-center justify-center"
                  >
                    <div className="w-4 h-4 mr-2">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    수동 로그인하기
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthRefreshProvider />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspace/:workspaceId/query/:queryId"
            element={
              <PrivateRoute>
                <QueryDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/workspaces"
            element={
              <AdminRoute>
                <WorkspaceManagement />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            }
          />
          <Route
            path="/workspaces/personal_test"
            element={
              <PrivateRoute>
                <PersonalTestWorkspace />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspaces/personal_test/process-flow/editor"
            element={
              <PrivateRoute>
                <ProcessFlowEditor />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspaces/personal_test/process-flow/monitor"
            element={
              <PrivateRoute>
                <ProcessFlowMonitor />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspaces/personal_test/process-flow/publish"
            element={
              <PrivateRoute>
                <ProcessFlowPublish />
              </PrivateRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          <Route
            path="/public/flow/:publishToken"
            element={<PublicProcessFlowMonitor />}
          />
          <Route
            path="/workspaces/personal_test/monitor/public/:publishToken"
            element={<PublicProcessFlowMonitor />}
          />
        </Routes>
      </Router>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#000',
            color: '#fff',
          },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;