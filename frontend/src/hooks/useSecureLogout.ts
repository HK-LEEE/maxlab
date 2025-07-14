/**
 * Secure Logout Hook
 * Integrates comprehensive logout functionality with token revocation and cleanup
 */

import { useState, useCallback } from 'react';
import { authService } from '../services/authService';
import { tokenBlacklistService } from '../services/tokenBlacklistService';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/authStore';

interface LogoutOptions {
  logoutAll?: boolean;
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
  const [state, setState] = useState<LogoutState>({
    isLoading: false,
    showConfirmation: false,
    error: null
  });

  /**
   * Show logout confirmation dialog
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
   * Perform server-side comprehensive logout
   */
  const performServerLogout = useCallback(async (logoutAll: boolean = false, reason: string = 'user_logout'): Promise<LogoutResult> => {
    try {
      // Use the enhanced logout API that handles both token blacklisting and session cleanup
      const response = await apiClient.post('/api/v1/auth/logout', {
        logout_all: logoutAll,
        reason
      });
      
      const data = response.data;
      return {
        success: data.success || false,
        sessionsLoggedOut: data.sessions_logged_out || 0
      };
    } catch (error: any) {
      console.error('Server logout failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || 'Server logout failed'
      };
    }
  }, []);

  /**
   * Comprehensive secure logout with token revocation
   */
  const performSecureLogout = useCallback(async (options: LogoutOptions = {}): Promise<LogoutResult> => {
    const { logoutAll = false, reason = 'user_logout' } = options;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      console.log(`🔐 Starting secure logout (${logoutAll ? 'all sessions' : 'current session only'})`);

      // Step 1: Server-side comprehensive logout (includes token blacklisting and session cleanup)
      const serverResult = await performServerLogout(logoutAll, reason);
      
      // Step 2: Enhanced client-side cleanup
      try {
        await authService.logout();
        console.log('✅ Enhanced client-side cleanup completed');
      } catch (error) {
        console.warn('⚠️ Client-side cleanup had issues:', error);
        // Continue to ensure user is logged out
      }

      // Step 3: Clear auth store
      clearAuthStore();

      // Step 4: Additional security cleanup
      try {
        // Clear any remaining sensitive data
        sessionStorage.clear();
        
        // Clear any cached API data that might contain sensitive info
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

      const finalResult: LogoutResult = {
        success: true,
        sessionsLoggedOut: serverResult.sessionsLoggedOut || 1
      };

      // Add server errors to result if any
      if (!serverResult.success && serverResult.error) {
        finalResult.error = `Server logout warning: ${serverResult.error}`;
      }

      console.log('✅ Secure logout completed successfully');
      return finalResult;

    } catch (error: any) {
      console.error('❌ Secure logout failed:', error);
      
      // Emergency cleanup - ensure user is logged out even if there are errors
      try {
        clearAuthStore();
        localStorage.clear();
        sessionStorage.clear();
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
  }, [clearAuthStore, performServerLogout]);

  /**
   * Handle logout confirmation
   */
  const handleLogoutConfirm = useCallback(async (logoutAll: boolean = false): Promise<void> => {
    setState(prev => ({ ...prev, showConfirmation: false }));
    
    const result = await performSecureLogout({ 
      logoutAll, 
      reason: logoutAll ? 'user_logout_all' : 'user_logout' 
    });

    if (!result.success) {
      setState(prev => ({ 
        ...prev, 
        error: result.error || 'Logout failed. Please refresh the page and try again.' 
      }));
    } else {
      // Success - redirect will be handled by the calling component
      console.log(`✅ Logout successful: ${result.sessionsLoggedOut} session(s) logged out`);
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