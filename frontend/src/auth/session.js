/**
 * 세션 관리자 - SSO 세션 관리 및 동기화
 * 
 * 기능:
 * - Single Sign-On (SSO) 세션 관리
 * - Cross-tab 세션 동기화
 * - 세션 만료 관리
 * - Remember Me 기능
 * - Silent logout/login 처리
 */

import TokenManager from './token-manager.js';
import OIDCClient from './oidc-client.js';

/**
 * 세션 상태 열거형
 */
export const SessionState = {
  UNKNOWN: 'unknown',          // 세션 상태 알 수 없음
  UNAUTHENTICATED: 'unauthenticated',  // 인증되지 않음
  AUTHENTICATED: 'authenticated',      // 인증됨
  EXPIRED: 'expired',          // 세션 만료
  REFRESHING: 'refreshing',    // 토큰 갱신 중
  ERROR: 'error'               // 오류 상태
};

/**
 * 세션 관리자 클래스
 */
class SessionManager {
  constructor(config = {}) {
    this.config = {
      sessionTimeout: 30 * 60 * 1000,     // 30분 (밀리초)
      refreshThreshold: 5 * 60 * 1000,    // 5분 전 갱신
      rememberMeDuration: 30 * 24 * 60 * 60 * 1000, // 30일
      crossTabSync: true,
      silentRenewal: true,
      ...config
    };
    
    this.tokenManager = new TokenManager();
    this.oidcClient = new OIDCClient(config);
    
    this.currentState = SessionState.UNKNOWN;
    this.userInfo = null;
    this.sessionMetadata = null;
    
    // 이벤트 리스너들
    this.stateChangeListeners = new Set();
    this.sessionListeners = new Set();
    
    // 세션 타이머들
    this.sessionTimer = null;
    this.renewalTimer = null;
    this.heartbeatTimer = null;
    
    // Cross-tab 동기화
    if (this.config.crossTabSync) {
      this.setupCrossTabSync();
    }
    
    // 초기화
    this.initialize();
    
    console.log('🔐 Session manager initialized');
  }

  /**
   * 세션 관리자 초기화
   */
  async initialize() {
    try {
      // 저장된 세션 정보 복구 시도
      await this.recoverSession();
      
      // 세션 상태 확인
      await this.validateCurrentSession();
      
      // 자동 갱신 타이머 시작
      if (this.config.silentRenewal) {
        this.startRenewalTimer();
      }
      
      // 세션 heartbeat 시작
      this.startHeartbeat();
      
      console.log('✅ Session manager ready, state:', this.currentState);
      
    } catch (error) {
      console.error('❌ Session initialization failed:', error);
      this.setState(SessionState.ERROR);
    }
  }

  /**
   * 로그인 처리
   * @param {Object} authResult - 인증 결과 (토큰, 사용자 정보 등)
   * @param {boolean} rememberMe - Remember Me 옵션
   * @returns {Promise<void>}
   */
  async login(authResult, rememberMe = false) {
    try {
      console.log('🔐 Processing login...');
      
      // 토큰 저장
      if (authResult.tokens) {
        await this.tokenManager.setTokens(authResult.tokens);
      }
      
      // 사용자 정보 저장
      this.userInfo = authResult.userInfo || authResult.user;
      
      // 세션 메타데이터 설정
      this.sessionMetadata = {
        loginTime: Date.now(),
        lastActivity: Date.now(),
        rememberMe: rememberMe,
        loginMethod: authResult.loginMethod || 'oauth',
        expiresAt: rememberMe 
          ? Date.now() + this.config.rememberMeDuration
          : Date.now() + this.config.sessionTimeout,
        ipAddress: await this.getClientIP(),
        userAgent: navigator.userAgent
      };
      
      // 세션 데이터 지속성 저장
      this.persistSession();
      
      // 상태 변경
      this.setState(SessionState.AUTHENTICATED);
      
      // 세션 타이머 시작
      this.startSessionTimer();
      
      // Cross-tab 동기화
      this.broadcastSessionChange('login', {
        userInfo: this.userInfo,
        sessionMetadata: this.sessionMetadata
      });
      
      console.log('✅ Login processed successfully');
      
    } catch (error) {
      console.error('❌ Login processing failed:', error);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * 로그아웃 처리
   * @param {boolean} globalLogout - 전역 로그아웃 (모든 탭/창)
   * @returns {Promise<void>}
   */
  async logout(globalLogout = true) {
    try {
      console.log('🔓 Processing logout...');
      
      const accessToken = this.tokenManager.getAccessToken();
      const refreshToken = this.tokenManager.getRefreshToken();
      
      // OIDC 로그아웃
      if (accessToken) {
        try {
          await this.oidcClient.logout(accessToken, refreshToken);
        } catch (error) {
          console.warn('⚠️ OIDC logout failed:', error);
        }
      }
      
      // 세션 데이터 정리
      this.clearSessionData();
      
      // 상태 변경
      this.setState(SessionState.UNAUTHENTICATED);
      
      // Cross-tab 동기화 (전역 로그아웃인 경우)
      if (globalLogout) {
        this.broadcastSessionChange('logout');
      }
      
      console.log('✅ Logout completed');
      
    } catch (error) {
      console.error('❌ Logout processing failed:', error);
      
      // 오류가 발생해도 로컬 데이터는 정리
      this.clearSessionData();
      this.setState(SessionState.UNAUTHENTICATED);
      
      throw new Error(`Logout failed: ${error.message}`);
    }
  }

  /**
   * 세션 유효성 검증
   * @returns {Promise<boolean>} 유효성 여부
   */
  async validateCurrentSession() {
    try {
      // 토큰 유효성 확인
      const accessToken = this.tokenManager.getAccessToken();
      if (!accessToken) {
        this.setState(SessionState.UNAUTHENTICATED);
        return false;
      }
      
      // 세션 메타데이터 확인
      if (!this.sessionMetadata) {
        this.setState(SessionState.UNAUTHENTICATED);
        return false;
      }
      
      // 세션 만료 확인
      if (Date.now() >= this.sessionMetadata.expiresAt) {
        console.log('⏰ Session expired');
        await this.handleSessionExpired();
        return false;
      }
      
      // 사용자 정보 검증 (서버와 동기화)
      try {
        const serverUserInfo = await this.oidcClient.getUserInfo(accessToken);
        
        // 기본 사용자 정보 일치 확인
        if (this.userInfo?.sub !== serverUserInfo?.sub) {
          console.warn('⚠️ User info mismatch detected');
          await this.logout();
          return false;
        }
        
        // 사용자 정보 업데이트
        this.userInfo = { ...this.userInfo, ...serverUserInfo };
        
      } catch (error) {
        console.error('❌ User info validation failed:', error);
        
        // 401/403 오류인 경우 세션 무효
        if (error.status === 401 || error.status === 403) {
          await this.logout();
          return false;
        }
      }
      
      // 활동 시간 업데이트
      this.updateLastActivity();
      
      this.setState(SessionState.AUTHENTICATED);
      return true;
      
    } catch (error) {
      console.error('❌ Session validation failed:', error);
      this.setState(SessionState.ERROR);
      return false;
    }
  }

  /**
   * Silent 토큰 갱신
   * @returns {Promise<boolean>} 갱신 성공 여부
   */
  async renewTokensSilently() {
    if (this.currentState === SessionState.REFRESHING) {
      console.log('🔄 Token renewal already in progress');
      return false;
    }
    
    try {
      console.log('🔄 Starting silent token renewal...');
      this.setState(SessionState.REFRESHING);
      
      // 먼저 Refresh Token으로 갱신 시도
      const refreshToken = this.tokenManager.getRefreshToken();
      if (refreshToken) {
        try {
          const newTokens = await this.oidcClient.refreshTokens(refreshToken);
          await this.tokenManager.setTokens(newTokens);
          
          console.log('✅ Token renewal successful (refresh token)');
          this.setState(SessionState.AUTHENTICATED);
          this.updateLastActivity();
          return true;
          
        } catch (error) {
          console.warn('⚠️ Refresh token renewal failed:', error);
        }
      }
      
      // Refresh Token 실패 시 Silent Authentication 시도
      try {
        const silentResult = await this.oidcClient.attemptSilentAuthentication();
        if (silentResult && silentResult.access_token) {
          await this.tokenManager.setTokens(silentResult);
          
          console.log('✅ Token renewal successful (silent auth)');
          this.setState(SessionState.AUTHENTICATED);
          this.updateLastActivity();
          return true;
        }
      } catch (error) {
        console.warn('⚠️ Silent authentication failed:', error);
      }
      
      console.log('❌ All token renewal methods failed');
      this.setState(SessionState.EXPIRED);
      return false;
      
    } catch (error) {
      console.error('❌ Silent token renewal failed:', error);
      this.setState(SessionState.ERROR);
      return false;
    }
  }

  /**
   * 세션 만료 처리
   */
  async handleSessionExpired() {
    console.log('⏰ Handling session expiration...');
    
    // Silent 갱신 시도
    const renewed = await this.renewTokensSilently();
    
    if (!renewed) {
      // 갱신 실패 시 로그아웃
      this.setState(SessionState.EXPIRED);
      
      // 사용자에게 알림
      this.notifySessionExpired();
      
      // 일정 시간 후 로그아웃
      setTimeout(() => {
        this.logout();
      }, 30000); // 30초 후
    }
  }

  /**
   * 활동 시간 업데이트
   */
  updateLastActivity() {
    if (this.sessionMetadata) {
      this.sessionMetadata.lastActivity = Date.now();
      this.persistSession();
    }
  }

  /**
   * 세션 상태 변경
   * @param {string} newState - 새로운 상태
   */
  setState(newState) {
    if (this.currentState !== newState) {
      const oldState = this.currentState;
      this.currentState = newState;
      
      console.log(`🔄 Session state changed: ${oldState} → ${newState}`);
      
      // 상태 변경 리스너들에게 알림
      this.stateChangeListeners.forEach(listener => {
        try {
          listener(newState, oldState);
        } catch (error) {
          console.error('❌ State change listener error:', error);
        }
      });
    }
  }

  /**
   * 세션 지속성 저장
   */
  persistSession() {
    try {
      if (this.sessionMetadata && this.userInfo) {
        const sessionData = {
          userInfo: this.userInfo,
          metadata: this.sessionMetadata,
          timestamp: Date.now()
        };
        
        // Remember Me 옵션에 따라 저장소 선택
        const storage = this.sessionMetadata.rememberMe ? localStorage : sessionStorage;
        storage.setItem('maxlab_session', JSON.stringify(sessionData));
        
        console.log('💾 Session persisted');
      }
    } catch (error) {
      console.error('❌ Failed to persist session:', error);
    }
  }

  /**
   * 저장된 세션 복구
   */
  async recoverSession() {
    try {
      // localStorage와 sessionStorage에서 모두 확인
      let sessionData = null;
      
      const localData = localStorage.getItem('maxlab_session');
      const sessionDataLocal = sessionStorage.getItem('maxlab_session');
      
      if (localData) {
        sessionData = JSON.parse(localData);
      } else if (sessionDataLocal) {
        sessionData = JSON.parse(sessionDataLocal);
      }
      
      if (sessionData && sessionData.userInfo && sessionData.metadata) {
        // 세션 만료 확인
        if (Date.now() < sessionData.metadata.expiresAt) {
          this.userInfo = sessionData.userInfo;
          this.sessionMetadata = sessionData.metadata;
          
          console.log('🔄 Session recovered from storage');
          return true;
        } else {
          console.log('⏰ Stored session expired, removing...');
          this.clearPersistedSession();
        }
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ Session recovery failed:', error);
      this.clearPersistedSession();
      return false;
    }
  }

  /**
   * 지속된 세션 데이터 정리
   */
  clearPersistedSession() {
    localStorage.removeItem('maxlab_session');
    sessionStorage.removeItem('maxlab_session');
  }

  /**
   * 세션 데이터 전체 정리
   */
  clearSessionData() {
    // 토큰 정리
    this.tokenManager.clearTokens();
    
    // 세션 정보 정리
    this.userInfo = null;
    this.sessionMetadata = null;
    
    // 지속된 세션 데이터 정리
    this.clearPersistedSession();
    
    // 타이머 정리
    this.clearAllTimers();
    
    console.log('🗑️ Session data cleared');
  }

  /**
   * 세션 타이머 시작
   */
  startSessionTimer() {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }
    
    if (!this.sessionMetadata) {
      return;
    }
    
    const timeToExpiry = this.sessionMetadata.expiresAt - Date.now();
    
    if (timeToExpiry > 0) {
      this.sessionTimer = setTimeout(() => {
        this.handleSessionExpired();
      }, timeToExpiry);
      
      console.log(`⏰ Session timer set for ${Math.round(timeToExpiry / 1000 / 60)} minutes`);
    }
  }

  /**
   * 토큰 갱신 타이머 시작
   */
  startRenewalTimer() {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
    }
    
    const checkInterval = 60 * 1000; // 1분마다 확인
    
    this.renewalTimer = setInterval(async () => {
      if (this.currentState === SessionState.AUTHENTICATED) {
        const accessToken = this.tokenManager.getAccessToken();
        if (accessToken && this.tokenManager.isAccessTokenExpiring()) {
          console.log('⏰ Access token expiring, attempting renewal...');
          await this.renewTokensSilently();
        }
      }
    }, checkInterval);
    
    console.log('⏰ Renewal timer started');
  }

  /**
   * 세션 heartbeat 시작
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    const heartbeatInterval = 5 * 60 * 1000; // 5분마다
    
    this.heartbeatTimer = setInterval(() => {
      if (this.currentState === SessionState.AUTHENTICATED) {
        // 활동 시간 업데이트 및 세션 유효성 확인
        this.updateLastActivity();
        this.validateCurrentSession();
      }
    }, heartbeatInterval);
    
    console.log('💓 Heartbeat started');
  }

  /**
   * 모든 타이머 정리
   */
  clearAllTimers() {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
    
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
      this.renewalTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Cross-tab 동기화 설정
   */
  setupCrossTabSync() {
    // Storage 이벤트 리스너 (다른 탭에서의 변경 감지)
    window.addEventListener('storage', (event) => {
      if (event.key === 'maxlab_session_sync') {
        try {
          const syncData = JSON.parse(event.newValue);
          this.handleCrossTabSync(syncData);
        } catch (error) {
          console.error('❌ Cross-tab sync error:', error);
        }
      }
    });
    
    // BroadcastChannel 사용 (지원하는 경우)
    if ('BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('maxlab_session');
      this.broadcastChannel.onmessage = (event) => {
        this.handleCrossTabSync(event.data);
      };
    }
    
    console.log('🔄 Cross-tab sync enabled');
  }

  /**
   * 세션 변경 브로드캐스트
   * @param {string} action - 액션 ('login', 'logout', 'refresh' 등)
   * @param {Object} data - 추가 데이터
   */
  broadcastSessionChange(action, data = {}) {
    if (!this.config.crossTabSync) {
      return;
    }
    
    const syncMessage = {
      action,
      timestamp: Date.now(),
      tabId: this.getTabId(),
      ...data
    };
    
    // BroadcastChannel 사용
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(syncMessage);
    }
    
    // Storage 이벤트 사용 (fallback)
    localStorage.setItem('maxlab_session_sync', JSON.stringify(syncMessage));
    localStorage.removeItem('maxlab_session_sync'); // 즉시 제거하여 이벤트 트리거
  }

  /**
   * Cross-tab 동기화 메시지 처리
   * @param {Object} syncData - 동기화 데이터
   */
  async handleCrossTabSync(syncData) {
    if (syncData.tabId === this.getTabId()) {
      return; // 자신이 발송한 메시지는 무시
    }
    
    console.log('🔄 Cross-tab sync received:', syncData.action);
    
    switch (syncData.action) {
      case 'login':
        if (syncData.userInfo && syncData.sessionMetadata) {
          this.userInfo = syncData.userInfo;
          this.sessionMetadata = syncData.sessionMetadata;
          this.setState(SessionState.AUTHENTICATED);
          this.startSessionTimer();
        }
        break;
        
      case 'logout':
        await this.logout(false); // 로컬 로그아웃만 수행
        break;
        
      case 'refresh':
        // 다른 탭에서 토큰이 갱신되었으므로 세션 상태 재확인
        await this.validateCurrentSession();
        break;
    }
  }

  /**
   * 세션 만료 알림
   */
  notifySessionExpired() {
    // 커스텀 이벤트 발송
    window.dispatchEvent(new CustomEvent('session:expired', {
      detail: {
        userInfo: this.userInfo,
        sessionMetadata: this.sessionMetadata
      }
    }));
    
    console.log('📢 Session expiration notification sent');
  }

  /**
   * 상태 변경 리스너 등록
   * @param {Function} listener - 리스너 함수
   * @returns {Function} 등록 해제 함수
   */
  onStateChange(listener) {
    this.stateChangeListeners.add(listener);
    
    return () => {
      this.stateChangeListeners.delete(listener);
    };
  }

  /**
   * 클라이언트 IP 주소 조회 (추정)
   * @returns {Promise<string>} IP 주소
   */
  async getClientIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * 탭 ID 생성/조회
   * @returns {string} 탭 고유 ID
   */
  getTabId() {
    if (!this.tabId) {
      this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return this.tabId;
  }

  // === 공개 API ===

  /**
   * 현재 세션 상태 조회
   * @returns {string} 세션 상태
   */
  getState() {
    return this.currentState;
  }

  /**
   * 사용자 정보 조회
   * @returns {Object|null} 사용자 정보
   */
  getUserInfo() {
    return this.userInfo;
  }

  /**
   * 세션 메타데이터 조회
   * @returns {Object|null} 세션 메타데이터
   */
  getSessionMetadata() {
    return this.sessionMetadata;
  }

  /**
   * 인증 상태 확인
   * @returns {boolean} 인증 여부
   */
  isAuthenticated() {
    return this.currentState === SessionState.AUTHENTICATED;
  }

  /**
   * 세션 만료까지 남은 시간 (초)
   * @returns {number} 남은 시간
   */
  getTimeToExpiry() {
    if (!this.sessionMetadata || !this.sessionMetadata.expiresAt) {
      return 0;
    }
    
    return Math.max(0, Math.floor((this.sessionMetadata.expiresAt - Date.now()) / 1000));
  }

  /**
   * 세션 관리자 정리
   */
  destroy() {
    console.log('🗑️ Destroying session manager...');
    
    this.clearAllTimers();
    this.stateChangeListeners.clear();
    this.sessionListeners.clear();
    
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
    
    if (this.tokenManager) {
      this.tokenManager.destroy();
    }
    
    console.log('✅ Session manager destroyed');
  }

  /**
   * 디버깅 정보
   * @returns {Object} 디버깅 정보
   */
  getDebugInfo() {
    return {
      state: this.currentState,
      hasUserInfo: !!this.userInfo,
      hasSessionMetadata: !!this.sessionMetadata,
      timeToExpiry: this.getTimeToExpiry(),
      timers: {
        session: !!this.sessionTimer,
        renewal: !!this.renewalTimer,
        heartbeat: !!this.heartbeatTimer
      },
      crossTabSync: this.config.crossTabSync,
      tabId: this.getTabId(),
      tokenManager: this.tokenManager?.getDebugInfo()
    };
  }
}

export default SessionManager;
export { SessionState };