/**
 * 🔒 OIDC 표준 준수 Secure Global Logout Hook
 * OpenID Connect 표준을 따르는 안전한 로그아웃 기능
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/authService';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { oidcService } from '../services/oidcService';
import { authSyncService } from '../services/authSyncService';

interface LogoutOptions {
  reason?: string;
  skipConfirmation?: boolean;
}

interface LogoutResult {
  success: boolean;
  error?: string;
  sessionsLoggedOut?: number;
}

interface LogoutState {
  isLoading: boolean;
  showConfirmation: boolean;
  error: string | null;
}

export const useSecureLogout = () => {
  const { logout: clearAuthStore } = useAuthStore();
  const queryClient = useQueryClient();
  const [state, setState] = useState<LogoutState>({
    isLoading: false,
    showConfirmation: false,
    error: null
  });

  /**
   * 🔒 서버 요청사항에 따른 로그아웃 구현
   */
  const performServerLogout = useCallback(async (): Promise<void> => {
    try {
      console.log('🔐 Starting server-requested logout flow...');
      
      // 1단계: 먼저 클라이언트 저장소에서 토큰 가져오기
      const accessToken = localStorage.getItem('accessToken');
      
      if (!accessToken) {
        console.warn('⚠️ No access token found, proceeding with local cleanup');
        throw new Error('No access token');
      }
      
      // 2단계: 백엔드 로그아웃 호출 (토큰과 함께)
      const logoutUrl = '/api/oauth/logout?client_id=maxlab&post_logout_redirect_uri=' +
        encodeURIComponent('http://localhost:3010/login?logout=success');
      
      console.log('🚪 Backend logout URL:', logoutUrl);
      
      const response = await fetch(logoutUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      console.log('🔄 Backend logout response:', {
        ok: response.ok,
        status: response.status,
        redirected: response.redirected,
        url: response.url
      });
      
      // 3단계: 클라이언트 저장소 완전 정리
      localStorage.removeItem('accessToken');
      localStorage.removeItem('tokenExpiryTime');
      localStorage.removeItem('user');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('id_token');
      
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('silent_oauth_state');
      sessionStorage.clear(); // 모든 세션 저장소 정리
      
      console.log('✅ Client storage cleaned');
      
      // 4단계: Auth 상태 초기화
      clearAuthStore();
      console.log('✅ Auth store reset');
      
      // 5단계: 리다이렉트 (백엔드에서 이미 처리되지만 실패 시 fallback)
      if (response.redirected && response.url) {
        console.log('🔄 Following server redirect:', response.url);
        window.location.href = response.url;
      } else if (response.ok) {
        console.log('🔄 Server logout successful, redirecting to login');
        window.location.href = '/login?logout=success';
      } else {
        throw new Error(`Server logout failed: ${response.status}`);
      }
      
    } catch (error) {
      console.error('❌ Server logout failed:', error);
      
      // 에러 시에도 클라이언트 정리는 수행
      console.log('🧹 Performing emergency client cleanup...');
      
      localStorage.removeItem('accessToken');
      localStorage.removeItem('tokenExpiryTime');
      localStorage.removeItem('user');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('id_token');
      sessionStorage.clear();
      
      // Auth 상태 초기화
      clearAuthStore();
      
      // 에러 상태로 리다이렉트
      window.location.href = '/login?logout=error';
    }
  }, [clearAuthStore]);

  /**
   * 🔒 OAuth 토큰 무효화 (fallback용)
   */
  const revokeOAuthTokens = useCallback(async (): Promise<void> => {
    try {
      console.log('🔑 Revoking OAuth tokens (fallback)...');
      
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (accessToken) {
        await oidcService.revokeToken(accessToken, 'access_token');
        console.log('✅ Access token revoked');
      }
      
      if (refreshToken) {
        await oidcService.revokeToken(refreshToken, 'refresh_token');
        console.log('✅ Refresh token revoked');
      }
      
    } catch (error: any) {
      console.warn('⚠️ Token revocation failed (best-effort):', error);
      // Token revocation is best-effort, don't throw
    }
  }, []);

  /**
   * 🔒 서버 요청사항에 따른 종합적인 보안 로그아웃
   */
  const performSecureLogout = useCallback(async (options: LogoutOptions = {}): Promise<LogoutResult> => {
    const { reason = 'user_global_logout' } = options;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      console.log('🔐 Starting server-requested logout flow');

      // Step 1: 서버 요청사항에 따른 로그아웃 시도 (우선순위)
      try {
        await performServerLogout();
        return { success: true, sessionsLoggedOut: 1 };
      } catch (error) {
        console.warn('⚠️ Server logout failed, falling back to token revocation:', error);
      }
      
      // Step 2: Fallback - OAuth 토큰 무효화
      await revokeOAuthTokens();
      
      // Step 3: Broadcast logout event to other tabs
      authSyncService.broadcastLogout(reason);
      console.log('📤 Logout event broadcasted to other tabs');
      
      // Step 4: Enhanced client-side cleanup
      try {
        await authService.logout({ useProviderLogout: false });
        console.log('✅ Enhanced client-side cleanup completed');
      } catch (error) {
        console.warn('⚠️ Client-side cleanup had issues:', error);
      }

      // Step 5: Clear auth store
      clearAuthStore();
      
      // Step 6: React Query cache clearing
      try {
        await queryClient.clear();
        await queryClient.invalidateQueries();
        queryClient.removeQueries();
        queryClient.resetQueries();
        console.log('✅ React Query cache cleared');
      } catch (error) {
        console.warn('⚠️ Failed to clear React Query cache:', error);
      }

      // Step 7: Additional security cleanup
      try {
        // Clear any cached API data
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
        }

        console.log('✅ Additional security cleanup completed');
      } catch (error) {
        console.warn('⚠️ Additional cleanup had issues:', error);
      }

      console.log('✅ Secure logout completed successfully');
      return { success: true, sessionsLoggedOut: 1 };

    } catch (error: any) {
      console.error('❌ Secure logout failed:', error);
      
      // Emergency cleanup - 에러 시에도 클라이언트 정리는 수행
      try {
        console.log('🧹 Performing emergency client cleanup...');
        
        localStorage.removeItem('accessToken');
        localStorage.removeItem('tokenExpiryTime');
        localStorage.removeItem('user');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('id_token');
        sessionStorage.clear();
        
        clearAuthStore();
        
        try {
          await queryClient.clear();
          queryClient.removeQueries();
          queryClient.getQueryCache().clear();
          queryClient.getMutationCache().clear();
        } catch (cacheError) {
          console.warn('Emergency cache clearing failed:', cacheError);
        }
        
        console.log('🆘 Emergency cleanup performed');
      } catch (cleanupError) {
        console.error('Emergency cleanup failed:', cleanupError);
      }

      return {
        success: false,
        error: error.message || 'Logout failed'
      };
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [clearAuthStore, performServerLogout, queryClient, revokeOAuthTokens]);

  /**
   * Show logout confirmation
   */
  const showLogoutConfirmation = useCallback(() => {
    setState(prev => ({ ...prev, showConfirmation: true, error: null }));
  }, []);

  /**
   * Hide logout confirmation dialog
   */
  const hideLogoutConfirmation = useCallback(() => {
    setState(prev => ({ ...prev, showConfirmation: false }));
  }, []);

  /**
   * Handle logout confirmation
   */
  const handleLogoutConfirm = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, showConfirmation: false }));
    
    const result = await performSecureLogout({ 
      reason: 'user_global_logout'
    });

    if (!result.success) {
      setState(prev => ({ 
        ...prev, 
        error: result.error || 'Logout failed. Please refresh the page and try again.' 
      }));
    } else {
      console.log(`✅ Global logout successful: ${result.sessionsLoggedOut} session(s) logged out`);
      
      // 🔒 SECURITY: Force redirect to login with MAX Platform
      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
    }
  }, [performSecureLogout]);

  /**
   * Quick logout without confirmation (for emergency/programmatic use)
   */
  const forceLogout = useCallback(async (reason: string = 'forced_logout'): Promise<LogoutResult> => {
    return performSecureLogout({ reason, skipConfirmation: true });
  }, [performSecureLogout]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    isLoading: state.isLoading,
    showConfirmation: state.showConfirmation, 
    error: state.error,
    
    // Actions
    showLogoutConfirmation,
    hideLogoutConfirmation,
    handleLogoutConfirm,
    forceLogout,
    clearError,
    
    // Direct access for advanced use cases
    performSecureLogout
  };
};

export default useSecureLogout;