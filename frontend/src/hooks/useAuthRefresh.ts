import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

  // 페이지 안전성 확인을 메모화 (성능 최적화)
  const isSafePage = useMemo(() => {
    return isSafePageForTokenRefresh();
  }, [location.pathname]);

  useEffect(() => {
    // 페이지 변경 감지
    const currentPath = location.pathname;
    const hasLocationChanged = lastLocationRef.current !== currentPath;
    lastLocationRef.current = currentPath;
    
    // React Strict Mode에서 이중 실행 방지 (더 엄격한 조건)
    if (isInitializedRef.current && isAuthenticated && cleanupRef.current && !hasLocationChanged && isSafePage) {
      // console.log('🔄 Token refresh already initialized, skipping...'); // 로그 줄이기
      return;
    }

    // 기존 갱신 정리 (페이지 변경 시 또는 안전하지 않은 페이지)
    if (cleanupRef.current) {
      // console.log('🛑 Cleaning up existing token refresh'); // 로그 줄이기
      cleanupRef.current();
      cleanupRef.current = null;
      isInitializedRef.current = false;
    }

    if (isAuthenticated && isSafePage) {
      // console.log('🔄 Starting automatic token refresh on safe page:', currentPath); // 로그 줄이기
      
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
  }, [isAuthenticated, isSafePage]); // dependency를 최적화

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