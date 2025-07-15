/**
 * OAuth-Only Authentication Service
 * Focused exclusively on OAuth 2.0 SSO with MAX Platform integration
 */

import { PopupOAuthLogin, getUserInfo } from '../utils/popupOAuth';
import { attemptSilentLogin, isSafePageForTokenRefresh } from '../utils/silentAuth';
import { tokenRefreshManager } from './tokenRefreshManager';
import { tokenBlacklistService } from './tokenBlacklistService';
import { refreshTokenService, type TokenResponse } from './refreshTokenService';
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
      
      // 토큰 저장 (RefreshTokenService 사용)
      await refreshTokenService.storeTokens({
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type || 'Bearer',
        expires_in: tokenResponse.expires_in,
        scope: tokenResponse.scope,
        refresh_token: tokenResponse.refresh_token,
        refresh_expires_in: tokenResponse.refresh_expires_in
      });
      
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
      const currentTime = Date.now();
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
        
        // 토큰 저장 (RefreshTokenService 사용)
        if (result.tokenData) {
          await refreshTokenService.storeTokens({
            access_token: result.token,
            token_type: result.tokenData.token_type || 'Bearer',
            expires_in: result.tokenData.expires_in || 3600,
            scope: result.tokenData.scope || 'read:profile read:groups manage:workflows',
            refresh_token: result.tokenData.refresh_token,
            refresh_expires_in: result.tokenData.refresh_expires_in
          });
        } else {
          // Fallback for when tokenData is not available
          await refreshTokenService.storeTokens({
            access_token: result.token,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'read:profile read:groups manage:workflows'
          });
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
        const currentTime = Date.now();
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
   * 로그아웃 - 보안 강화 (Refresh Token 포함)
   */
  logout: async (): Promise<void> => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      
      // First, blacklist the token on our backend
      if (accessToken) {
        try {
          await tokenBlacklistService.blacklistCurrentToken('user_logout');
          console.log('✅ Token blacklisted on backend');
        } catch (error) {
          console.warn('⚠️ Failed to blacklist token on backend:', error);
          // Continue with logout even if blacklisting fails
        }
      }
      
      // Enhanced logout with refresh token revocation
      await refreshTokenService.secureLogout();
      
    } catch (error) {
      console.error('Logout error:', error);
      // 로그아웃 에러는 로그만 남기고 계속 진행
    } finally {
      // 강화된 로컬 데이터 정리
      await authService._secureCleanup();
    }
  },

  /**
   * 보안 강화된 데이터 정리 - Refresh Token 포함
   */
  _secureCleanup: async (): Promise<void> => {
    // 현재 토큰을 블랙리스트에 추가
    const currentToken = localStorage.getItem('accessToken');
    if (currentToken) {
      tokenRefreshManager.blacklistToken(currentToken, 'logout');
    }

    // RefreshTokenService를 통한 완전한 토큰 정리
    await refreshTokenService.clearAllTokens();
    
    // 세션 스토리지 정리 (모든 OAuth 관련 데이터)
    const sessionKeysToRemove = [
      'oauth_state',
      'oauth_code_verifier',
      'oauth_popup_mode',
      'silent_oauth_state',
      'silent_oauth_code_verifier',
      'oauth_nonce',
      'csrf_token'
    ];

    sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));

    // 쿠키 정리 (있다면)
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (name.includes('auth') || name.includes('token') || name.includes('session')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict`;
      }
    });
    
    console.log('🧹 Complete secure cleanup finished');
  },

  /**
   * 인증 상태 확인 - 보안 강화
   */
  isAuthenticated: (): boolean => {
    const accessToken = localStorage.getItem('accessToken');
    const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
    
    if (!accessToken) {
      return false;
    }

    // 토큰 블랙리스트 확인
    if (tokenRefreshManager.isTokenBlacklisted(accessToken)) {
      console.log('🚫 Token is blacklisted, clearing storage');
      authService._secureCleanup();
      return false;
    }
    
    // 토큰 만료 확인 (정확한 만료 시간 사용)
    if (tokenExpiryTime) {
      const expiryTime = parseInt(tokenExpiryTime, 10);
      const now = Date.now();
      
      // 만료 5분 전부터 토큰 갱신 필요로 표시
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      
      if (now >= expiryTime) {
        console.log('Access token expired');
        tokenRefreshManager.blacklistToken(accessToken, 'expired');
        
        // Access token이 만료되었지만 refresh token이 유효하면 갱신 가능
        if (refreshTokenService.isRefreshTokenValid()) {
          console.log('Access token expired but refresh token is valid, authentication can be renewed');
          return true; // 갱신 가능하므로 인증된 상태로 간주
        }
        
        // 둘 다 만료된 경우 로그아웃
        console.log('Both access and refresh tokens expired, logging out');
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
   * 인증 토큰 갱신 - Refresh Token 우선, Silent Auth 폴백
   */
  refreshToken: async (): Promise<boolean> => {
    return tokenRefreshManager.refreshToken(async () => {
      try {
        console.log('🔄 Attempting token refresh with fallback chain...');
        
        // 1차: Refresh Token 시도
        const hasValidRefreshToken = await refreshTokenService.isRefreshTokenValidAsync();
        if (hasValidRefreshToken) {
          try {
            console.log('🎟️ Attempting refresh with refresh token...');
            const refreshResult = await refreshTokenService.refreshWithRefreshToken();
            
            // 토큰 갱신 성공 시 사용자 정보도 업데이트
            const userInfo = await getUserInfo(refreshResult.access_token);
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
            
            // 사용자 정보 업데이트
            const currentTime = Date.now();
            const userWithMetadata = {
              ...user,
              created_at: JSON.parse(localStorage.getItem('user') || '{}').created_at || currentTime,
              updated_at: currentTime
            };
            
            localStorage.setItem('user', JSON.stringify(userWithMetadata));
            
            console.log('✅ Refresh token renewal successful');
            return {
              success: true,
              token: refreshResult.access_token
            };
          } catch (refreshError: any) {
            console.warn('⚠️ Refresh token failed, falling back to silent auth:', refreshError.message);
            // 다음 단계로 진행
          }
        }
        
        // 2차: Silent Auth 폴백
        if (isSafePageForTokenRefresh()) {
          console.log('🔇 Falling back to silent authentication...');
          const result = await authService.attemptSilentLogin();
          
          if (result.success) {
            console.log('✅ Silent auth fallback successful');
            return {
              success: true,
              token: localStorage.getItem('accessToken') || undefined
            };
          } else {
            console.log('❌ Silent auth fallback failed:', result.error);
            return {
              success: false,
              error: result.error || 'Both refresh token and silent auth failed'
            };
          }
        } else {
          console.log('❌ Current page not safe for silent auth, refresh completely failed');
          return {
            success: false,
            error: 'Refresh token failed and silent auth not available on current page'
          };
        }
      } catch (error: any) {
        console.error('❌ Complete token refresh chain failed:', error);
        return {
          success: false,
          error: error.message || 'Token refresh chain failed'
        };
      }
    });
  },

  /**
   * 자동 토큰 갱신 시작 - 최적화된 로직
   */
  startAutoTokenRefresh: (): (() => void) => {
    let refreshInterval: NodeJS.Timeout;
    let lastRefreshAttempt = 0;
    let consecutiveFailures = 0;
    
    const checkAndRefresh = async () => {
      try {
        if (!authService.isAuthenticated()) {
          console.log('🔓 User not authenticated, stopping auto refresh');
          clearInterval(refreshInterval);
          return;
        }

        // 현재 페이지에서 토큰 갱신이 안전한지 확인
        if (!isSafePageForTokenRefresh()) {
          console.log('🔐 Current page not safe for token refresh, skipping...');
          return;
        }

        // 토큰 갱신 필요 여부 확인
        const needsRefresh = authService.needsTokenRefresh();
        const hasValidRefreshToken = refreshTokenService.isRefreshTokenValid();
        
        if (needsRefresh) {
          // 너무 빈번한 갱신 시도 방지 (30초 쿨다운)
          const now = Date.now();
          if (now - lastRefreshAttempt < 30000) {
            console.log('🔄 Token refresh attempted too recently, skipping...');
            return;
          }

          lastRefreshAttempt = now;
          
          console.log(`🔄 Token needs refresh, attempting automatic refresh... (Method: ${hasValidRefreshToken ? 'refresh_token' : 'silent_auth'})`);
          
          const success = await authService.refreshToken();
          
          if (success) {
            console.log('✅ Auto token refresh successful');
            consecutiveFailures = 0; // 성공 시 실패 카운터 리셋
          } else {
            consecutiveFailures++;
            console.log(`❌ Auto token refresh failed (attempt ${consecutiveFailures})`);
            
            // 3번 연속 실패 시 로그아웃
            if (consecutiveFailures >= 3) {
              console.log('❌ Multiple consecutive refresh failures, logging out user');
              clearInterval(refreshInterval);
              
              // 자동 로그아웃 수행
              await authService.logout();
              
              // 로그인 페이지로 리다이렉트 (앱 수준에서 처리되도록 이벤트 발송)
              window.dispatchEvent(new CustomEvent('auth:logout', { 
                detail: { reason: 'token_refresh_failed', attempts: consecutiveFailures } 
              }));
              return;
            }
          }
        } else {
          // 갱신이 필요하지 않으면 실패 카운터 리셋
          if (consecutiveFailures > 0) {
            console.log('🔄 Token refresh no longer needed, resetting failure counter');
            consecutiveFailures = 0;
          }
        }

        // Refresh Token 만료 임박 알림 (1일 전)
        if (hasValidRefreshToken && refreshTokenService.needsRefreshTokenRenewal()) {
          console.log('⚠️ Refresh token expires soon, user should re-authenticate');
          window.dispatchEvent(new CustomEvent('auth:refresh_token_expiring', {
            detail: { 
              timeToExpiry: refreshTokenService.getRefreshTokenTimeToExpiry(),
              message: 'Your session will expire soon. Please log in again to maintain access.'
            }
          }));
        }

      } catch (error) {
        console.error('Auto token refresh check error:', error);
        consecutiveFailures++;
        
        // 치명적 에러 시에도 3회 실패 규칙 적용
        if (consecutiveFailures >= 3) {
          console.log('❌ Critical errors in token refresh, forcing logout');
          clearInterval(refreshInterval);
          await authService.logout();
          window.dispatchEvent(new CustomEvent('auth:logout', { 
            detail: { reason: 'critical_error', error: error.message } 
          }));
        }
      }
    };

    // 동적 인터벌 설정
    const getRefreshInterval = () => {
      const accessTokenTimeToExpiry = authService.getTokenTimeToExpiry();
      
      // Access token 만료까지 5분 이하면 30초마다 체크
      if (accessTokenTimeToExpiry <= 300) {
        return 30 * 1000; // 30초
      }
      
      // Access token 만료까지 30분 이하면 1분마다 체크
      if (accessTokenTimeToExpiry <= 1800) {
        return 60 * 1000; // 1분
      }
      
      // 그 외의 경우 5분마다 체크
      return 5 * 60 * 1000; // 5분
    };

    // 초기 체크
    checkAndRefresh();

    // 동적 인터벌로 갱신 체크
    const startDynamicInterval = () => {
      const interval = getRefreshInterval();
      refreshInterval = setTimeout(() => {
        checkAndRefresh().then(() => {
          startDynamicInterval(); // 재귀적으로 다음 인터벌 설정
        });
      }, interval);
    };

    startDynamicInterval();

    // 정리 함수 반환
    return () => {
      if (refreshInterval) {
        clearTimeout(refreshInterval);
      }
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
   * 토큰 갱신 필요 여부 확인 - Refresh Token 고려
   */
  needsTokenRefresh: (): boolean => {
    const accessToken = localStorage.getItem('accessToken');
    const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
    
    if (!accessToken || !tokenExpiryTime) {
      return false;
    }

    // 최근 갱신 시간 확인 (OAuth 콜백 중 중복 갱신 방지)
    const lastRefresh = localStorage.getItem('lastTokenRefresh');
    if (lastRefresh && (Date.now() - parseInt(lastRefresh)) < 30000) {
      return false;
    }
    
    const expiryTime = parseInt(tokenExpiryTime, 10);
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    
    // Access token이 갱신이 필요한 시점이고, refresh token이나 다른 갱신 방법이 있는 경우
    const needsRefresh = now >= (expiryTime - bufferTime);
    
    if (needsRefresh) {
      // 토큰 갱신이 안전한 환경인지 먼저 확인
      const canUseSilentAuth = isSafePageForTokenRefresh();
      
      if (!canUseSilentAuth) {
        console.log('🚫 Token refresh not safe in current context, skipping');
        return false;
      }

      // Refresh token이 유효하거나 silent auth 가능한 경우 갱신 시도
      const hasValidRefreshToken = refreshTokenService.isRefreshTokenValid();
      
      console.log('🔄 Token refresh eligibility check:', {
        needsRefresh,
        hasValidRefreshToken,
        canUseSilentAuth,
        timeToExpiry: authService.getTokenTimeToExpiry()
      });
      
      return hasValidRefreshToken || canUseSilentAuth;
    }
    
    return false;
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
   * 디버깅 정보 - Refresh Token 정보 포함
   */
  getAuthDebugInfo: () => {
    const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
    const tokenCreatedAt = localStorage.getItem('tokenCreatedAt');
    const refreshTokenDebug = refreshTokenService.getDebugInfo();
    
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
      refreshToken: refreshTokenDebug,
      sessionData: {
        oauth_state: sessionStorage.getItem('oauth_state'),
        silent_oauth_state: sessionStorage.getItem('silent_oauth_state'),
        oauth_popup_mode: sessionStorage.getItem('oauth_popup_mode')
      },
      tokenRefreshManager: tokenRefreshManager.getRefreshStatus()
    };
  }
};