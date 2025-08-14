import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { csrfProtection } from '../services/csrfProtection';
import { setupAxiosInterceptor } from '../services/authErrorInterceptor';
import { securityHeaders } from '../services/securityHeaders';
import { userIsolatedTokenStorage } from '../services/userIsolatedTokenStorage';

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
      
      // Mark this request as having attempted token refresh to prevent infinite loops
      originalRequest._tokenRefreshAttempted = true;
      
      try {
        // Attempt token refresh using authService
        console.log('🔄 Attempting automatic token refresh...');
        
        // Dynamic import to avoid circular dependency
        const { authService } = await import('../services/authService');
        const refreshSuccess = await authService.refreshToken();
        
        if (refreshSuccess) {
          console.log('✅ Token refresh successful, retrying original request');
          
          // Update the authorization header with the new token
          const newToken = localStorage.getItem('accessToken');
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          
          // Retry the original request
          return apiClient.request(originalRequest);
        } else {
          console.log('❌ Token refresh failed, redirecting to login');
          throw new Error('Token refresh failed');
        }
      } catch (refreshError) {
        const errorMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
        console.error('❌ Token refresh error:', errorMessage);
        
        // 차등적 재시도 정책 분석 및 로깅
        let maxRetries = 3; // 기본값
        let reason = 'default policy';
        
        if (errorMessage.includes('Network Error') || 
            errorMessage.includes('ERR_NETWORK') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('connection')) {
          maxRetries = 5;
          reason = 'network error - more tolerant policy';
        } else if (errorMessage.includes('401') || 
                   errorMessage.includes('unauthorized') ||
                   errorMessage.includes('invalid_token')) {
          maxRetries = 1;
          reason = 'token error - immediate failure policy';
        } else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
          maxRetries = 1;
          reason = 'permission error - immediate failure policy';
        } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
          maxRetries = 4;
          reason = 'server error - moderate retry policy';
        }
        
        console.log(`📋 API Client: Would use ${maxRetries} retries (${reason}) for error: ${errorMessage}`);
        
        // Token refresh failed, handle accordingly
        const isProcessFlowEditor = window.location.pathname.includes('/process-flow/editor');
        
        if (isProcessFlowEditor) {
          // ProcessFlowEditor에서는 즉시 리다이렉트하지 않고 이벤트 발송
          window.dispatchEvent(new CustomEvent('auth:token-expired', { 
            detail: { 
              error, 
              source: 'api', 
              status, 
              refreshFailed: true,
              errorAnalysis: { maxRetries, reason, errorMessage }
            } 
          }));
        } else {
          // 다른 페이지에서는 자동 로그아웃 이벤트 발송
          window.dispatchEvent(new CustomEvent('auth:logout', {
            detail: { 
              reason: 'token_refresh_failed', 
              source: 'api_interceptor',
              errorAnalysis: { maxRetries, reason, errorMessage }
            }
          }));
        }
        
        return Promise.reject(error);
      }
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
      
      // Mark this request as having attempted token refresh
      originalRequest._tokenRefreshAttempted = true;
      
      try {
        // For auth client, we should be more conservative about token refresh
        // since this might be the auth endpoints themselves
        console.log('🔄 Attempting token refresh for auth API...');
        
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
          console.log('❌ Token refresh failed for auth API');
          throw new Error('Auth API token refresh failed');
        }
      } catch (refreshError) {
        const errorMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
        console.error('❌ Auth API token refresh error:', errorMessage);
        
        // 차등적 재시도 정책 분석 및 로깅
        let maxRetries = 3; // 기본값
        let reason = 'default policy';
        
        if (errorMessage.includes('Network Error') || 
            errorMessage.includes('ERR_NETWORK') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('connection')) {
          maxRetries = 5;
          reason = 'network error - more tolerant policy';
        } else if (errorMessage.includes('401') || 
                   errorMessage.includes('unauthorized') ||
                   errorMessage.includes('invalid_token')) {
          maxRetries = 1;
          reason = 'token error - immediate failure policy';
        } else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
          maxRetries = 1;
          reason = 'permission error - immediate failure policy';
        } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
          maxRetries = 4;
          reason = 'server error - moderate retry policy';
        }
        
        console.log(`📋 Auth Client: Would use ${maxRetries} retries (${reason}) for error: ${errorMessage}`);
        
        // For auth API failures, always trigger logout
        window.dispatchEvent(new CustomEvent('auth:logout', {
          detail: { 
            reason: 'auth_api_token_refresh_failed', 
            source: 'auth_client',
            errorAnalysis: { maxRetries, reason, errorMessage }
          }
        }));
        
        return Promise.reject(error);
      }
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