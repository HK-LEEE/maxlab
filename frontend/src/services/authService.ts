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
      
      // 토큰 저장
      localStorage.setItem('accessToken', tokenResponse.access_token);
      localStorage.setItem('tokenType', tokenResponse.token_type);
      localStorage.setItem('expiresIn', tokenResponse.expires_in.toString());
      localStorage.setItem('scope', tokenResponse.scope);
      
      // 사용자 정보 매핑
      const user: User = {
        id: userInfo.sub || userInfo.id || userInfo.user_id,
        email: userInfo.email,
        username: userInfo.display_name || userInfo.username,
        full_name: userInfo.real_name || userInfo.full_name,
        is_active: true,
        is_admin: userInfo.is_admin || false,
        role: userInfo.is_admin ? 'admin' : 'user',
        groups: userInfo.groups?.map((g: any) => g.name || g.display_name) || []
      };
      
      localStorage.setItem('user', JSON.stringify(user));
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
        
        // 토큰 저장
        localStorage.setItem('accessToken', result.token);
        if (result.tokenData) {
          localStorage.setItem('tokenType', result.tokenData.token_type || 'Bearer');
          localStorage.setItem('expiresIn', (result.tokenData.expires_in || 3600).toString());
          localStorage.setItem('scope', result.tokenData.scope || 'read:profile read:groups manage:workflows');
        }
        
        // 사용자 정보 매핑
        const user: User = {
          id: userInfo.sub || userInfo.id || userInfo.user_id,
          email: userInfo.email,
          username: userInfo.display_name || userInfo.username,
          full_name: userInfo.real_name || userInfo.full_name,
          is_active: true,
          is_admin: userInfo.is_admin || false,
          role: userInfo.is_admin ? 'admin' : 'user',
          groups: userInfo.groups?.map((g: any) => g.name || g.display_name) || []
        };
        
        localStorage.setItem('user', JSON.stringify(user));
        
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

    const userInfo = await getUserInfo(accessToken);
    
    return {
      id: userInfo.sub || userInfo.id || userInfo.user_id,
      email: userInfo.email,
      username: userInfo.display_name || userInfo.username,
      full_name: userInfo.real_name || userInfo.full_name,
      is_active: true,
      is_admin: userInfo.is_admin || false,
      role: userInfo.is_admin ? 'admin' : 'user',
      groups: userInfo.groups?.map((g: any) => g.name || g.display_name) || []
    };
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
    const expiresIn = localStorage.getItem('expiresIn');
    
    if (!accessToken) {
      return false;
    }
    
    // 토큰 만료 확인 (간단한 체크)
    if (expiresIn) {
      const expiryTime = parseInt(expiresIn, 10) * 1000; // Convert to milliseconds
      const now = Date.now();
      const tokenAge = now - (JSON.parse(localStorage.getItem('user') || '{}').created_at || now);
      
      if (tokenAge > expiryTime) {
        console.log('Token expired, clearing storage');
        authService.logout();
        return false;
      }
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
    // OAuth에서는 일반적으로 refresh token을 사용하지만
    // 현재 구현에서는 silent authentication으로 대체
    const result = await authService.attemptSilentLogin();
    return result.success;
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
   * 디버깅 정보
   */
  getAuthDebugInfo: () => {
    return {
      isAuthenticated: authService.isAuthenticated(),
      hasToken: !!localStorage.getItem('accessToken'),
      tokenType: localStorage.getItem('tokenType'),
      expiresIn: localStorage.getItem('expiresIn'),
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