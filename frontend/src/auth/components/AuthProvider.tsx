/**
 * 인증 프로바이더 컴포넌트
 * 애플리케이션 전체에 인증 상태와 기능을 제공
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import SessionManager, { SessionState } from '../session.js';
import AuthGuard, { GuardResult } from '../auth-guard.js';

// 인증 컨텍스트 타입 정의
interface AuthContextType {
  // 인증 상태
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionState: string;
  
  // 사용자 정보
  user: any | null;
  userInfo: any | null;
  
  // 인증 기능
  login: (options?: LoginOptions) => Promise<void>;
  logout: (globalLogout?: boolean) => Promise<void>;
  refreshSession: () => Promise<void>;
  
  // 권한 확인
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  hasGroup: (group: string) => boolean;
  
  // 가드 기능
  checkAccess: (path: string) => Promise<any>;
  
  // 세션 정보
  sessionMetadata: any | null;
  timeToExpiry: number;
  
  // 오류 상태
  error: string | null;
  clearError: () => void;
}

interface LoginOptions {
  forceAccountSelection?: boolean;
  rememberMe?: boolean;
  redirectTo?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
  config?: any;
  onAuthStateChange?: (state: string, user: any) => void;
  onError?: (error: any) => void;
}

/**
 * 인증 프로바이더 컴포넌트
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  config = {},
  onAuthStateChange,
  onError
}) => {
  // 상태 관리
  const [isLoading, setIsLoading] = useState(true);
  const [sessionState, setSessionState] = useState(SessionState.UNKNOWN);
  const [user, setUser] = useState(null);
  const [sessionMetadata, setSessionMetadata] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [timeToExpiry, setTimeToExpiry] = useState(0);

  // 매니저 인스턴스들
  const [sessionManager] = useState(() => new SessionManager(config));
  const [authGuard] = useState(() => new AuthGuard(config));

  /**
   * 세션 상태 업데이트
   */
  const updateSessionState = useCallback(() => {
    const currentState = sessionManager.getState();
    const currentUser = sessionManager.getUserInfo();
    const currentMetadata = sessionManager.getSessionMetadata();
    const currentTimeToExpiry = sessionManager.getTimeToExpiry();

    setSessionState(currentState);
    setUser(currentUser);
    setSessionMetadata(currentMetadata);
    setTimeToExpiry(currentTimeToExpiry);

    // 인증 상태 변경 콜백
    if (onAuthStateChange) {
      onAuthStateChange(currentState, currentUser);
    }

    console.log('🔄 Auth state updated:', {
      state: currentState,
      hasUser: !!currentUser,
      timeToExpiry: currentTimeToExpiry
    });
  }, [sessionManager, onAuthStateChange]);

  /**
   * 세션 매니저 초기화 및 이벤트 구독
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🔐 Initializing auth provider...');

        // 세션 상태 변경 구독
        const unsubscribeSession = sessionManager.onStateChange((newState) => {
          if (mounted) {
            updateSessionState();
          }
        });

        // 가드 이벤트 구독
        const unsubscribeGuard = authGuard.onGuardEvent((event) => {
          if (mounted) {
            console.log('🛡️ Guard event:', event);
            
            if (event.type === 'session_expired') {
              setError('세션이 만료되었습니다. 다시 로그인해주세요.');
            }
          }
        });

        // 초기 세션 상태 확인
        await sessionManager.validateCurrentSession();
        
        if (mounted) {
          updateSessionState();
          setIsLoading(false);
        }

        return () => {
          unsubscribeSession();
          unsubscribeGuard();
        };

      } catch (error: any) {
        console.error('❌ Auth initialization failed:', error);
        
        if (mounted) {
          setError(error.message);
          setIsLoading(false);
          
          if (onError) {
            onError(error);
          }
        }
      }
    };

    const cleanup = initializeAuth();

    // 주기적인 세션 상태 업데이트
    const updateInterval = setInterval(() => {
      if (mounted && sessionState === SessionState.AUTHENTICATED) {
        updateSessionState();
      }
    }, 30 * 1000); // 30초마다

    return () => {
      mounted = false;
      clearInterval(updateInterval);
      cleanup.then(cleanupFn => cleanupFn?.());
    };
  }, [sessionManager, authGuard, sessionState, updateSessionState, onError]);

  /**
   * 로그인 함수
   */
  const login = useCallback(async (options: LoginOptions = {}) => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔐 Login initiated from AuthProvider');

      // 실제 로그인은 LoginButton 컴포넌트에서 처리
      // 여기서는 상태만 관리
      throw new Error('로그인은 LoginButton 컴포넌트를 사용해주세요.');

    } catch (error: any) {
      console.error('❌ Login failed:', error);
      setError(error.message);
      
      if (onError) {
        onError(error);
      }
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  /**
   * 로그아웃 함수
   */
  const logout = useCallback(async (globalLogout = true) => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔓 Logout initiated from AuthProvider');

      await sessionManager.logout(globalLogout);
      
      // 상태 초기화
      setUser(null);
      setSessionMetadata(null);
      setTimeToExpiry(0);
      setSessionState(SessionState.UNAUTHENTICATED);

    } catch (error: any) {
      console.error('❌ Logout failed:', error);
      setError(error.message);
      
      if (onError) {
        onError(error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionManager, onError]);

  /**
   * 세션 새로고침
   */
  const refreshSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔄 Refreshing session...');

      const success = await sessionManager.renewTokensSilently();
      
      if (success) {
        updateSessionState();
        console.log('✅ Session refreshed successfully');
      } else {
        throw new Error('세션 새로고침에 실패했습니다.');
      }

    } catch (error: any) {
      console.error('❌ Session refresh failed:', error);
      setError(error.message);
      
      if (onError) {
        onError(error);
      }
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sessionManager, updateSessionState, onError]);

  /**
   * 권한 확인 함수들
   */
  const hasPermission = useCallback((permission: string) => {
    if (!user) return false;
    
    switch (permission) {
      case 'authenticated':
        return !!user;
      case 'admin':
        return user.is_admin || user.role === 'admin';
      case 'super_admin':
        return user.is_superuser || user.role === 'super_admin';
      default:
        return false;
    }
  }, [user]);

  const hasRole = useCallback((role: string) => {
    if (!user) return false;
    
    const userRoles = user.roles || [user.role].filter(Boolean);
    return userRoles.includes(role);
  }, [user]);

  const hasGroup = useCallback((group: string) => {
    if (!user) return false;
    
    const userGroups = user.groups || [];
    return userGroups.includes(group);
  }, [user]);

  /**
   * 접근 권한 확인
   */
  const checkAccess = useCallback(async (path: string) => {
    try {
      return await authGuard.checkAccess(path);
    } catch (error: any) {
      console.error('❌ Access check failed:', error);
      return {
        result: GuardResult.DENY,
        message: 'Access check failed',
        error: error.message
      };
    }
  }, [authGuard]);

  /**
   * 오류 초기화
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 컨텍스트 값 구성
  const contextValue: AuthContextType = {
    // 인증 상태
    isAuthenticated: sessionState === SessionState.AUTHENTICATED,
    isLoading,
    sessionState,
    
    // 사용자 정보
    user,
    userInfo: user,
    
    // 인증 기능
    login,
    logout,
    refreshSession,
    
    // 권한 확인
    hasPermission,
    hasRole,
    hasGroup,
    
    // 가드 기능
    checkAccess,
    
    // 세션 정보
    sessionMetadata,
    timeToExpiry,
    
    // 오류 상태
    error,
    clearError
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * 인증 컨텍스트 훅
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

/**
 * 인증된 사용자 전용 훅
 */
export const useAuthenticatedUser = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return { user: null, isLoading: true };
  }
  
  if (!isAuthenticated || !user) {
    throw new Error('User not authenticated');
  }
  
  return { user, isLoading: false };
};

/**
 * 권한 기반 컴포넌트 렌더링 훅
 */
export const usePermission = (permission: string) => {
  const { hasPermission, isLoading } = useAuth();
  
  return {
    hasPermission: hasPermission(permission),
    isLoading
  };
};

export default AuthProvider;