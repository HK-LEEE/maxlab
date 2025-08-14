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
  private lastSyncTime = 0;
  private syncInterval = 30000; // 30 seconds minimum between syncs
  private isValidating = false;
  private isSyncing = false;
  private validationQueue: Array<(result: boolean) => void> = [];
  private readonly AUTH_SERVER_URL = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  private readonly MAX_PLATFORM_URL = import.meta.env.VITE_MAX_PLATFORM_URL || 'https://max.dwchem.co.kr';
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
    
    // Periodic token validation and sync
    setInterval(() => {
      this.syncTokensFromPlatform().catch(error => {
        console.error('Periodic token sync failed:', error);
      });
    }, 60000); // Check every minute
    
    // Sync on window focus
    window.addEventListener('focus', () => {
      this.syncTokensFromPlatform().catch(error => {
        console.error('Focus token sync failed:', error);
      });
    });
    
    console.log('✅ Token sync manager initialized with cross-domain sync');
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
   * Sync tokens from MAX Platform
   * This solves the multi-domain token mismatch issue
   */
  public async syncTokensFromPlatform(): Promise<boolean> {
    if (this.isSyncing) {
      console.log('⏳ Token sync already in progress');
      return false;
    }
    
    const now = Date.now();
    if (now - this.lastSyncTime < this.syncInterval) {
      console.log('⏰ Token sync throttled, too soon since last sync');
      return false;
    }
    
    this.isSyncing = true;
    
    try {
      console.log('🔄 Syncing tokens from MAX Platform...');
      
      // Call MAX Platform to get current token
      const response = await fetch(`${this.MAX_PLATFORM_URL}/api/auth/current-token`, {
        method: 'GET',
        credentials: 'include', // Important: send cookies
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.access_token) {
          const currentToken = localStorage.getItem('accessToken');
          
          // Only update if token is different
          if (currentToken !== data.access_token) {
            console.log('✅ Received fresh token from MAX Platform, updating local storage');
            console.log('Token sync details:', {
              source: data.source,
              synced: data.synced,
              expires_in: data.expires_in
            });
            
            // Update localStorage
            localStorage.setItem('accessToken', data.access_token);
            
            // Update expiry time if provided
            if (data.expires_in) {
              const expiryTime = Date.now() + (data.expires_in * 1000);
              localStorage.setItem('tokenExpiryTime', expiryTime.toString());
            }
            
            // Log the sync event
            securityEventLogger.logTokenEvent('token_synced_from_platform', {
              source: data.source,
              synced: data.synced,
              expires_in: data.expires_in
            });
            
            // Notify other components
            window.dispatchEvent(new CustomEvent('token-synced', {
              detail: { 
                token: data.access_token,
                source: 'max_platform'
              }
            }));
            
            // Broadcast to other tabs
            authSyncService.broadcastTokenRefresh(data.access_token);
            
            this.lastSyncTime = now;
            return true;
          } else {
            console.log('ℹ️ Token already up to date');
          }
        }
      } else if (response.status === 401) {
        console.warn('⚠️ Not authenticated with MAX Platform, need to login');
        // Clear local tokens as they're invalid
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tokenExpiryTime');
        
        // Redirect to login
        window.location.href = `${this.MAX_PLATFORM_URL}/login?return_url=${encodeURIComponent(window.location.href)}`;
        return false;
      } else {
        console.error('Token sync failed with status:', response.status);
      }
      
      this.lastSyncTime = now;
      return false;
      
    } catch (error) {
      console.error('❌ Failed to sync tokens from MAX Platform:', error);
      // Don't update lastSyncTime on error to allow retry sooner
      return false;
    } finally {
      this.isSyncing = false;
    }
  }
  
  /**
   * Validate token freshness and sync if needed
   */
  public async validateTokenFreshness(forceCheck = false): Promise<boolean> {
    // First, try to sync from MAX Platform
    const syncResult = await this.syncTokensFromPlatform();
    if (syncResult) {
      // Token was synced successfully, it's fresh
      return true;
    }
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