/**
 * OAuth-Only Authentication Service
 * Focused exclusively on OAuth 2.0 SSO with MAX Platform integration
 * Enhanced with OAuth Infinite Loop Prevention
 */

import { PopupOAuthLogin, getUserInfo } from '../utils/popupOAuth';
import { attemptSilentLogin, isSafePageForTokenRefresh } from '../utils/silentAuth';
import { tokenRefreshManager } from './tokenRefreshManager';
import { tokenBlacklistService } from './tokenBlacklistService';
import { refreshTokenService, type TokenResponse } from './refreshTokenService';
import { browserSecurityCleanup } from '../utils/browserSecurityCleanup';
import { userIsolatedTokenStorage } from './userIsolatedTokenStorage';
import { securityHeaders } from './securityHeaders';
import type { User, MAXPlatformClaims } from '../types/auth';
import { jwtDecode } from 'jwt-decode';
import { oidcService } from './oidcService';
import { authSyncService } from './authSyncService';
import { useOAuthLoopPrevention, oauthLoopPrevention } from '../utils/oauthInfiniteLoopPrevention';
import { useAuthStore } from '../stores/authStore';
import { oauthRequestCoordinator } from './oauthRequestCoordinator';

// Re-export for backward compatibility
export type IDTokenClaims = MAXPlatformClaims;

export interface AuthServiceResult {
  success: boolean;
  user?: User;
  error?: string;
}

export const authService = {
  /**
   * 팝업 OAuth 로그인 (Enhanced with Loop Prevention through AuthStore)
   */
  loginWithPopupOAuth: async (forceAccountSelection = false): Promise<User> => {
    // Get authStore instance for integrated loop prevention
    const authStore = useAuthStore.getState();
    
    // Check if OAuth attempt should be allowed through authStore
    const attemptType = forceAccountSelection ? 'manual' : 'auto';
    const canAttempt = authStore.canAttemptOAuth(attemptType);
    
    if (!canAttempt.allowed) {
      console.warn('🚫 MaxLab OAuth attempt blocked by authStore loop prevention:', canAttempt.reason);
      
      // Set error state in authStore
      authStore.setAuthError({
        type: 'loop_prevention',
        message: canAttempt.reason || 'OAuth attempt blocked by loop prevention',
        recoverable: true,
        suggestion: canAttempt.suggestedAction
      });
      
      const error = new Error(canAttempt.reason + (canAttempt.suggestedAction ? `\n\nSuggested action: ${canAttempt.suggestedAction}` : ''));
      (error as any).blocked = true;
      (error as any).suggestion = canAttempt.suggestedAction;
      (error as any).waitTime = canAttempt.waitTime;
      throw error;
    }

    const oauthInstance = new PopupOAuthLogin();
    
    try {
      console.log(`🔐 Starting popup OAuth login (force account selection: ${forceAccountSelection}, type: ${attemptType})...`);
      
      // 🚨 CRITICAL: Complete session cleanup for different user login
      if (forceAccountSelection) {
        console.log('🧹 Performing complete session cleanup for different user login...');
        
        // 1. Clear all existing tokens and auth state
        try {
          await refreshTokenService.clearAllTokens();
          console.log('✅ Cleared refresh tokens');
        } catch (e) {
          console.warn('⚠️ Failed to clear refresh tokens:', e);
        }
        
        try {
          await userIsolatedTokenStorage.clearAllTokens();
          console.log('✅ Cleared user isolated tokens');
        } catch (e) {
          console.warn('⚠️ Failed to clear user isolated tokens:', e);
        }
        
        // 2. Clear existing user data
        localStorage.removeItem('user');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('hasLoggedOut');
        localStorage.removeItem('logoutTimestamp');
        console.log('✅ Cleared localStorage user data');
        
        // 3. Force logout in auth store
        try {
          const { useAuthStore } = await import('../stores/authStore');
          useAuthStore.getState().logout();
          console.log('✅ Forced auth store logout');
        } catch (e) {
          console.warn('⚠️ Failed to force auth store logout:', e);
        }
        
        // 4. Broadcast logout to other tabs before new login
        try {
          authSyncService.broadcastLogout();
          console.log('✅ Broadcasted logout to other tabs');
        } catch (e) {
          console.warn('⚠️ Failed to broadcast logout:', e);
        }
        
        console.log('✅ Complete session cleanup finished for different user login');
      }
      
      // 🔧 RACE CONDITION FIX: Queue OAuth popup request through coordinator
      const tokenResponse = await oauthRequestCoordinator.queueRequest(
        'authorize',
        'popup_oauth_auth',
        async (abortSignal) => {
          return await oauthInstance.startAuth(forceAccountSelection, abortSignal);
        },
        forceAccountSelection ? 1 : 0 // Higher priority for manual logins
      );
      
      // Record successful OAuth attempt
      oauthLoopPrevention.recordAttempt(attemptType, true);
      console.log('✅ OAuth attempt successful - recorded in loop prevention system');
      console.log('✅ Popup OAuth successful, getting user info...');
      
      const userInfo = await getUserInfo(tokenResponse.access_token);
      
      // ID Token 처리 (있는 경우)
      let idTokenClaims: MAXPlatformClaims | null = null;
      if (tokenResponse.id_token) {
        try {
          // ID Token 디코드 및 검증 (OIDC service 사용)
          const storedNonce = sessionStorage.getItem('oauth_nonce');
          idTokenClaims = await oidcService.verifyIDToken(tokenResponse.id_token, storedNonce || undefined);
          console.log('✅ ID Token validated:', idTokenClaims);
          
          // ID Token 저장
          sessionStorage.setItem('id_token', tokenResponse.id_token);
          
          // Nonce 정리
          if (storedNonce) {
            sessionStorage.removeItem('oauth_nonce');
          }
        } catch (error) {
          console.error('ID Token validation failed:', error);
          // ID Token 검증 실패는 경고만 하고 계속 진행 (하위 호환성)
        }
      }
      
      // 토큰 저장 (RefreshTokenService 사용)
      await refreshTokenService.storeTokens({
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type || 'Bearer',
        expires_in: tokenResponse.expires_in,
        scope: tokenResponse.scope,
        refresh_token: tokenResponse.refresh_token,
        refresh_expires_in: tokenResponse.refresh_expires_in
      });
      
      // User-isolated token storage에도 저장 (추가 보안)
      await userIsolatedTokenStorage.saveTokens({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        idToken: tokenResponse.id_token,
        expiresAt: Date.now() + (tokenResponse.expires_in || 3600) * 1000
      }, idTokenClaims?.sub || userInfo.sub || userInfo.id || userInfo.email);
      
      console.log('📋 User info received:', userInfo);
      
      // 사용자 정보 매핑 (ID Token claims 우선, UserInfo 폴백)
      const user: User = {
        id: idTokenClaims?.sub || userInfo.sub || userInfo.id || userInfo.user_id || userInfo.email,
        email: idTokenClaims?.email || userInfo.email || '',
        username: idTokenClaims?.name || userInfo.name || userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
        full_name: idTokenClaims?.name || userInfo.real_name || userInfo.full_name || userInfo.name || userInfo.display_name || userInfo.username || userInfo.email || 'Unknown User',
        is_active: userInfo.is_active !== undefined ? userInfo.is_active : true,
        is_admin: Boolean(idTokenClaims?.is_admin || userInfo.is_admin || userInfo.is_superuser || userInfo.admin),
        role: idTokenClaims?.role_name || idTokenClaims?.role || ((idTokenClaims?.is_admin || userInfo.is_admin || userInfo.is_superuser || userInfo.admin) ? 'admin' : 'user'),
        groups: idTokenClaims?.groups || (Array.isArray(userInfo.groups) 
          ? userInfo.groups.map((g: any) => typeof g === 'string' ? g : (g.name || g.display_name || g)).filter(Boolean)
          : [])
      };
      
      // Broadcast login event to other tabs
      authSyncService.broadcastLogin(user, tokenResponse.access_token);
      
      console.log('👤 Mapped user:', user);
      
      // 사용자 정보와 함께 생성 시간 저장
      const currentTime = Date.now();
      const userWithMetadata = {
        ...user,
        created_at: currentTime,
        updated_at: currentTime
      };
      
      localStorage.setItem('user', JSON.stringify(userWithMetadata));
      
      // 🔒 CLEAR: Remove logout flags on successful login
      localStorage.removeItem('hasLoggedOut');
      localStorage.removeItem('logoutTimestamp');
      sessionStorage.removeItem('preventSilentAuth');
      console.log('🔓 Cleared logout flags after successful login');
      
      // Record successful OAuth attempt through authStore
      authStore.recordOAuthAttempt(attemptType, true);
      
      return user;
      
    } catch (error: any) {
      console.error('Popup OAuth login error:', error);
      
      // Record failed OAuth attempt through authStore (automatically handles loop detection)
      authStore.recordOAuthAttempt(attemptType, false, error.message);
      
      // Check if infinite loop was detected (authStore handles this automatically)
      const loopDetection = authStore.detectInfiniteLoop();
      if (loopDetection.inLoop) {
        console.warn('🚨 MaxLab OAuth infinite loop detected via authStore!', loopDetection);
        
        // Try automated recovery through authStore
        const recoveryActions = authStore.getOAuthRecoveryActions();
        const automatedAction = recoveryActions.find(action => action.automated);
        
        if (automatedAction) {
          console.log('🔄 MaxLab: Attempting automated recovery:', automatedAction.action);
          const recoverySuccess = await oauthLoopPrevention.executeRecoveryAction(automatedAction.action);
          
          if (recoverySuccess) {
            console.log('✅ MaxLab automated recovery successful');
          }
        }
        
        // Enhance error with loop information
        (error as any).infiniteLoop = true;
        (error as any).loopDetection = loopDetection;
        (error as any).recoveryActions = recoveryActions;
      }
      
      // 구체적인 에러 메시지
      if (error.blocked) {
        // Error already processed by loop prevention
        throw error;
      } else if (error.message?.includes('blocked')) {
        throw new Error('Popup was blocked. Please allow popups for this site and try again.');
      } else if (error.message?.includes('cancelled')) {
        throw new Error('Login was cancelled by the user.');
      } else if (error.message?.includes('login_required')) {
        throw new Error('Please log in to MAX Platform first, then try OAuth login again.');
      } else if (error.message?.includes('aborted') || error.message?.includes('NS_BINDING_ABORTED')) {
        throw new Error('OAuth request was aborted. This might be due to a session mismatch. Please try clearing your browser cache and cookies, then try manual login.');
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
      
      // 🔧 RACE CONDITION FIX: Queue silent login request through coordinator
      const result = await oauthRequestCoordinator.queueRequest(
        'silent_login',
        'silent_oauth_auth',
        async (abortSignal) => {
          return await attemptSilentLogin(abortSignal);
        }
      );
      
      if (result.success && result.token) {
        console.log('✅ Silent SSO login successful');
        
        // Record silent auth completion for grace period
        tokenBlacklistService.recordSilentAuthCompletion();
        
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
        
        // User-isolated token storage에도 저장 (추가 보안)
        await userIsolatedTokenStorage.saveTokens({
          accessToken: result.token,
          refreshToken: result.tokenData?.refresh_token,
          idToken: result.tokenData?.id_token,
          expiresAt: Date.now() + ((result.tokenData?.expires_in || 3600) * 1000)
        }, userInfo.sub || userInfo.id || userInfo.user_id || userInfo.email);
        
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
        
        // 🔒 CLEAR: Remove logout flags on successful silent login
        localStorage.removeItem('hasLoggedOut');
        localStorage.removeItem('logoutTimestamp');
        sessionStorage.removeItem('preventSilentAuth');
        console.log('🔓 Cleared logout flags after successful silent login');
        
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
   * 로그아웃 - 로컬 세션만 정리 (SSO 세션 유지)
   * @param options - 로그아웃 옵션 (useProviderLogout: OAuth 서버 로그아웃 여부)
   */
  logout: async (options: { useProviderLogout?: boolean } = {}): Promise<void> => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      
      // Step 1: 🔥 CRITICAL: Call backend logout API first (Redis 세션 정리)
      if (accessToken) {
        try {
          const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
          const response = await fetch(`${authUrl}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log('✅ Backend logout successful:', result.stats);
          } else {
            console.warn('⚠️ Backend logout failed:', response.status, response.statusText);
          }
        } catch (error) {
          console.warn('⚠️ Failed to call backend logout API:', error);
          // Continue with logout even if backend call fails
        }
      }
      
      // Step 2: Blacklist token on our backend (legacy)
      if (accessToken) {
        try {
          await tokenBlacklistService.blacklistCurrentToken('user_logout');
          console.log('✅ Token blacklisted on backend');
        } catch (error) {
          console.warn('⚠️ Failed to blacklist token on backend:', error);
          // Continue with logout even if blacklisting fails
        }
      }
      
      // Step 3: 🔒 OAuth Provider Token Revocation (조건부)
      // OAuth 서버에 /api/oauth/logout 엔드포인트가 없으므로 토큰 revocation만 수행
      if (options.useProviderLogout !== false) { // 기본값은 true (하위 호환성)
        try {
          const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
          const clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
          
          // 토큰 revocation만 수행 (logout 엔드포인트 사용하지 않음)
          const accessToken = localStorage.getItem('accessToken');
          const refreshToken = localStorage.getItem('refreshToken');
          
          if (accessToken || refreshToken) {
            console.log('🔑 Attempting token revocation...');
            
            // Access token revocation
            if (accessToken) {
              try {
                const response = await fetch(`${authUrl}/api/oauth/revoke`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    token: accessToken,
                    token_type_hint: 'access_token',
                    client_id: clientId
                  })
                });
                
                if (response.ok) {
                  console.log('✅ Access token revoked');
                } else if (response.status === 404) {
                  console.log('⚠️ Token revocation endpoint not implemented (404) - continuing');
                }
              } catch (error) {
                console.warn('⚠️ Access token revocation failed:', error);
              }
            }
            
            // Refresh token revocation
            if (refreshToken) {
              try {
                const response = await fetch(`${authUrl}/api/oauth/revoke`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    token: refreshToken,
                    token_type_hint: 'refresh_token',
                    client_id: clientId
                  })
                });
                
                if (response.ok) {
                  console.log('✅ Refresh token revoked');
                } else if (response.status === 404) {
                  console.log('⚠️ Token revocation endpoint not implemented (404) - continuing');
                }
              } catch (error) {
                console.warn('⚠️ Refresh token revocation failed:', error);
              }
            }
          }
          
          // Clear OAuth provider cookies
          const { clearOAuthProviderCookies } = await import('../utils/oauthProviderLogout');
          clearOAuthProviderCookies();
          console.log('🍪 OAuth provider cookies cleared');
          
        } catch (error) {
          console.error('❌ OAuth provider cleanup error:', error);
          // Continue with local logout even if OAuth provider cleanup fails
        }
      }
      
      // Step 4: Enhanced logout with refresh token revocation
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
   * 보안 강화된 데이터 정리 - Comprehensive Browser Cleanup
   */
  _secureCleanup: async (): Promise<void> => {
    console.log('🔒 Starting comprehensive security cleanup...');
    
    // 현재 토큰을 블랙리스트에 추가
    const currentToken = localStorage.getItem('accessToken');
    if (currentToken) {
      tokenRefreshManager.blacklistToken(currentToken, 'logout');
    }

    // RefreshTokenService를 통한 완전한 토큰 정리
    await refreshTokenService.clearAllTokens();
    
    // User-isolated token storage 정리
    await userIsolatedTokenStorage.clearAllTokens();
    
    // 보안 헤더 서비스 세션 토큰 리셋
    securityHeaders.resetSessionToken();
    
    // Comprehensive browser security cleanup
    const cleanupResult = await browserSecurityCleanup.performSecurityCleanup({
      clearLocalStorage: true,
      clearSessionStorage: true,
      clearCookies: true,
      clearIndexedDB: true,
      clearCacheStorage: true,
      clearWebSQL: true,
      preserveKeys: ['theme', 'language', 'preferences'], // 사용자 설정은 유지
      cookieDomains: [window.location.hostname, '.localhost', 'localhost']
    });
    
    // 🔒 CRITICAL: Force clear all OAuth-related sessionStorage items
    const oauthKeys = [
      'oauth_state', 'oauth_code_verifier', 'oauth_nonce', 
      'oauth_popup_mode', 'oauth_window_type', 'oauth_parent_origin',
      'oauth_result', 'oauth_error', 'oauth_force_account_selection',
      'silent_oauth_state', 'silent_oauth_code_verifier',
      'oauth_flow_in_progress', 'oauth_callback_processing'
    ];
    oauthKeys.forEach(key => sessionStorage.removeItem(key));
    
    if (cleanupResult.success) {
      console.log('✅ Security cleanup completed:', {
        localStorage: cleanupResult.cleared.localStorage,
        sessionStorage: cleanupResult.cleared.sessionStorage,
        cookies: cleanupResult.cleared.cookies,
        indexedDB: cleanupResult.cleared.indexedDB.length,
        cacheStorage: cleanupResult.cleared.cacheStorage.length,
        duration: `${cleanupResult.duration.toFixed(2)}ms`
      });
    } else {
      console.error('❌ Security cleanup encountered errors:', cleanupResult.errors);
    }
    
    // 추가 보안 조치: 모든 이벤트 리스너 정리
    window.dispatchEvent(new CustomEvent('auth:cleanup_complete', { 
      detail: { cleanupResult } 
    }));
    
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
      
      // 🔒 CRITICAL FIX: Only return true if access token is ACTUALLY valid
      if (now >= expiryTime) {
        console.log('Access token expired');
        tokenRefreshManager.blacklistToken(accessToken, 'expired');
        
        // 🔒 SECURITY: Do NOT return true for expired tokens
        // The token refresh logic should handle renewal separately
        return false;
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
  refreshToken: async (forceRefresh: boolean = false): Promise<boolean> => {
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
            
            // 401 오류인 경우 특별한 처리
            if (refreshError.message === 'refresh_token_invalid') {
              console.error('🔒 Refresh token is invalid - likely expired or revoked');
              
              // 사용자에게 알림 이벤트 발송
              window.dispatchEvent(new CustomEvent('auth:refresh_token_invalid', {
                detail: { 
                  message: 'Your session has expired. Please log in again.',
                  reason: 'refresh_token_invalid',
                  action: 'login_required'
                }
              }));
            }
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
    }, { forceRefresh });
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
            detail: { reason: 'critical_error', error: error instanceof Error ? error.message : String(error) } 
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
  },

  /**
   * ID Token 검증 (OIDC)
   */
  validateIDToken: async (idToken: string): Promise<IDTokenClaims> => {
    try {
      // 토큰 디코드 (서명 검증은 백엔드에서)
      const claims = jwtDecode<IDTokenClaims>(idToken);
      
      // 기본 검증
      const now = Math.floor(Date.now() / 1000);
      
      // 만료 시간 검증
      if (claims.exp && claims.exp < now) {
        throw new Error('ID Token has expired');
      }
      
      // 발급 시간 검증 (너무 오래된 토큰 거부)
      if (claims.iat && claims.iat > now + 60) { // 1분 이상 미래
        throw new Error('ID Token issued in the future');
      }
      
      // Nonce 검증
      const storedNonce = sessionStorage.getItem('oauth_nonce');
      if (storedNonce && claims.nonce !== storedNonce) {
        throw new Error('Invalid nonce in ID Token');
      }
      
      // Audience 검증
      const clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
      if (claims.aud !== clientId) {
        throw new Error('Invalid audience in ID Token');
      }
      
      // Issuer 검증
      const expectedIssuer = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
      if (!claims.iss || !claims.iss.startsWith(expectedIssuer)) {
        throw new Error('Invalid issuer in ID Token');
      }
      
      // 검증 성공 후 nonce 정리
      sessionStorage.removeItem('oauth_nonce');
      
      return claims;
    } catch (error: any) {
      console.error('ID Token validation error:', error);
      throw new Error(`ID Token validation failed: ${error.message}`);
    }
  }
};