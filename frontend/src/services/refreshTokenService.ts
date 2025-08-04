/**
 * Refresh Token Service
 * Manages secure storage and operations for OAuth 2.0 refresh tokens
 * Implements RFC 6749 compliant refresh token handling
 */

import { apiClient } from '../api/client';
import { secureTokenStorage } from './secureTokenStorage';
import { securityEventLogger } from './securityEventLogger';
import { userIsolatedTokenStorage } from './userIsolatedTokenStorage';

// 로컬 인터페이스 정의 (import 문제 해결)
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
  refresh_expires_in?: number;
}

export interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token: string;
  refresh_expires_in: number;
}

export enum TokenRefreshError {
  REFRESH_TOKEN_EXPIRED = 'refresh_token_expired',
  REFRESH_TOKEN_INVALID = 'refresh_token_invalid',
  NETWORK_ERROR = 'network_error',
  SILENT_AUTH_FAILED = 'silent_auth_failed',
  SERVER_ERROR = 'server_error',
  OAUTH_CALLBACK_ERROR = 'oauth_callback_error'
}

export interface RefreshTokenRequest {
  refresh_token: string;
  client_id: string;
  client_secret?: string;
}

export interface StoredTokenInfo {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string;
  createdAt: number;
  refreshCreatedAt: number;
}

class RefreshTokenService {
  private static instance: RefreshTokenService;
  private readonly clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
  private readonly clientSecret = import.meta.env.VITE_CLIENT_SECRET || '';

  static getInstance(): RefreshTokenService {
    if (!RefreshTokenService.instance) {
      RefreshTokenService.instance = new RefreshTokenService();
    }
    return RefreshTokenService.instance;
  }

  /**
   * Refresh access token using stored refresh token
   */
  async refreshWithRefreshToken(): Promise<RefreshTokenResponse> {
    const refreshToken = await this.getStoredRefreshToken();
    
    if (!refreshToken) {
      console.error('❌ No refresh token available for renewal');
      throw new Error(TokenRefreshError.REFRESH_TOKEN_INVALID);
    }

    if (!this.isRefreshTokenValid()) {
      console.error('❌ Stored refresh token is expired or invalid');
      throw new Error(TokenRefreshError.REFRESH_TOKEN_EXPIRED);
    }

    try {
      console.log('🔄 Attempting refresh with refresh token...');
      
      const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
      console.log('📡 Auth Server URL:', authUrl);
      console.log('🔑 Client ID:', this.clientId);
      console.log('🔐 Has Client Secret:', !!this.clientSecret);
      console.log('🎟️ Refresh Token Available:', !!refreshToken);
      console.log('🎟️ Refresh Token Prefix:', refreshToken.substring(0, 10) + '...');
      
      // 네트워크 요청에 타임아웃 및 재시도 로직 추가
      const response = await this.fetchWithRetry(`${authUrl}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.clientId,
          ...(this.clientSecret && { client_secret: this.clientSecret })
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        console.error('❌ Token refresh request failed:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          errorData,
          headers: Object.fromEntries(response.headers.entries())
        });
        
        if (response.status === 400) {
          // Invalid or expired refresh token
          console.error('🚫 400 Bad Request - Invalid refresh token parameters');
          securityEventLogger.logRefreshTokenEvent('invalid_or_expired', {
            status: response.status,
            response: errorData,
            action: 'clearing_token'
          });
          await this.clearRefreshToken();
          throw new Error(TokenRefreshError.REFRESH_TOKEN_INVALID);
        }
        
        if (response.status >= 500) {
          // Server error - 재시도 가능한 오류
          console.error('🔥 5xx Server Error - Auth server internal error');
          securityEventLogger.logRefreshTokenEvent('server_error', {
            status: response.status,
            response: errorData,
            action: 'retry_later'
          });
          throw new Error(TokenRefreshError.SERVER_ERROR);
        }
        
        if (response.status === 401) {
          // Unauthorized - 토큰 무효
          console.error('🔒 401 Unauthorized - Token expired or client authentication failed');
          console.error('🔍 Possible causes:', [
            '1. Refresh token has expired',
            '2. Client ID/Secret mismatch',
            '3. Auth server configuration issue',
            '4. Token was revoked'
          ]);
          securityEventLogger.logRefreshTokenEvent('unauthorized', {
            status: response.status,
            response: errorData,
            action: 'clearing_token',
            debugInfo: {
              authUrl,
              clientId: this.clientId,
              hasClientSecret: !!this.clientSecret,
              tokenPrefix: refreshToken.substring(0, 10)
            }
          });
          await this.clearRefreshToken();
          throw new Error(TokenRefreshError.REFRESH_TOKEN_INVALID);
        }
        
        throw new Error(errorData.error_description || TokenRefreshError.SERVER_ERROR);
      }

      const tokenData: RefreshTokenResponse = await response.json();
      
      // Store new tokens (token rotation)
      await this.storeTokens({
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        scope: tokenData.scope,
        refresh_token: tokenData.refresh_token,
        refresh_expires_in: tokenData.refresh_expires_in
      });

      // 성공적인 토큰 갱신 로그
      securityEventLogger.logRefreshTokenEvent('renewal_success', {
        tokenRotated: tokenData.refresh_token !== refreshToken,
        newExpiresIn: tokenData.expires_in,
        refreshExpiresIn: tokenData.refresh_expires_in
      });
      
      console.log('✅ Refresh token renewal successful');
      return tokenData;
      
    } catch (error: any) {
      console.error('❌ Refresh token renewal failed:', error);
      
      // 실패 이벤트 로그
      securityEventLogger.logRefreshTokenEvent('renewal_failed', {
        error: error.message,
        errorType: error.message,
        willClearToken: error.message === TokenRefreshError.REFRESH_TOKEN_INVALID || 
                       error.message === TokenRefreshError.REFRESH_TOKEN_EXPIRED
      });
      
      if (error.message === TokenRefreshError.REFRESH_TOKEN_INVALID || 
          error.message === TokenRefreshError.REFRESH_TOKEN_EXPIRED) {
        await this.clearRefreshToken();
      }
      
      throw error;
    }
  }

  /**
   * Store tokens securely after successful authentication
   */
  async storeTokens(tokenResponse: TokenResponse): Promise<void> {
    const currentTime = Date.now();
    const accessExpiryTime = currentTime + (tokenResponse.expires_in * 1000);
    
    // Store access token data
    localStorage.setItem('accessToken', tokenResponse.access_token);
    localStorage.setItem('tokenType', tokenResponse.token_type || 'Bearer');
    localStorage.setItem('expiresIn', tokenResponse.expires_in.toString());
    localStorage.setItem('tokenExpiryTime', accessExpiryTime.toString());
    localStorage.setItem('scope', tokenResponse.scope);
    localStorage.setItem('tokenCreatedAt', currentTime.toString());

    // Store refresh token data if present
    if (tokenResponse.refresh_token) {
      const refreshExpiryTime = currentTime + ((tokenResponse.refresh_expires_in || 2592000) * 1000); // Default 30 days
      
      await this.storeRefreshTokenSecurely(tokenResponse.refresh_token);
      localStorage.setItem('refreshExpiresIn', (tokenResponse.refresh_expires_in || 2592000).toString());
      localStorage.setItem('refreshTokenExpiryTime', refreshExpiryTime.toString());
      localStorage.setItem('refreshTokenCreatedAt', currentTime.toString());
      
      console.log('💾 Tokens stored successfully (including refresh token)');
    } else {
      console.log('💾 Access token stored (no refresh token provided)');
    }
    
    // Store in user-isolated token storage if user ID is available
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user.id) {
          await userIsolatedTokenStorage.saveTokens({
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt: accessExpiryTime
          }, user.id);
          console.log('🔐 Tokens also stored in user-isolated storage');
        }
      } catch (error) {
        console.warn('Failed to store tokens in user-isolated storage:', error);
      }
    }
  }

  /**
   * Get stored refresh token (with encryption support)
   */
  async getStoredRefreshToken(): Promise<string | null> {
    try {
      // 새로운 암호화 저장소 사용
      const result = await secureTokenStorage.getRefreshToken();
      
      if (result.token) {
        if (result.encrypted) {
          console.log('🔓 Retrieved encrypted refresh token');
        } else {
          console.log('📄 Retrieved plaintext refresh token');
        }
        return result.token;
      }
      
      // Fallback: 기존 localStorage 확인
      const legacyToken = localStorage.getItem('refreshToken');
      if (legacyToken) {
        console.log('🔄 Found legacy refresh token, migrating to secure storage...');
        
        // 레거시 토큰을 새 저장소로 마이그레이션
        const migrationResult = await secureTokenStorage.storeRefreshToken(legacyToken);
        if (migrationResult.success) {
          localStorage.removeItem('refreshToken'); // 기존 토큰 제거
          console.log('✅ Legacy token migration completed');
        }
        
        return legacyToken;
      }
      
      return null;
    } catch (error: any) {
      console.error('Failed to retrieve refresh token:', error);
      return null;
    }
  }

  /**
   * Store refresh token securely (with encryption)
   */
  private async storeRefreshTokenSecurely(refreshToken: string): Promise<void> {
    try {
      console.log('🔐 Storing refresh token securely...');
      
      const result = await secureTokenStorage.storeRefreshToken(refreshToken);
      
      if (result.success) {
        // 저장 후 즉시 검증
        const verificationResult = await secureTokenStorage.getRefreshToken();
        if (!verificationResult.token) {
          throw new Error('Token storage verification failed - token not found after storage');
        }
        
        if (result.encrypted) {
          securityEventLogger.logEncryptionEvent('token_encrypted_stored', {
            storageType: 'encrypted',
            success: true,
            verified: true
          });
          console.log('✅ Refresh token encrypted, stored, and verified securely');
        } else {
          securityEventLogger.logEncryptionEvent('token_plaintext_stored', {
            storageType: 'plaintext',
            reason: 'encryption_not_available',
            verified: true
          });
          console.log('💾 Refresh token stored and verified (encryption not available, using plaintext fallback)');
        }
      } else {
        securityEventLogger.logEncryptionEvent('token_storage_failed', {
          error: result.error,
          attempted: 'secure_storage'
        });
        throw new Error(result.error || 'Failed to store refresh token');
      }
    } catch (error: any) {
      console.error('❌ Failed to store refresh token:', error);
      // 저장 실패 시 정리
      try {
        await secureTokenStorage.clearRefreshToken();
      } catch (cleanupError) {
        console.error('Failed to cleanup after storage failure:', cleanupError);
      }
      throw new Error('Failed to store refresh token securely');
    }
  }

  /**
   * Clear stored refresh token (secure storage)
   */
  async clearRefreshToken(): Promise<void> {
    try {
      // 새로운 보안 저장소에서 제거
      await secureTokenStorage.clearRefreshToken();
      
      // 기존 localStorage의 메타데이터도 제거
      localStorage.removeItem('refreshToken'); // 레거시 지원
      localStorage.removeItem('refreshExpiresIn');
      localStorage.removeItem('refreshTokenExpiryTime');
      localStorage.removeItem('refreshTokenCreatedAt');
      
      console.log('🧹 Refresh token cleared from secure storage');
    } catch (error) {
      console.error('Failed to clear refresh token:', error);
    }
  }

  /**
   * Check if stored refresh token is valid (checks both encrypted and legacy storage)
   */
  isRefreshTokenValid(): boolean {
    // Check refresh token existence from multiple sources
    const legacyRefreshToken = localStorage.getItem('refreshToken');
    const refreshTokenExpiryTime = localStorage.getItem('refreshTokenExpiryTime');
    const refreshTokenCreatedAt = localStorage.getItem('refreshTokenCreatedAt');
    
    // First, check if we have any refresh token at all
    let hasRefreshToken = !!legacyRefreshToken;
    
    // If no legacy token, check if we might have an encrypted one
    // Note: We can't check encrypted storage synchronously, but we can check if the storage status suggests one exists
    if (!hasRefreshToken) {
      // Check if there are any refresh token metadata indicating encrypted storage
      const hasRefreshMetadata = !!refreshTokenExpiryTime || !!refreshTokenCreatedAt;
      if (hasRefreshMetadata) {
        // Only log this once per session to avoid spam
        const logKey = 'refresh_token_metadata_logged';
        if (!sessionStorage.getItem(logKey)) {
          console.log('🔍 Found refresh token metadata, will verify encrypted token exists');
          sessionStorage.setItem(logKey, 'true');
          
          // Schedule async verification to clean up inconsistent state
          this.verifyTokenConsistencyAsync();
        }
        hasRefreshToken = true;
      }
    }
    
    if (!hasRefreshToken) {
      // No token and no metadata - definitely no refresh token
      return false;
    }
    
    // Check expiry time if available
    if (refreshTokenExpiryTime) {
      const expiryTime = parseInt(refreshTokenExpiryTime, 10);
      const now = Date.now();
      
      if (now >= expiryTime) {
        console.log('🕒 Refresh token expired');
        return false;
      }
    }
    
    return true;
  }

  /**
   * Async version of refresh token validation that checks encrypted storage
   */
  async isRefreshTokenValidAsync(): Promise<boolean> {
    try {
      const refreshToken = await this.getStoredRefreshToken();
      const refreshTokenExpiryTime = localStorage.getItem('refreshTokenExpiryTime');
      
      if (!refreshToken) {
        console.log('🚫 No refresh token found in any storage');
        return false;
      }
      
      if (refreshTokenExpiryTime) {
        const expiryTime = parseInt(refreshTokenExpiryTime, 10);
        const now = Date.now();
        
        if (now >= expiryTime) {
          console.log('🕒 Refresh token expired');
          return false;
        }
      }
      
      console.log('✅ Refresh token is valid');
      return true;
    } catch (error) {
      console.error('❌ Error validating refresh token:', error);
      return false;
    }
  }

  /**
   * Get refresh token time to expiry in seconds
   */
  getRefreshTokenTimeToExpiry(): number {
    const refreshTokenExpiryTime = localStorage.getItem('refreshTokenExpiryTime');
    
    if (!refreshTokenExpiryTime) {
      return 0;
    }
    
    const expiryTime = parseInt(refreshTokenExpiryTime, 10);
    const now = Date.now();
    
    return Math.max(0, Math.floor((expiryTime - now) / 1000));
  }

  /**
   * Check if refresh token needs renewal (within 1 day of expiry)
   */
  needsRefreshTokenRenewal(): boolean {
    const timeToExpiry = this.getRefreshTokenTimeToExpiry();
    const oneDayInSeconds = 24 * 60 * 60; // 1 day
    
    return timeToExpiry > 0 && timeToExpiry <= oneDayInSeconds;
  }

  /**
   * Get comprehensive token information
   */
  getTokenInfo(): StoredTokenInfo | null {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!accessToken) {
        return null;
      }

      return {
        accessToken,
        refreshToken: refreshToken || '',
        tokenType: localStorage.getItem('tokenType') || 'Bearer',
        expiresIn: parseInt(localStorage.getItem('expiresIn') || '3600', 10),
        refreshExpiresIn: parseInt(localStorage.getItem('refreshExpiresIn') || '2592000', 10),
        scope: localStorage.getItem('scope') || '',
        createdAt: parseInt(localStorage.getItem('tokenCreatedAt') || '0', 10),
        refreshCreatedAt: parseInt(localStorage.getItem('refreshTokenCreatedAt') || '0', 10)
      };
    } catch (error) {
      console.error('Failed to get token info:', error);
      return null;
    }
  }

  /**
   * Enhanced logout with access and refresh token revocation
   */
  async secureLogout(): Promise<void> {
    const refreshToken = await this.getStoredRefreshToken();
    const accessToken = localStorage.getItem('accessToken');
    
    // Revoke both tokens on server (parallel for efficiency)
    const revocationPromises: Promise<void>[] = [];
    
    // Revoke access token
    if (accessToken) {
      revocationPromises.push(
        fetch('/api/oauth/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: accessToken,
            token_type_hint: 'access_token',
            client_id: this.clientId
          })
        })
        .then(() => console.log('✅ Access token revoked on server'))
        .catch(error => console.warn('⚠️ Failed to revoke access token:', error))
      );
    }
    
    // Revoke refresh token
    if (refreshToken) {
      revocationPromises.push(
        fetch('/api/oauth/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: refreshToken,
            token_type_hint: 'refresh_token',
            client_id: this.clientId
          })
        })
        .then(() => console.log('✅ Refresh token revoked on server'))
        .catch(error => console.warn('⚠️ Failed to revoke refresh token:', error))
      );
    }
    
    // Wait for both revocations to complete (but don't fail if they error)
    if (revocationPromises.length > 0) {
      await Promise.allSettled(revocationPromises);
    }

    // Clear all stored tokens
    await this.clearAllTokens();
  }

  /**
   * Clear all stored authentication data
   */
  async clearAllTokens(): Promise<void> {
    // Clear access token data
    const accessKeysToRemove = [
      'accessToken',
      'tokenType',
      'expiresIn',
      'tokenExpiryTime',
      'tokenCreatedAt',
      'scope',
      'user',
      'lastTokenRefresh'
    ];

    accessKeysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Clear refresh token data
    await this.clearRefreshToken();
    
    // Clear user-isolated token storage
    try {
      await userIsolatedTokenStorage.clearAllTokens();
      console.log('🔐 User-isolated tokens cleared');
    } catch (error) {
      console.warn('Failed to clear user-isolated tokens:', error);
    }
    
    console.log('🧹 All tokens cleared');
  }

  /**
   * Enhanced security validation (with encryption status)
   */
  async validateSecurityContext(): Promise<{ 
    isSecure: boolean; 
    issues: string[]; 
    recommendations: string[];
    encryptionStatus: any;
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 암호화 저장소 상태 확인
    const storageStatus = await secureTokenStorage.getStorageStatus();

    // Check for secure storage
    if (storageStatus.hasPlaintextToken && !storageStatus.hasEncryptedToken) {
      issues.push('Refresh token stored in plaintext');
      if (storageStatus.canMigrate) {
        recommendations.push('Migrate refresh token to encrypted storage');
      } else {
        recommendations.push('Browser does not support encryption - consider using httpOnly cookies');
      }
    }

    if (!storageStatus.encryptionSupported) {
      issues.push('Browser does not support token encryption');
      recommendations.push('Use a modern browser that supports Web Crypto API');
    }

    // Check token rotation
    const tokenInfo = this.getTokenInfo();
    if (tokenInfo) {
      const tokenAge = Date.now() - tokenInfo.refreshCreatedAt;
      const maxRecommendedAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      if (tokenAge > maxRecommendedAge) {
        issues.push('Refresh token has not been rotated recently');
        recommendations.push('Use refresh token more frequently to ensure rotation');
      }
    }

    // Check client secret exposure
    if (this.clientSecret) {
      issues.push('Client secret is stored in frontend environment');
      recommendations.push('Use public OAuth clients without client secrets in frontend');
    }

    // Check HTTPS context
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      issues.push('Application not running over HTTPS');
      recommendations.push('Deploy application with HTTPS in production');
    }

    return {
      isSecure: issues.length === 0,
      issues,
      recommendations,
      encryptionStatus: storageStatus
    };
  }

  /**
   * Monitor suspicious activity (enhanced with server logging)
   */
  private logSecurityEvent(event: string, details: any = {}) {
    const securityLog = {
      timestamp: new Date().toISOString(),
      event,
      details: {
        ...details,
        userAgent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer
      }
    };

    // Enhanced: Send to security event logger
    securityEventLogger.logRefreshTokenEvent(event, details);

    // Legacy: Keep local logging for backward compatibility
    console.warn('🔒 Security Event:', securityLog);
    
    // Store locally for debugging (in production, send to server)
    const existingLogs = JSON.parse(localStorage.getItem('securityLogs') || '[]');
    existingLogs.push(securityLog);
    
    // Keep only last 10 events to prevent storage bloat
    if (existingLogs.length > 10) {
      existingLogs.splice(0, existingLogs.length - 10);
    }
    
    localStorage.setItem('securityLogs', JSON.stringify(existingLogs));
  }

  /**
   * Enhanced refresh with security monitoring
   */
  async refreshWithRefreshTokenSecure(): Promise<RefreshTokenResponse> {
    const startTime = Date.now();
    
    try {
      // Log refresh attempt
      this.logSecurityEvent('refresh_token_usage', {
        hasValidToken: this.isRefreshTokenValid(),
        timeToExpiry: this.getRefreshTokenTimeToExpiry()
      });

      const result = await this.refreshWithRefreshToken();
      
      // Log successful refresh
      this.logSecurityEvent('refresh_token_success', {
        duration: Date.now() - startTime
      });

      return result;
      
    } catch (error: any) {
      // Log failed refresh with details
      this.logSecurityEvent('refresh_token_failure', {
        error: error.message,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }

  /**
   * Verify token consistency between metadata and actual tokens (async)
   */
  private async verifyTokenConsistencyAsync(): Promise<void> {
    try {
      console.log('🔍 Verifying token consistency...');
      
      const actualToken = await this.getStoredRefreshToken();
      const hasMetadata = !!localStorage.getItem('refreshTokenExpiryTime') || !!localStorage.getItem('refreshTokenCreatedAt');
      
      if (hasMetadata && !actualToken) {
        console.warn('⚠️ Token metadata exists but no actual token found - cleaning up inconsistent state');
        
        // Clear metadata to prevent confusion
        const metadataKeys = [
          'refreshExpiresIn',
          'refreshTokenExpiryTime', 
          'refreshTokenCreatedAt'
        ];
        
        metadataKeys.forEach(key => {
          const oldValue = localStorage.getItem(key);
          if (oldValue) {
            localStorage.removeItem(key);
            console.log(`🧹 Removed orphaned metadata: ${key} = ${oldValue}`);
          }
        });
        
        console.log('✅ Token consistency restored - metadata cleaned up');
      } else if (actualToken && hasMetadata) {
        console.log('✅ Token consistency verified - metadata and token both exist');
      } else {
        console.log('ℹ️ No token metadata found - consistency check skipped');
      }
    } catch (error) {
      console.error('❌ Token consistency verification failed:', error);
    }
  }

  /**
   * Check OAuth server connectivity and configuration
   */
  async checkServerConnectivity(): Promise<{
    isOnline: boolean;
    serverUrl: string;
    clientId: string;
    hasClientSecret: boolean;
    responseTime?: number;
    error?: string;
  }> {
    const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
    const startTime = Date.now();
    
    try {
      console.log('🌐 Checking OAuth server connectivity...');
      
      // OIDC discovery endpoint로 health check
      const response = await fetch(`${authUrl}/api/oauth/.well-known/openid-configuration`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        isOnline: response.ok,
        serverUrl: authUrl,
        clientId: this.clientId,
        hasClientSecret: !!this.clientSecret,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        isOnline: false,
        serverUrl: authUrl,
        clientId: this.clientId,
        hasClientSecret: !!this.clientSecret,
        responseTime,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Debug information for development (with encryption details)
   */
  async getDebugInfo() {
    const tokenInfo = this.getTokenInfo();
    const refreshTokenExpiryTime = localStorage.getItem('refreshTokenExpiryTime');
    const storageStatus = await secureTokenStorage.getStorageStatus();
    const securityContext = await this.validateSecurityContext();
    
    return {
      hasRefreshToken: !!localStorage.getItem('refreshToken') || storageStatus.hasEncryptedToken || storageStatus.hasPlaintextToken,
      isRefreshTokenValid: this.isRefreshTokenValid(),
      refreshTokenTimeToExpiry: this.getRefreshTokenTimeToExpiry(),
      needsRefreshTokenRenewal: this.needsRefreshTokenRenewal(),
      refreshTokenExpiryTime: refreshTokenExpiryTime ? new Date(parseInt(refreshTokenExpiryTime)).toISOString() : null,
      tokenInfo,
      clientId: this.clientId,
      hasClientSecret: !!this.clientSecret,
      securityLogs: JSON.parse(localStorage.getItem('securityLogs') || '[]').slice(-5), // Last 5 events
      encryptionStatus: storageStatus,
      securityContext: securityContext,
      storageDebug: secureTokenStorage.getDebugInfo()
    };
  }

  /**
   * Get security logs for monitoring
   */
  getSecurityLogs(): any[] {
    return JSON.parse(localStorage.getItem('securityLogs') || '[]');
  }

  /**
   * Clear security logs
   */
  clearSecurityLogs(): void {
    localStorage.removeItem('securityLogs');
    console.log('🧹 Security logs cleared');
  }

  /**
   * 네트워크 요청에 재시도 로직과 타임아웃을 적용한 fetch
   */
  private async fetchWithRetry(
    url: string, 
    options: RequestInit, 
    maxRetries: number = 3,
    baseDelay: number = 1000,
    timeout: number = 10000
  ): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 타임아웃을 적용한 fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // 성공적인 응답 또는 재시도 불가능한 오류의 경우 즉시 반환
        if (response.ok || 
            response.status === 400 || 
            response.status === 401 || 
            response.status === 403) {
          return response;
        }
        
        // 5xx 오류의 경우 재시도
        if (response.status >= 500 && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`🔄 Request failed with status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.delay(delay);
          continue;
        }
        
        return response;
        
      } catch (error: any) {
        lastError = error;
        
        // 네트워크 오류나 타임아웃인 경우 재시도
        const isNetworkError = error.name === 'TypeError' || 
                              error.name === 'AbortError' ||
                              error.message.includes('fetch');
        
        if (isNetworkError && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`🔄 Network error: ${error.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          
          // 보안 이벤트 로그
          this.logSecurityEvent('network_retry', {
            attempt: attempt + 1,
            error: error.message,
            url: url.replace(/refresh_token=[^&]+/, 'refresh_token=***')
          });
          
          await this.delay(delay);
          continue;
        }
        
        // 재시도 불가능한 오류이거나 최대 재시도 횟수 도달
        throw error;
      }
    }
    
    // 모든 재시도 실패
    console.error('❌ All retry attempts failed');
    throw new Error(TokenRefreshError.NETWORK_ERROR + (lastError ? ': ' + lastError.message : ''));
  }

  /**
   * 지연 유틸리티 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const refreshTokenService = RefreshTokenService.getInstance();

export default refreshTokenService;