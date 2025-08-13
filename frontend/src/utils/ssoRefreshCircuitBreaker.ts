/**
 * SSO Token Refresh Circuit Breaker
 * Prevents infinite loops when MAX Platform SSO token refresh fails repeatedly
 */

interface SsoRefreshFailure {
  timestamp: number;
  error: string;
  state?: string;
}

export class SsoRefreshCircuitBreaker {
  private static readonly STORAGE_KEY = 'sso_refresh_failures';
  private static readonly MAX_FAILURES = 3;
  private static readonly FAILURE_WINDOW = 5 * 60 * 1000; // 5 minutes
  private static readonly CIRCUIT_OPEN_DURATION = 10 * 60 * 1000; // 10 minutes

  /**
   * Record an SSO refresh failure
   */
  static recordFailure(error: string, state?: string): void {
    try {
      const failures = this.getFailures();
      const newFailure: SsoRefreshFailure = {
        timestamp: Date.now(),
        error,
        state
      };

      failures.push(newFailure);

      // Keep only recent failures
      const cutoff = Date.now() - this.FAILURE_WINDOW;
      const recentFailures = failures.filter(f => f.timestamp > cutoff);

      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentFailures));
      
      console.log('📊 SSO refresh failure recorded:', {
        error: error.substring(0, 50),
        totalFailures: recentFailures.length,
        withinWindow: recentFailures.length,
        circuitOpen: this.isCircuitOpen()
      });

      // If circuit breaker opens, clear SSO session metadata
      if (this.isCircuitOpen()) {
        this.clearSsoMetadata();
      }
    } catch (e) {
      console.warn('Failed to record SSO refresh failure:', e);
    }
  }

  /**
   * Check if circuit breaker is open (should block SSO refresh attempts)
   */
  static isCircuitOpen(): boolean {
    const failures = this.getFailures();
    const cutoff = Date.now() - this.FAILURE_WINDOW;
    const recentFailures = failures.filter(f => f.timestamp > cutoff);

    return recentFailures.length >= this.MAX_FAILURES;
  }

  /**
   * Check if SSO refresh should be allowed
   */
  static canAttemptSsoRefresh(): {
    allowed: boolean;
    reason?: string;
    failureCount?: number;
    nextAttemptIn?: number;
  } {
    const failures = this.getFailures();
    const cutoff = Date.now() - this.FAILURE_WINDOW;
    const recentFailures = failures.filter(f => f.timestamp > cutoff);

    if (recentFailures.length >= this.MAX_FAILURES) {
      const latestFailure = Math.max(...recentFailures.map(f => f.timestamp));
      const circuitOpenUntil = latestFailure + this.CIRCUIT_OPEN_DURATION;
      const nextAttemptIn = Math.max(0, circuitOpenUntil - Date.now());

      return {
        allowed: false,
        reason: 'SSO refresh circuit breaker is open due to repeated failures',
        failureCount: recentFailures.length,
        nextAttemptIn: Math.ceil(nextAttemptIn / 1000)
      };
    }

    return {
      allowed: true,
      failureCount: recentFailures.length
    };
  }

  /**
   * Clear circuit breaker state (manual reset)
   */
  static reset(): void {
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
      console.log('🔄 SSO refresh circuit breaker manually reset');
    } catch (e) {
      console.warn('Failed to reset SSO circuit breaker:', e);
    }
  }

  /**
   * Record successful SSO refresh (resets failure count)
   */
  static recordSuccess(): void {
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
      console.log('✅ SSO refresh successful - circuit breaker reset');
    } catch (e) {
      console.warn('Failed to record SSO success:', e);
    }
  }

  /**
   * Get current failure history
   */
  private static getFailures(): SsoRefreshFailure[] {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('Failed to parse SSO failures:', e);
      return [];
    }
  }

  /**
   * Clear SSO session metadata when circuit opens
   */
  private static clearSsoMetadata(): void {
    try {
      console.log('🚨 SSO circuit breaker opened - clearing SSO session metadata');
      
      // Clear localStorage items
      localStorage.removeItem('auth_method');
      localStorage.removeItem('has_refresh_token');
      localStorage.removeItem('max_platform_session');
      localStorage.removeItem('token_renewable_via_sso');
      localStorage.removeItem('sync_time');
      localStorage.removeItem('sso_refresh_return_data');
      
      // Clear sessionStorage items
      sessionStorage.removeItem('sso_refresh_return_url');
      sessionStorage.removeItem('last_sso_attempt');
      sessionStorage.removeItem('last_sso_failure');
      sessionStorage.removeItem('silent_oauth_state');
      
      // Set flag to prevent further silent auth attempts
      sessionStorage.setItem('preventSilentAuth', 'true');
      
      console.log('✅ SSO session metadata cleared to break infinite loop');
      
      // Dispatch event to notify components
      window.dispatchEvent(new CustomEvent('sso:circuit_breaker_open', {
        detail: { 
          message: 'SSO circuit breaker opened - authentication required',
          timestamp: Date.now()
        }
      }));
    } catch (e) {
      console.warn('Failed to clear SSO metadata:', e);
    }
  }

  /**
   * Get debug information
   */
  static getDebugInfo(): any {
    const failures = this.getFailures();
    const cutoff = Date.now() - this.FAILURE_WINDOW;
    const recentFailures = failures.filter(f => f.timestamp > cutoff);
    const canAttempt = this.canAttemptSsoRefresh();

    return {
      isCircuitOpen: this.isCircuitOpen(),
      totalFailures: failures.length,
      recentFailures: recentFailures.length,
      canAttemptSsoRefresh: canAttempt,
      failureWindow: this.FAILURE_WINDOW,
      circuitOpenDuration: this.CIRCUIT_OPEN_DURATION,
      maxFailures: this.MAX_FAILURES,
      failures: recentFailures.map(f => ({
        ...f,
        timeAgo: Date.now() - f.timestamp
      }))
    };
  }
}