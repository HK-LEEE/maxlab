/**
 * 인증 가드 - 라우트 보호 및 인증 검사
 * 
 * 기능:
 * - 라우트 레벨 인증 보호
 * - 권한 기반 접근 제어 (RBAC)
 * - 자동 로그인 리다이렉트
 * - 세션 만료 처리
 * - 조건부 접근 제어
 */

import SessionManager, { SessionState } from './session.js';
import OIDCClient from './oidc-client.js';

/**
 * 권한 레벨 열거형
 */
export const PermissionLevel = {
  PUBLIC: 'public',           // 공개 (인증 불필요)
  AUTHENTICATED: 'authenticated', // 인증된 사용자
  ADMIN: 'admin',            // 관리자
  SUPER_ADMIN: 'super_admin'  // 슈퍼 관리자
};

/**
 * 가드 결과 타입
 */
export const GuardResult = {
  ALLOW: 'allow',           // 접근 허용
  DENY: 'deny',            // 접근 거부
  REDIRECT_LOGIN: 'redirect_login',     // 로그인 페이지로 리다이렉트
  REDIRECT_UNAUTHORIZED: 'redirect_unauthorized', // 권한 없음 페이지로 리다이렉트
  WAIT_AUTH: 'wait_auth'    // 인증 완료 대기
};

/**
 * 라우트 보호 설정 인터페이스
 */
class RouteProtection {
  constructor(config = {}) {
    this.requiredPermission = config.requiredPermission || PermissionLevel.AUTHENTICATED;
    this.allowedRoles = config.allowedRoles || [];
    this.allowedGroups = config.allowedGroups || [];
    this.customValidator = config.customValidator;
    this.redirectOnFailure = config.redirectOnFailure;
    this.bypassConditions = config.bypassConditions || [];
  }
}

/**
 * 인증 가드 클래스
 */
class AuthGuard {
  constructor(config = {}) {
    this.config = {
      loginPath: '/login',
      unauthorizedPath: '/unauthorized',
      defaultRedirectPath: '/dashboard',
      sessionTimeout: 30 * 60 * 1000, // 30분
      gracePeriod: 5 * 60 * 1000,     // 5분 유예기간
      ...config
    };
    
    this.sessionManager = new SessionManager(config);
    this.oidcClient = new OIDCClient(config);
    
    // 보호된 라우트 설정 저장소
    this.protectedRoutes = new Map();
    
    // 현재 가드 상태
    this.guardState = {
      isChecking: false,
      lastCheck: null,
      failureCount: 0
    };
    
    // 이벤트 리스너들
    this.guardListeners = new Set();
    
    // 세션 상태 변경 구독
    this.sessionManager.onStateChange((newState, oldState) => {
      this.handleSessionStateChange(newState, oldState);
    });
    
    console.log('🛡️ Auth guard initialized');
  }

  /**
   * 라우트 보호 설정 등록
   * @param {string} path - 보호할 경로 (glob 패턴 지원)
   * @param {RouteProtection|Object} protection - 보호 설정
   */
  protect(path, protection) {
    const protectionConfig = protection instanceof RouteProtection 
      ? protection 
      : new RouteProtection(protection);
    
    this.protectedRoutes.set(path, protectionConfig);
    
    console.log(`🛡️ Route protected: ${path} (${protectionConfig.requiredPermission})`);
    
    return this;
  }

  /**
   * 라우트 접근 권한 확인
   * @param {string} path - 확인할 경로
   * @param {Object} context - 추가 컨텍스트 (사용자 정보 등)
   * @returns {Promise<Object>} 가드 결과
   */
  async checkAccess(path, context = {}) {
    try {
      console.log(`🛡️ Checking access for: ${path}`);
      
      this.guardState.isChecking = true;
      this.guardState.lastCheck = Date.now();
      
      // 보호 설정 찾기
      const protection = this.findProtectionForPath(path);
      
      if (!protection) {
        // 보호되지 않은 라우트는 접근 허용
        return this.createGuardResult(GuardResult.ALLOW, {
          message: 'Route is not protected'
        });
      }
      
      // 바이패스 조건 확인
      if (await this.checkBypassConditions(protection, context)) {
        return this.createGuardResult(GuardResult.ALLOW, {
          message: 'Bypass condition met'
        });
      }
      
      // 공개 라우트 확인
      if (protection.requiredPermission === PermissionLevel.PUBLIC) {
        return this.createGuardResult(GuardResult.ALLOW, {
          message: 'Public route'
        });
      }
      
      // 세션 상태 확인
      const sessionState = this.sessionManager.getState();
      const userInfo = this.sessionManager.getUserInfo();
      
      // 인증되지 않은 상태 처리
      if (sessionState === SessionState.UNAUTHENTICATED) {
        return this.createGuardResult(GuardResult.REDIRECT_LOGIN, {
          message: 'User not authenticated',
          redirectTo: this.buildLoginUrl(path)
        });
      }
      
      // 세션 만료 상태 처리
      if (sessionState === SessionState.EXPIRED) {
        return this.createGuardResult(GuardResult.REDIRECT_LOGIN, {
          message: 'Session expired',
          redirectTo: this.buildLoginUrl(path)
        });
      }
      
      // 인증 진행 중 상태 처리
      if (sessionState === SessionState.REFRESHING || sessionState === SessionState.UNKNOWN) {
        return this.createGuardResult(GuardResult.WAIT_AUTH, {
          message: 'Authentication in progress'
        });
      }
      
      // 오류 상태 처리
      if (sessionState === SessionState.ERROR) {
        return this.createGuardResult(GuardResult.REDIRECT_LOGIN, {
          message: 'Authentication error',
          redirectTo: this.buildLoginUrl(path)
        });
      }
      
      // 사용자 정보 확인
      if (!userInfo) {
        return this.createGuardResult(GuardResult.REDIRECT_LOGIN, {
          message: 'User information not available',
          redirectTo: this.buildLoginUrl(path)
        });
      }
      
      // 권한 확인
      const hasPermission = await this.checkUserPermissions(userInfo, protection, context);
      
      if (!hasPermission) {
        return this.createGuardResult(GuardResult.REDIRECT_UNAUTHORIZED, {
          message: 'Insufficient permissions',
          redirectTo: this.config.unauthorizedPath,
          requiredPermission: protection.requiredPermission,
          userRoles: userInfo.roles || [],
          userGroups: userInfo.groups || []
        });
      }
      
      // 커스텀 검증
      if (protection.customValidator) {
        const customResult = await protection.customValidator(userInfo, context, path);
        if (!customResult.allowed) {
          return this.createGuardResult(GuardResult.DENY, {
            message: customResult.reason || 'Custom validation failed',
            customResult
          });
        }
      }
      
      // 모든 검사 통과
      return this.createGuardResult(GuardResult.ALLOW, {
        message: 'Access granted',
        userInfo,
        protection
      });
      
    } catch (error) {
      console.error('❌ Access check failed:', error);
      
      return this.createGuardResult(GuardResult.DENY, {
        message: 'Access check failed',
        error: error.message
      });
      
    } finally {
      this.guardState.isChecking = false;
    }
  }

  /**
   * 경로에 대한 보호 설정 찾기
   * @param {string} path - 경로
   * @returns {RouteProtection|null} 보호 설정
   */
  findProtectionForPath(path) {
    // 정확한 매치 먼저 확인
    if (this.protectedRoutes.has(path)) {
      return this.protectedRoutes.get(path);
    }
    
    // 패턴 매치 확인 (간단한 glob 지원)
    for (const [pattern, protection] of this.protectedRoutes.entries()) {
      if (this.matchesPattern(path, pattern)) {
        return protection;
      }
    }
    
    return null;
  }

  /**
   * 경로 패턴 매칭 (간단한 glob)
   * @param {string} path - 확인할 경로
   * @param {string} pattern - 패턴
   * @returns {boolean} 매치 여부
   */
  matchesPattern(path, pattern) {
    // 와일드카드 패턴을 정규식으로 변환
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\//g, '\\/');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * 바이패스 조건 확인
   * @param {RouteProtection} protection - 보호 설정
   * @param {Object} context - 컨텍스트
   * @returns {Promise<boolean>} 바이패스 여부
   */
  async checkBypassConditions(protection, context) {
    if (!protection.bypassConditions || protection.bypassConditions.length === 0) {
      return false;
    }
    
    for (const condition of protection.bypassConditions) {
      try {
        if (typeof condition === 'function') {
          if (await condition(context)) {
            console.log('🔓 Bypass condition met');
            return true;
          }
        }
      } catch (error) {
        console.error('❌ Bypass condition check failed:', error);
      }
    }
    
    return false;
  }

  /**
   * 사용자 권한 확인
   * @param {Object} userInfo - 사용자 정보
   * @param {RouteProtection} protection - 보호 설정
   * @param {Object} context - 컨텍스트
   * @returns {Promise<boolean>} 권한 여부
   */
  async checkUserPermissions(userInfo, protection, context) {
    // 기본 권한 레벨 확인
    if (!this.hasRequiredPermissionLevel(userInfo, protection.requiredPermission)) {
      console.log(`❌ User lacks required permission level: ${protection.requiredPermission}`);
      return false;
    }
    
    // 특정 역할 확인
    if (protection.allowedRoles && protection.allowedRoles.length > 0) {
      const userRoles = userInfo.roles || [userInfo.role].filter(Boolean);
      const hasRole = protection.allowedRoles.some(role => userRoles.includes(role));
      
      if (!hasRole) {
        console.log(`❌ User lacks required roles:`, protection.allowedRoles);
        return false;
      }
    }
    
    // 특정 그룹 확인
    if (protection.allowedGroups && protection.allowedGroups.length > 0) {
      const userGroups = userInfo.groups || [];
      const hasGroup = protection.allowedGroups.some(group => userGroups.includes(group));
      
      if (!hasGroup) {
        console.log(`❌ User lacks required groups:`, protection.allowedGroups);
        return false;
      }
    }
    
    return true;
  }

  /**
   * 권한 레벨 확인
   * @param {Object} userInfo - 사용자 정보
   * @param {string} requiredLevel - 필요한 권한 레벨
   * @returns {boolean} 권한 여부
   */
  hasRequiredPermissionLevel(userInfo, requiredLevel) {
    switch (requiredLevel) {
      case PermissionLevel.PUBLIC:
        return true;
        
      case PermissionLevel.AUTHENTICATED:
        return !!userInfo;
        
      case PermissionLevel.ADMIN:
        return userInfo.is_admin || userInfo.role === 'admin' || userInfo.is_superuser;
        
      case PermissionLevel.SUPER_ADMIN:
        return userInfo.is_superuser || userInfo.role === 'super_admin';
        
      default:
        console.warn(`⚠️ Unknown permission level: ${requiredLevel}`);
        return false;
    }
  }

  /**
   * 로그인 URL 생성 (리다이렉트 포함)
   * @param {string} returnPath - 로그인 후 돌아갈 경로
   * @returns {string} 로그인 URL
   */
  buildLoginUrl(returnPath) {
    const loginUrl = new URL(this.config.loginPath, window.location.origin);
    
    if (returnPath && returnPath !== this.config.loginPath) {
      loginUrl.searchParams.set('returnUrl', returnPath);
    }
    
    return loginUrl.toString();
  }

  /**
   * 가드 결과 객체 생성
   * @param {string} result - 가드 결과
   * @param {Object} details - 세부 정보
   * @returns {Object} 가드 결과 객체
   */
  createGuardResult(result, details = {}) {
    return {
      result,
      timestamp: Date.now(),
      ...details
    };
  }

  /**
   * 세션 상태 변경 처리
   * @param {string} newState - 새 상태
   * @param {string} oldState - 이전 상태
   */
  handleSessionStateChange(newState, oldState) {
    console.log(`🛡️ Session state change detected: ${oldState} → ${newState}`);
    
    // 가드 리스너들에게 알림
    this.guardListeners.forEach(listener => {
      try {
        listener({
          type: 'session_state_change',
          newState,
          oldState,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('❌ Guard listener error:', error);
      }
    });
    
    // 세션 만료 시 추가 처리
    if (newState === SessionState.EXPIRED) {
      this.handleSessionExpired();
    }
  }

  /**
   * 세션 만료 처리
   */
  handleSessionExpired() {
    console.log('⏰ Handling session expiration in auth guard...');
    
    // 현재 경로가 로그인 페이지가 아닌 경우 리다이렉트 준비
    const currentPath = window.location.pathname;
    if (currentPath !== this.config.loginPath) {
      this.notifyGuardListeners({
        type: 'session_expired',
        currentPath,
        loginUrl: this.buildLoginUrl(currentPath),
        gracePeriod: this.config.gracePeriod
      });
    }
  }

  /**
   * 자동 리다이렉트 수행
   * @param {Object} guardResult - 가드 결과
   * @returns {boolean} 리다이렉트 수행 여부
   */
  performAutoRedirect(guardResult) {
    if (!guardResult.redirectTo) {
      return false;
    }
    
    const currentUrl = window.location.href;
    const targetUrl = guardResult.redirectTo;
    
    if (currentUrl === targetUrl) {
      console.log('🔄 Preventing redirect loop');
      return false;
    }
    
    console.log(`🔄 Redirecting to: ${targetUrl}`);
    
    // 리다이렉트 수행
    window.location.href = targetUrl;
    
    return true;
  }

  /**
   * 가드 이벤트 리스너 등록
   * @param {Function} listener - 리스너 함수
   * @returns {Function} 등록 해제 함수
   */
  onGuardEvent(listener) {
    this.guardListeners.add(listener);
    
    return () => {
      this.guardListeners.delete(listener);
    };
  }

  /**
   * 가드 리스너들에게 알림
   * @param {Object} event - 이벤트 객체
   */
  notifyGuardListeners(event) {
    this.guardListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('❌ Guard listener notification error:', error);
      }
    });
  }

  /**
   * React Hook과의 통합을 위한 헬퍼
   * @param {string} path - 확인할 경로
   * @returns {Object} 가드 상태 객체
   */
  useGuardState(path) {
    const [guardResult, setGuardResult] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    
    useEffect(() => {
      let isMounted = true;
      
      const checkAccess = async () => {
        try {
          setIsLoading(true);
          const result = await this.checkAccess(path);
          
          if (isMounted) {
            setGuardResult(result);
          }
        } catch (error) {
          console.error('❌ Guard state check failed:', error);
          if (isMounted) {
            setGuardResult(this.createGuardResult(GuardResult.DENY, {
              message: 'Guard check failed',
              error: error.message
            }));
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      };
      
      checkAccess();
      
      // 세션 상태 변경 시 재확인
      const unsubscribe = this.onGuardEvent((event) => {
        if (event.type === 'session_state_change') {
          checkAccess();
        }
      });
      
      return () => {
        isMounted = false;
        unsubscribe();
      };
    }, [path]);
    
    return { guardResult, isLoading };
  }

  // === 편의 메서드들 ===

  /**
   * 관리자 전용 라우트 보호
   * @param {string} path - 경로
   * @returns {AuthGuard} 체이닝을 위한 this
   */
  protectAdmin(path) {
    return this.protect(path, {
      requiredPermission: PermissionLevel.ADMIN
    });
  }

  /**
   * 인증된 사용자 전용 라우트 보호
   * @param {string} path - 경로
   * @returns {AuthGuard} 체이닝을 위한 this
   */
  protectAuthenticated(path) {
    return this.protect(path, {
      requiredPermission: PermissionLevel.AUTHENTICATED
    });
  }

  /**
   * 역할 기반 라우트 보호
   * @param {string} path - 경로
   * @param {string[]} roles - 허용된 역할
   * @returns {AuthGuard} 체이닝을 위한 this
   */
  protectRoles(path, roles) {
    return this.protect(path, {
      requiredPermission: PermissionLevel.AUTHENTICATED,
      allowedRoles: roles
    });
  }

  /**
   * 그룹 기반 라우트 보호
   * @param {string} path - 경로
   * @param {string[]} groups - 허용된 그룹
   * @returns {AuthGuard} 체이닝을 위한 this
   */
  protectGroups(path, groups) {
    return this.protect(path, {
      requiredPermission: PermissionLevel.AUTHENTICATED,
      allowedGroups: groups
    });
  }

  /**
   * 인증 가드 정리
   */
  destroy() {
    console.log('🗑️ Destroying auth guard...');
    
    this.guardListeners.clear();
    this.protectedRoutes.clear();
    
    if (this.sessionManager) {
      this.sessionManager.destroy();
    }
    
    console.log('✅ Auth guard destroyed');
  }

  /**
   * 디버깅 정보
   * @returns {Object} 디버깅 정보
   */
  getDebugInfo() {
    return {
      config: this.config,
      protectedRouteCount: this.protectedRoutes.size,
      protectedRoutes: Array.from(this.protectedRoutes.keys()),
      guardState: this.guardState,
      listenerCount: this.guardListeners.size,
      sessionManager: this.sessionManager?.getDebugInfo()
    };
  }
}

export default AuthGuard;
export { PermissionLevel, GuardResult, RouteProtection };