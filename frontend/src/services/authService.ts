/**
 * OAuth-Only Authentication Service
 * Focused exclusively on OAuth 2.0 SSO with MAX Platform integration
 */

import { PopupOAuthLogin, getUserInfo } from '../utils/popupOAuth';
import { attemptSilentLogin } from '../utils/silentAuth';
import type { User } from '../types/auth';

export interface AuthServiceResult {
  success: boolean;
  user?: User;
  error?: string;
}

export const authService = {
  /**
   * 팝업 OAuth 로그인
   */
  loginWithPopupOAuth: async (): Promise<User> => {
    const oauthInstance = new PopupOAuthLogin();
    
    try {
      console.log('🔐 Starting popup OAuth login...');
      
      const tokenResponse = await oauthInstance.startAuth();
      console.log('✅ Popup OAuth successful, getting user info...');
      
      const userInfo = await getUserInfo(tokenResponse.access_token);
      
      // 토큰 저장 (만료 시간 정확히 계산)
      const currentTime = Date.now();
      const expiryTime = currentTime + (tokenResponse.expires_in * 1000);
      
      localStorage.setItem('accessToken', tokenResponse.access_token);
      localStorage.setItem('tokenType', tokenResponse.token_type || 'Bearer');
      localStorage.setItem('expiresIn', tokenResponse.expires_in.toString());
      localStorage.setItem('tokenExpiryTime', expiryTime.toString());
      localStorage.setItem('scope', tokenResponse.scope);
      localStorage.setItem('tokenCreatedAt', currentTime.toString());
      
      console.log('📋 User info received:', userInfo);
      
      // 사용자 정보 매핑 (안전한 기본값 처리)
      const user: User = {
        id: userInfo.sub || userInfo.id || userInfo.user_id || userInfo.email,
        email: userInfo.email || '',
        username: userInfo.name || userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
        full_name: userInfo.real_name || userInfo.full_name || userInfo.name || userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
        is_active: userInfo.is_active !== undefined ? userInfo.is_active : true,
        is_admin: Boolean(userInfo.is_admin || userInfo.is_superuser || userInfo.admin),
        role: (userInfo.is_admin || userInfo.is_superuser || userInfo.admin) ? 'admin' : 'user',
        groups: Array.isArray(userInfo.groups) 
          ? userInfo.groups.map((g: any) => typeof g === 'string' ? g : (g.name || g.display_name || g)).filter(Boolean)
          : []
      };
      
      console.log('👤 Mapped user:', user);
      
      // 사용자 정보와 함께 생성 시간 저장
      const userWithMetadata = {
        ...user,
        created_at: currentTime,
        updated_at: currentTime
      };
      
      localStorage.setItem('user', JSON.stringify(userWithMetadata));
      return user;
      
    } catch (error: any) {
      console.error('Popup OAuth login error:', error);
      
      // 구체적인 에러 메시지
      if (error.message?.includes('blocked')) {
        throw new Error('Popup was blocked. Please allow popups for this site and try again.');
      } else if (error.message?.includes('cancelled')) {
        throw new Error('Login was cancelled by the user.');
      } else if (error.message?.includes('login_required')) {
        throw new Error('Please log in to MAX Platform first, then try OAuth login again.');
      } else {
        throw new Error('OAuth login failed. Please try again or contact support if the problem persists.');
      }
    } finally {
      oauthInstance.forceCleanup();
    }
  },

  /**
   * Silent SSO 로그인 시도
   */
  attemptSilentLogin: async (): Promise<AuthServiceResult> => {
    try {
      console.log('🔇 Attempting silent SSO login...');
      
      const result = await attemptSilentLogin();
      
      if (result.success && result.token) {
        console.log('✅ Silent SSO login successful');
        
        const userInfo = await getUserInfo(result.token);
        
        // 토큰 저장 (만료 시간 정확히 계산)
        const currentTime = Date.now();
        const expiresInSeconds = result.tokenData?.expires_in || 3600;
        const expiryTime = currentTime + (expiresInSeconds * 1000);
        
        localStorage.setItem('accessToken', result.token);
        if (result.tokenData) {
          localStorage.setItem('tokenType', result.tokenData.token_type || 'Bearer');
          localStorage.setItem('expiresIn', expiresInSeconds.toString());
          localStorage.setItem('tokenExpiryTime', expiryTime.toString());
          localStorage.setItem('scope', result.tokenData.scope || 'read:profile read:groups manage:workflows');
          localStorage.setItem('tokenCreatedAt', currentTime.toString());
        }
        
        // 사용자 정보 매핑 (안전한 기본값 처리)
        const user: User = {
          id: userInfo.sub || userInfo.id || userInfo.user_id || userInfo.email,
          email: userInfo.email || '',
          username: userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
          full_name: userInfo.real_name || userInfo.full_name || userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
          is_active: userInfo.is_active !== undefined ? userInfo.is_active : true,
          is_admin: Boolean(userInfo.is_admin || userInfo.is_superuser || userInfo.admin),
          role: (userInfo.is_admin || userInfo.is_superuser || userInfo.admin) ? 'admin' : 'user',
          groups: Array.isArray(userInfo.groups) 
            ? userInfo.groups.map((g: any) => g.name || g.display_name || g).filter(Boolean)
            : []
        };
        
        // 사용자 정보와 함께 생성 시간 저장
        const userWithMetadata = {
          ...user,
          created_at: currentTime,
          updated_at: currentTime
        };
        
        localStorage.setItem('user', JSON.stringify(userWithMetadata));
        
        return { success: true, user };
      } else {
        console.log('ℹ️ Silent SSO login failed:', result.error);
        return { 
          success: false, 
          error: result.error || 'Silent authentication failed' 
        };
      }
    } catch (error: any) {
      console.error('Silent login error:', error);
      return { 
        success: false, 
        error: error.message || 'Silent authentication failed' 
      };
    }
  },

  /**
   * 현재 사용자 정보 가져오기
   */
  getCurrentUser: async (): Promise<User> => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      throw new Error('No access token available');
    }

    // 토큰 유효성 먼저 확인
    if (!authService.isAuthenticated()) {
      throw new Error('Token expired');
    }

    const userInfo = await getUserInfo(accessToken);
    const currentTime = Date.now();
    
    // 사용자 정보 매핑 (안전한 기본값 처리)
    const user: User = {
      id: userInfo.sub || userInfo.id || userInfo.user_id || userInfo.email,
      email: userInfo.email || '',
      username: userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
      full_name: userInfo.real_name || userInfo.full_name || userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
      is_active: userInfo.is_active !== undefined ? userInfo.is_active : true,
      is_admin: Boolean(userInfo.is_admin || userInfo.is_superuser || userInfo.admin),
      role: (userInfo.is_admin || userInfo.is_superuser || userInfo.admin) ? 'admin' : 'user',
      groups: Array.isArray(userInfo.groups) 
        ? userInfo.groups.map((g: any) => g.name || g.display_name || g).filter(Boolean)
        : []
    };

    // 업데이트된 사용자 정보 저장
    const userWithMetadata = {
      ...user,
      created_at: JSON.parse(localStorage.getItem('user') || '{}').created_at || currentTime,
      updated_at: currentTime
    };
    
    localStorage.setItem('user', JSON.stringify(userWithMetadata));
    
    return user;
  },

  /**
   * 토큰 유효성 확인
   */
  validateToken: async (): Promise<boolean> => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) {
        return false;
      }

      await getUserInfo(accessToken);
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  },

  /**
   * 로그아웃
   */
  logout: async (): Promise<void> => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        // 토큰 취소 요청
        const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
        await fetch(`${authUrl}/api/oauth/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: accessToken,
            client_id: import.meta.env.VITE_CLIENT_ID || 'maxlab'
          })
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // 로컬 데이터 정리
      localStorage.removeItem('accessToken');
      localStorage.removeItem('tokenType');
      localStorage.removeItem('expiresIn');
      localStorage.removeItem('tokenExpiryTime');
      localStorage.removeItem('tokenCreatedAt');
      localStorage.removeItem('scope');
      localStorage.removeItem('user');
      
      // 세션 스토리지 정리
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('oauth_popup_mode');
      sessionStorage.removeItem('silent_oauth_state');
      sessionStorage.removeItem('silent_oauth_code_verifier');
    }
  },

  /**
   * 인증 상태 확인
   */
  isAuthenticated: (): boolean => {
    const accessToken = localStorage.getItem('accessToken');
    const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
    
    if (!accessToken) {
      return false;
    }
    
    // 토큰 만료 확인 (정확한 만료 시간 사용)
    if (tokenExpiryTime) {
      const expiryTime = parseInt(tokenExpiryTime, 10);
      const now = Date.now();
      
      // 만료 5분 전부터 토큰 갱신 필요로 표시
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      
      if (now >= expiryTime) {
        console.log('Token expired, clearing storage');
        authService.logout();
        return false;
      } else if (now >= (expiryTime - bufferTime)) {
        console.log('Token expires soon, consider refreshing');
        // 토큰이 곧 만료되지만 아직 유효
        return true;
      }
    }
    
    // 저장된 사용자 정보 확인
    const storedUser = authService.getStoredUser();
    if (!storedUser || !storedUser.id) {
      console.log('No valid user data found');
      return false;
    }
    
    return true;
  },

  /**
   * 저장된 사용자 정보 가져오기
   */
  getStoredUser: (): User | null => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * 회원가입 리다이렉트
   */
  redirectToSignup: (): void => {
    const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
    const signupUrl = authUrl.replace(':8000', ':3000'); // MAX Platform frontend
    window.location.href = `${signupUrl}/signup?redirect=${encodeURIComponent(window.location.origin)}`;
  },

  /**
   * 인증 토큰 갱신
   */
  refreshToken: async (): Promise<boolean> => {
    try {
      console.log('🔄 Attempting token refresh...');
      
      // 현재 토큰이 있는지 확인
      const currentToken = localStorage.getItem('accessToken');
      if (!currentToken) {
        console.log('❌ No current token to refresh');
        return false;
      }

      // Silent authentication으로 토큰 갱신 시도
      const result = await authService.attemptSilentLogin();
      
      if (result.success) {
        console.log('✅ Token refresh successful');
        return true;
      } else {
        console.log('❌ Token refresh failed:', result.error);
        
        // 특정 에러에 따른 처리
        if (result.error === 'Cannot attempt silent auth on current page' || 
            result.error === 'Silent authentication not supported' ||
            result.error === 'Silent authentication already in progress') {
          console.log('ℹ️ Silent auth not possible, checking current token validity');
          
          // 현재 토큰이 여전히 유효한지 확인
          if (authService.isAuthenticated()) {
            console.log('ℹ️ Current token still valid, keeping it');
            return true;
          }
        }
        
        // 로그인이 필요한 경우 또는 토큰이 만료된 경우
        if (result.error === 'login_required' || result.error === 'silent_auth_timeout') {
          console.log('🔓 Authentication required, checking if token is still usable');
          
          // 마지막으로 현재 토큰 검증 시도
          const isStillValid = await authService.validateToken();
          if (isStillValid) {
            console.log('ℹ️ Current token validated successfully, keeping it');
            return true;
          } else {
            console.log('🔓 Token validation failed, clearing auth');
            await authService.logout();
            return false;
          }
        }
        
        // 기타 에러의 경우 기존 토큰 유효성 확인
        if (authService.isAuthenticated()) {
          console.log('ℹ️ Current token still valid despite refresh failure, keeping it');
          return true;
        } else {
          console.log('🔓 Token refresh failed and current token expired, clearing auth');
          await authService.logout();
          return false;
        }
      }
    } catch (error: any) {
      console.error('Token refresh error:', error);
      
      // 에러 발생 시에도 현재 토큰 확인
      if (authService.isAuthenticated()) {
        console.log('ℹ️ Refresh error but current token still valid, keeping it');
        return true;
      }
      
      return false;
    }
  },

  /**
   * 자동 토큰 갱신 시작
   */
  startAutoTokenRefresh: (): (() => void) => {
    let refreshInterval: NodeJS.Timeout;
    
    const checkAndRefresh = async () => {
      try {
        if (!authService.isAuthenticated()) {
          console.log('🔓 User not authenticated, stopping auto refresh');
          clearInterval(refreshInterval);
          return;
        }

        if (authService.needsTokenRefresh()) {
          console.log('🔄 Token needs refresh, attempting automatic refresh...');
          const success = await authService.refreshToken();
          
          if (!success) {
            console.log('❌ Auto token refresh failed, logging out user');
            clearInterval(refreshInterval);
            
            // 자동 로그아웃 수행
            await authService.logout();
            
            // 로그인 페이지로 리다이렉트 (앱 수준에서 처리되도록 이벤트 발송)
            window.dispatchEvent(new CustomEvent('auth:logout', { 
              detail: { reason: 'token_refresh_failed' } 
            }));
          }
        }
      } catch (error) {
        console.error('Auto token refresh check error:', error);
      }
    };

    // 매 1분마다 토큰 상태 확인
    refreshInterval = setInterval(checkAndRefresh, 60 * 1000);
    
    // 즉시 한 번 확인
    checkAndRefresh();

    // 정리 함수 반환
    return () => {
      clearInterval(refreshInterval);
    };
  },

  /**
   * 사용자 권한 확인
   */
  hasPermission: (requiredRole: 'admin' | 'user' = 'user'): boolean => {
    const user = authService.getStoredUser();
    if (!user) return false;
    
    if (requiredRole === 'admin') {
      return user.is_admin || false;
    }
    
    return true; // All authenticated users have 'user' permission
  },

  /**
   * 토큰 갱신 필요 여부 확인
   */
  needsTokenRefresh: (): boolean => {
    const accessToken = localStorage.getItem('accessToken');
    const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
    
    if (!accessToken || !tokenExpiryTime) {
      return false;
    }
    
    const expiryTime = parseInt(tokenExpiryTime, 10);
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    
    return now >= (expiryTime - bufferTime);
  },

  /**
   * 토큰 만료까지 남은 시간 (초)
   */
  getTokenTimeToExpiry: (): number => {
    const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
    
    if (!tokenExpiryTime) {
      return 0;
    }
    
    const expiryTime = parseInt(tokenExpiryTime, 10);
    const now = Date.now();
    
    return Math.max(0, Math.floor((expiryTime - now) / 1000));
  },

  /**
   * 디버깅 정보
   */
  getAuthDebugInfo: () => {
    const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
    const tokenCreatedAt = localStorage.getItem('tokenCreatedAt');
    
    return {
      isAuthenticated: authService.isAuthenticated(),
      needsRefresh: authService.needsTokenRefresh(),
      timeToExpiry: authService.getTokenTimeToExpiry(),
      hasToken: !!localStorage.getItem('accessToken'),
      tokenType: localStorage.getItem('tokenType'),
      expiresIn: localStorage.getItem('expiresIn'),
      tokenExpiryTime: tokenExpiryTime ? new Date(parseInt(tokenExpiryTime)).toISOString() : null,
      tokenCreatedAt: tokenCreatedAt ? new Date(parseInt(tokenCreatedAt)).toISOString() : null,
      scope: localStorage.getItem('scope'),
      user: authService.getStoredUser(),
      sessionData: {
        oauth_state: sessionStorage.getItem('oauth_state'),
        silent_oauth_state: sessionStorage.getItem('silent_oauth_state'),
        oauth_popup_mode: sessionStorage.getItem('oauth_popup_mode')
      }
    };
  }
};