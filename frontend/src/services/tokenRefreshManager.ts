/**
 * 고급 토큰 갱신 관리자
 * RFC 6749 준수 refresh token 우선 처리
 * 동시성 제어, 토큰 블랙리스트, 보안 강화 기능 제공
 */

import { refreshTokenService, TokenRefreshError } from './refreshTokenService';
import { securityEventLogger } from './securityEventLogger';

export interface TokenRefreshConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  refreshThreshold: number; // 만료 전 몇 초부터 갱신할지
  concurrentRefreshTimeout: number;
}

export interface TokenBlacklistEntry {
  token: string;
  revokedAt: number;
  reason: string;
}

export class TokenRefreshManager {
  private static instance: TokenRefreshManager;
  private refreshInProgress: boolean = false;
  private refreshQueue: Array<(success: boolean) => void> = [];
  private config: TokenRefreshConfig;
  private blacklist: Map<string, TokenBlacklistEntry> = new Map();
  private refreshStartTime: number | null = null;

  private constructor(config?: Partial<TokenRefreshConfig>) {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      refreshThreshold: 300, // 5분
      concurrentRefreshTimeout: 30000, // 30초
      ...config
    };

    // 블랙리스트 초기화 (로컬 스토리지에서 복원)
    this.loadBlacklist();
    
    // 주기적 블랙리스트 정리 (1시간마다)
    setInterval(() => this.cleanupBlacklist(), 60 * 60 * 1000);
  }

  public static getInstance(config?: Partial<TokenRefreshConfig>): TokenRefreshManager {
    if (!TokenRefreshManager.instance) {
      TokenRefreshManager.instance = new TokenRefreshManager(config);
    }
    return TokenRefreshManager.instance;
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인
   */
  public isTokenBlacklisted(token: string): boolean {
    return this.blacklist.has(token);
  }

  /**
   * 토큰을 블랙리스트에 추가
   */
  public blacklistToken(token: string, reason: string = 'revoked'): void {
    const entry: TokenBlacklistEntry = {
      token,
      revokedAt: Date.now(),
      reason
    };
    
    this.blacklist.set(token, entry);
    this.saveBlacklist();
    
    console.log(`🚫 Token blacklisted: ${reason}`);
  }

  /**
   * 보안 강화된 토큰 갱신 - Refresh Token 우선 처리
   * 1순위: RFC 6749 Refresh Token
   * 2순위: Silent Auth (fallback)
   */
  public async refreshToken(
    silentAuthFunction?: () => Promise<{ success: boolean; token?: string; error?: string }>
  ): Promise<boolean> {
    // 이미 갱신 중인 경우 대기
    if (this.refreshInProgress) {
      console.log('🔄 Token refresh already in progress, queuing request...');
      return this.waitForRefresh();
    }

    this.refreshInProgress = true;
    this.refreshStartTime = Date.now();

    try {
      // 현재 토큰 블랙리스트 확인
      const currentToken = localStorage.getItem('accessToken');
      if (currentToken && this.isTokenBlacklisted(currentToken)) {
        securityEventLogger.logTokenEvent('blacklisted_token_detected', {
          action: 'forcing_logout',
          tokenPrefix: currentToken.substring(0, 8)
        });
        console.log('🚫 Current token is blacklisted, forcing logout');
        await this.clearAuth();
        return false;
      }

      // 현재 토큰이 여전히 유효한지 먼저 확인
      if (this.isCurrentTokenValid()) {
        const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
        if (tokenExpiryTime) {
          const expiryTime = parseInt(tokenExpiryTime, 10);
          const now = Date.now();
          const timeToExpiry = Math.max(0, Math.floor((expiryTime - now) / 1000));
          
          // 토큰이 5분 이상 남았으면 갱신할 필요 없음
          if (timeToExpiry > 300) {
            console.log(`ℹ️ Current token is valid for ${timeToExpiry}s, no refresh needed`);
            return true;
          }
        }
      }

      // 토큰 재사용 공격 방지
      const lastRefresh = localStorage.getItem('lastTokenRefresh');
      const now = Date.now();
      if (lastRefresh && (now - parseInt(lastRefresh)) < 30000) {
        securityEventLogger.logTokenEvent('suspicious_refresh_frequency', {
          timeSinceLastRefresh: now - parseInt(lastRefresh),
          action: 'rejecting_refresh_attempt'
        });
        console.log('⚠️ Token refresh attempted too soon, using current token');
        return this.isCurrentTokenValid();
      }

      // 1순위: Refresh Token으로 갱신 시도
      const refreshResult = await this.tryRefreshWithRefreshToken();
      if (refreshResult.success) {
        localStorage.setItem('lastTokenRefresh', now.toString());
        console.log('✅ Token refresh successful (refresh token)');
        return true;
      }

      // 2순위: Silent Auth로 갱신 시도 (fallback)
      if (silentAuthFunction && refreshResult.shouldTrySilentAuth) {
        console.log('🔄 Refresh token failed, trying silent auth as fallback...');
        const silentResult = await this.tryRefreshWithSilentAuth(silentAuthFunction);
        
        if (silentResult.success) {
          localStorage.setItem('lastTokenRefresh', now.toString());
          console.log('✅ Token refresh successful (silent auth fallback)');
          return true;
        }
      }

      // 모든 갱신 방법 실패
      console.log('❌ All token refresh methods failed, checking current token validity');

      // 현재 토큰이 여전히 유효한지 확인
      if (this.isCurrentTokenValid()) {
        console.log('ℹ️ Current token still valid despite refresh failure - user can continue working');
        return true;
      } else {
        console.log('🔓 Token validation failed, clearing auth and requiring re-login');
        await this.clearAuth();
        return false;
      }

    } catch (error: any) {
      console.error('Token refresh critical error:', error);
      
      if (this.isCurrentTokenValid()) {
        console.log('ℹ️ Critical error but current token still valid');
        return true;
      }
      
      await this.clearAuth();
      return false;
    } finally {
      this.refreshInProgress = false;
      this.refreshStartTime = null;
      this.resolveQueuedRequests();
    }
  }

  /**
   * Refresh Token을 사용한 갱신 시도
   */
  private async tryRefreshWithRefreshToken(): Promise<{ success: boolean; shouldTrySilentAuth: boolean; error?: string }> {
    try {
      // Refresh token이 있고 유효한지 확인
      if (!refreshTokenService.isRefreshTokenValid()) {
        console.log('ℹ️ No valid refresh token available');
        return { success: false, shouldTrySilentAuth: true };
      }

      console.log('🔄 Attempting refresh with refresh token...');
      
      const currentToken = localStorage.getItem('accessToken');
      const tokenData = await refreshTokenService.refreshWithRefreshToken();
      
      // 성공 시 이전 토큰 블랙리스트 추가
      if (currentToken && currentToken !== tokenData.access_token) {
        this.blacklistToken(currentToken, 'refreshed');
      }

      return { success: true, shouldTrySilentAuth: false };
      
    } catch (error: any) {
      console.error('❌ Refresh token renewal failed:', error);
      
      // Refresh token 관련 에러는 silent auth 시도하지 않음
      if (error.message === TokenRefreshError.REFRESH_TOKEN_EXPIRED || 
          error.message === TokenRefreshError.REFRESH_TOKEN_INVALID) {
        return { success: false, shouldTrySilentAuth: true, error: error.message };
      }
      
      // 네트워크 에러 등은 silent auth 시도
      return { success: false, shouldTrySilentAuth: true, error: error.message };
    }
  }

  /**
   * Silent Auth를 사용한 갱신 시도 (fallback)
   */
  private async tryRefreshWithSilentAuth(
    silentAuthFunction: () => Promise<{ success: boolean; token?: string; error?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    let retryCount = 0;
    let lastError: string | null = null;

    while (retryCount < this.config.maxRetries) {
      try {
        // 지수 백오프 지연
        if (retryCount > 0) {
          const delay = Math.min(
            this.config.baseDelay * Math.pow(2, retryCount - 1),
            this.config.maxDelay
          );
          console.log(`🔄 Silent auth retry attempt ${retryCount} after ${delay}ms delay`);
          await this.delay(delay);
        }

        const result = await silentAuthFunction();

        if (result.success && result.token) {
          const currentToken = localStorage.getItem('accessToken');
          
          // 성공 시 이전 토큰 블랙리스트 추가
          if (currentToken && currentToken !== result.token) {
            this.blacklistToken(currentToken, 'refreshed');
          }

          return { success: true };
        } else {
          lastError = result.error || 'Unknown error';
          console.log(`❌ Silent auth attempt ${retryCount + 1} failed:`, lastError);

          // 치명적 에러는 즉시 중단
          if (this.isCriticalError(lastError)) {
            console.log('🔓 Critical auth error, stopping silent auth retries');
            break;
          }

          retryCount++;
        }
      } catch (retryError: any) {
        lastError = retryError.message || 'Network error';
        console.error(`❌ Silent auth retry ${retryCount + 1} error:`, lastError);
        retryCount++;
      }
    }

    return { success: false, error: lastError || 'Silent auth failed' };
  }

  /**
   * 토큰 갱신 완료 대기
   */
  private waitForRefresh(): Promise<boolean> {
    return new Promise((resolve) => {
      // 타임아웃 설정
      const timeout = setTimeout(() => {
        console.log('⏰ Token refresh wait timeout');
        resolve(this.isCurrentTokenValid());
      }, this.config.concurrentRefreshTimeout);

      this.refreshQueue.push((success: boolean) => {
        clearTimeout(timeout);
        resolve(success);
      });
    });
  }

  /**
   * 대기 중인 요청들 해결
   */
  private resolveQueuedRequests(): void {
    if (this.refreshQueue.length > 0) {
      const success = this.isCurrentTokenValid();
      this.refreshQueue.forEach(resolve => resolve(success));
      this.refreshQueue = [];
    }
  }

  /**
   * 치명적 에러 확인
   */
  private isCriticalError(error: string): boolean {
    const criticalErrors = [
      'login_required',
      'invalid_token',
      'token_revoked',
      'unauthorized',
      'forbidden',
      'cannot attempt silent auth on current page',
      'silent authentication not supported',
      'silent authentication already in progress',
      'oauth callback in progress',
      'oauth flow in progress'
    ];
    return criticalErrors.some(criticalError => 
      error.toLowerCase().includes(criticalError.toLowerCase())
    );
  }

  /**
   * 현재 토큰 유효성 확인 - Access Token 및 Refresh Token 고려
   */
  private isCurrentTokenValid(): boolean {
    const accessToken = localStorage.getItem('accessToken');
    const tokenExpiryTime = localStorage.getItem('tokenExpiryTime');
    
    if (!accessToken) return false;
    
    // 블랙리스트 확인
    if (this.isTokenBlacklisted(accessToken)) return false;

    // Access Token 만료 시간 확인
    if (tokenExpiryTime) {
      const expiryTime = parseInt(tokenExpiryTime, 10);
      const now = Date.now();
      
      if (now >= expiryTime) {
        this.blacklistToken(accessToken, 'expired');
        
        // Access Token이 만료되었지만 Refresh Token이 유효하면 갱신 가능으로 간주
        if (refreshTokenService.isRefreshTokenValid()) {
          console.log('ℹ️ Access token expired but refresh token is valid');
          return false; // 갱신이 필요하므로 false 반환
        }
        
        return false;
      }
    }

    return true;
  }

  /**
   * 인증 데이터 정리 - Refresh Token 포함
   */
  private async clearAuth(): Promise<void> {
    const currentToken = localStorage.getItem('accessToken');
    if (currentToken) {
      this.blacklistToken(currentToken, 'cleared');
    }

    // Refresh Token 정리
    await refreshTokenService.clearAllTokens();
    
    console.log('🧹 All authentication data cleared');
  }

  /**
   * 블랙리스트 로드
   */
  private loadBlacklist(): void {
    try {
      const stored = localStorage.getItem('tokenBlacklist');
      if (stored) {
        const entries = JSON.parse(stored);
        this.blacklist = new Map(entries);
      }
    } catch (error) {
      console.error('Failed to load token blacklist:', error);
      this.blacklist = new Map();
    }
  }

  /**
   * 블랙리스트 저장
   */
  private saveBlacklist(): void {
    try {
      const entries = Array.from(this.blacklist.entries());
      localStorage.setItem('tokenBlacklist', JSON.stringify(entries));
    } catch (error) {
      console.error('Failed to save token blacklist:', error);
    }
  }

  /**
   * 오래된 블랙리스트 항목 정리 (24시간 이상된 것들)
   */
  private cleanupBlacklist(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24시간
    
    let cleanedCount = 0;
    for (const [token, entry] of this.blacklist.entries()) {
      if (now - entry.revokedAt > maxAge) {
        this.blacklist.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old blacklist entries`);
      this.saveBlacklist();
    }
  }

  /**
   * 지연 유틸리티
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 갱신 상태 정보 반환 - Refresh Token 정보 포함
   */
  public getRefreshStatus() {
    const refreshTokenDebug = refreshTokenService.getDebugInfo();
    
    return {
      refreshInProgress: this.refreshInProgress,
      queueLength: this.refreshQueue.length,
      refreshStartTime: this.refreshStartTime,
      blacklistSize: this.blacklist.size,
      config: this.config,
      refreshToken: {
        hasRefreshToken: refreshTokenDebug.hasRefreshToken,
        isValid: refreshTokenDebug.isRefreshTokenValid,
        timeToExpiry: refreshTokenDebug.refreshTokenTimeToExpiry,
        needsRenewal: refreshTokenDebug.needsRefreshTokenRenewal
      }
    };
  }

  /**
   * 블랙리스트 강제 정리 (테스트/디버깅용)
   */
  public clearBlacklist(): void {
    this.blacklist.clear();
    localStorage.removeItem('tokenBlacklist');
    console.log('🧹 Token blacklist cleared');
  }
}

// 싱글톤 인스턴스 export
export const tokenRefreshManager = TokenRefreshManager.getInstance();