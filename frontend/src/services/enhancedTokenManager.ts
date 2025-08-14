/**
 * Enhanced Token Manager with Backend Coordination
 * Integrates with backend distributed lock and provides optimized refresh strategy
 */

import { tokenRefreshManager } from './tokenRefreshManager';
import { oauthRequestCoordinator } from './oauthRequestCoordinator';
import { securityEventLogger } from './securityEventLogger';
import { optimizedSilentAuthManager } from './optimizedSilentAuthManager';

export interface TokenRefreshMetrics {
  totalAttempts: number;
  successfulRefreshes: number;
  failedRefreshes: number;
  cacheHits: number;
  averageRefreshTime: number;
  lastRefreshTimestamp: number;
}

export class EnhancedTokenManager {
  private static instance: EnhancedTokenManager;
  private refreshPromise: Promise<boolean> | null = null;
  private metrics: TokenRefreshMetrics = {
    totalAttempts: 0,
    successfulRefreshes: 0,
    failedRefreshes: 0,
    cacheHits: 0,
    averageRefreshTime: 0,
    lastRefreshTimestamp: 0
  };
  
  // Performance optimization parameters
  private readonly CACHE_DURATION = 10000; // 10 seconds
  private readonly PREEMPTIVE_REFRESH_THRESHOLD = 300; // 5 minutes before expiry
  private readonly MAX_CONCURRENT_REQUESTS = 1;
  
  private constructor() {
    this.initializePreemptiveRefresh();
    this.setupEventListeners();
  }
  
  public static getInstance(): EnhancedTokenManager {
    if (!EnhancedTokenManager.instance) {
      EnhancedTokenManager.instance = new EnhancedTokenManager();
    }
    return EnhancedTokenManager.instance;
  }
  
  /**
   * Optimized token refresh with singleton guarantee
   */
  public async refreshToken(options?: { 
    forceRefresh?: boolean;
    skipCache?: boolean;
  }): Promise<boolean> {
    // Return existing promise if refresh is in progress
    if (this.refreshPromise && !options?.forceRefresh) {
      console.log('🔄 Reusing existing refresh promise');
      this.metrics.cacheHits++;
      return this.refreshPromise;
    }
    
    // Check if token is still valid and doesn't need refresh
    if (!options?.forceRefresh && !options?.skipCache) {
      const tokenExpiry = this.getTokenExpiry();
      if (tokenExpiry && tokenExpiry - Date.now() > this.PREEMPTIVE_REFRESH_THRESHOLD * 1000) {
        console.log('✅ Token still valid, no refresh needed');
        this.metrics.cacheHits++;
        return Promise.resolve(true);
      }
    }
    
    // Create new refresh promise
    this.refreshPromise = this.performRefresh(options?.forceRefresh);
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      // Clear the promise after completion
      setTimeout(() => {
        this.refreshPromise = null;
      }, this.CACHE_DURATION);
    }
  }
  
  /**
   * Perform the actual token refresh
   */
  private async performRefresh(forceRefresh?: boolean): Promise<boolean> {
    const startTime = Date.now();
    this.metrics.totalAttempts++;
    
    try {
      console.log('🔄 Starting coordinated token refresh');
      
      // First try with the existing tokenRefreshManager
      let result = await tokenRefreshManager.refreshToken(
        undefined, // We'll handle silent auth internally if needed
        { forceRefresh }
      );
      
      // If refresh failed and not force refresh, try optimized silent auth as fallback
      if (!result && !forceRefresh) {
        console.log('🔄 Attempting optimized silent auth as fallback');
        
        const silentAuthResult = await optimizedSilentAuthManager.attemptSilentAuth({
          skipCache: forceRefresh,
          maxAge: 300 // Require auth within last 5 minutes
        });
        
        if (silentAuthResult.success && silentAuthResult.token) {
          // Store the token received from silent auth
          localStorage.setItem('accessToken', silentAuthResult.token);
          
          // Store token data if available
          if (silentAuthResult.tokenData) {
            const expiryTime = Date.now() + (silentAuthResult.tokenData.expires_in * 1000);
            localStorage.setItem('tokenExpiryTime', expiryTime.toString());
            
            if (silentAuthResult.tokenData.refresh_token) {
              localStorage.setItem('refreshToken', silentAuthResult.tokenData.refresh_token);
            }
          }
          
          result = true;
          console.log('✅ Optimized silent auth successful');
          
          securityEventLogger.logTokenEvent('silent_auth_success', {
            fromCache: silentAuthResult.fromCache,
            method: 'optimized'
          });
        }
      }
      
      if (result) {
        const refreshTime = Date.now() - startTime;
        this.updateMetrics(true, refreshTime);
        console.log(`✅ Token refresh successful in ${refreshTime}ms`);
        
        // Log to security event logger
        securityEventLogger.logTokenEvent('token_refresh_success', {
          refreshTime,
          method: 'coordinated',
          forced: forceRefresh
        });
        
        return true;
      } else {
        this.updateMetrics(false, Date.now() - startTime);
        console.log('❌ Token refresh failed');
        return false;
      }
    } catch (error: any) {
      const refreshTime = Date.now() - startTime;
      this.updateMetrics(false, refreshTime);
      
      console.error('❌ Token refresh error:', error);
      
      securityEventLogger.logTokenEvent('token_refresh_error', {
        error: error.message,
        refreshTime,
        forced: forceRefresh
      });
      
      throw error;
    }
  }
  
  /**
   * Initialize preemptive token refresh
   */
  private initializePreemptiveRefresh(): void {
    // Check token expiry every minute
    setInterval(async () => {
      const tokenExpiry = this.getTokenExpiry();
      if (!tokenExpiry) return;
      
      const timeToExpiry = tokenExpiry - Date.now();
      
      // Refresh if token expires in less than 5 minutes
      if (timeToExpiry > 0 && timeToExpiry < this.PREEMPTIVE_REFRESH_THRESHOLD * 1000) {
        console.log('⏰ Preemptive token refresh triggered');
        try {
          await this.refreshToken({ skipCache: true });
        } catch (error) {
          console.error('❌ Preemptive refresh failed:', error);
        }
      }
    }, 60000); // Check every minute
  }
  
  /**
   * Setup event listeners for token changes
   */
  private setupEventListeners(): void {
    // Listen for storage events (cross-tab synchronization)
    window.addEventListener('storage', (event) => {
      if (event.key === 'accessToken' && event.newValue) {
        console.log('🔄 Token updated in another tab');
        this.refreshPromise = null; // Clear promise as token is already refreshed
      }
    });
    
    // Listen for visibility changes (tab becomes active)
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) {
        const tokenExpiry = this.getTokenExpiry();
        if (tokenExpiry && tokenExpiry - Date.now() < 60000) {
          console.log('📱 Tab became active, checking token validity');
          await this.refreshToken();
        }
      }
    });
  }
  
  /**
   * Get token expiry time
   */
  private getTokenExpiry(): number | null {
    const expiryStr = localStorage.getItem('tokenExpiryTime');
    return expiryStr ? parseInt(expiryStr, 10) : null;
  }
  
  /**
   * Update performance metrics
   */
  private updateMetrics(success: boolean, refreshTime: number): void {
    if (success) {
      this.metrics.successfulRefreshes++;
    } else {
      this.metrics.failedRefreshes++;
    }
    
    // Update average refresh time
    const totalRefreshes = this.metrics.successfulRefreshes + this.metrics.failedRefreshes;
    this.metrics.averageRefreshTime = 
      (this.metrics.averageRefreshTime * (totalRefreshes - 1) + refreshTime) / totalRefreshes;
    
    this.metrics.lastRefreshTimestamp = Date.now();
  }
  
  /**
   * Get current metrics
   */
  public getMetrics(): TokenRefreshMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Reset metrics (for testing/debugging)
   */
  public resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      cacheHits: 0,
      averageRefreshTime: 0,
      lastRefreshTimestamp: 0
    };
  }
  
  /**
   * Force clear the refresh promise (for testing/debugging)
   */
  public clearRefreshPromise(): void {
    this.refreshPromise = null;
  }
  
  /**
   * Check if refresh is currently in progress
   */
  public isRefreshing(): boolean {
    return this.refreshPromise !== null;
  }
}

// Export singleton instance
export const enhancedTokenManager = EnhancedTokenManager.getInstance();