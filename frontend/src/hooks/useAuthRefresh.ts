import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import { refreshTokenService } from '../services/refreshTokenService';
import { isSafePageForTokenRefresh } from '../utils/silentAuth';

/**
 * 자동 토큰 갱신 훅
 * 인증된 사용자의 토큰을 자동으로 갱신합니다.
 * React Strict Mode에서의 이중 실행을 방지합니다.
 */
export const useAuthRefresh = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();
  const cleanupRef = useRef<(() => void) | null>(null);
  const isInitializedRef = useRef(false);
  const lastLocationRef = useRef(location.pathname);

  useEffect(() => {
    // 페이지 변경 감지
    const currentPath = location.pathname;
    const hasLocationChanged = lastLocationRef.current !== currentPath;
    lastLocationRef.current = currentPath;

    // 현재 페이지에서 토큰 갱신이 안전한지 확인
    const isSafePage = isSafePageForTokenRefresh();
    
    // React Strict Mode에서 이중 실행 방지
    if (isInitializedRef.current && isAuthenticated && cleanupRef.current && !hasLocationChanged && isSafePage) {
      console.log('🔄 Token refresh already initialized, skipping...');
      return;
    }

    // 기존 갱신 정리 (페이지 변경 시 또는 안전하지 않은 페이지)
    if (cleanupRef.current) {
      console.log('🛑 Cleaning up existing token refresh');
      cleanupRef.current();
      cleanupRef.current = null;
      isInitializedRef.current = false;
    }

    if (isAuthenticated && isSafePage) {
      console.log('🔄 Starting automatic token refresh on safe page:', currentPath);
      
      // 자동 토큰 갱신 시작
      cleanupRef.current = authService.startAutoTokenRefresh();
      isInitializedRef.current = true;
      
      return () => {
        if (cleanupRef.current) {
          console.log('🛑 Stopping automatic token refresh (cleanup)');
          cleanupRef.current();
          cleanupRef.current = null;
        }
        isInitializedRef.current = false;
      };
    } else if (isAuthenticated && !isSafePage) {
      console.log('🔐 Page not safe for token refresh, disabling auto refresh:', currentPath);
      isInitializedRef.current = false;
    } else {
      // 인증되지 않은 경우
      console.log('🛑 User not authenticated, stopping token refresh');
      isInitializedRef.current = false;
    }
  }, [isAuthenticated, location.pathname]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        console.log('🛑 Component unmounting, cleaning up token refresh');
        cleanupRef.current();
        cleanupRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, []);
};

/**
 * 토큰 상태 모니터링 훅 - Refresh Token 지원
 * Access Token과 Refresh Token의 상태를 종합적으로 모니터링합니다.
 */
export const useTokenStatus = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [tokenStatus, setTokenStatus] = useState({
    accessTokenTimeToExpiry: 0,
    refreshTokenTimeToExpiry: 0,
    needsAccessTokenRefresh: false,
    needsReAuthentication: false,
    refreshMethod: null as 'refresh_token' | 'silent_auth' | null,
    lastRefreshAttempt: null as Date | null,
    isNearExpiry: false,
    isRefreshTokenValid: false
  });

  // 토큰 상태를 주기적으로 업데이트
  useEffect(() => {
    const updateTokenStatus = () => {
      if (!isAuthenticated) {
        setTokenStatus({
          accessTokenTimeToExpiry: 0,
          refreshTokenTimeToExpiry: 0,
          needsAccessTokenRefresh: false,
          needsReAuthentication: false,
          refreshMethod: null,
          lastRefreshAttempt: null,
          isNearExpiry: false,
          isRefreshTokenValid: false
        });
        return;
      }

      const accessTokenTimeToExpiry = authService.getTokenTimeToExpiry();
      const refreshTokenTimeToExpiry = refreshTokenService.getRefreshTokenTimeToExpiry();
      const needsAccessTokenRefresh = authService.needsTokenRefresh();
      const isRefreshTokenValid = refreshTokenService.isRefreshTokenValid();
      const isNearExpiry = accessTokenTimeToExpiry <= 300; // 5분 이내
      
      // 재인증이 필요한 경우 판단
      const needsReAuthentication = !isRefreshTokenValid && 
                                   (accessTokenTimeToExpiry <= 0 || !isSafePageForTokenRefresh());
      
      // 갱신 방법 결정
      let refreshMethod: 'refresh_token' | 'silent_auth' | null = null;
      if (needsAccessTokenRefresh && isRefreshTokenValid) {
        refreshMethod = 'refresh_token';
      } else if (needsAccessTokenRefresh && isSafePageForTokenRefresh()) {
        refreshMethod = 'silent_auth';
      }

      // 마지막 갱신 시도 시간 가져오기
      const lastRefreshStr = localStorage.getItem('lastTokenRefresh');
      const lastRefreshAttempt = lastRefreshStr ? new Date(parseInt(lastRefreshStr)) : null;

      setTokenStatus({
        accessTokenTimeToExpiry,
        refreshTokenTimeToExpiry,
        needsAccessTokenRefresh,
        needsReAuthentication,
        refreshMethod,
        lastRefreshAttempt,
        isNearExpiry,
        isRefreshTokenValid
      });
    };

    // 초기 업데이트
    updateTokenStatus();

    // 10초마다 업데이트
    const interval = setInterval(updateTokenStatus, 10000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  return tokenStatus;
};

/**
 * 토큰 만료 알림 훅
 * 토큰 만료 시점에 따라 적절한 알림을 제공합니다.
 */
export const useTokenExpiryNotification = () => {
  const tokenStatus = useTokenStatus();
  const [notifications, setNotifications] = useState<Array<{
    type: 'warning' | 'info' | 'error';
    message: string;
    action?: string;
  }>>([]);

  useEffect(() => {
    const newNotifications: Array<{
      type: 'warning' | 'info' | 'error';
      message: string;
      action?: string;
    }> = [];

    // Refresh Token 만료 1일 전 알림
    if (tokenStatus.isRefreshTokenValid && tokenStatus.refreshTokenTimeToExpiry <= 86400) { // 1일
      newNotifications.push({
        type: 'warning',
        message: 'Your session will expire soon. Please log in again to maintain access.',
        action: 'login'
      });
    }

    // Access Token 만료 임박 알림 (Refresh Token이 없는 경우)
    if (!tokenStatus.isRefreshTokenValid && tokenStatus.isNearExpiry) {
      newNotifications.push({
        type: 'warning',
        message: 'Your session will expire in a few minutes. Please save your work.',
        action: 'save'
      });
    }

    // 재인증 필요 알림
    if (tokenStatus.needsReAuthentication) {
      newNotifications.push({
        type: 'error',
        message: 'Your session has expired. Please log in again.',
        action: 'login'
      });
    }

    // 자동 갱신 실패 알림 (5분 이상 갱신이 안 된 경우)
    if (tokenStatus.lastRefreshAttempt) {
      const timeSinceLastRefresh = Date.now() - tokenStatus.lastRefreshAttempt.getTime();
      if (timeSinceLastRefresh > 5 * 60 * 1000 && tokenStatus.needsAccessTokenRefresh) {
        newNotifications.push({
          type: 'info',
          message: 'Automatic token refresh is having issues. Your session may expire soon.',
          action: 'refresh'
        });
      }
    }

    setNotifications(newNotifications);
  }, [tokenStatus]);

  return notifications;
};