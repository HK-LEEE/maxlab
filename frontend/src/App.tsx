import React, { useEffect, useState, useRef } from 'react';
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
import { tokenSyncManager } from './services/tokenSyncManager';
import { crossDomainLogout } from './utils/crossDomainLogout';
import { instantLogoutChannel } from './utils/instantLogoutChannel';
import { oauthLoopPrevention } from './utils/oauthInfiniteLoopPrevention';
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
  // Skip auth refresh on public routes
  if (!isPublicRoute()) {
    useAuthRefresh();
  }
  return null;
};

// Helper function to check if current page is a public route
const isPublicRoute = () => {
  const currentPath = window.location.pathname;
  return currentPath.startsWith('/public/flow/') || 
         currentPath.startsWith('/workspaces/personal_test/monitor/public/');
};

// Global initialization guard to prevent double initialization
let globalInitializationInProgress = false;
let globalInitializationCompleted = false;

function App() {
  devLog.debug('App component rendering');
  
  // CRITICAL FIX: Add initialization guard state
  const [appInitialized, setAppInitialized] = useState(false);
  const initializationRef = useRef(false);
  
  // CRITICAL FIX: Save original navigation URL before any redirects
  useEffect(() => {
    // Only save if not already on an error page or auth callback
    const currentUrl = window.location.href;
    const pathname = window.location.pathname;
    
    // Don't save auth-related URLs as original navigation
    const isAuthRelatedPage = pathname === '/oauth/callback' || 
                              pathname === '/login' ||
                              currentUrl.includes('error=') ||
                              currentUrl.includes('error_description=');
    
    if (!isAuthRelatedPage && !sessionStorage.getItem('original_navigation_url')) {
      console.log('📍 Saving original navigation URL:', currentUrl);
      sessionStorage.setItem('original_navigation_url', currentUrl);
      localStorage.setItem('pre_auth_url', currentUrl);
    }
  }, []); // Run only once on mount
  
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
  
  // SSO: 초기 로드 시 SSO 동기화 토큰 체크
  useEffect(() => {
    const checkSSOSync = async () => {
      // Skip SSO sync on public routes
      if (isPublicRoute()) {
        console.log('🔓 Public route detected, skipping SSO sync check');
        return;
      }
      
      // 이미 인증된 상태면 스킵
      if (isAuthenticated) {
        return;
      }
      
      // localStorage에서 SSO 동기화 토큰 확인
      const ssoToken = localStorage.getItem('sso_sync_token');
      const ssoUser = localStorage.getItem('sso_sync_user');
      
      if (ssoToken && ssoUser) {
        console.log('🔄 SSO: Found sync token from MAX Platform');
        
        try {
          const userData = JSON.parse(ssoUser);
          
          // CRITICAL FIX: Store user data in localStorage for validation
          localStorage.setItem('user', JSON.stringify(userData));
          
          // Store access token (SSO sync only provides access token, no refresh token)
          localStorage.setItem('accessToken', ssoToken);
          
          // Set auth state with user data
          setAuth(ssoToken, userData);
          setUser(userData);
          
          // IMPORTANT: SSO sync tokens typically don't have refresh tokens
          // Store flag to indicate this is SSO-based auth without refresh capability
          localStorage.setItem('auth_source', 'sso_sync');
          localStorage.setItem('auth_no_refresh_token', 'true');
          
          // ENHANCED: Store SSO-specific metadata for proper token refresh handling
          localStorage.setItem('auth_method', userData.auth_method || 'sso_sync');
          localStorage.setItem('has_refresh_token', String(userData.has_refresh_token || false));
          localStorage.setItem('max_platform_session', String(userData.max_platform_session || true));
          localStorage.setItem('token_renewable_via_sso', String(userData.token_renewable_via_sso || true));
          localStorage.setItem('sync_time', String(userData.sync_time || Date.now()));
          
          console.log('✅ SSO Sync: Enhanced metadata stored for SSO session handling');
          
          setAuthState('ready');
          
          // 동기화 토큰 정리 (일회성)
          localStorage.removeItem('sso_sync_token');
          localStorage.removeItem('sso_sync_user');
          
          console.log('✅ SSO: Auto login from stored sync token successful (no refresh token)');
          
        } catch (error) {
          console.error('❌ SSO: Failed to parse stored sync data:', error);
          // 파싱 실패 시 정리
          localStorage.removeItem('sso_sync_token');
          localStorage.removeItem('sso_sync_user');
        }
      }
    };
    
    checkSSOSync();
  }, []);
  
  // 기존 isInitializing 대신 authStore의 상태 사용
  // Skip initialization screen on public routes
  const isInitializing = !isPublicRoute() && (initState !== 'ready' && initState !== 'error');
  
  // Token Sync Manager - Sync with MAX Platform BEFORE other initializations
  useEffect(() => {
    // Skip token sync on public routes
    if (isPublicRoute()) {
      console.log('🔓 Public route detected, skipping token sync');
      return;
    }
    
    // Perform initial sync immediately and wait for it
    const performInitialSync = async () => {
      console.log('🔄 Performing initial token sync with MAX Platform...');
      try {
        const synced = await tokenSyncManager.syncTokensFromPlatform();
        if (synced) {
          console.log('✅ Initial token sync successful');
          // Update auth state if token was synced
          const accessToken = localStorage.getItem('accessToken');
          const user = localStorage.getItem('user');
          if (accessToken && user) {
            try {
              const userData = JSON.parse(user);
              setAuth(accessToken, userData);
            } catch (e) {
              console.error('Failed to parse user data after sync:', e);
            }
          }
        }
      } catch (error) {
        console.error('Initial token sync failed:', error);
      }
    };
    
    // Run initial sync immediately
    performInitialSync();
    
    // Then set up periodic sync
    const syncInterval = setInterval(() => {
      tokenSyncManager.syncTokensFromPlatform().catch(error => {
        console.error('Periodic token sync failed:', error);
      });
    }, 60000); // Every minute
    
    // Also sync on window focus
    const handleFocus = () => {
      tokenSyncManager.syncTokensFromPlatform().catch(error => {
        console.error('Focus token sync failed:', error);
      });
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [setAuth]);
  
  // Auth Sync Service 초기화
  useEffect(() => {
    // Skip auth sync service on public routes
    if (isPublicRoute()) {
      console.log('🔓 Public route detected, skipping Auth Sync Service initialization');
      return;
    }
    
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

  // 🚫 SIMPLIFIED: 크로스 도메인 로그아웃 리스너 초기화
  useEffect(() => {
    // Skip cross-domain logout listeners on public routes
    if (isPublicRoute()) {
      console.log('🔓 Public route detected, skipping cross-domain logout listeners');
      return;
    }
    
    // SAFETY: 로그아웃 진행 중이면 리스너 초기화 건너뛰기
    const logoutInProgress = sessionStorage.getItem('logout_in_progress');
    if (logoutInProgress && Date.now() - parseInt(logoutInProgress) < 10000) {
      console.log('🛑 Logout in progress, skipping cross-domain listener initialization');
      return;
    }
    
    console.log('🔒 Initializing cross-domain logout listener');
    
    // 🔥 즉시 로그아웃 채널 리스너 등록
    instantLogoutChannel.onLogout(() => {
      console.log('🔥 Instant logout detected via BroadcastChannel/localStorage');
      
      const isPublicPageNow = isPublicRoute();
      
      // 로그아웃 진행 상태 표시
      sessionStorage.setItem('logout_in_progress', Date.now().toString());
      
      // 즉시 로그아웃 수행
      localStorage.clear();
      logout();
      
      if (!isPublicPageNow) {
        window.location.href = '/login?reason=instant_logout';
      }
    });
    
    // 크로스 도메인 로그아웃 감지 시작 - SIMPLIFIED
    crossDomainLogout.startListening(() => {
      console.log('🚨 Cross-domain logout detected - clearing session');
      
      const isPublicPageNow = isPublicRoute();
      
      // 모든 스토리지 클리어 및 로그아웃
      localStorage.clear();
      sessionStorage.clear();
      
      // 상태 리셋
      logout();
      
      // Only redirect if not on a public page
      if (!isPublicPageNow) {
        // Simple redirect without tracking attempts
        window.location.href = '/login?reason=cross_domain_logout';
      } else {
        console.log('🔄 Cross-domain logout detected on public page, staying on current page');
      }
    });
    
    return () => {
      crossDomainLogout.stopListening();
      instantLogoutChannel.close();  // 🔥 즉시 로그아웃 채널 정리
    };
  }, []); // FIXED: Remove logout dependency to prevent infinite loops
  
  // SSO: MAX Platform에서 전송한 PostMessage 수신
  useEffect(() => {
    // Skip SSO message handling on public routes
    if (isPublicRoute()) {
      console.log('🔓 Public route detected, skipping SSO PostMessage listener');
      return;
    }
    
    const handleSSOMessage = async (event: MessageEvent) => {
      // 보안: 신뢰할 수 있는 오리진에서만 메시지 수락
      const trustedOrigins = [
        'https://max.dwchem.co.kr',
        'https://maxplatform.dwchem.co.kr',
        'https://maxlab.dwchem.co.kr', // 자기 자신 (iframe logout-sync)
        'http://localhost:3000', // 개발 환경
        'http://localhost:3001', // 개발 환경 대체 포트
        'http://localhost:3010', // maxlab 개발 환경
        'http://localhost:8100', // maxlab backend 개발 환경
      ];
      
      if (!trustedOrigins.includes(event.origin)) {
        console.warn('⚠️ SSO: Received message from untrusted origin:', event.origin);
        return;
      }
      
      // SSO 동기화 메시지 처리
      if (event.data.type === 'SSO_SYNC_SUCCESS') {
        console.log('🔄 SSO: Received sync success from MAX Platform');
        
        try {
          const { sessionData, token } = event.data;
          
          // Normalize user data to ensure required fields exist
          const normalizedUser = {
            id: sessionData.id || sessionData.user_id || sessionData.sub || sessionData.email,
            email: sessionData.email || '',
            username: sessionData.username || sessionData.name || sessionData.display_name || sessionData.email || 'Unknown User',
            full_name: sessionData.full_name || sessionData.real_name || sessionData.name || sessionData.username || sessionData.email || 'Unknown User',
            is_active: sessionData.is_active !== undefined ? sessionData.is_active : true,
            is_admin: Boolean(sessionData.is_admin || sessionData.is_superuser || sessionData.admin),
            role: (sessionData.is_admin || sessionData.is_superuser || sessionData.admin) ? 'admin' : 'user',
            groups: sessionData.groups || [],
            permissions: sessionData.permissions || [],
            ...sessionData // Keep all original fields
          };
          
          console.log('🔄 SSO: Normalized user data:', {
            id: normalizedUser.id,
            username: normalizedUser.username,
            email: normalizedUser.email,
            is_admin: normalizedUser.is_admin
          });
          
          // Store user data BEFORE setting auth state to prevent race conditions
          localStorage.setItem('user', JSON.stringify(normalizedUser));
          localStorage.setItem('accessToken', token);
          
          // Auth Store 업데이트 - use normalized user data
          setUser(normalizedUser);
          
          // Small delay to ensure localStorage writes complete
          setTimeout(() => {
            setAuth(token, normalizedUser);
            setAuthState('ready');
            resetRetry();
            
            console.log('✅ SSO: Auto login successful via MAX Platform');
            
            // Auth Sync Service를 통해 다른 탭에도 알림
            authSyncService.broadcast({
              type: 'LOGIN',
              user: normalizedUser,
              token: token
            });
          }, 50);
          
        } catch (error) {
          console.error('❌ SSO: Failed to process sync message:', error);
          setAuthError({
            type: 'sso_sync',
            message: 'Failed to sync with MAX Platform',
            recoverable: true
          });
        }
      }
      
      // SSO 동기화 에러 처리
      if (event.data.type === 'SSO_SYNC_ERROR') {
        console.error('❌ SSO: Sync error from MAX Platform:', event.data.error);
        // 에러 로깅만 하고 현재 세션에는 영향을 주지 않음
      }
      
      // SSO 로그아웃 동기화 처리
      if (event.data.type === 'SSO_LOGOUT_SYNC') {
        console.log('🔄 SSO: Received logout sync from MAX Platform');
        
        // 🔥 Force immediate cleanup
        try {
          // Clear all storage immediately
          localStorage.clear();
          sessionStorage.clear();
          
          // Clear cookies
          const isProduction = window.location.hostname.includes('dwchem.co.kr');
          document.cookie.split(";").forEach(c => {
            const cookie = c.replace(/^ +/, "");
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            document.cookie = name + "=;expires=" + new Date().toUTCString() + ";path=/";
            if (isProduction) {
              document.cookie = name + "=;expires=" + new Date().toUTCString() + ";path=/;domain=.dwchem.co.kr";
            }
          });
        } catch (e) {
          console.error('Failed to clear storage:', e);
        }
        
        // 로컬 세션 종료
        logout();
        
        // Auth Sync Service를 통해 다른 탭에도 알림
        authSyncService.broadcast({
          type: 'LOGOUT',
          reason: 'SSO logout from MAX Platform'
        });
        
        console.log('✅ SSO: Auto logout completed via MAX Platform');
        
        // 로그인 페이지로 리다이렉트 (SSO 로그아웃 표시)
        setTimeout(() => {
          window.location.href = '/login?logout=sso_sync';
        }, 100);
      }
    };
    
    // PostMessage 리스너 등록
    window.addEventListener('message', handleSSOMessage);
    console.log('📡 SSO: PostMessage listener registered');
    
    return () => {
      window.removeEventListener('message', handleSSOMessage);
    };
  }, [setAuth, setUser, setAuthState, resetRetry, setAuthError]);
  
  // 통합 인증 상태 관리 및 리다이렉트 시스템
  useEffect(() => {
    const handleAutoLogout = (event: CustomEvent) => {
      devLog.info('🔓 Auto logout triggered:', event.detail);
      
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const isPublicPageNow = isPublicRoute();
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
      if (!isPublicPageNow) {
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
    
    // 🔥 localStorage 변경 즉시 감지 for instant logout
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'logout_trigger' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (Date.now() - data.timestamp < 2000) { // 2초 이내만
            console.log('🔥 Instant logout detected via storage');
            logout();
            window.location.href = '/login?logout=cross_domain';
          }
        } catch (error) {
          console.error('Failed to parse logout trigger:', error);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('auth:logout', handleAutoLogout as EventListener);
      window.removeEventListener('auth:token_expiring', handleTokenExpiring as EventListener);
      window.removeEventListener('auth:refresh_token_expiring', handleRefreshTokenExpiring as EventListener);
      window.removeEventListener('auth:network_error', handleTokenRefreshNetworkError as EventListener);
      window.removeEventListener('auth:refresh_token_invalid', handleRefreshTokenInvalid as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [logout]);
  
  // 개발 환경에서만 진단 도구 및 토큰 테스트 헬퍼 등록
  useEffect(() => {
    // Skip development diagnostics on public routes
    if (isPublicRoute()) {
      console.log('🔓 Public route detected, skipping development diagnostics');
      return;
    }
    
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
        // 🔓 CRITICAL FIX: Skip authentication completely on public routes
        if (isPublicRoute()) {
          console.log('🔓 Public route detected, skipping authentication initialization completely');
          setAuthState('ready'); // Set auth state to ready without authentication
          setAppInitialized(true);
          return;
        }
        
        // Check if we're in the middle of auth redirect
        if (sessionStorage.getItem('auth_redirect_in_progress') === 'true') {
          console.log('🔄 Auth redirect in progress, skipping initialization');
          setAuthState('ready');
          setAppInitialized(true);
          return;
        }
        
        // 🔒 CRITICAL FIX: Global initialization guard to prevent double initialization
        if (globalInitializationInProgress) {
          console.log('🛑 Global initialization already in progress, skipping duplicate initialization');
          return;
        }
        
        // 🔒 CRITICAL FIX: Check if already initialized globally
        if (globalInitializationCompleted) {
          console.log('✅ Global initialization already completed');
          setAppInitialized(true);
          return;
        }
        
        // 🔒 CRITICAL FIX: Use ref to ensure single initialization per instance
        if (initializationRef.current) {
          console.log('🛑 This component instance already initialized');
          return;
        }
        
        // Mark initialization as started
        globalInitializationInProgress = true;
        initializationRef.current = true;
        
        console.log('🚀 Starting auth initialization (single instance guaranteed)');
        
        // 🔒 CRITICAL FIX: Use ref values to prevent stale closures
        const currentInitState = useAuthStore.getState().initState;
        const currentIsAuthenticated = useAuthStore.getState().isAuthenticated;
        
        // 🔒 GUARD: Check if OAuth popup is currently redirecting
        const oauthRedirecting = sessionStorage.getItem('oauth_popup_redirecting');
        const redirectTime = sessionStorage.getItem('oauth_popup_redirect_time');
        if (oauthRedirecting === 'true' && redirectTime) {
          const timeSinceRedirect = Date.now() - parseInt(redirectTime);
          // If OAuth popup redirected less than 5 seconds ago, skip initialization
          if (timeSinceRedirect < 5000) {
            console.log('🔄 OAuth popup is currently redirecting, skipping auth initialization');
            globalInitializationInProgress = false;
            return;
          } else {
            // Clean up stale redirect flag
            sessionStorage.removeItem('oauth_popup_redirecting');
            sessionStorage.removeItem('oauth_popup_redirect_time');
          }
        }
        
        // 🔒 GUARD: Prevent duplicate initialization
        if (currentInitState === 'syncing' || currentInitState === 'silent_auth') {
          console.log('🛑 Authentication initialization already in progress:', currentInitState);
          globalInitializationInProgress = false;
          return;
        }
        
        // 🔒 SECURITY: Skip initialization if already ready
        if (currentInitState === 'ready') {
          console.log('✅ Authentication already initialized');
          globalInitializationInProgress = false;
          globalInitializationCompleted = true;
          setAppInitialized(true);
          return;
        }
        
        // 🔧 CRITICAL FIX: Handle authenticated users with server-side validation
        if (currentIsAuthenticated) {
          const cachedToken = localStorage.getItem('accessToken');
          const tokenExpiry = localStorage.getItem('tokenExpiryTime');
          const currentTime = Date.now();
          
          // Check if token is locally valid first
          if (cachedToken && tokenExpiry && currentTime < parseInt(tokenExpiry)) {
            devLog.info('✅ User has locally valid token, validating with server...');
            
            // 🚨 CRITICAL: Server-side token validation to prevent isAuthenticated mismatch
            try {
              setAuthState('syncing');
              
              // Validate token with server by fetching user info
              const freshUser = await authService.getCurrentUser();
              
              // Check for user switch - compare stored user with server user
              const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
              if (storedUser.email && freshUser.email && storedUser.email !== freshUser.email) {
                devLog.warn('🚨 User mismatch detected!');
                devLog.warn(`Stored: ${storedUser.email} (${storedUser.id}) vs Server: ${freshUser.email} (${freshUser.id})`);
                
                // Clear all local storage to prevent token confusion
                localStorage.clear();
                sessionStorage.clear();
                
                // Force re-authentication
                logout();
                setAuthState('idle');
                window.location.href = '/login?reason=user_switch';
                return;
              }
              
              // If we get here, token is valid on server side and user matches
              setUser(freshUser);
              devLog.info('✅ Token validated with server, user authenticated:', { 
                email: freshUser.email,
                is_admin: freshUser.is_admin 
              });
              setAuthState('ready');
              return;
              
            } catch (error: any) {
              devLog.error('❌ Server-side token validation failed:', error);
              
              // 🚨 CRITICAL FIX: Token invalid on server side - clear auth state
              console.log('🧹 Clearing invalid token and auth state');
              
              // Clear all auth-related data
              const keysToRemove = [
                'accessToken', 'tokenExpiryTime', 'tokenType', 'expiresIn', 
                'refreshToken', 'refreshTokenExpiry', 'user'
              ];
              keysToRemove.forEach(key => localStorage.removeItem(key));
              
              // Clear auth store state
              logout();
              setAuthState('idle');
              
              // Set specific error for UI feedback
              setAuthError({
                type: 'server_error',
                message: 'Your session has expired. Please log in again.',
                recoverable: true
              });
              
              // Continue to silent auth attempt below instead of stopping
            }
          } else {
            devLog.warn('⚠️ Cached token locally invalid or expired, attempting refresh');
            // CRITICAL FIX: Don't call logout() immediately when token expires
            // Try to refresh the token first, only logout if refresh fails
            try {
              const refreshResult = await authService.refreshToken(true);
              if (refreshResult) {
                devLog.info('✅ Token refresh successful, continuing with auth');
                setAuthState('ready');
                return; // Exit early, no need for silent auth
              } else {
                devLog.warn('❌ Token refresh failed, will attempt silent auth');
                // Don't call logout() here - let silent auth try first
                setAuthState('idle');
              }
            } catch (error) {
              devLog.warn('❌ Token refresh error, will attempt silent auth:', error);
              // Don't call logout() here - let silent auth try first  
              setAuthState('idle');
            }
            // Continue to silent auth attempt below
          }
        }
        
        // 🔧 SECURITY FIX: Handle non-authenticated users with silent auth
        if (currentInitState === 'idle' || currentInitState === 'hydrating') {
          // 🔒 CRITICAL: Check for OAuth loop before attempting silent auth
          const loopDetection = oauthLoopPrevention.detectInfiniteLoop();
          if (loopDetection.inLoop) {
            console.warn('🚨 OAuth infinite loop detected, skipping silent auth:', loopDetection);
            setAuthState('ready');
            globalInitializationInProgress = false;
            globalInitializationCompleted = true;
            setAppInitialized(true);
            
            // Set error for user feedback
            setAuthError({
              type: 'unknown',
              message: loopDetection.recommendation || 'Authentication loop detected. Please try manual login.',
              recoverable: true
            });
            return;
          }
          
          // Check if silent auth is allowed by loop prevention
          const canAttempt = oauthLoopPrevention.canAttemptOAuth('auto');
          if (!canAttempt.allowed) {
            console.warn('🚫 Silent auth blocked by loop prevention:', canAttempt.reason);
            setAuthState('ready');
            globalInitializationInProgress = false;
            globalInitializationCompleted = true;
            setAppInitialized(true);
            return;
          }
          
          devLog.info('🔄 Attempting silent authentication...');
          setAuthState('silent_auth');
          
          const result = await authService.attemptSilentLogin();
          
          if (result.success && result.user) {
            const token = localStorage.getItem('accessToken') || '';
            
            // 🚨 CRITICAL: Validate silent auth token with server
            try {
              devLog.info('🔍 Validating silent auth token with server...');
              const freshUser = await authService.getCurrentUser();
              
              // Check for user switch during silent auth
              const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
              if (storedUser.email && freshUser.email && storedUser.email !== freshUser.email) {
                devLog.warn('🚨 User mismatch during silent auth!');
                devLog.warn(`Stored: ${storedUser.email} vs Server: ${freshUser.email}`);
                
                // Clear everything and force re-login
                localStorage.clear();
                sessionStorage.clear();
                logout();
                setAuthState('idle');
                window.location.href = '/login?reason=user_switch';
                return;
              }
              
              // If we get here, token is valid
              setAuth(token, freshUser);
              setUser(freshUser);
              resetRetry();
              devLog.info('✅ Silent auth validated with server:', { 
                email: freshUser.email,
                is_admin: freshUser.is_admin 
              });
              
              // Record successful OAuth attempt
              oauthLoopPrevention.recordAttempt('auto', true);
              
            } catch (validationError: any) {
              devLog.error('❌ Silent auth token validation failed:', validationError);
              
              // Record failed OAuth attempt
              oauthLoopPrevention.recordAttempt('auto', false, validationError.message);
              
              // Silent auth succeeded but token is invalid on server - clear everything
              const keysToRemove = [
                'accessToken', 'tokenExpiryTime', 'tokenType', 'expiresIn', 
                'refreshToken', 'refreshTokenExpiry', 'user'
              ];
              keysToRemove.forEach(key => localStorage.removeItem(key));
              
              logout();
              
              setAuthError({
                type: 'server_error',
                message: 'Authentication validation failed. Please log in manually.',
                recoverable: true
              });
              
              devLog.info('🚨 Silent auth token invalid - user needs manual login');
            }
          } else {
            devLog.info('ℹ️ Silent login not available, user needs to login manually');
            
            // Record failed OAuth attempt
            oauthLoopPrevention.recordAttempt('auto', false, result.error || 'Silent login unavailable');
            
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
        
        // Mark initialization as complete
        globalInitializationInProgress = false;
        globalInitializationCompleted = true;
        setAppInitialized(true);
      } catch (error: any) {
        devLog.warn('⚠️ Auth initialization error:', error);
        
        // Record failed OAuth attempt
        oauthLoopPrevention.recordAttempt('auto', false, error.message);
        
        const authError = {
          type: 'unknown' as const,
          message: error.message || 'Authentication initialization failed',
          recoverable: false
        };
        
        setAuthError(authError);
        setAuthState('ready'); // Move to ready state even on error
        
        // Mark initialization as complete even on error
        globalInitializationInProgress = false;
        globalInitializationCompleted = true;
        setAppInitialized(true);
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