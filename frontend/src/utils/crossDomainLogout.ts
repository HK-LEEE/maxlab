/**
 * 🚫 SIMPLIFIED: 크로스 도메인 로그아웃 관리
 * max.dwchem.co.kr에서 로그아웃 시 maxlab.dwchem.co.kr도 자동 로그아웃
 */

import { devLog } from './logger';
import { oauthRequestCoordinator } from '../services/oauthRequestCoordinator';

const LOGOUT_EVENT_KEY = 'max_platform_logout';
// DISABLED: Periodic logout checks to prevent aggressive detection
// const LOGOUT_CHECK_INTERVAL = 60000;  // Increased to 60 seconds if needed

export class CrossDomainLogoutManager {
  private static instance: CrossDomainLogoutManager;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastLogoutTime: number = 0;
  private logoutCount: number = 0;
  private logoutCountResetTime: number = 0;
  private readonly MAX_LOGOUTS_PER_MINUTE = 3;

  private constructor() {}

  static getInstance(): CrossDomainLogoutManager {
    if (!CrossDomainLogoutManager.instance) {
      CrossDomainLogoutManager.instance = new CrossDomainLogoutManager();
    }
    return CrossDomainLogoutManager.instance;
  }

  /**
   * 로그아웃 감지 시작
   */
  startListening(onLogoutDetected: () => void) {
    devLog.info('🔒 Starting cross-domain logout listener');

    // 1. Storage Event 리스너 (같은 도메인 내 다른 탭)
    window.addEventListener('storage', async (e) => {
      // 🚫 ENHANCED: 더 많은 키 체크
      if (e.key === LOGOUT_EVENT_KEY && e.newValue) {
        const logoutTime = parseInt(e.newValue, 10);
        if (logoutTime > this.lastLogoutTime) {
          devLog.warn('🚨 Logout detected from another tab');
          this.lastLogoutTime = logoutTime;
          this.handleLogout(onLogoutDetected);
        }
      }
      
      // accessToken이 제거되면 로그아웃으로 간주 - BUT check for auth operations first
      if (e.key === 'accessToken' && !e.newValue) {
        // Check if any authentication operation is in progress
        if (oauthRequestCoordinator.hasActiveSilentAuth() || 
            oauthRequestCoordinator.hasActiveAuthOperation()) {
          devLog.info('🔇 Access token removed during auth operation, ignoring');
          return;
        }
        
        // Check if OAuth flow or token refresh is in progress
        const isAuthInProgress = (
          sessionStorage.getItem('oauth_flow_in_progress') ||
          sessionStorage.getItem('oauth_callback_processing') ||
          sessionStorage.getItem('sso_refresh_return_url') ||
          document.body.getAttribute('data-oauth-processing')
        );
        
        if (isAuthInProgress) {
          devLog.info('🔇 Access token removed during OAuth/SSO flow, ignoring');
          return;
        }
        
        devLog.warn('🚨 Access token removed - logout detected');
        this.handleLogout(onLogoutDetected);
      }
      
      // user 정보가 제거되면 로그아웃으로 간주 - BUT check for auth operations first
      if (e.key === 'user' && !e.newValue) {
        // Check if any authentication operation is in progress
        if (oauthRequestCoordinator.hasActiveSilentAuth() || 
            oauthRequestCoordinator.hasActiveAuthOperation()) {
          devLog.info('🔇 User data removed during auth operation, ignoring');
          return;
        }
        
        // Check if OAuth flow or token refresh is in progress
        const isAuthInProgress = (
          sessionStorage.getItem('oauth_flow_in_progress') ||
          sessionStorage.getItem('oauth_callback_processing') ||
          sessionStorage.getItem('sso_refresh_return_url') ||
          document.body.getAttribute('data-oauth-processing')
        );
        
        if (isAuthInProgress) {
          devLog.info('🔇 User data removed during OAuth/SSO flow, ignoring');
          return;
        }
        
        devLog.warn('🚨 User data removed - logout detected');
        this.handleLogout(onLogoutDetected);
      }
    });

    // 2. DISABLED: Periodic session checks to prevent aggressive logout
    // Uncomment if periodic checks are needed (with longer interval)
    /*
    this.checkInterval = setInterval(async () => {
      // Only check MAX Platform session, not local token
      await this.checkMaxPlatformSession(onLogoutDetected);
    }, 60000); // Check every minute instead of 5 seconds
    */

    // 3. BroadcastChannel API (동일 origin만 지원) - FIXED: 전용 채널 사용
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('maxlab_cross_domain_logout');
      channel.onmessage = async (event) => {
        if (event.data.type === 'logout' || event.data.type === 'LOGOUT') {
          // Check if silent authentication is in progress
          if (oauthRequestCoordinator.hasActiveSilentAuth()) {
            devLog.info('🔇 Logout broadcast received during silent auth, ignoring');
            return;
          }
          devLog.warn('🚨 Cross-domain logout broadcast received');
          this.handleLogout(onLogoutDetected);
        }
      };
      
      // MAX Platform 채널도 수신 (외부 시스템과의 호환성)
      const maxPlatformChannel = new BroadcastChannel('max_platform_auth');
      maxPlatformChannel.onmessage = async (event) => {
        if (event.data.type === 'logout') {
          // Check if silent authentication is in progress
          if (oauthRequestCoordinator.hasActiveSilentAuth()) {
            devLog.info('🔇 MAX Platform logout broadcast received during silent auth, ignoring');
            return;
          }
          devLog.warn('🚨 MAX Platform logout broadcast received');
          this.handleLogout(onLogoutDetected);
        }
      };
    }

    // 4. PostMessage를 통한 크로스 도메인 통신
    window.addEventListener('message', async (event) => {
      // max.dwchem.co.kr에서만 메시지 수신
      // Original hardcoded: event.origin === 'https://max.dwchem.co.kr'
      if (event.origin === import.meta.env.VITE_AUTH_SERVER_URL && event.data?.type === 'logout') {
        // Check if silent authentication is in progress
        if (oauthRequestCoordinator.hasActiveSilentAuth()) {
          devLog.info('🔇 Cross-domain logout message received during silent auth, ignoring');
          return;
        }
        devLog.warn('🚨 Cross-domain logout message received');
        this.handleLogout(onLogoutDetected);
      }
    });

    // 5. DISABLED: Page focus check - too aggressive
    // Only check on focus if explicitly needed
    /*
    window.addEventListener('focus', async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        devLog.warn('🚨 No token on focus - logout detected');
        this.handleLogout(onLogoutDetected);
      }
    });
    */

    // 6. DISABLED: Visibility change check - too aggressive
    // Only check visibility if explicitly needed
    /*
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          devLog.warn('🚨 No token on visibility change - logout detected');
          this.handleLogout(onLogoutDetected);
        }
      }
    });
    */
  }

  /**
   * 로그아웃 감지 중지
   */
  stopListening() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    devLog.info('🔒 Stopped cross-domain logout listener');
  }

  /**
   * MAX Platform 세션 체크
   */
  private async checkMaxPlatformSession(onLogoutDetected: () => void) {
    try {
      // OAuth userinfo 엔드포인트를 통해 세션 확인
      const token = localStorage.getItem('accessToken');
      if (!token) {
        // 토큰이 없으면 이미 로그아웃 상태
        return;
      }

      // Original hardcoded: process.env.NODE_ENV === 'production' ? 'https://max.dwchem.co.kr' : 'http://localhost:3000'
      const maxPlatformUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';

      const response = await fetch(`${maxPlatformUrl}/api/oauth/userinfo`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include'
      });

      if (response.status === 401) {
        // 인증 실패 = 로그아웃됨
        devLog.warn('🚨 MAX Platform session expired or logged out - forcing logout');
        this.handleLogout(onLogoutDetected);
      } else if (response.status === 200) {
        // 🔥 Fallback: Check if the user from MAX Platform matches our local user
        try {
          const maxPlatformUser = await response.json();
          const localUser = JSON.parse(localStorage.getItem('user') || '{}');
          
          // If users don't match or MAX Platform has no user, logout
          if (!maxPlatformUser || !maxPlatformUser.email || 
              (localUser.email && localUser.email !== maxPlatformUser.email)) {
            devLog.warn('🚨 User mismatch detected - MAX Platform user changed');
            this.handleLogout(onLogoutDetected);
          }
        } catch (e) {
          devLog.debug('Could not compare users:', e);
        }
      }
    } catch (error) {
      // 네트워크 오류는 무시 (오프라인 등)
      devLog.debug('Session check failed:', error);
    }
  }

  /**
   * 로그아웃 처리
   */
  private async handleLogout(onLogoutDetected: () => void) {
    devLog.warn('🔒 Executing cross-domain logout cleanup');
    
    const now = Date.now();
    
    // 🔥 1초 쿨다운으로 감소 (기존 5000ms에서)
    if (now - this.lastLogoutTime < 1000) {
      devLog.debug('🔄 Logout cooldown active, ignoring duplicate logout');
      return;
    }
    
    // Circuit Breaker: 1분당 최대 3회 로그아웃만 허용
    if (now - this.logoutCountResetTime > 60000) {
      this.logoutCount = 0;
      this.logoutCountResetTime = now;
    }
    
    if (this.logoutCount >= this.MAX_LOGOUTS_PER_MINUTE) {
      devLog.warn('🚫 Circuit breaker: Too many logout attempts, stopping');
      return;
    }
    
    // 🔒 CRITICAL: Check if silent authentication is in progress
    if (oauthRequestCoordinator.hasActiveSilentAuth()) {
      devLog.warn('🚫 Silent authentication in progress, deferring logout');
      // Wait for auth operations to complete before allowing logout
      await oauthRequestCoordinator.waitForAuthOperations(5000);
      
      // After waiting, check again if we still need to logout
      const token = localStorage.getItem('accessToken');
      if (token) {
        devLog.info('✅ Token exists after silent auth, canceling logout');
        return;
      }
    }
    
    this.logoutCount++;
    this.lastLogoutTime = now;
    
    // 모든 스토리지 클리어
    this.clearAllStorage();
    
    // 다른 탭에도 로그아웃 브로드캐스트 (FIXED: 고유한 채널명 사용)
    if ('BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel('maxlab_cross_domain_logout');
        channel.postMessage({ type: 'LOGOUT', reason: 'cross_domain_logout' });
        channel.close();
        devLog.info('📡 Logout broadcast sent on dedicated channel');
      } catch (e) {
        devLog.error('Failed to broadcast logout:', e);
      }
    }
    
    // localStorage 이벤트로도 전파
    try {
      localStorage.setItem(LOGOUT_EVENT_KEY, now.toString());
    } catch (e) {
      devLog.error('Failed to set logout event:', e);
    }
    
    // 콜백 실행 (앱 상태 리셋)
    onLogoutDetected();
  }

  /**
   * 모든 브라우저 스토리지 클리어
   */
  private clearAllStorage() {
    // localStorage 클리어
    try {
      localStorage.clear();
      devLog.info('✅ localStorage cleared');
    } catch (e) {
      devLog.error('Failed to clear localStorage:', e);
    }

    // sessionStorage 클리어
    try {
      sessionStorage.clear();
      devLog.info('✅ sessionStorage cleared');
    } catch (e) {
      devLog.error('Failed to clear sessionStorage:', e);
    }

    // IndexedDB 클리어
    if ('indexedDB' in window) {
      indexedDB.databases().then(databases => {
        databases.forEach(db => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
            devLog.info(`✅ IndexedDB ${db.name} cleared`);
          }
        });
      }).catch(e => {
        devLog.error('Failed to clear IndexedDB:', e);
      });
    }

    // 쿠키 클리어 (including .dwchem.co.kr domain)
    const cookiesToClear = [
      'access_token',
      'session_id', 
      'session_token',
      'user_id',
      'refresh_token'
    ];
    
    const isProduction = window.location.hostname.includes('dwchem.co.kr');
    
    cookiesToClear.forEach(cookieName => {
      // Clear for current domain (works on localhost and production)
      document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;`;
      
      // Only set domain cookies in production
      if (isProduction) {
        // Clear for .dwchem.co.kr domain (important for cross-domain SSO)
        document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.dwchem.co.kr;`;
        
        // Clear for specific subdomains
        // Original hardcoded: domain=maxlab.dwchem.co.kr; domain=max.dwchem.co.kr;
        const maxLabDomain = new URL(import.meta.env.VITE_API_BASE_URL || 'https://maxlab.dwchem.co.kr').hostname;
        const maxPlatformDomain = new URL(import.meta.env.VITE_AUTH_SERVER_URL || 'https://max.dwchem.co.kr').hostname;
        document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=${maxLabDomain};`;
        document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=${maxPlatformDomain};`;
      }
    });
    
    // Also clear any other cookies that might exist
    document.cookie.split(";").forEach(c => {
      const eqPos = c.indexOf("=");
      const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
      if (name && !cookiesToClear.includes(name)) {
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;`;
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.dwchem.co.kr;`;
      }
    });
    
    devLog.info('✅ Cookies cleared for .dwchem.co.kr domain');

    // Service Worker 캐시 클리어
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
          devLog.info(`✅ Cache ${name} cleared`);
        });
      }).catch(e => {
        devLog.error('Failed to clear caches:', e);
      });
    }
  }

  /**
   * 로그아웃 이벤트 브로드캐스트 (max.dwchem.co.kr에서 호출)
   */
  broadcastLogout() {
    const logoutTime = Date.now();
    
    // 1. localStorage에 로그아웃 시간 저장 (같은 도메인 다른 탭)
    localStorage.setItem(LOGOUT_EVENT_KEY, logoutTime.toString());
    
    // 2. BroadcastChannel로 전송 (같은 origin)
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('max_platform_auth');
      channel.postMessage({ type: 'logout', time: logoutTime });
    }

    // 3. iframe을 통한 크로스 도메인 통신 (maxlab에 iframe이 있는 경우)
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'logout', time: logoutTime },
          // Original hardcoded: 'https://maxlab.dwchem.co.kr'
          import.meta.env.VITE_API_BASE_URL || 'https://maxlab.dwchem.co.kr'
        );
      }
    });

    devLog.info('🔒 Logout broadcast sent');
  }
}

export const crossDomainLogout = CrossDomainLogoutManager.getInstance();