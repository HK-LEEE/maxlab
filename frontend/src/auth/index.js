/**
 * MaxLab 인증 모듈 통합 내보내기
 * 
 * 이 파일은 모든 인증 관련 모듈과 컴포넌트를 중앙에서 관리하여
 * 다른 파일에서 쉽게 가져다 사용할 수 있도록 합니다.
 * 
 * 사용 예시:
 * import { OIDCClient, SessionManager, useAuth, LoginButton } from '@/auth';
 */

// === 핵심 서비스 모듈 ===
export { default as PKCEUtils } from './pkce.js';
export { default as OIDCClient } from './oidc-client.js';
export { default as TokenManager } from './token-manager.js';
export { default as SessionManager, SessionState } from './session.js';
export { default as AuthGuard, PermissionLevel, GuardResult, RouteProtection } from './auth-guard.js';

// === React 컴포넌트 ===
export { default as LoginButton } from './components/LoginButton.tsx';
export { default as LogoutButton } from './components/LogoutButton.tsx';
export { 
  default as AuthProvider, 
  useAuth, 
  useAuthenticatedUser, 
  usePermission 
} from './components/AuthProvider.tsx';
export { 
  default as ProtectedRoute, 
  AdminRoute, 
  RoleBasedRoute, 
  GroupBasedRoute 
} from './components/ProtectedRoute.tsx';

// === 타입 정의 (TypeScript 지원) ===
export type {
  // 세션 상태 타입
  SessionState as SessionStateType
} from './session.js';

export type {
  // 권한 및 가드 타입
  PermissionLevel as PermissionLevelType,
  GuardResult as GuardResultType
} from './auth-guard.js';

// === 유틸리티 함수들 ===

/**
 * 통합 인증 설정 생성
 * @param {Object} config - 설정 객체
 * @returns {Object} 통합 설정
 */
export function createAuthConfig(config = {}) {
  return {
    // 기본 OAuth/OIDC 설정
    authServerUrl: config.authServerUrl || import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000',
    clientId: config.clientId || import.meta.env.VITE_CLIENT_ID || 'maxlab',
    redirectUri: config.redirectUri || `${window.location.origin}/oauth/callback`,
    scope: config.scope || 'openid profile email read:profile read:groups manage:workflows',
    
    // 세션 관리 설정
    sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30분
    refreshThreshold: config.refreshThreshold || 5 * 60 * 1000, // 5분
    rememberMeDuration: config.rememberMeDuration || 30 * 24 * 60 * 60 * 1000, // 30일
    crossTabSync: config.crossTabSync !== false, // 기본값: true
    silentRenewal: config.silentRenewal !== false, // 기본값: true
    
    // 가드 설정
    loginPath: config.loginPath || '/login',
    unauthorizedPath: config.unauthorizedPath || '/unauthorized',
    defaultRedirectPath: config.defaultRedirectPath || '/dashboard',
    gracePeriod: config.gracePeriod || 5 * 60 * 1000, // 5분
    
    // 추가 설정
    ...config
  };
}

/**
 * 통합 인증 시스템 초기화
 * @param {Object} config - 설정 객체
 * @returns {Object} 초기화된 인증 서비스들
 */
export function initializeAuth(config = {}) {
  const authConfig = createAuthConfig(config);
  
  console.log('🔐 Initializing MaxLab auth system...', {
    authServerUrl: authConfig.authServerUrl,
    clientId: authConfig.clientId,
    features: {
      crossTabSync: authConfig.crossTabSync,
      silentRenewal: authConfig.silentRenewal,
      sessionTimeout: `${authConfig.sessionTimeout / 1000 / 60}분`
    }
  });
  
  // 서비스 인스턴스 생성
  const oidcClient = new OIDCClient(authConfig);
  const sessionManager = new SessionManager(authConfig);
  const authGuard = new AuthGuard(authConfig);
  
  // 전역 이벤트 리스너 설정
  setupGlobalEventHandlers(sessionManager, authGuard);
  
  return {
    oidcClient,
    sessionManager,
    authGuard,
    config: authConfig
  };
}

/**
 * 전역 이벤트 핸들러 설정
 * @param {SessionManager} sessionManager - 세션 관리자
 * @param {AuthGuard} authGuard - 인증 가드
 */
function setupGlobalEventHandlers(sessionManager, authGuard) {
  // 페이지 가시성 변경 시 세션 검증
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && sessionManager.isAuthenticated()) {
      console.log('👁️ Page visible - validating session');
      sessionManager.validateCurrentSession();
    }
  });
  
  // 브라우저 포커스 시 세션 검증
  window.addEventListener('focus', () => {
    if (sessionManager.isAuthenticated()) {
      console.log('🎯 Window focused - validating session');
      sessionManager.validateCurrentSession();
    }
  });
  
  // 네트워크 상태 변경 시 처리
  if ('navigator' in window && 'onLine' in navigator) {
    window.addEventListener('online', () => {
      console.log('🌐 Network online - resuming auth operations');
      if (sessionManager.isAuthenticated()) {
        sessionManager.validateCurrentSession();
      }
    });
    
    window.addEventListener('offline', () => {
      console.log('📴 Network offline - auth operations paused');
    });
  }
  
  // 페이지 언로드 시 정리
  window.addEventListener('beforeunload', () => {
    console.log('👋 Page unloading - cleaning up auth resources');
    // 중요한 정리 작업은 각 서비스에서 자동으로 처리됨
  });
}

/**
 * 현재 인증 상태 요약 정보 조회
 * @param {SessionManager} sessionManager - 세션 관리자
 * @returns {Object} 인증 상태 요약
 */
export function getAuthStatus(sessionManager) {
  if (!sessionManager) {
    return {
      status: 'not_initialized',
      message: '인증 시스템이 초기화되지 않았습니다.'
    };
  }
  
  const state = sessionManager.getState();
  const user = sessionManager.getUserInfo();
  const timeToExpiry = sessionManager.getTimeToExpiry();
  
  return {
    status: state,
    isAuthenticated: sessionManager.isAuthenticated(),
    user: user ? {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      groups: user.groups?.length || 0
    } : null,
    session: {
      timeToExpiry,
      expiryFormatted: timeToExpiry > 0 ? `${Math.floor(timeToExpiry / 60)}분 ${timeToExpiry % 60}초` : '만료됨'
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * 인증 디버깅 정보 수집
 * @param {Object} authServices - 인증 서비스들
 * @returns {Object} 디버깅 정보
 */
export function getAuthDebugInfo(authServices = {}) {
  const { sessionManager, authGuard, oidcClient } = authServices;
  
  return {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: {
      authServerUrl: import.meta.env.VITE_AUTH_SERVER_URL,
      clientId: import.meta.env.VITE_CLIENT_ID,
      isDevelopment: import.meta.env.DEV,
      userAgent: navigator.userAgent,
      url: window.location.href
    },
    sessionManager: sessionManager?.getDebugInfo(),
    authGuard: authGuard?.getDebugInfo(),
    oidcClient: oidcClient?.getDebugInfo(),
    localStorage: {
      keys: Object.keys(localStorage).filter(key => 
        key.includes('auth') || 
        key.includes('token') || 
        key.includes('session') ||
        key.includes('maxlab')
      )
    },
    sessionStorage: {
      keys: Object.keys(sessionStorage).filter(key => 
        key.includes('auth') || 
        key.includes('token') || 
        key.includes('oauth') ||
        key.includes('oidc')
      )
    }
  };
}

/**
 * 개발 모드에서 사용할 수 있는 디버깅 함수들을 전역에 노출
 */
if (import.meta.env.DEV) {
  // 개발 모드에서만 전역 변수로 노출
  window.__maxlab_auth_debug = {
    getAuthStatus,
    getAuthDebugInfo,
    PKCEUtils,
    SessionState,
    PermissionLevel,
    GuardResult
  };
  
  console.log('🔧 MaxLab Auth Debug functions available at window.__maxlab_auth_debug');
}

// 기본 내보내기는 초기화 함수
export default initializeAuth;