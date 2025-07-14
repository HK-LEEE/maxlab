import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';

/**
 * 자동 토큰 갱신 훅
 * 인증된 사용자의 토큰을 자동으로 갱신합니다.
 * React Strict Mode에서의 이중 실행을 방지합니다.
 */
export const useAuthRefresh = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // React Strict Mode에서 이중 실행 방지
    if (isInitializedRef.current && isAuthenticated && cleanupRef.current) {
      console.log('🔄 Token refresh already initialized, skipping...');
      return;
    }

    if (isAuthenticated) {
      console.log('🔄 Starting automatic token refresh');
      
      // 기존 갱신이 있다면 먼저 정리
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      
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
    } else {
      // 인증되지 않은 경우 기존 갱신 정리
      if (cleanupRef.current) {
        console.log('🛑 User not authenticated, stopping token refresh');
        cleanupRef.current();
        cleanupRef.current = null;
      }
      isInitializedRef.current = false;
    }
  }, [isAuthenticated]);

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
 * 토큰 상태 모니터링 훅
 * 토큰의 만료 시간과 갱신 필요 여부를 제공합니다.
 */
export const useTokenStatus = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getTokenStatus = () => {
    if (!isAuthenticated) {
      return {
        timeToExpiry: 0,
        needsRefresh: false,
        isNearExpiry: false
      };
    }

    const timeToExpiry = authService.getTokenTimeToExpiry();
    const needsRefresh = authService.needsTokenRefresh();
    const isNearExpiry = timeToExpiry <= 300; // 5분 이내

    return {
      timeToExpiry,
      needsRefresh,
      isNearExpiry
    };
  };

  return getTokenStatus();
};