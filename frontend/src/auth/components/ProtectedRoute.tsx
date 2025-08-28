/**
 * 보호된 라우트 컴포넌트
 * 권한 기반 라우트 접근 제어
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { GuardResult } from '../auth-guard.js';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** 필요한 권한 레벨 */
  requiredPermission?: string;
  /** 허용된 역할 */
  allowedRoles?: string[];
  /** 허용된 그룹 */
  allowedGroups?: string[];
  /** 커스텀 검증 함수 */
  customValidator?: (user: any) => boolean | Promise<boolean>;
  /** 접근 거부 시 표시할 컴포넌트 */
  fallback?: React.ComponentType<any>;
  /** 로딩 중 표시할 컴포넌트 */
  loadingComponent?: React.ComponentType<any>;
  /** 자동 리다이렉트 활성화 */
  autoRedirect?: boolean;
  /** 로그인 페이지 경로 */
  loginPath?: string;
  /** 권한 없음 페이지 경로 */
  unauthorizedPath?: string;
}

/**
 * 기본 로딩 컴포넌트
 */
const DefaultLoadingComponent = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex items-center space-x-2">
      <svg
        className="animate-spin h-5 w-5 text-blue-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="text-gray-600">인증 확인 중...</span>
    </div>
  </div>
);

/**
 * 기본 접근 거부 컴포넌트
 */
const DefaultFallbackComponent = ({ 
  reason, 
  requiredPermission, 
  userRoles = [], 
  userGroups = [] 
}: {
  reason?: string;
  requiredPermission?: string;
  userRoles?: string[];
  userGroups?: string[];
}) => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
      <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
        <svg
          className="w-6 h-6 text-red-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.104 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      
      <div className="mt-4 text-center">
        <h3 className="text-lg font-medium text-gray-900">
          접근 권한이 없습니다
        </h3>
        <div className="mt-2">
          <p className="text-sm text-gray-500">
            {reason || '이 페이지에 접근할 권한이 없습니다.'}
          </p>
          
          {requiredPermission && (
            <div className="mt-3 p-3 bg-gray-50 rounded-md text-left">
              <p className="text-xs font-medium text-gray-700">필요한 권한:</p>
              <p className="text-sm text-gray-600">{requiredPermission}</p>
              
              {userRoles.length > 0 && (
                <>
                  <p className="text-xs font-medium text-gray-700 mt-2">현재 역할:</p>
                  <p className="text-sm text-gray-600">{userRoles.join(', ')}</p>
                </>
              )}
              
              {userGroups.length > 0 && (
                <>
                  <p className="text-xs font-medium text-gray-700 mt-2">현재 그룹:</p>
                  <p className="text-sm text-gray-600">{userGroups.join(', ')}</p>
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="mt-5 flex justify-center space-x-3">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            뒤로가기
          </button>
          
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            대시보드로
          </button>
        </div>
      </div>
    </div>
  </div>
);

/**
 * 보호된 라우트 컴포넌트
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission = 'authenticated',
  allowedRoles = [],
  allowedGroups = [],
  customValidator,
  fallback: FallbackComponent = DefaultFallbackComponent,
  loadingComponent: LoadingComponent = DefaultLoadingComponent,
  autoRedirect = true,
  loginPath = '/login',
  unauthorizedPath = '/unauthorized'
}) => {
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    hasPermission, 
    hasRole, 
    hasGroup,
    checkAccess 
  } = useAuth();

  const [accessCheckResult, setAccessCheckResult] = useState<any>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  /**
   * 접근 권한 확인
   */
  const performAccessCheck = useCallback(async () => {
    try {
      setIsCheckingAccess(true);

      // 기본 권한 확인
      if (!hasPermission(requiredPermission)) {
        const result = {
          result: GuardResult.REDIRECT_LOGIN,
          message: '인증이 필요합니다',
          requiredPermission
        };
        setAccessCheckResult(result);
        return;
      }

      // 역할 확인
      if (allowedRoles.length > 0) {
        const hasRequiredRole = allowedRoles.some(role => hasRole(role));
        if (!hasRequiredRole) {
          const result = {
            result: GuardResult.REDIRECT_UNAUTHORIZED,
            message: '필요한 역할이 없습니다',
            requiredRoles: allowedRoles,
            userRoles: user?.roles || [user?.role].filter(Boolean)
          };
          setAccessCheckResult(result);
          return;
        }
      }

      // 그룹 확인
      if (allowedGroups.length > 0) {
        const hasRequiredGroup = allowedGroups.some(group => hasGroup(group));
        if (!hasRequiredGroup) {
          const result = {
            result: GuardResult.REDIRECT_UNAUTHORIZED,
            message: '필요한 그룹이 없습니다',
            requiredGroups: allowedGroups,
            userGroups: user?.groups || []
          };
          setAccessCheckResult(result);
          return;
        }
      }

      // 커스텀 검증
      if (customValidator) {
        const customResult = await customValidator(user);
        if (!customResult) {
          const result = {
            result: GuardResult.DENY,
            message: '커스텀 검증에 실패했습니다'
          };
          setAccessCheckResult(result);
          return;
        }
      }

      // 추가적인 라우트 가드 확인 (현재 경로 기반)
      const currentPath = window.location.pathname;
      const guardResult = await checkAccess(currentPath);
      
      setAccessCheckResult(guardResult);

    } catch (error: any) {
      console.error('❌ Access check failed:', error);
      setAccessCheckResult({
        result: GuardResult.DENY,
        message: '접근 권한 확인 중 오류가 발생했습니다',
        error: error.message
      });
    } finally {
      setIsCheckingAccess(false);
    }
  }, [
    hasPermission,
    requiredPermission,
    allowedRoles,
    allowedGroups,
    hasRole,
    hasGroup,
    customValidator,
    user,
    checkAccess
  ]);

  /**
   * 인증 상태 변경 시 접근 권한 재확인
   */
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      performAccessCheck();
    } else if (!isLoading && !isAuthenticated) {
      // 인증되지 않은 경우
      setAccessCheckResult({
        result: GuardResult.REDIRECT_LOGIN,
        message: '로그인이 필요합니다'
      });
      setIsCheckingAccess(false);
    }
  }, [isLoading, isAuthenticated, performAccessCheck]);

  /**
   * 자동 리다이렉트 처리
   */
  useEffect(() => {
    if (autoRedirect && accessCheckResult && !isCheckingAccess) {
      const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
      
      switch (accessCheckResult.result) {
        case GuardResult.REDIRECT_LOGIN:
          const loginUrl = `${loginPath}?returnUrl=${currentUrl}`;
          console.log('🔄 Redirecting to login:', loginUrl);
          window.location.href = loginUrl;
          break;
          
        case GuardResult.REDIRECT_UNAUTHORIZED:
          console.log('🔄 Redirecting to unauthorized page');
          window.location.href = unauthorizedPath;
          break;
          
        default:
          // 다른 결과는 리다이렉트하지 않음
          break;
      }
    }
  }, [autoRedirect, accessCheckResult, isCheckingAccess, loginPath, unauthorizedPath]);

  // 로딩 중일 때
  if (isLoading || isCheckingAccess) {
    return <LoadingComponent />;
  }

  // 접근 권한 확인 결과 처리
  if (accessCheckResult) {
    switch (accessCheckResult.result) {
      case GuardResult.ALLOW:
        // 접근 허용 - 자식 컴포넌트 렌더링
        return <>{children}</>;
        
      case GuardResult.REDIRECT_LOGIN:
        // 자동 리다이렉트가 비활성화된 경우 폴백 컴포넌트 표시
        if (!autoRedirect) {
          return (
            <FallbackComponent
              reason={accessCheckResult.message}
              requiredPermission={requiredPermission}
              userRoles={user?.roles || [user?.role].filter(Boolean)}
              userGroups={user?.groups || []}
            />
          );
        }
        // 자동 리다이렉트 진행 중 - 로딩 표시
        return <LoadingComponent />;
        
      case GuardResult.REDIRECT_UNAUTHORIZED:
        // 자동 리다이렉트가 비활성화된 경우 폴백 컴포넌트 표시
        if (!autoRedirect) {
          return (
            <FallbackComponent
              reason={accessCheckResult.message}
              requiredPermission={requiredPermission}
              userRoles={accessCheckResult.userRoles}
              userGroups={accessCheckResult.userGroups}
            />
          );
        }
        // 자동 리다이렉트 진행 중 - 로딩 표시
        return <LoadingComponent />;
        
      case GuardResult.DENY:
      case GuardResult.WAIT_AUTH:
      default:
        // 접근 거부 또는 기타 상황 - 폴백 컴포넌트 표시
        return (
          <FallbackComponent
            reason={accessCheckResult.message}
            requiredPermission={requiredPermission}
            userRoles={user?.roles || [user?.role].filter(Boolean)}
            userGroups={user?.groups || []}
          />
        );
    }
  }

  // 접근 권한 확인 결과가 없는 경우 (예상치 못한 상황)
  return (
    <FallbackComponent
      reason="접근 권한을 확인할 수 없습니다"
      requiredPermission={requiredPermission}
    />
  );
};

export default ProtectedRoute;

/**
 * 관리자 전용 라우트 컴포넌트
 */
export const AdminRoute: React.FC<Omit<ProtectedRouteProps, 'requiredPermission'>> = (props) => (
  <ProtectedRoute {...props} requiredPermission="admin" />
);

/**
 * 역할 기반 라우트 컴포넌트
 */
export const RoleBasedRoute: React.FC<Omit<ProtectedRouteProps, 'allowedRoles'> & { roles: string[] }> = ({ 
  roles, 
  ...props 
}) => (
  <ProtectedRoute {...props} allowedRoles={roles} />
);

/**
 * 그룹 기반 라우트 컴포넌트
 */
export const GroupBasedRoute: React.FC<Omit<ProtectedRouteProps, 'allowedGroups'> & { groups: string[] }> = ({ 
  groups, 
  ...props 
}) => (
  <ProtectedRoute {...props} allowedGroups={groups} />
);