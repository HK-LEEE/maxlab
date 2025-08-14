/**
 * Token Synchronization Manager
 * Ensures tokens are synchronized between MAX Platform and MAXLab
 * Handles token validation and automatic refresh when needed
 */

import { TokenRefreshManager } from './tokenRefreshManager';
import { authSyncService } from './authSyncService';
import { securityEventLogger } from './securityEventLogger';

export interface TokenValidationResult {
  active: boolean;
  exp?: number;
  sub?: string;
  client_id?: string;
  scope?: string;
}

export class TokenSyncManager {
  private static instance: TokenSyncManager;
  private lastValidationTime = 0;
  private validationInterval = 30000; // 30 seconds
  private isValidating = false;
  private validationQueue: Array<(result: boolean) => void> = [];
  private readonly AUTH_SERVER_URL = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  private readonly CLIENT_ID = import.meta.env.VITE_CLIENT_ID || 'maxlab';
  private readonly CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET || '';

  private constructor() {
    this.initializeTokenSync();
  }

  public static getInstance(): TokenSyncManager {
    if (!TokenSyncManager.instance) {
      TokenSyncManager.instance = new TokenSyncManager();
    }
    return TokenSyncManager.instance;
  }

  /**
   * Initialize token synchronization
   */
  private initializeTokenSync(): void {
    // Listen for storage events (token changes in other tabs)
    window.addEventListener('storage', this.handleStorageChange.bind(this));
    
    // Periodic token validation
    setInterval(() => {
      this.validateTokenFreshness();
    }, 60000); // Check every minute
    
    console.log('✅ Token sync manager initialized');
  }

  /**
   * Handle storage change events
   */
  private handleStorageChange(event: StorageEvent): void {
    if (event.key === 'accessToken' && !event.newValue) {
      // Token was removed, might be logout or refresh
      console.log('🔄 Access token removed, checking token state...');
      this.validateTokenFreshness();
    }
  }

  /**
   * Validate token freshness and sync if needed
   */
  public async validateTokenFreshness(forceCheck = false): Promise<boolean> {
    const now = Date.now();
    
    // Skip if recently validated (unless forced)
    if (!forceCheck && now - this.lastValidationTime < this.validationInterval) {
      return true;
    }
    
    // Queue if validation is already in progress
    if (this.isValidating) {
      return new Promise((resolve) => {
        this.validationQueue.push(resolve);
      });
    }
    
    this.isValidating = true;
    
    try {
      const token = localStorage.getItem('accessToken');
      
      // No token, need to authenticate
      if (!token) {
        console.log('❌ No access token found');
        this.processValidationQueue(false);
        return false;
      }
      
      // Check token expiry first (quick check)
      const tokenExpiry = localStorage.getItem('tokenExpiryTime');
      if (tokenExpiry) {
        const expiryTime = parseInt(tokenExpiry, 10);
        const timeToExpiry = (expiryTime - now) / 1000;
        
        if (timeToExpiry < 60) {
          // Token expires in less than 1 minute, refresh proactively
          console.log(`⚠️ Token expires in ${timeToExpiry}s, refreshing proactively...`);
          const refreshed = await this.refreshToken();
          this.lastValidationTime = now;
          this.processValidationQueue(refreshed);
          return refreshed;
        }
        
        if (timeToExpiry > 300) {
          // Token is fresh enough, skip introspection
          this.lastValidationTime = now;
          this.processValidationQueue(true);
          return true;
        }
      }
      
      // Introspect token with auth server
      const isValid = await this.introspectToken(token);
      
      if (!isValid) {
        console.log('❌ Token is no longer valid, attempting refresh...');
        const refreshed = await this.refreshToken();
        this.lastValidationTime = now;
        this.processValidationQueue(refreshed);
        return refreshed;
      }
      
      this.lastValidationTime = now;
      this.processValidationQueue(true);
      return true;
      
    } catch (error) {
      console.error('Token validation error:', error);
      securityEventLogger.logTokenEvent('validation_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.processValidationQueue(false);
      return false;
    } finally {
      this.isValidating = false;
    }
  }

  /**
   * Process queued validation callbacks
   */
  private processValidationQueue(result: boolean): void {
    const queue = [...this.validationQueue];
    this.validationQueue = [];
    queue.forEach(callback => callback(result));
  }

  /**
   * Introspect token with auth server
   */
  private async introspectToken(token: string): Promise<boolean> {
    try {
      console.log('🔍 Introspecting token with auth server...');
      
      const response = await fetch(`${this.AUTH_SERVER_URL}/api/oauth/introspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: token,
          client_id: this.CLIENT_ID,
          ...(this.CLIENT_SECRET && { client_secret: this.CLIENT_SECRET })
        }),
      });
      
      if (!response.ok) {
        console.error('Token introspection failed:', response.status);
        return false;
      }
      
      const result: TokenValidationResult = await response.json();
      
      // Check if token is active and not expired
      if (!result.active) {
        console.log('❌ Token is not active');
        return false;
      }
      
      // Check expiration
      if (result.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (result.exp <= now) {
          console.log('❌ Token has expired');
          return false;
        }
        
        // Update local expiry time
        localStorage.setItem('tokenExpiryTime', (result.exp * 1000).toString());
      }
      
      console.log('✅ Token is valid and active');
      return true;
      
    } catch (error) {
      console.error('Token introspection error:', error);
      // On error, assume token might be valid (network issue)
      return true;
    }
  }

  /**
   * Refresh the access token
   */
  private async refreshToken(): Promise<boolean> {
    try {
      console.log('🔄 Initiating token refresh...');
      
      // Clear stale token
      const oldToken = localStorage.getItem('accessToken');
      if (oldToken) {
        localStorage.setItem('previousAccessToken', oldToken);
        localStorage.removeItem('accessToken');
      }
      
      // Use token refresh manager
      const refreshManager = TokenRefreshManager.getInstance();
      const success = await refreshManager.refreshToken(undefined, { forceRefresh: true });
      
      if (success) {
        console.log('✅ Token refreshed successfully');
        
        // Broadcast token refresh to other tabs
        const newToken = localStorage.getItem('accessToken');
        if (newToken) {
          authSyncService.broadcastTokenRefresh(newToken);
        }
        
        // Log successful refresh
        securityEventLogger.logTokenEvent('token_sync_refresh', {
          reason: 'stale_token_detected',
          previousTokenPrefix: oldToken?.substring(0, 10),
          success: true
        });
      } else {
        console.error('❌ Token refresh failed');
        
        // Restore old token if refresh failed
        const previousToken = localStorage.getItem('previousAccessToken');
        if (previousToken) {
          localStorage.setItem('accessToken', previousToken);
          localStorage.removeItem('previousAccessToken');
        }
      }
      
      return success;
      
    } catch (error) {
      console.error('Token refresh error:', error);
      securityEventLogger.logTokenEvent('token_sync_refresh_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Force token synchronization
   */
  public async forceTokenSync(): Promise<boolean> {
    console.log('🔄 Forcing token synchronization...');
    return this.validateTokenFreshness(true);
  }

  /**
   * Get token sync status
   */
  public getTokenSyncStatus(): {
    lastValidation: number;
    isValidating: boolean;
    hasToken: boolean;
    tokenExpiry: number | null;
    isExpired: boolean;
    timeToExpiry: number | null;
  } {
    const token = localStorage.getItem('accessToken');
    const expiry = localStorage.getItem('tokenExpiryTime');
    const now = Date.now();
    
    let tokenExpiry: number | null = null;
    let isExpired = false;
    let timeToExpiry: number | null = null;
    
    if (expiry) {
      tokenExpiry = parseInt(expiry, 10);
      isExpired = tokenExpiry < now;
      timeToExpiry = Math.max(0, (tokenExpiry - now) / 1000);
    }
    
    return {
      lastValidation: this.lastValidationTime,
      isValidating: this.isValidating,
      hasToken: !!token,
      tokenExpiry,
      isExpired,
      timeToExpiry
    };
  }

  /**
   * Debug helper - log current token state
   */
  public debugTokenState(context = 'Debug'): void {
    const status = this.getTokenSyncStatus();
    console.log(`[Token Sync - ${context}]`, {
      ...status,
      tokenPrefix: localStorage.getItem('accessToken')?.substring(0, 10),
      refreshTokenExists: !!localStorage.getItem('refreshToken'),
      timeSinceLastValidation: status.lastValidation 
        ? (Date.now() - status.lastValidation) / 1000 
        : null
    });
  }
}

// Export singleton instance
export const tokenSyncManager = TokenSyncManager.getInstance();