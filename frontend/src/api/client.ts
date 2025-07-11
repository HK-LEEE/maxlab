import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

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

// Add auth token to requests for both clients
apiClient.interceptors.request.use((config) => {
  // OAuth 토큰은 localStorage에서 가져옴
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

authClient.interceptors.request.use((config) => {
  // OAuth 토큰은 localStorage에서 가져옴
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors for both clients
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // ProcessFlowEditor에서는 즉시 리다이렉트하지 않고 이벤트 발송
      const isProcessFlowEditor = window.location.pathname.includes('/process-flow/editor');
      
      if (isProcessFlowEditor) {
        // 토큰 만료 이벤트 발송 (TokenStatusMonitor에서 처리)
        window.dispatchEvent(new CustomEvent('auth:token-expired', { 
          detail: { error, source: 'api' } 
        }));
      } else {
        // 다른 페이지에서는 기존대로 즉시 리다이렉트
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

authClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export { apiClient, authClient };