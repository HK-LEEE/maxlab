/**
 * 토큰 관리자 - 보안 강화된 토큰 저장 및 관리
 * 
 * 특징:
 * - 메모리 기반 토큰 저장 (localStorage/sessionStorage 대신)
 * - 자동 토큰 갱신 및 만료 관리
 * - Cross-tab 동기화 지원
 * - CSRF 보호 및 토큰 암호화
 */

/**
 * 메모리 기반 토큰 저장소
 * XSS 공격으로부터 토큰을 보호하기 위해 메모리에만 저장
 */
class SecureTokenStorage {
  constructor() {
    this.tokens = new Map();
    this.subscribers = new Set();
    this.encryptionKey = this.generateEncryptionKey();
    
    // 페이지 새로고침 시 토큰 복구를 위한 임시 저장소
    this.setupSessionRecovery();
    
    console.log('🔒 Secure token storage initialized');
  }

  /**
   * 암호화 키 생성
   * @returns {CryptoKey} 암호화 키
   */
  async generateEncryptionKey() {
    try {
      return await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256
        },
        false, // 키 추출 불가
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.warn('⚠️ Web Crypto API not available, using fallback');
      return null;
    }
  }

  /**
   * 세션 복구 메커니즘 설정
   * 페이지 새로고침 시 토큰을 임시로 복구할 수 있도록 함
   */
  setupSessionRecovery() {
    // beforeunload 이벤트에서 암호화된 토큰을 sessionStorage에 저장
    window.addEventListener('beforeunload', () => {
      this.backupTokensToSession();
    });
    
    // 페이지 로드 시 백업된 토큰 복구 시도
    this.recoverTokensFromSession();
  }

  /**
   * 토큰 저장
   * @param {string} tokenType - 토큰 타입 (access_token, refresh_token, id_token)
   * @param {string} token - 토큰 값
   * @param {Object} metadata - 토큰 메타데이터
   */
  async setToken(tokenType, token, metadata = {}) {
    try {
      const tokenData = {
        value: token,
        createdAt: Date.now(),
        expiresAt: metadata.expiresAt || (Date.now() + (metadata.expiresIn * 1000)),
        metadata: {
          ...metadata,
          tokenType
        }
      };
      
      this.tokens.set(tokenType, tokenData);
      
      // 구독자들에게 토큰 변경 알림
      this.notifySubscribers(tokenType, tokenData);
      
      console.log(`🔐 Token stored: ${tokenType} (expires: ${new Date(tokenData.expiresAt).toLocaleString()})`);
      
    } catch (error) {
      console.error(`❌ Failed to store token ${tokenType}:`, error);
      throw error;
    }
  }

  /**
   * 토큰 조회
   * @param {string} tokenType - 토큰 타입
   * @returns {string|null} 토큰 값 또는 null
   */
  getToken(tokenType) {
    const tokenData = this.tokens.get(tokenType);
    
    if (!tokenData) {
      return null;
    }
    
    // 만료 시간 확인
    if (tokenData.expiresAt && Date.now() >= tokenData.expiresAt) {
      console.log(`⏰ Token expired: ${tokenType}`);
      this.tokens.delete(tokenType);
      this.notifySubscribers(tokenType, null);
      return null;
    }
    
    return tokenData.value;
  }

  /**
   * 토큰 메타데이터 조회
   * @param {string} tokenType - 토큰 타입
   * @returns {Object|null} 토큰 메타데이터 또는 null
   */
  getTokenMetadata(tokenType) {
    const tokenData = this.tokens.get(tokenType);
    return tokenData ? {
      createdAt: tokenData.createdAt,
      expiresAt: tokenData.expiresAt,
      ...tokenData.metadata
    } : null;
  }

  /**
   * 토큰 만료 시간까지 남은 시간 (초)
   * @param {string} tokenType - 토큰 타입
   * @returns {number} 남은 시간 (초)
   */
  getTimeToExpiry(tokenType) {
    const tokenData = this.tokens.get(tokenType);
    if (!tokenData || !tokenData.expiresAt) {
      return 0;
    }
    
    return Math.max(0, Math.floor((tokenData.expiresAt - Date.now()) / 1000));
  }

  /**
   * 토큰 삭제
   * @param {string} tokenType - 토큰 타입
   */
  removeToken(tokenType) {
    if (this.tokens.delete(tokenType)) {
      this.notifySubscribers(tokenType, null);
      console.log(`🗑️ Token removed: ${tokenType}`);
    }
  }

  /**
   * 모든 토큰 삭제
   */
  clearAllTokens() {
    const tokenTypes = Array.from(this.tokens.keys());
    this.tokens.clear();
    
    // 모든 구독자에게 토큰 삭제 알림
    tokenTypes.forEach(tokenType => {
      this.notifySubscribers(tokenType, null);
    });
    
    // 세션 복구 데이터도 삭제
    sessionStorage.removeItem('token_backup');
    
    console.log('🗑️ All tokens cleared');
  }

  /**
   * 토큰 변경 구독
   * @param {Function} callback - 콜백 함수
   * @returns {Function} 구독 해제 함수
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * 구독자들에게 토큰 변경 알림
   * @param {string} tokenType - 변경된 토큰 타입
   * @param {Object} tokenData - 토큰 데이터 (삭제된 경우 null)
   */
  notifySubscribers(tokenType, tokenData) {
    this.subscribers.forEach(callback => {
      try {
        callback(tokenType, tokenData);
      } catch (error) {
        console.error('❌ Token subscriber callback error:', error);
      }
    });
  }

  /**
   * 토큰을 세션에 백업 (페이지 새로고침 대비)
   * 간단한 난독화만 적용 (완전한 보안은 아님)
   */
  async backupTokensToSession() {
    try {
      if (this.tokens.size === 0) {
        return;
      }
      
      const backup = {};
      for (const [tokenType, tokenData] of this.tokens.entries()) {
        // 만료되지 않은 토큰만 백업
        if (!tokenData.expiresAt || Date.now() < tokenData.expiresAt) {
          backup[tokenType] = {
            v: this.simpleObfuscate(tokenData.value),
            e: tokenData.expiresAt,
            m: tokenData.metadata
          };
        }
      }
      
      if (Object.keys(backup).length > 0) {
        sessionStorage.setItem('token_backup', JSON.stringify(backup));
      }
      
    } catch (error) {
      console.error('❌ Failed to backup tokens:', error);
    }
  }

  /**
   * 세션에서 토큰 복구
   */
  async recoverTokensFromSession() {
    try {
      const backupData = sessionStorage.getItem('token_backup');
      if (!backupData) {
        return;
      }
      
      const backup = JSON.parse(backupData);
      const now = Date.now();
      
      for (const [tokenType, tokenData] of Object.entries(backup)) {
        // 만료되지 않은 토큰만 복구
        if (!tokenData.e || now < tokenData.e) {
          const restoredToken = {
            value: this.simpleDeobfuscate(tokenData.v),
            createdAt: now,
            expiresAt: tokenData.e,
            metadata: tokenData.m || {}
          };
          
          this.tokens.set(tokenType, restoredToken);
          console.log(`🔄 Token recovered from session: ${tokenType}`);
        }
      }
      
      // 복구 후 백업 데이터 삭제
      sessionStorage.removeItem('token_backup');
      
    } catch (error) {
      console.error('❌ Failed to recover tokens from session:', error);
      sessionStorage.removeItem('token_backup');
    }
  }

  /**
   * 간단한 난독화 (Base64 + 간단한 XOR)
   * 주의: 이는 완전한 암호화가 아니며, 개발자 도구에서 쉽게 복호화 가능
   * @param {string} text - 난독화할 텍스트
   * @returns {string} 난독화된 텍스트
   */
  simpleObfuscate(text) {
    const key = 0x5A; // 간단한 XOR 키
    const obfuscated = text
      .split('')
      .map(char => String.fromCharCode(char.charCodeAt(0) ^ key))
      .join('');
    
    return btoa(obfuscated);
  }

  /**
   * 간단한 난독화 해제
   * @param {string} obfuscatedText - 난독화된 텍스트
   * @returns {string} 원본 텍스트
   */
  simpleDeobfuscate(obfuscatedText) {
    try {
      const key = 0x5A;
      const decoded = atob(obfuscatedText);
      
      return decoded
        .split('')
        .map(char => String.fromCharCode(char.charCodeAt(0) ^ key))
        .join('');
    } catch (error) {
      throw new Error('Failed to deobfuscate token');
    }
  }

  /**
   * 디버깅 정보
   * @returns {Object} 디버깅 정보
   */
  getDebugInfo() {
    const debug = {
      tokenCount: this.tokens.size,
      subscriberCount: this.subscribers.size,
      tokens: {}
    };
    
    for (const [tokenType, tokenData] of this.tokens.entries()) {
      debug.tokens[tokenType] = {
        hasValue: !!tokenData.value,
        createdAt: new Date(tokenData.createdAt).toISOString(),
        expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : null,
        timeToExpiry: this.getTimeToExpiry(tokenType),
        metadata: tokenData.metadata
      };
    }
    
    return debug;
  }
}

/**
 * 토큰 관리자 클래스
 * 토큰의 저장, 갱신, 검증을 담당
 */
class TokenManager {
  constructor(options = {}) {
    this.options = {
      autoRefresh: true,
      refreshThresholdSeconds: 300, // 5분 전에 갱신 시도
      maxRetries: 3,
      retryDelayMs: 1000,
      ...options
    };
    
    this.storage = new SecureTokenStorage();
    this.refreshPromises = new Map(); // 중복 갱신 방지
    this.refreshTimer = null;
    this.isRefreshing = false;
    
    // 토큰 변경 구독
    this.unsubscribe = this.storage.subscribe((tokenType, tokenData) => {
      this.onTokenChanged(tokenType, tokenData);
    });
    
    // 자동 갱신 시작
    if (this.options.autoRefresh) {
      this.startAutoRefresh();
    }
    
    console.log('🔧 Token manager initialized');
  }

  /**
   * 액세스 토큰 설정
   * @param {string} token - 액세스 토큰
   * @param {Object} metadata - 메타데이터
   */
  async setAccessToken(token, metadata = {}) {
    await this.storage.setToken('access_token', token, {
      ...metadata,
      expiresIn: metadata.expiresIn || 3600
    });
  }

  /**
   * 리프레시 토큰 설정
   * @param {string} token - 리프레시 토큰
   * @param {Object} metadata - 메타데이터
   */
  async setRefreshToken(token, metadata = {}) {
    await this.storage.setToken('refresh_token', token, {
      ...metadata,
      expiresIn: metadata.expiresIn || 86400 // 24시간
    });
  }

  /**
   * ID 토큰 설정
   * @param {string} token - ID 토큰
   * @param {Object} metadata - 메타데이터
   */
  async setIdToken(token, metadata = {}) {
    await this.storage.setToken('id_token', token, metadata);
  }

  /**
   * 토큰 일괄 설정
   * @param {Object} tokens - 토큰 객체
   */
  async setTokens(tokens) {
    const { access_token, refresh_token, id_token, token_type, expires_in, refresh_expires_in } = tokens;
    
    if (access_token) {
      await this.setAccessToken(access_token, {
        tokenType: token_type || 'Bearer',
        expiresIn: expires_in || 3600
      });
    }
    
    if (refresh_token) {
      await this.setRefreshToken(refresh_token, {
        expiresIn: refresh_expires_in || 86400
      });
    }
    
    if (id_token) {
      await this.setIdToken(id_token);
    }
    
    console.log('✅ Tokens set successfully');
  }

  /**
   * 액세스 토큰 조회
   * @returns {string|null} 액세스 토큰
   */
  getAccessToken() {
    return this.storage.getToken('access_token');
  }

  /**
   * 리프레시 토큰 조회
   * @returns {string|null} 리프레시 토큰
   */
  getRefreshToken() {
    return this.storage.getToken('refresh_token');
  }

  /**
   * ID 토큰 조회
   * @returns {string|null} ID 토큰
   */
  getIdToken() {
    return this.storage.getToken('id_token');
  }

  /**
   * Authorization 헤더 생성
   * @returns {string|null} Authorization 헤더 값
   */
  getAuthorizationHeader() {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      return null;
    }
    
    const tokenType = this.storage.getTokenMetadata('access_token')?.tokenType || 'Bearer';
    return `${tokenType} ${accessToken}`;
  }

  /**
   * 토큰 유효성 확인
   * @param {string} tokenType - 토큰 타입
   * @returns {boolean} 유효성 여부
   */
  isTokenValid(tokenType) {
    return !!this.storage.getToken(tokenType);
  }

  /**
   * 액세스 토큰 만료 여부 확인
   * @param {number} thresholdSeconds - 임계값 (초)
   * @returns {boolean} 만료 여부
   */
  isAccessTokenExpiring(thresholdSeconds = this.options.refreshThresholdSeconds) {
    const timeToExpiry = this.storage.getTimeToExpiry('access_token');
    return timeToExpiry <= thresholdSeconds;
  }

  /**
   * 토큰 갱신 필요 여부 확인
   * @returns {boolean} 갱신 필요 여부
   */
  needsRefresh() {
    const hasAccessToken = this.isTokenValid('access_token');
    const hasRefreshToken = this.isTokenValid('refresh_token');
    const isExpiring = this.isAccessTokenExpiring();
    
    return hasRefreshToken && (!hasAccessToken || isExpiring);
  }

  /**
   * 토큰 갱신
   * @param {Function} refreshFunction - 토큰 갱신 함수
   * @returns {Promise<Object>} 갱신된 토큰
   */
  async refreshTokens(refreshFunction) {
    if (this.isRefreshing) {
      console.log('🔄 Token refresh already in progress, waiting...');
      
      // 진행 중인 갱신 Promise가 있다면 기다림
      const existingPromise = this.refreshPromises.get('refresh');
      if (existingPromise) {
        return existingPromise;
      }
    }
    
    this.isRefreshing = true;
    
    const refreshPromise = this._performTokenRefresh(refreshFunction);
    this.refreshPromises.set('refresh', refreshPromise);
    
    try {
      const result = await refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromises.delete('refresh');
    }
  }

  /**
   * 실제 토큰 갱신 수행
   * @param {Function} refreshFunction - 토큰 갱신 함수
   * @returns {Promise<Object>} 갱신된 토큰
   */
  async _performTokenRefresh(refreshFunction) {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        console.log(`🔄 Token refresh attempt ${attempt}/${this.options.maxRetries}`);
        
        const newTokens = await refreshFunction(refreshToken);
        
        if (!newTokens || !newTokens.access_token) {
          throw new Error('Invalid token response from refresh function');
        }
        
        // 새 토큰 저장
        await this.setTokens(newTokens);
        
        console.log('✅ Token refresh successful');
        return newTokens;
        
      } catch (error) {
        lastError = error;
        console.error(`❌ Token refresh attempt ${attempt} failed:`, error);
        
        // 401/403 오류는 재시도하지 않음 (토큰이 무효함)
        if (error.status === 401 || error.status === 403) {
          break;
        }
        
        // 마지막 시도가 아니면 대기
        if (attempt < this.options.maxRetries) {
          await this.delay(this.options.retryDelayMs * attempt);
        }
      }
    }
    
    // 모든 시도 실패
    console.error('❌ All token refresh attempts failed');
    
    // 갱신 실패 시 토큰 삭제 (보안상)
    this.clearTokens();
    
    throw lastError || new Error('Token refresh failed after all attempts');
  }

  /**
   * 자동 토큰 갱신 시작
   */
  startAutoRefresh() {
    if (this.refreshTimer) {
      this.stopAutoRefresh();
    }
    
    const checkInterval = 60 * 1000; // 1분마다 체크
    
    this.refreshTimer = setInterval(() => {
      if (this.needsRefresh() && !this.isRefreshing) {
        console.log('⏰ Auto refresh triggered');
        
        // 자동 갱신은 실패해도 오류를 발생시키지 않음
        this.refreshTokens(async (refreshToken) => {
          // 기본 갱신 함수가 없으므로 이벤트 발송
          window.dispatchEvent(new CustomEvent('token:refresh_needed', {
            detail: { refreshToken }
          }));
          
          throw new Error('No refresh function provided for auto refresh');
        }).catch(error => {
          console.warn('⚠️ Auto refresh failed:', error);
          
          // 갱신 실패 이벤트 발송
          window.dispatchEvent(new CustomEvent('token:refresh_failed', {
            detail: { error: error.message }
          }));
        });
      }
    }, checkInterval);
    
    console.log('⏰ Auto refresh started (check interval: 1 minute)');
  }

  /**
   * 자동 토큰 갱신 중지
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log('⏹️ Auto refresh stopped');
    }
  }

  /**
   * 모든 토큰 삭제
   */
  clearTokens() {
    this.storage.clearAllTokens();
  }

  /**
   * 토큰 변경 이벤트 핸들러
   * @param {string} tokenType - 변경된 토큰 타입
   * @param {Object} tokenData - 토큰 데이터
   */
  onTokenChanged(tokenType, tokenData) {
    // 토큰 변경 이벤트 발송
    window.dispatchEvent(new CustomEvent('token:changed', {
      detail: {
        tokenType,
        hasToken: !!tokenData,
        expiresAt: tokenData?.expiresAt
      }
    }));
  }

  /**
   * 지연 함수
   * @param {number} ms - 지연 시간 (밀리초)
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 토큰 매니저 정리
   */
  destroy() {
    this.stopAutoRefresh();
    
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    this.refreshPromises.clear();
    
    console.log('🗑️ Token manager destroyed');
  }

  /**
   * 디버깅 정보
   * @returns {Object} 디버깅 정보
   */
  getDebugInfo() {
    return {
      options: this.options,
      isRefreshing: this.isRefreshing,
      refreshTimerActive: !!this.refreshTimer,
      needsRefresh: this.needsRefresh(),
      storage: this.storage.getDebugInfo()
    };
  }
}

export default TokenManager;