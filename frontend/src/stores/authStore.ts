import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types/auth';
import type { AuthInitState, AuthError, EnhancedAuthState } from '../types/authStates';
import { oauthLoopPrevention } from '../utils/oauthInfiniteLoopPrevention';

interface AuthState extends EnhancedAuthState {
  user: User | null;
  isAuthenticated: boolean;
  
  // Enhanced state management
  setAuthState: (state: AuthInitState) => void;
  setAuthError: (error: AuthError | null) => void;
  clearError: () => void;
  incrementRetry: () => void;
  resetRetry: () => void;
  updateSyncTime: () => void;
  
  // Original methods (enhanced)
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isAdmin: () => boolean;
  hasPermission: (requiredRole?: 'admin' | 'user') => boolean;
  
  // New utility methods
  isReady: () => boolean;
  canRetry: () => boolean;
  shouldShowError: () => boolean;
  getStatusMessage: () => string;
  
  // Enhanced UX methods
  getProgressPercentage: () => number;
  getTimeInState: () => number;
  isNetworkIssue: () => boolean;
  getRecommendedAction: () => {
    action: string;
    message: string;
    priority: 'high' | 'medium' | 'low';
  } | null;
  
  // OAuth Infinite Loop Prevention methods
  canAttemptOAuth: (type?: 'auto' | 'manual' | 'retry') => {
    allowed: boolean;
    reason?: string;
    suggestedAction?: string;
    waitTime?: number;
  };
  recordOAuthAttempt: (type: 'auto' | 'manual' | 'retry', success: boolean, error?: string) => void;
  detectInfiniteLoop: () => {
    inLoop: boolean;
    confidence: number;
    indicators: string[];
    recommendation: string;
  };
  resetOAuthLoopState: () => void;
  getOAuthLoopDebugState: () => any;
  getOAuthRecoveryActions: () => Array<{
    action: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    automated?: boolean;
  }>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // User data
      user: null,
      isAuthenticated: false,
      
      // Enhanced state management
      initState: 'idle' as AuthInitState,
      error: null as AuthError | null,
      lastSyncTime: null as number | null,
      retryCount: 0,
      
      // Enhanced state management methods
      setAuthState: (state: AuthInitState) => {
        const currentState = get();
        console.log(`🔄 Auth state change: ${currentState.initState} → ${state}`, {
          isAuthenticated: currentState.isAuthenticated,
          hasUser: !!currentState.user,
          stackTrace: new Error().stack?.split('\n').slice(1, 4)
        });
        set({ initState: state });
      },
      
      setAuthError: (error: AuthError | null) => {
        set({ error, initState: error ? 'error' : get().initState });
        if (error) {
          console.error(`❌ Auth error: ${error.type} - ${error.message}`);
        }
      },
      
      clearError: () => {
        set({ error: null });
        console.log('✅ Auth error cleared');
      },
      
      incrementRetry: () => {
        const currentRetry = get().retryCount;
        set({ retryCount: currentRetry + 1 });
        console.log(`🔄 Retry count: ${currentRetry + 1}`);
      },
      
      resetRetry: () => {
        set({ retryCount: 0 });
      },
      
      updateSyncTime: () => {
        set({ lastSyncTime: Date.now() });
      },
      
      setAuth: (token, user) => {
        // OAuth 토큰은 localStorage에서 별도 관리
        localStorage.setItem('accessToken', token);
        
        // Normalize user data with enhanced admin checking
        const normalizedUser = {
          ...user,
          user_id: user.user_id || user.id || user.email,
          is_admin: user.is_admin || user.role === 'admin' || false,
        };
        
        set({ 
          user: normalizedUser, 
          isAuthenticated: true,
          initState: 'ready',
          error: null,
          lastSyncTime: Date.now()
        });
        
        // 🔄 Record successful OAuth attempt for loop prevention
        try {
          oauthLoopPrevention.recordAttempt('manual', true);
          console.log('✅ OAuth success recorded in loop prevention system');
        } catch (loopError) {
          console.warn('⚠️ Failed to record OAuth success in loop prevention:', loopError);
        }
        
        console.log('✅ User authenticated successfully');
      },
      
      setUser: (user) => {
        const normalizedUser = {
          ...user,
          user_id: user.user_id || user.id || user.email,
          is_admin: user.is_admin || user.role === 'admin' || false,
        };
        set({ 
          user: normalizedUser, 
          isAuthenticated: true,
          initState: 'ready',
          lastSyncTime: Date.now()
        });
      },
      
      logout: async () => {
        // 🔒 CRITICAL: Clear auth state immediately to prevent UI issues
        set({ 
          user: null, 
          isAuthenticated: false,
          initState: 'idle',
          error: null,
          lastSyncTime: null,
          retryCount: 0
        });
        
        // Enhanced logout with token revocation
        try {
          // Import authService dynamically to avoid circular dependencies
          const { authService } = await import('../services/authService');
          await authService.logout();
        } catch (error) {
          console.error('Enhanced logout failed, performing basic cleanup:', error);
          
          // Fallback: comprehensive cleanup
          const keysToRemove = [
            'accessToken', 'tokenType', 'expiresIn', 'scope',
            'tokenExpiryTime', 'tokenCreatedAt', 'refreshToken',
            'refreshTokenExpiry', 'lastTokenRefresh', 'user'
          ];
          
          keysToRemove.forEach(key => localStorage.removeItem(key));
          sessionStorage.clear();
        }
        
        // 🔄 Reset OAuth loop prevention state on logout
        try {
          oauthLoopPrevention.manualReset();
          console.log('✅ OAuth loop prevention state reset');
        } catch (loopError) {
          console.warn('⚠️ Failed to reset OAuth loop prevention state:', loopError);
        }
        
        console.log('✅ User logged out successfully');
      },
      
      isAdmin: () => {
        const user = get().user;
        return (user?.is_admin === true) || user?.role === 'admin' || false;
      },
      
      hasPermission: (requiredRole = 'user') => {
        const state = get();
        if (!state.isAuthenticated || !state.user) {
          return false;
        }
        
        if (requiredRole === 'admin') {
          return state.isAdmin();
        }
        
        return true; // 모든 인증된 사용자는 기본 권한 보유
      },
      
      // New utility methods
      isReady: () => {
        const state = get();
        return state.initState === 'ready' && state.isAuthenticated && !state.error;
      },
      
      canRetry: () => {
        const state = get();
        return (state.error?.recoverable === true) && state.retryCount < 3;
      },
      
      shouldShowError: () => {
        const state = get();
        return state.error !== null && state.initState === 'error';
      },
      
      getStatusMessage: () => {
        const state = get();
        if (state.error) {
          return state.error.message;
        }
        
        // Import AUTH_STATE_MESSAGES here to avoid circular dependency
        const messages: Record<AuthInitState, string> = {
          idle: '초기화 중...',
          hydrating: '사용자 정보 복원 중...',
          syncing: '서버와 동기화 중...',
          silent_auth: '자동 로그인 시도 중...',
          ready: '준비 완료',
          error: '인증 오류 발생'
        };
        
        return messages[state.initState] || '알 수 없는 상태';
      },
      
      // Additional utility methods for enhanced UX
      getProgressPercentage: () => {
        const state = get();
        const stateOrder: AuthInitState[] = ['idle', 'hydrating', 'syncing', 'silent_auth', 'ready'];
        const currentIndex = stateOrder.indexOf(state.initState);
        
        // 🔧 SECURITY FIX: Show minimum progress for idle state to indicate initialization
        if (state.error) return 0;
        if (currentIndex === -1) return 0;
        
        // Show 5% minimum progress for idle state to indicate system is starting
        const baseProgress = Math.round((currentIndex / (stateOrder.length - 1)) * 100);
        return state.initState === 'idle' ? Math.max(5, baseProgress) : baseProgress;
      },
      
      getTimeInState: () => {
        const state = get();
        return state.lastSyncTime ? Date.now() - state.lastSyncTime : 0;
      },
      
      isNetworkIssue: () => {
        const state = get();
        return state.error?.type === 'network' || state.error?.type === 'silent_auth_timeout';
      },
      
      getRecommendedAction: () => {
        const state = get();
        
        if (!state.error) return null;
        
        switch (state.error.type) {
          case 'network':
            return {
              action: 'check_connection',
              message: '인터넷 연결을 확인하고 다시 시도해주세요',
              priority: 'high'
            };
          case 'silent_auth_timeout':
            return {
              action: 'manual_login',
              message: '수동 로그인을 시도해주세요',
              priority: 'medium'
            };
          case 'server_error':
            return {
              action: 'wait_and_retry',
              message: '잠시 후 다시 시도해주세요',
              priority: 'medium'
            };
          case 'oauth_infinite_loop':
            return {
              action: 'clear_cache_and_manual_login',
              message: 'OAuth 무한루프가 감지되었습니다. 브라우저 캐시를 지우고 수동 로그인해주세요',
              priority: 'high'
            };
          case 'loop_prevention':
            return {
              action: 'wait_or_manual_login',
              message: state.error.suggestion || '잠시 후 다시 시도하거나 수동 로그인해주세요',
              priority: 'medium'
            };
          default:
            return {
              action: 'refresh_page',
              message: '페이지를 새로고침해주세요',
              priority: 'low'
            };
        }
      },
      
      // OAuth Infinite Loop Prevention implementation
      canAttemptOAuth: (type = 'auto') => {
        try {
          return oauthLoopPrevention.canAttemptOAuth(type);
        } catch (error) {
          console.error('❌ OAuth loop prevention check failed:', error);
          return { allowed: true }; // Fail open for graceful degradation
        }
      },
      
      recordOAuthAttempt: (type, success, error) => {
        try {
          oauthLoopPrevention.recordAttempt(type, success, error);
          
          // If OAuth attempt failed, update auth store error state
          if (!success && error) {
            const loopDetection = oauthLoopPrevention.detectInfiniteLoop();
            
            if (loopDetection.inLoop) {
              set({
                error: {
                  type: 'oauth_infinite_loop',
                  message: `OAuth 무한루프 감지됨 (신뢰도: ${loopDetection.confidence}%)`,
                  recoverable: true,
                  suggestion: loopDetection.recommendation
                },
                initState: 'error'
              });
            } else if (error.includes('aborted') || error.includes('NS_BINDING_ABORTED')) {
              // Handle aborted requests as potential loop indicators
              set({
                error: {
                  type: 'network',
                  message: 'OAuth 요청이 중단되었습니다',
                  recoverable: true,
                  suggestion: '네트워크 연결을 확인하고 다시 시도해주세요'
                },
                initState: 'error'
              });
            }
          }
        } catch (loopError) {
          console.error('❌ Failed to record OAuth attempt:', loopError);
        }
      },
      
      detectInfiniteLoop: () => {
        try {
          return oauthLoopPrevention.detectInfiniteLoop();
        } catch (error) {
          console.error('❌ OAuth loop detection failed:', error);
          return {
            inLoop: false,
            confidence: 0,
            indicators: [],
            recommendation: 'Manual login recommended due to detection error'
          };
        }
      },
      
      resetOAuthLoopState: () => {
        try {
          oauthLoopPrevention.manualReset();
          console.log('✅ OAuth loop state reset manually');
        } catch (error) {
          console.error('❌ Failed to reset OAuth loop state:', error);
        }
      },
      
      getOAuthLoopDebugState: () => {
        try {
          return oauthLoopPrevention.getDebugState();
        } catch (error) {
          console.error('❌ Failed to get OAuth loop debug state:', error);
          return { error: 'Debug state unavailable' };
        }
      },
      
      getOAuthRecoveryActions: () => {
        try {
          return oauthLoopPrevention.getRecoveryActions();
        } catch (error) {
          console.error('❌ Failed to get OAuth recovery actions:', error);
          return [{
            action: 'manual_reset',
            description: '수동으로 로그인을 다시 시도해주세요',
            priority: 'medium'
          }];
        }
      },
    }),
    {
      name: 'maxlab-auth-storage',
      // 🔒 SECURITY: Admin 정보와 임시 상태는 localStorage에 저장하지 않음
      partialize: (state) => ({
        user: state.user ? {
          ...state.user,
          // Admin 권한 정보 제외 - 매번 서버에서 검증
          is_admin: false,
          role: state.user.role === 'admin' ? 'user' : state.user.role
        } : null,
        // 기본 인증 상태는 유지 (UX 개선)
        isAuthenticated: state.isAuthenticated,
        // 마지막 동기화 시간만 저장 (상태 체크용)
        lastSyncTime: state.lastSyncTime,
        // 임시 상태들은 제외 (initState, error, retryCount)
      }),
      // 🔄 Hydration 시 상태 초기화 및 서버 동기화 준비
      onRehydrateStorage: () => (state) => {
        console.log('🔄 Rehydrating auth state for initialization', { state });
        
        // 🔧 CRITICAL FIX: Enhanced token validity checking with server validation
        const accessToken = localStorage.getItem('accessToken');
        const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
        const currentTime = Date.now();
        
        // 🚨 SECURITY FIX: More strict token validation
        const hasTokenData = accessToken && tokenExpiryTime;
        const isLocallyValid = hasTokenData && currentTime < parseInt(tokenExpiryTime);
        
        if (state?.isAuthenticated && state?.user && hasTokenData) {
          // 🔍 Enhanced validation: Check both local and potential server issues
          if (!isLocallyValid) {
            console.log('⚠️ Authenticated user but token expired locally, clearing auth');
            // Clear expired auth data immediately
            const keysToRemove = ['accessToken', 'tokenExpiryTime', 'tokenType', 'expiresIn', 'refreshToken', 'refreshTokenExpiry'];
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            return {
              ...state,
              initState: 'idle' as AuthInitState,
              error: null,
              retryCount: 0,
              isAuthenticated: false,
              user: null
            };
          }
          
          // 🔧 CRITICAL: Set to syncing state to trigger server validation  
          console.log('📋 Authenticated user detected - will validate with server');
          const rehydratedState = {
            ...state,
            initState: 'syncing' as AuthInitState, // Changed from 'hydrating' to 'syncing'
            error: null,
            retryCount: 0,
            // 🚨 CRITICAL: Keep authenticated true temporarily for App.tsx validation logic
            isAuthenticated: true  // Keep true so App initialization validates the token
          };
          console.log('📋 Rehydrated state (pending server validation):', rehydratedState);
          return rehydratedState;
        } else {
          console.log('🆕 New or unauthenticated user, preparing for silent auth attempt');
          return {
            ...state,
            initState: 'idle' as AuthInitState,
            error: null,
            retryCount: 0,
            isAuthenticated: false,
            user: null
          };
        }
      }
    }
  )
);