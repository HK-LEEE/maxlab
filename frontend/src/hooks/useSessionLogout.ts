/**
 * Session Logout Hook
 * Manages session logout operations and modal state
 */

import { useState, useCallback } from 'react';
import { sessionService } from '../services/sessionService';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import { refreshTokenService } from '../services/refreshTokenService';
import toast from 'react-hot-toast';

// Import types directly to avoid module resolution issues
type LogoutType = 'current' | 'all';

interface ActiveSessionsResponse {
  current_session: any;
  other_sessions: any[];
  total_sessions: number;
  suspicious_sessions: number;
}

export interface UseSessionLogoutReturn {
  isLoading: boolean;
  sessionsData: ActiveSessionsResponse | null;
  isModalOpen: boolean;
  error: string | null;
  openModal: () => void;
  closeModal: () => void;
  fetchActiveSessions: () => Promise<void>;
  executeLogout: (logoutType: LogoutType, reason?: string) => Promise<void>;
}

export const useSessionLogout = (): UseSessionLogoutReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [sessionsData, setSessionsData] = useState<ActiveSessionsResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logout = useAuthStore((state) => state.logout);

  // Open modal
  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // Close modal
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Fetch active sessions
  const fetchActiveSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await sessionService.getActiveSessions();
      setSessionsData(data);
      
      // Show warning if suspicious sessions detected
      if (data.suspicious_sessions > 0) {
        toast.error(
          `⚠️ ${data.suspicious_sessions}개의 의심스러운 세션이 감지되었습니다.`,
          { duration: 5000 }
        );
      }
    } catch (error: any) {
      console.error('Error fetching active sessions:', error);
      const errorMessage = error.message || '세션 정보를 가져오는 중 오류가 발생했습니다.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Execute logout
  const executeLogout = useCallback(async (logoutType: LogoutType, reason?: string) => {
    setIsLoading(true);
    
    try {
      // Show loading toast
      const loadingToast = toast.loading(
        logoutType === 'current' 
          ? '현재 세션에서 로그아웃 중...' 
          : '모든 세션에서 로그아웃 중...'
      );

      // Execute logout on server
      const result = await sessionService.executeLogout(logoutType, reason);
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      // Show success message
      toast.success(
        `${result.sessions_terminated}개의 세션이 종료되었습니다.`,
        { duration: 3000 }
      );

      // Clear local authentication state
      // Use refreshTokenService for secure cleanup
      await refreshTokenService.clearAllTokens();
      
      // Clear auth store
      logout();
      
      // Close modal
      closeModal();
      
      // Redirect to login after a short delay
      setTimeout(() => {
        // Save current path for return after login (if not on public page)
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const isPublicPage = currentPath.startsWith('/public/');
        
        if (!isPublicPage) {
          const returnUrl = encodeURIComponent(currentPath + currentSearch);
          window.location.href = `/login?return=${returnUrl}`;
        } else {
          window.location.href = '/login';
        }
      }, 1000);
      
    } catch (error: any) {
      console.error('Error during logout:', error);
      
      // Show error toast
      toast.error(
        error.message || '로그아웃 중 오류가 발생했습니다.',
        { duration: 5000 }
      );
      
      // If logout partially succeeded, still clear local state
      if (error.message?.includes('partially')) {
        await refreshTokenService.clearAllTokens();
        logout();
        
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [logout, closeModal]);

  return {
    isLoading,
    sessionsData,
    isModalOpen,
    error,
    openModal,
    closeModal,
    fetchActiveSessions,
    executeLogout,
  };
};