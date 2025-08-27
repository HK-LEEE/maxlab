import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { csrfProtection } from '../services/csrfProtection';
import { setupAxiosInterceptor } from '../services/authErrorInterceptor';
import { securityHeaders } from '../services/securityHeaders';
import { userIsolatedTokenStorage } from '../services/userIsolatedTokenStorage';
import { tokenSyncManager } from '../services/tokenSyncManager';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8010',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth client points to maxplatform auth server (8000)
const authClient = axios.create({
  baseURL: import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token and CSRF protection to requests for both clients
apiClient.interceptors.request.use(async (config) => {
  // Get current user ID for security headers
  const userId = userIsolatedTokenStorage.getCurrentUserId();
  
  // Add comprehensive security headers
  const secHeaders = securityHeaders.getSecurityHeaders(userId || undefined);
  Object.assign(config.headers, secHeaders);
  
  // Validate token freshness for non-auth endpoints
  if (!config.url?.includes('/oauth/') && !config.url?.includes('/auth/')) {
    try {
      await tokenSyncManager.validateTokenFreshness();
    } catch (error) {
      console.warn('Token validation failed, proceeding with request:', error);
    }
  }
  
  // OAuth 토큰은 localStorage에서 가져옴 (fallback to user-isolated storage)
  let token = localStorage.getItem('accessToken');
  if (!token && userId) {
    // Try to get from user-isolated storage
    const userTokens = await userIsolatedTokenStorage.getTokens(userId);
    if (userTokens) {
      token = userTokens.accessToken;
    }
  }
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // CSRF 보호 - 상태 변경 요청에만 적용
  const method = config.method?.toUpperCase();
  const needsCSRF = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method || '');
  
  if (needsCSRF) {
    // CSRF 헤더 추가
    const csrfHeaders = csrfProtection.getHeaders();
    Object.assign(config.headers, csrfHeaders);
    
    // FormData인 경우 CSRF 토큰 추가
    if (config.data instanceof FormData) {
      csrfProtection.addToFormData(config.data);
    }
    
    // CSRF protection applied
  }
  
  return config;
});

authClient.interceptors.request.use(async (config) => {
  // Get current user ID for security headers
  const userId = userIsolatedTokenStorage.getCurrentUserId();
  
  // Add comprehensive security headers
  const secHeaders = securityHeaders.getSecurityHeaders(userId || undefined);
  Object.assign(config.headers, secHeaders);
  
  // Validate token freshness for non-auth endpoints
  if (!config.url?.includes('/oauth/') && !config.url?.includes('/auth/')) {
    try {
      await tokenSyncManager.validateTokenFreshness();
    } catch (error) {
      console.warn('Token validation failed, proceeding with request:', error);
    }
  }
  
  // OAuth 토큰은 localStorage에서 가져옴 (fallback to user-isolated storage)
  let token = localStorage.getItem('accessToken');
  if (!token && userId) {
    // Try to get from user-isolated storage
    const userTokens = await userIsolatedTokenStorage.getTokens(userId);
    if (userTokens) {
      token = userTokens.accessToken;
    }
  }
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // CSRF 보호 - 상태 변경 요청에만 적용
  const method = config.method?.toUpperCase();
  const needsCSRF = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method || '');
  
  if (needsCSRF) {
    // CSRF 헤더 추가
    const csrfHeaders = csrfProtection.getHeaders();
    Object.assign(config.headers, csrfHeaders);
    
    // FormData인 경우 CSRF 토큰 추가
    if (config.data instanceof FormData) {
      csrfProtection.addToFormData(config.data);
    }
    
    // CSRF protection applied
  }
  
  return config;
});

// Handle auth and CSRF errors for both clients with token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;
    
    if (status === 401 && !originalRequest._tokenRefreshAttempted) {
      console.log(`🔒 Authentication error (401) detected:`, originalRequest?.url);
      
      // Skip refresh on public routes
      const currentPath = window.location.pathname;
      const isPublicRoute = currentPath.startsWith('/public/flow/') || 
                           currentPath.startsWith('/workspaces/personal_test/monitor/public/');
      
      if (isPublicRoute) {
        console.log('🔓 Public route - skipping authentication handling');
        return Promise.reject(error);
      }
      
      // DISABLED: No refresh token logic - immediately clean up and redirect
      console.log('⚠️ Token expired - cleaning cache and redirecting to login');
      
      // Complete cache cleanup
      const keysToRemove = [
        'accessToken', 'refreshToken', 'tokenType', 'expiresIn', 'scope',
        'tokenExpiryTime', 'tokenCreatedAt', 'refreshTokenExpiry',
        'lastTokenRefresh', 'user', 'userId', 'auth_method',
        'has_refresh_token', 'max_platform_session', 'token_renewable_via_sso',
        'sso_sync_token', 'sso_sync_user', 'oauth_state', 'oauth_flow',
        'redirectAfterLogin', 'pre_auth_url', 'original_navigation_url'
      ];
      
      // Clean localStorage
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clean sessionStorage
      sessionStorage.clear();
      
      // Save current path for redirect after login
      const currentPathWithQuery = window.location.pathname + window.location.search;
      if (currentPathWithQuery !== '/' && !currentPathWithQuery.includes('/login')) {
        localStorage.setItem('redirectAfterLogin', currentPathWithQuery);
      }
      
      // Redirect to MAX Platform login
      console.log('➡️ Redirecting to MAX Platform login page');
      // Original hardcoded: 'https://max.dwchem.co.kr/login'
      window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
      
      return Promise.reject(error);
      
      /* ORIGINAL REFRESH LOGIC - DISABLED
      try {
        // First, try to sync from MAX Platform...
        ... refresh logic ...
      } else {
          console.error('🔴 [MAX Lab API] Token refresh failed, redirecting to MAX Platform login');
          
          // 상세 로깅
          console.error('Token refresh failure details:', {
            timestamp: new Date().toISOString(),
            currentUrl: window.location.href,
            requestUrl: originalRequest?.url,
            sessionInfo: {
              userId: localStorage.getItem('userId'),
              authMethod: localStorage.getItem('auth_method'),
              hasRefreshToken: localStorage.getItem('refreshToken') !== null
            }
          });
          
          // 현재 경로 저장
          const currentPath = window.location.pathname + window.location.search;
          if (currentPath !== '/' && !currentPath.includes('/login')) {
            localStorage.setItem('redirectAfterLogin', currentPath);
          }
          
          // 토큰 정리
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          sessionStorage.clear();
          
          // MAX Platform 로그인 페이지로 리다이렉트
          console.log('➡️ [MAX Lab API] Redirecting to MAX Platform login...');
          // Original hardcoded: 'https://max.dwchem.co.kr/login'
      window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
          
          return Promise.reject(error);
        }
      } catch (refreshError: any) {
        console.error('🔴 [MAX Lab API] Token refresh error:', {
          error: refreshError?.message || refreshError,
          timestamp: new Date().toISOString(),
          currentUrl: window.location.href,
          requestUrl: originalRequest?.url,
          sessionInfo: {
            userId: localStorage.getItem('userId'),
            authMethod: localStorage.getItem('auth_method'),
            hasRefreshToken: localStorage.getItem('refreshToken') !== null
          }
        });
        
        // Token refresh failed, handle accordingly
        const isProcessFlowEditor = window.location.pathname.includes('/process-flow/editor');
        
        if (isProcessFlowEditor) {
          // ProcessFlowEditor에서는 즉시 리다이렉트하지 않고 이벤트 발송
          window.dispatchEvent(new CustomEvent('auth:token-expired', { 
            detail: { error, source: 'api', status, refreshFailed: true } 
          }));
        } else {
          // 현재 경로 저장
          const currentPath = window.location.pathname + window.location.search;
          if (currentPath !== '/' && !currentPath.includes('/login')) {
            localStorage.setItem('redirectAfterLogin', currentPath);
          }
          
          // 토큰 정리
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          sessionStorage.clear();
          
          // MAX Platform 로그인 페이지로 리다이렉트
          console.warn('🔐 [MAX Lab API] Redirecting to login due to refresh error...');
          // Original hardcoded: 'https://max.dwchem.co.kr/login'
      window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
        }
        
        return Promise.reject(error);
      }
      */ // END OF DISABLED REFRESH LOGIC
    } else if (status === 403) {
      // Authorization error (403)
      
      // 403은 권한 문제이므로 토큰 갱신으로 해결되지 않음
      const isProcessFlowEditor = window.location.pathname.includes('/process-flow/editor');
      
      if (isProcessFlowEditor) {
        window.dispatchEvent(new CustomEvent('auth:token-expired', { 
          detail: { error, source: 'api', status } 
        }));
      } else {
        window.dispatchEvent(new CustomEvent('auth:logout', {
          detail: { reason: 'insufficient_permissions', source: 'api_interceptor' }
        }));
      }
    } else if (status === 419 || (status === 400 && error.response?.data?.detail?.includes('CSRF'))) {
      // CSRF 토큰 에러 처리
      // CSRF token error, regenerating token
      csrfProtection.forceRegenerate();
      
      // 자동 재시도 (한 번만)
      if (!originalRequest._csrfRetry) {
        originalRequest._csrfRetry = true;
        return apiClient.request(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

authClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;
    
    if (status === 401 && !originalRequest._tokenRefreshAttempted) {
      console.log(`🔒 Auth API authentication error (401):`, originalRequest?.url);
      
      // Skip refresh on public routes
      const currentPath = window.location.pathname;
      const isPublicRoute = currentPath.startsWith('/public/flow/') || 
                           currentPath.startsWith('/workspaces/personal_test/monitor/public/');
      
      if (isPublicRoute) {
        console.log('🔓 Public route - skipping authentication handling for auth API');
        return Promise.reject(error);
      }
      
      // DISABLED: No refresh token logic - immediately clean up and redirect
      console.log('⚠️ Auth API token expired - cleaning cache and redirecting to login');
      
      // Complete cache cleanup
      const keysToRemove = [
        'accessToken', 'refreshToken', 'tokenType', 'expiresIn', 'scope',
        'tokenExpiryTime', 'tokenCreatedAt', 'refreshTokenExpiry',
        'lastTokenRefresh', 'user', 'userId', 'auth_method',
        'has_refresh_token', 'max_platform_session', 'token_renewable_via_sso',
        'sso_sync_token', 'sso_sync_user', 'oauth_state', 'oauth_flow',
        'redirectAfterLogin', 'pre_auth_url', 'original_navigation_url'
      ];
      
      // Clean localStorage
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clean sessionStorage
      sessionStorage.clear();
      
      // Save current path for redirect after login
      const currentPathWithQuery = window.location.pathname + window.location.search;
      if (currentPathWithQuery !== '/' && !currentPathWithQuery.includes('/login')) {
        localStorage.setItem('redirectAfterLogin', currentPathWithQuery);
      }
      
      // Redirect to MAX Platform login
      console.log('➡️ Redirecting to MAX Platform login page');
      // Original hardcoded: 'https://max.dwchem.co.kr/login'
      window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
      
      return Promise.reject(error);
      
      /* ORIGINAL REFRESH LOGIC - DISABLED
      try {
        // First, try to sync from MAX Platform for auth client too...
        
        // For auth client, we should be more conservative about token refresh
        // since this might be the auth endpoints themselves
        console.log('🔄 MAX Platform sync unsuccessful, attempting token refresh for auth API...');
        
        // Dynamic import to avoid circular dependency
        const { authService } = await import('../services/authService');
        const refreshSuccess = await authService.refreshToken();
        
        if (refreshSuccess) {
          console.log('✅ Token refresh successful for auth API, retrying request');
          
          // Update the authorization header with the new token
          const newToken = localStorage.getItem('accessToken');
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          
          // Retry the original request
          return authClient.request(originalRequest);
        } else {
          console.error('🔴 [MAX Lab Auth API] Token refresh failed, redirecting to MAX Platform login');
          
          // 상세 로깅
          console.error('Auth API token refresh failure details:', {
            timestamp: new Date().toISOString(),
            currentUrl: window.location.href,
            requestUrl: originalRequest?.url,
            sessionInfo: {
              userId: localStorage.getItem('userId'),
              authMethod: localStorage.getItem('auth_method'),
              hasRefreshToken: localStorage.getItem('refreshToken') !== null
            }
          });
          
          // 현재 경로 저장
          const currentPath = window.location.pathname + window.location.search;
          if (currentPath !== '/' && !currentPath.includes('/login')) {
            localStorage.setItem('redirectAfterLogin', currentPath);
          }
          
          // 토큰 정리
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          sessionStorage.clear();
          
          // MAX Platform 로그인 페이지로 리다이렉트
          console.log('➡️ [MAX Lab Auth API] Redirecting to MAX Platform login...');
          // Original hardcoded: 'https://max.dwchem.co.kr/login'
      window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
          
          return Promise.reject(error);
        }
      } catch (refreshError: any) {
        console.error('🔴 [MAX Lab Auth API] Token refresh error:', {
          error: refreshError?.message || refreshError,
          timestamp: new Date().toISOString(),
          currentUrl: window.location.href,
          requestUrl: originalRequest?.url,
          sessionInfo: {
            userId: localStorage.getItem('userId'),
            authMethod: localStorage.getItem('auth_method'),
            hasRefreshToken: localStorage.getItem('refreshToken') !== null
          }
        });
        
        // 현재 경로 저장
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/' && !currentPath.includes('/login')) {
          localStorage.setItem('redirectAfterLogin', currentPath);
        }
        
        // 토큰 정리
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        sessionStorage.clear();
        
        // MAX Platform 로그인 페이지로 리다이렉트
        console.warn('🔐 [MAX Lab Auth API] Redirecting to login due to auth API refresh error...');
        // Original hardcoded: 'https://max.dwchem.co.kr/login'
      window.location.href = `${import.meta.env.VITE_AUTH_SERVER_URL}/login`;
        
        return Promise.reject(error);
      }
      */ // END OF DISABLED REFRESH LOGIC
    } else if (status === 403) {
      console.log(`🚫 Auth API authorization error (403):`, originalRequest?.url);
      
      // 403 in auth API is serious - trigger logout
      window.dispatchEvent(new CustomEvent('auth:logout', {
        detail: { reason: 'auth_api_insufficient_permissions', source: 'auth_client' }
      }));
    } else if (status === 419 || (status === 400 && error.response?.data?.detail?.includes('CSRF'))) {
      // CSRF 토큰 에러 처리
      console.warn('🚫 CSRF token error in auth client, regenerating token...');
      csrfProtection.forceRegenerate();
      
      // 자동 재시도 (한 번만)
      if (!originalRequest._csrfRetry) {
        originalRequest._csrfRetry = true;
        return authClient.request(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

// Setup new error interceptor for both clients
setupAxiosInterceptor(apiClient);
setupAxiosInterceptor(authClient);

export { apiClient, authClient };