import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { csrfProtection } from '../services/csrfProtection';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8010',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth client now points to Max Lab backend proxy (8010) instead of direct maxplatform (8000)
const authClient = axios.create({
  baseURL: import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8010',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token and CSRF protection to requests for both clients
apiClient.interceptors.request.use((config) => {
  // OAuth 토큰은 localStorage에서 가져옴
  const token = localStorage.getItem('accessToken');
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
    
    console.log(`🛡️ CSRF protection applied to ${method} ${config.url}`);
  }
  
  return config;
});

authClient.interceptors.request.use((config) => {
  // OAuth 토큰은 localStorage에서 가져옴
  const token = localStorage.getItem('accessToken');
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
    
    console.log(`🛡️ CSRF protection applied to ${method} ${config.url}`);
  }
  
  return config;
});

// Handle auth and CSRF errors for both clients
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    
    if (status === 401 || status === 403) {
      console.log(`🔒 Authentication error (${status}):`, error.config?.url);
      
      // ProcessFlowEditor에서는 즉시 리다이렉트하지 않고 이벤트 발송
      const isProcessFlowEditor = window.location.pathname.includes('/process-flow/editor');
      
      if (isProcessFlowEditor) {
        // 토큰 만료/권한 없음 이벤트 발송 (TokenStatusMonitor에서 처리)
        window.dispatchEvent(new CustomEvent('auth:token-expired', { 
          detail: { error, source: 'api', status } 
        }));
      } else {
        // 다른 페이지에서는 기존대로 즉시 리다이렉트
        console.log('🔓 Clearing auth and redirecting to login...');
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    } else if (status === 419 || (status === 400 && error.response?.data?.detail?.includes('CSRF'))) {
      // CSRF 토큰 에러 처리
      console.warn('🚫 CSRF token error, regenerating token...');
      csrfProtection.forceRegenerate();
      
      // 자동 재시도 (한 번만)
      if (!error.config._csrfRetry) {
        error.config._csrfRetry = true;
        return apiClient.request(error.config);
      }
    }
    return Promise.reject(error);
  }
);

authClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    
    if (status === 401 || status === 403) {
      console.log(`🔒 Auth API error (${status}):`, error.config?.url);
      useAuthStore.getState().logout();
      window.location.href = '/login';
    } else if (status === 419 || (status === 400 && error.response?.data?.detail?.includes('CSRF'))) {
      // CSRF 토큰 에러 처리
      console.warn('🚫 CSRF token error in auth client, regenerating token...');
      csrfProtection.forceRegenerate();
      
      // 자동 재시도 (한 번만)
      if (!error.config._csrfRetry) {
        error.config._csrfRetry = true;
        return authClient.request(error.config);
      }
    }
    return Promise.reject(error);
  }
);

export { apiClient, authClient };