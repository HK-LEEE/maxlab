/**
 * 🚫 SIMPLIFIED: 크로스 도메인 로그아웃 관리
 * max.dwchem.co.kr에서 로그아웃 시 maxlab.dwchem.co.kr도 자동 로그아웃
 */

import { devLog } from './logger';

const LOGOUT_EVENT_KEY = 'max_platform_logout';
const LOGOUT_CHECK_INTERVAL = 1000; // 1초마다 체크

export class CrossDomainLogoutManager {
  private static instance: CrossDomainLogoutManager;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastLogoutTime: number = 0;

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
    window.addEventListener('storage', (e) => {
      if (e.key === LOGOUT_EVENT_KEY && e.newValue) {
        const logoutTime = parseInt(e.newValue, 10);
        if (logoutTime > this.lastLogoutTime) {
          devLog.warn('🚨 Logout detected from another tab');
          this.lastLogoutTime = logoutTime;
          this.handleLogout(onLogoutDetected);
        }
      }
    });

    // 2. 주기적으로 max.dwchem.co.kr의 로그아웃 상태 체크
    // Cookie나 특정 엔드포인트를 통해 확인
    this.checkInterval = setInterval(async () => {
      await this.checkMaxPlatformSession(onLogoutDetected);
    }, LOGOUT_CHECK_INTERVAL);

    // 3. BroadcastChannel API (동일 origin만 지원)
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('max_platform_auth');
      channel.onmessage = (event) => {
        if (event.data.type === 'logout') {
          devLog.warn('🚨 Logout broadcast received');
          this.handleLogout(onLogoutDetected);
        }
      };
    }

    // 4. PostMessage를 통한 크로스 도메인 통신
    window.addEventListener('message', (event) => {
      // max.dwchem.co.kr에서만 메시지 수신
      if (event.origin === 'https://max.dwchem.co.kr' && event.data?.type === 'logout') {
        devLog.warn('🚨 Cross-domain logout message received');
        this.handleLogout(onLogoutDetected);
      }
    });
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

      const response = await fetch('https://max.dwchem.co.kr/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include'
      });

      if (response.status === 401) {
        // 인증 실패 = 로그아웃됨
        devLog.warn('🚨 MAX Platform session expired or logged out');
        this.handleLogout(onLogoutDetected);
      }
    } catch (error) {
      // 네트워크 오류는 무시 (오프라인 등)
      devLog.debug('Session check failed:', error);
    }
  }

  /**
   * 로그아웃 처리
   */
  private handleLogout(onLogoutDetected: () => void) {
    devLog.warn('🔒 Executing cross-domain logout cleanup');
    
    // 모든 스토리지 클리어
    this.clearAllStorage();
    
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

    // 쿠키 클리어 (같은 도메인만 가능)
    document.cookie.split(";").forEach(c => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    devLog.info('✅ Cookies cleared');

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
          'https://maxlab.dwchem.co.kr'
        );
      }
    });

    devLog.info('🔒 Logout broadcast sent');
  }
}

export const crossDomainLogout = CrossDomainLogoutManager.getInstance();