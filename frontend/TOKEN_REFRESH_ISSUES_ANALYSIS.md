# Token Refresh System Analysis & Solutions

## Critical Issues Identified

### 1. Token Auto-Refresh Failures ❌

**Root Causes:**
- `startAutoTokenRefresh()` uses interval checking (20s) without immediate initial check
- 30-second cooldown prevents timely refresh attempts
- No proactive refresh before token expiry
- Multiple components can trigger concurrent refresh attempts

**Current Code Issues:**
```typescript
// authService.ts - Line 849-900
const checkAndRefresh = async () => {
  // Only checks every 20 seconds
  // 30-second cooldown can miss critical refresh windows
  if (now - lastRefreshAttempt < 30000) {
    return; // Blocks legitimate refresh attempts
  }
}
```

### 2. Access Token Update Failures ❌

**Root Causes:**
- Token updates not properly synchronized across components
- No event emission when tokens are updated
- Authorization headers not updated in pending requests
- Token storage scattered across multiple services

**Current Code Issues:**
```typescript
// refreshTokenService.ts - Line 224-248
async storeTokens(tokenResponse: TokenResponse): Promise<void> {
  // Direct localStorage writes without synchronization
  localStorage.setItem('accessToken', tokenResponse.access_token);
  // No event emission to notify other components
  // No update to existing axios instances
}
```

### 3. Cache Clearing During Crashes ❌

**Root Causes:**
- ErrorBoundary components don't clear auth state
- No global error handlers for unhandled errors
- `clearAllTokens()` not called during critical failures
- Session recovery doesn't validate token state

**Missing Implementation:**
```typescript
// ErrorBoundary.tsx - Missing auth cleanup
componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  // No auth token cleanup
  // No session invalidation
  // No cache clearing
}
```

### 4. Race Conditions ⚠️

**Root Causes:**
- No mutex/lock for token refresh operations
- Circuit breaker is per-tab (sessionStorage)
- Multiple parallel refresh attempts possible
- Token validation cache can become stale

## Comprehensive Solution

### Solution 1: Enhanced Token Auto-Refresh

```typescript
// src/services/enhancedTokenRefreshService.ts
import { EventEmitter } from 'events';

class EnhancedTokenRefreshService extends EventEmitter {
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshInProgress = false;
  private refreshPromise: Promise<any> | null = null;
  
  /**
   * Start intelligent token refresh with proactive renewal
   */
  startAutoRefresh(): () => void {
    // Immediate check on start
    this.checkAndRefreshIfNeeded();
    
    // Set up proactive refresh (5 minutes before expiry)
    this.scheduleProactiveRefresh();
    
    // Backup interval check (every 30 seconds)
    const intervalId = setInterval(() => {
      this.checkAndRefreshIfNeeded();
    }, 30000);
    
    // Return cleanup function
    return () => {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      clearInterval(intervalId);
      this.refreshInProgress = false;
      this.refreshPromise = null;
    };
  }
  
  /**
   * Schedule proactive refresh before token expires
   */
  private scheduleProactiveRefresh() {
    const tokenExpiryTime = parseInt(localStorage.getItem('tokenExpiryTime') || '0');
    const now = Date.now();
    const timeToExpiry = tokenExpiryTime - now;
    const refreshTime = timeToExpiry - (5 * 60 * 1000); // 5 minutes before expiry
    
    if (refreshTime > 0) {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      
      this.refreshTimer = setTimeout(() => {
        console.log('⏰ Proactive token refresh triggered');
        this.performRefresh();
      }, refreshTime);
    }
  }
  
  /**
   * Perform token refresh with mutex to prevent race conditions
   */
  private async performRefresh(): Promise<boolean> {
    // Prevent concurrent refresh attempts
    if (this.refreshInProgress) {
      console.log('🔄 Refresh already in progress, waiting...');
      return this.refreshPromise || Promise.resolve(false);
    }
    
    this.refreshInProgress = true;
    
    this.refreshPromise = (async () => {
      try {
        // Try refresh token first
        const hasRefreshToken = await refreshTokenService.isRefreshTokenValidAsync();
        
        if (hasRefreshToken) {
          const result = await refreshTokenService.refreshWithRefreshToken();
          
          // Emit token update event
          this.emit('tokenUpdated', {
            accessToken: result.access_token,
            expiresIn: result.expires_in
          });
          
          // Update all axios instances
          this.updateAxiosHeaders(result.access_token);
          
          // Schedule next proactive refresh
          this.scheduleProactiveRefresh();
          
          return true;
        }
        
        // Fallback to silent auth if safe
        if (isSafePageForTokenRefresh()) {
          const silentResult = await authService.attemptSilentLogin();
          
          if (silentResult.success) {
            this.emit('tokenUpdated', {
              accessToken: localStorage.getItem('accessToken'),
              source: 'silent_auth'
            });
            
            this.scheduleProactiveRefresh();
            return true;
          }
        }
        
        return false;
      } catch (error) {
        console.error('❌ Token refresh failed:', error);
        this.emit('tokenRefreshFailed', error);
        return false;
      } finally {
        this.refreshInProgress = false;
        this.refreshPromise = null;
      }
    })();
    
    return this.refreshPromise;
  }
  
  /**
   * Update all axios instance headers with new token
   */
  private updateAxiosHeaders(token: string) {
    // Update default axios headers
    if (window.axios) {
      window.axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    
    // Update apiClient headers
    if (window.apiClient) {
      window.apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    
    console.log('✅ Updated axios headers with new token');
  }
  
  /**
   * Check and refresh if needed (with debouncing)
   */
  private async checkAndRefreshIfNeeded() {
    const needsRefresh = authService.needsTokenRefresh();
    
    if (needsRefresh && !this.refreshInProgress) {
      console.log('🔄 Token needs refresh, initiating...');
      await this.performRefresh();
    }
  }
}

export const enhancedTokenRefresh = new EnhancedTokenRefreshService();
```

### Solution 2: Global Error Handler with Auth Cleanup

```typescript
// src/services/globalErrorHandler.ts
class GlobalErrorHandler {
  private isCleaningUp = false;
  
  initialize() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    
    // Handle global errors
    window.onerror = this.handleGlobalError;
    
    // Handle before unload (browser crash/close)
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    
    // Handle visibility change (tab switch/minimize)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }
  
  private handleUnhandledRejection = async (event: PromiseRejectionEvent) => {
    console.error('🚨 Unhandled Promise Rejection:', event.reason);
    
    // Check if auth-related error
    if (this.isAuthError(event.reason)) {
      await this.performAuthCleanup('unhandled_rejection');
    }
    
    // Log to error tracking service
    this.logError('unhandled_rejection', event.reason);
  };
  
  private handleGlobalError = async (
    message: string,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error
  ) => {
    console.error('🚨 Global Error:', { message, source, lineno, colno, error });
    
    // Check if critical error
    if (this.isCriticalError(error || new Error(message))) {
      await this.performAuthCleanup('global_error');
    }
    
    // Log to error tracking service
    this.logError('global_error', { message, source, error });
    
    return true; // Prevent default error handling
  };
  
  private handleBeforeUnload = (event: BeforeUnloadEvent) => {
    // Save current auth state for recovery
    this.saveAuthStateForRecovery();
    
    // If tokens are expired, clear them
    if (authService.needsTokenRefresh()) {
      this.performQuickCleanup();
    }
  };
  
  private handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      // Tab became visible, validate auth state
      await this.validateAndRecoverAuthState();
    }
  };
  
  /**
   * Perform auth cleanup during critical errors
   */
  private async performAuthCleanup(reason: string) {
    if (this.isCleaningUp) return;
    
    this.isCleaningUp = true;
    
    try {
      console.log(`🧹 Performing auth cleanup due to: ${reason}`);
      
      // Clear all tokens
      await refreshTokenService.clearAllTokens();
      
      // Clear user isolated storage
      await userIsolatedTokenStorage.clearAllTokens();
      
      // Clear SSO metadata
      localStorage.removeItem('auth_method');
      localStorage.removeItem('has_refresh_token');
      localStorage.removeItem('max_platform_session');
      localStorage.removeItem('token_renewable_via_sso');
      
      // Reset circuit breakers
      SsoRefreshCircuitBreaker.reset();
      
      // Clear auth store
      const { useAuthStore } = await import('../stores/authStore');
      useAuthStore.getState().logout();
      
      console.log('✅ Auth cleanup completed');
    } catch (error) {
      console.error('❌ Auth cleanup failed:', error);
    } finally {
      this.isCleaningUp = false;
    }
  }
  
  /**
   * Quick cleanup for immediate operations
   */
  private performQuickCleanup() {
    // Clear sensitive data from memory
    localStorage.removeItem('accessToken');
    sessionStorage.clear();
    
    // Invalidate token cache
    tokenRefreshManager.invalidateTokenValidationCache();
  }
  
  /**
   * Save auth state for potential recovery
   */
  private saveAuthStateForRecovery() {
    const authState = {
      timestamp: Date.now(),
      hadValidToken: authService.isAuthenticated(),
      tokenExpiry: localStorage.getItem('tokenExpiryTime'),
      userId: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).id : null
    };
    
    sessionStorage.setItem('auth_recovery_state', JSON.stringify(authState));
  }
  
  /**
   * Validate and recover auth state after tab visibility
   */
  private async validateAndRecoverAuthState() {
    const recoveryState = sessionStorage.getItem('auth_recovery_state');
    
    if (!recoveryState) return;
    
    const state = JSON.parse(recoveryState);
    const timeSinceHidden = Date.now() - state.timestamp;
    
    // If hidden for more than 5 minutes, refresh tokens
    if (timeSinceHidden > 5 * 60 * 1000 && state.hadValidToken) {
      console.log('🔄 Tab was hidden for >5 minutes, refreshing tokens...');
      await authService.refreshToken(true);
    }
    
    sessionStorage.removeItem('auth_recovery_state');
  }
  
  /**
   * Check if error is auth-related
   */
  private isAuthError(error: any): boolean {
    const authKeywords = ['401', 'unauthorized', 'token', 'auth', 'login', 'refresh'];
    const errorString = JSON.stringify(error).toLowerCase();
    
    return authKeywords.some(keyword => errorString.includes(keyword));
  }
  
  /**
   * Check if error is critical
   */
  private isCriticalError(error: Error): boolean {
    const criticalPatterns = [
      'SecurityError',
      'NetworkError',
      'CORS',
      'Failed to fetch',
      'NS_BINDING_ABORTED'
    ];
    
    return criticalPatterns.some(pattern => 
      error.message.includes(pattern) || error.name.includes(pattern)
    );
  }
  
  /**
   * Log error to tracking service
   */
  private logError(type: string, error: any) {
    // Send to error tracking service (Sentry, LogRocket, etc.)
    console.log('📊 Error logged:', { type, error });
  }
}

export const globalErrorHandler = new GlobalErrorHandler();
```

### Solution 3: Enhanced ErrorBoundary with Auth Cleanup

```typescript
// src/components/common/EnhancedErrorBoundary.tsx
import React from 'react';
import { refreshTokenService } from '../../services/refreshTokenService';

export class EnhancedErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 React Error Boundary caught:', error);
    
    // Perform auth cleanup for critical errors
    if (this.isCriticalError(error)) {
      this.performEmergencyAuthCleanup();
    }
    
    // Log to error service
    this.logErrorToService(error, errorInfo);
    
    // Call parent handler if exists
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }
  
  private isCriticalError(error: Error): boolean {
    // Check if error is auth-related or critical
    const criticalPatterns = [
      'ChunkLoadError',
      'NetworkError',
      'SecurityError',
      'TypeError: Failed to fetch'
    ];
    
    return criticalPatterns.some(pattern => error.message.includes(pattern));
  }
  
  private async performEmergencyAuthCleanup() {
    try {
      console.log('🚨 Performing emergency auth cleanup...');
      
      // Clear all auth data
      await refreshTokenService.clearAllTokens();
      
      // Clear circuit breakers
      if (window.SsoRefreshCircuitBreaker) {
        window.SsoRefreshCircuitBreaker.reset();
      }
      
      // Clear session storage
      sessionStorage.clear();
      
      // Mark session as crashed for recovery
      localStorage.setItem('session_crashed', Date.now().toString());
      
      console.log('✅ Emergency auth cleanup completed');
    } catch (cleanupError) {
      console.error('❌ Emergency cleanup failed:', cleanupError);
    }
  }
  
  private logErrorToService(error: Error, errorInfo: React.ErrorInfo) {
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack
      },
      errorInfo: errorInfo,
      authState: {
        isAuthenticated: !!localStorage.getItem('accessToken'),
        tokenExpired: authService.needsTokenRefresh(),
        hasRefreshToken: refreshTokenService.isRefreshTokenValid()
      },
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    // Store locally and/or send to service
    console.log('📊 Error report:', errorReport);
  }
  
  render() {
    if (this.state.hasError) {
      return this.renderErrorFallback();
    }
    
    return this.props.children;
  }
}
```

### Solution 4: Unified Token Storage Service

```typescript
// src/services/unifiedTokenStorage.ts
class UnifiedTokenStorage extends EventEmitter {
  private static instance: UnifiedTokenStorage;
  private memoryCache: Map<string, any> = new Map();
  
  static getInstance(): UnifiedTokenStorage {
    if (!UnifiedTokenStorage.instance) {
      UnifiedTokenStorage.instance = new UnifiedTokenStorage();
    }
    return UnifiedTokenStorage.instance;
  }
  
  /**
   * Store tokens with proper synchronization
   */
  async storeTokens(tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    refreshExpiresIn?: number;
  }): Promise<void> {
    const timestamp = Date.now();
    
    // Update memory cache first
    this.memoryCache.set('accessToken', tokens.accessToken);
    this.memoryCache.set('tokenTimestamp', timestamp);
    
    // Atomic localStorage update
    const updates = {
      accessToken: tokens.accessToken,
      tokenExpiryTime: (timestamp + tokens.expiresIn * 1000).toString(),
      tokenCreatedAt: timestamp.toString()
    };
    
    if (tokens.refreshToken) {
      updates.refreshToken = tokens.refreshToken;
      updates.refreshTokenExpiryTime = (timestamp + (tokens.refreshExpiresIn || 2592000) * 1000).toString();
    }
    
    // Batch update localStorage
    Object.entries(updates).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    
    // Update secure storage
    if (tokens.refreshToken) {
      await secureTokenStorage.storeRefreshToken(tokens.refreshToken);
    }
    
    // Emit update event
    this.emit('tokensUpdated', {
      accessToken: tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      timestamp
    });
    
    // Update all axios instances
    this.updateAxiosDefaults(tokens.accessToken);
    
    console.log('✅ Tokens stored and synchronized');
  }
  
  /**
   * Get current valid access token
   */
  getAccessToken(): string | null {
    // Check memory cache first
    const cached = this.memoryCache.get('accessToken');
    if (cached && this.isTokenValid(cached)) {
      return cached;
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem('accessToken');
    if (stored && this.isTokenValid(stored)) {
      this.memoryCache.set('accessToken', stored);
      return stored;
    }
    
    return null;
  }
  
  /**
   * Clear all tokens with proper cleanup
   */
  async clearAllTokens(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();
    
    // Clear localStorage
    const keysToRemove = [
      'accessToken',
      'refreshToken',
      'tokenExpiryTime',
      'refreshTokenExpiryTime',
      'tokenCreatedAt',
      'refreshTokenCreatedAt'
    ];
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Clear secure storage
    await secureTokenStorage.clearRefreshToken();
    
    // Clear user isolated storage
    await userIsolatedTokenStorage.clearAllTokens();
    
    // Emit clear event
    this.emit('tokensCleared');
    
    // Clear axios defaults
    this.clearAxiosDefaults();
    
    console.log('✅ All tokens cleared and synchronized');
  }
  
  /**
   * Validate token (basic check)
   */
  private isTokenValid(token: string): boolean {
    if (!token || token === 'undefined' || token === 'null') {
      return false;
    }
    
    // Check expiry
    const expiryTime = parseInt(localStorage.getItem('tokenExpiryTime') || '0');
    if (Date.now() >= expiryTime) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Update axios defaults
   */
  private updateAxiosDefaults(token: string) {
    const header = `Bearer ${token}`;
    
    // Update all known axios instances
    ['axios', 'apiClient', 'authClient'].forEach(instanceName => {
      if (window[instanceName]?.defaults?.headers) {
        window[instanceName].defaults.headers.common['Authorization'] = header;
      }
    });
  }
  
  /**
   * Clear axios defaults
   */
  private clearAxiosDefaults() {
    ['axios', 'apiClient', 'authClient'].forEach(instanceName => {
      if (window[instanceName]?.defaults?.headers) {
        delete window[instanceName].defaults.headers.common['Authorization'];
      }
    });
  }
}

export const unifiedTokenStorage = UnifiedTokenStorage.getInstance();
```

## Implementation Steps

1. **Phase 1: Critical Fixes** (Immediate)
   - Implement global error handler
   - Add auth cleanup to ErrorBoundary
   - Fix token refresh timing issues

2. **Phase 2: Enhancement** (1-2 days)
   - Implement unified token storage
   - Add proactive token refresh
   - Implement proper event emission

3. **Phase 3: Testing** (1 day)
   - Test crash recovery scenarios
   - Test token refresh race conditions
   - Test multi-tab synchronization

4. **Phase 4: Monitoring** (Ongoing)
   - Add error tracking
   - Monitor token refresh success rates
   - Track auth-related errors

## Testing Checklist

- [ ] Token auto-refreshes 5 minutes before expiry
- [ ] Access token updates properly in all requests
- [ ] Tokens clear during application crashes
- [ ] No race conditions during concurrent refresh
- [ ] Recovery works after tab visibility changes
- [ ] Circuit breaker prevents infinite loops
- [ ] Multi-tab synchronization works correctly
- [ ] Error boundaries handle auth cleanup

## Monitoring Metrics

- Token refresh success rate
- Average time to refresh
- Number of auth-related errors
- Session recovery success rate
- Circuit breaker activation frequency