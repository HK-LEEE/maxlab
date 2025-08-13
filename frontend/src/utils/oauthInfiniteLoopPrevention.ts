/**
 * OAuth Infinite Loop Prevention System for MaxLab
 * Detects and prevents OAuth authentication infinite loops
 * 
 * PROBLEM ANALYSIS:
 * - Frontend detects user as authenticated (from cached state)
 * - Tries to redirect to OAuth authorize endpoint
 * - Request gets aborted (NS_BINDING_ABORTED) due to session mismatch
 * - Falls back to unauthenticated state
 * - Cycle repeats infinitely
 * 
 * SOLUTION:
 * - Circuit breaker pattern for OAuth attempts
 * - Token validation with server verification
 * - Graceful fallback to manual login
 * - State cleanup and recovery mechanisms
 */

interface OAuthAttempt {
  timestamp: number;
  type: 'auto' | 'manual' | 'retry';
  success: boolean;
  error?: string;
  aborted?: boolean;
  path?: string; // Track the path where attempt was made
  isDoubleInit?: boolean; // Track if this is a double initialization
}

interface OAuthLoopState {
  attempts: OAuthAttempt[];
  lastSuccessfulAuth: number | null;
  circuitBreakerOpen: boolean;
  consecutiveFailures: number;
  totalAbortedRequests: number;
  doubleInitDetections: number; // Track double initialization detections
  lastDoubleInitTime: number | null; // Track when last double init was detected
}

export class OAuthInfiniteLoopPrevention {
  private static readonly STORAGE_KEY = 'maxlab_oauth_loop_prevention';
  private static readonly MAX_ATTEMPTS_PER_MINUTE = 3;
  private static readonly MAX_CONSECUTIVE_FAILURES = 5;
  private static readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_ABORTED_REQUESTS = 3;
  
  private state: OAuthLoopState = {
    attempts: [],
    lastSuccessfulAuth: null,
    circuitBreakerOpen: false,
    consecutiveFailures: 0,
    totalAbortedRequests: 0,
    doubleInitDetections: 0,
    lastDoubleInitTime: null
  };

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    try {
      const stored = sessionStorage.getItem(OAuthInfiniteLoopPrevention.STORAGE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
        
        // Clean up old attempts (older than 1 hour)
        const oneHourAgo = Date.now() - 3600000;
        this.state.attempts = this.state.attempts.filter(attempt => attempt.timestamp > oneHourAgo);
      } else {
        this.resetState();
      }
    } catch (error) {
      console.warn('Failed to load OAuth loop prevention state:', error);
      this.resetState();
    }
  }

  private saveState(): void {
    try {
      sessionStorage.setItem(OAuthInfiniteLoopPrevention.STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn('Failed to save OAuth loop prevention state:', error);
    }
  }

  private resetState(): void {
    this.state = {
      attempts: [],
      lastSuccessfulAuth: null,
      circuitBreakerOpen: false,
      consecutiveFailures: 0,
      totalAbortedRequests: 0,
      doubleInitDetections: 0,
      lastDoubleInitTime: null
    };
    this.saveState();
  }

  /**
   * Check if OAuth attempt should be allowed
   * Returns true if attempt can proceed, false if blocked
   */
  public canAttemptOAuth(type: 'auto' | 'manual' | 'retry' = 'auto'): {
    allowed: boolean;
    reason?: string;
    suggestedAction?: string;
    waitTime?: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Count recent attempts
    const recentAttempts = this.state.attempts.filter(attempt => attempt.timestamp > oneMinuteAgo);
    const recentAbortedAttempts = recentAttempts.filter(attempt => attempt.aborted);

    console.log('🔍 MaxLab OAuth loop prevention check:', {
      type,
      recentAttempts: recentAttempts.length,
      recentAborted: recentAbortedAttempts.length,
      consecutiveFailures: this.state.consecutiveFailures,
      circuitBreakerOpen: this.state.circuitBreakerOpen,
      totalAborted: this.state.totalAbortedRequests
    });

    // Check circuit breaker
    if (this.state.circuitBreakerOpen) {
      const timeSinceLastFailure = this.state.attempts.length > 0 
        ? now - this.state.attempts[this.state.attempts.length - 1].timestamp 
        : 0;
      
      if (timeSinceLastFailure < OAuthInfiniteLoopPrevention.CIRCUIT_BREAKER_TIMEOUT) {
        const waitTime = OAuthInfiniteLoopPrevention.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure;
        return {
          allowed: false,
          reason: 'Circuit breaker is open due to repeated failures',
          suggestedAction: 'Wait for circuit breaker to reset or try manual login',
          waitTime: Math.ceil(waitTime / 1000)
        };
      } else {
        // Reset circuit breaker
        this.state.circuitBreakerOpen = false;
        this.state.consecutiveFailures = 0;
        console.log('🔄 Circuit breaker reset after timeout');
      }
    }

    // Check for too many attempts in short time
    if (recentAttempts.length >= OAuthInfiniteLoopPrevention.MAX_ATTEMPTS_PER_MINUTE) {
      return {
        allowed: false,
        reason: 'Too many OAuth attempts in the last minute',
        suggestedAction: 'Please wait a minute before trying again or use manual login'
      };
    }

    // Check for too many aborted requests (infinite loop detection)
    if (recentAbortedAttempts.length >= OAuthInfiniteLoopPrevention.MAX_ABORTED_REQUESTS) {
      return {
        allowed: false,
        reason: 'Multiple OAuth requests were aborted - possible infinite loop detected',
        suggestedAction: 'Clear browser cache and cookies, then try manual login'
      };
    }

    // Check consecutive failures
    if (this.state.consecutiveFailures >= OAuthInfiniteLoopPrevention.MAX_CONSECUTIVE_FAILURES && type === 'auto') {
      return {
        allowed: false,
        reason: 'Too many consecutive automatic OAuth failures',
        suggestedAction: 'Try manual login or check your network connection'
      };
    }

    // Manual attempts are always allowed (with some limitations)
    if (type === 'manual') {
      return { allowed: true };
    }

    // Auto attempts require more careful checking
    if (type === 'auto') {
      // Don't allow auto attempts if we've had recent failures
      const recentFailures = recentAttempts.filter(attempt => !attempt.success);
      if (recentFailures.length >= 2) {
        return {
          allowed: false,
          reason: 'Recent automatic OAuth failures detected',
          suggestedAction: 'Try manual login instead'
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Detect double initialization pattern
   */
  public detectDoubleInitialization(): boolean {
    const now = Date.now();
    const recentAttempts = this.state.attempts.filter(attempt => attempt.timestamp > now - 5000); // Last 5 seconds
    
    // Check if we have multiple attempts in a very short time from the same flow
    if (recentAttempts.length >= 2) {
      const intervals = [];
      for (let i = 1; i < recentAttempts.length; i++) {
        intervals.push(recentAttempts[i].timestamp - recentAttempts[i-1].timestamp);
      }
      
      // If attempts are less than 200ms apart, it's likely double initialization
      if (intervals.some(interval => interval < 200)) {
        this.state.doubleInitDetections++;
        this.state.lastDoubleInitTime = now;
        this.saveState();
        console.warn('🚨 Double initialization detected - multiple OAuth attempts within 200ms');
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Record an OAuth attempt
   */
  public recordAttempt(type: 'auto' | 'manual' | 'retry', success: boolean, error?: string, path?: string): void {
    const now = Date.now();
    const isDoubleInit = this.detectDoubleInitialization();
    
    const attempt: OAuthAttempt = {
      timestamp: now,
      type,
      success,
      error,
      aborted: error?.includes('aborted') || error?.includes('NS_BINDING_ABORTED') || false,
      path: path || window.location.pathname,
      isDoubleInit
    };

    this.state.attempts.push(attempt);

    if (success) {
      this.state.lastSuccessfulAuth = attempt.timestamp;
      this.state.consecutiveFailures = 0;
      this.state.circuitBreakerOpen = false;
      console.log('✅ MaxLab OAuth success recorded, resetting failure counters');
    } else {
      this.state.consecutiveFailures++;
      
      if (attempt.aborted) {
        this.state.totalAbortedRequests++;
        console.log('🚨 MaxLab OAuth request aborted - potential infinite loop indicator');
      }

      // Open circuit breaker if too many consecutive failures
      if (this.state.consecutiveFailures >= OAuthInfiniteLoopPrevention.MAX_CONSECUTIVE_FAILURES) {
        this.state.circuitBreakerOpen = true;
        console.log('🔌 Circuit breaker opened due to consecutive failures');
      }
    }

    this.saveState();
    
    console.log('📊 MaxLab OAuth attempt recorded:', {
      type,
      success,
      error: error ? error.substring(0, 50) + '...' : 'none',
      aborted: attempt.aborted,
      consecutiveFailures: this.state.consecutiveFailures,
      totalAborted: this.state.totalAbortedRequests
    });
  }

  /**
   * Detect if we're currently in an infinite loop
   */
  public detectInfiniteLoop(): {
    inLoop: boolean;
    confidence: number;
    indicators: string[];
    recommendation: string;
  } {
    const now = Date.now();
    const recentAttempts = this.state.attempts.filter(attempt => attempt.timestamp > now - 120000); // Last 2 minutes
    
    const indicators: string[] = [];
    let confidence = 0;

    // Check for rapid repeated attempts
    if (recentAttempts.length >= 4) {
      indicators.push('Rapid repeated OAuth attempts');
      confidence += 30;
    }

    // Check for high abort rate
    const abortedRecent = recentAttempts.filter(attempt => attempt.aborted);
    if (abortedRecent.length >= 2) {
      indicators.push('Multiple aborted requests');
      confidence += 40;
    }

    // Check for alternating success/failure pattern (cached vs server mismatch)
    if (recentAttempts.length >= 3) {
      const pattern = recentAttempts.slice(-3).map(a => a.success);
      if (pattern.every((success, i) => i === 0 || success !== pattern[i-1])) {
        indicators.push('Alternating success/failure pattern');
        confidence += 25;
      }
    }

    // Check for auto-attempts without user interaction
    const autoAttempts = recentAttempts.filter(attempt => attempt.type === 'auto');
    if (autoAttempts.length >= 3 && autoAttempts.length / recentAttempts.length > 0.7) {
      indicators.push('Predominantly automatic attempts');
      confidence += 20;
    }

    // Check time intervals (loops typically happen quickly)
    if (recentAttempts.length >= 3) {
      const intervals = [];
      for (let i = 1; i < recentAttempts.length; i++) {
        intervals.push(recentAttempts[i].timestamp - recentAttempts[i-1].timestamp);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval < 5000) { // Less than 5 seconds between attempts
        indicators.push('Very short intervals between attempts');
        confidence += 15;
      }
    }

    // Check for double initialization pattern
    const doubleInitAttempts = recentAttempts.filter(attempt => attempt.isDoubleInit);
    if (doubleInitAttempts.length >= 2 || this.state.doubleInitDetections >= 2) {
      indicators.push('Double initialization pattern detected');
      confidence += 35;
    }

    // Check for OAuth callback path issues
    const callbackAttempts = recentAttempts.filter(attempt => attempt.path === '/oauth/callback');
    if (callbackAttempts.length >= 2 && callbackAttempts.some(a => !a.success)) {
      indicators.push('OAuth callback page initialization issues');
      confidence += 25;
    }

    const inLoop = confidence >= 50;
    
    let recommendation = '';
    if (inLoop) {
      if (indicators.includes('Multiple aborted requests')) {
        recommendation = 'Clear browser cache and cookies, then try manual login';
      } else if (indicators.includes('Alternating success/failure pattern')) {
        recommendation = 'Session mismatch detected - logout completely and try again';
      } else {
        recommendation = 'Stop automatic attempts and use manual login';
      }
    }

    console.log('🔍 MaxLab Infinite loop detection result:', {
      inLoop,
      confidence,
      indicators,
      recentAttempts: recentAttempts.length
    });

    return { inLoop, confidence, indicators, recommendation };
  }

  /**
   * Get recovery actions for current state
   */
  public getRecoveryActions(): Array<{
    action: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    automated?: boolean;
  }> {
    const actions = [];
    const loopDetection = this.detectInfiniteLoop();

    if (loopDetection.inLoop) {
      if (loopDetection.indicators.includes('Multiple aborted requests')) {
        actions.push({
          action: 'clear_browser_data',
          description: 'Clear browser cache and cookies',
          priority: 'high' as const
        });
      }

      if (loopDetection.indicators.includes('Alternating success/failure pattern')) {
        actions.push({
          action: 'force_logout',
          description: 'Force complete logout from all services',
          priority: 'high' as const,
          automated: true
        });
      }

      actions.push({
        action: 'manual_login',
        description: 'Use manual login instead of automatic',
        priority: 'high' as const
      });
    }

    if (this.state.circuitBreakerOpen) {
      actions.push({
        action: 'wait_circuit_breaker',
        description: 'Wait for circuit breaker to reset',
        priority: 'medium' as const
      });
    }

    if (this.state.totalAbortedRequests >= 2) {
      actions.push({
        action: 'check_network',
        description: 'Check network connection and firewall',
        priority: 'medium' as const
      });
    }

    actions.push({
      action: 'reset_oauth_state',
      description: 'Reset OAuth state and try again',
      priority: 'low' as const,
      automated: true
    });

    return actions;
  }

  /**
   * Execute automated recovery action
   */
  public async executeRecoveryAction(action: string): Promise<boolean> {
    try {
      switch (action) {
        case 'force_logout':
          return this.forceCompleteLogout();
        
        case 'reset_oauth_state':
          return this.resetOAuthState();
        
        default:
          console.warn('Unknown automated recovery action:', action);
          return false;
      }
    } catch (error) {
      console.error('Recovery action failed:', error);
      return false;
    }
  }

  private async forceCompleteLogout(): Promise<boolean> {
    try {
      console.log('🔄 MaxLab: Executing force complete logout...');
      
      // Clear all auth-related storage
      const authKeys = [
        'accessToken', 'tokenType', 'expiresIn', 'scope',
        'tokenExpiryTime', 'tokenCreatedAt', 'refreshToken',
        'refreshTokenExpiry', 'lastTokenRefresh', 'user',
        'oauth_result', 'oauth_success', 'oauth_token_data',
        'oauth_access_token', 'oauth_completion_timestamp'
      ];
      
      authKeys.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });

      // Clear MaxLab Zustand store
      sessionStorage.removeItem('maxlab-auth-storage');
      
      // Reset our own state
      this.resetState();
      
      console.log('✅ MaxLab force logout completed');
      return true;
    } catch (error) {
      console.error('MaxLab force logout failed:', error);
      return false;
    }
  }

  private resetOAuthState(): boolean {
    try {
      console.log('🔄 MaxLab: Resetting OAuth state...');
      
      // Clear OAuth-specific storage
      const oauthKeys = Object.keys(sessionStorage).filter(key => 
        key.includes('oauth') || key.includes('_force_') || key.includes('state_')
      );
      
      oauthKeys.forEach(key => sessionStorage.removeItem(key));
      
      // Reset our tracking state
      this.resetState();
      
      console.log('✅ MaxLab OAuth state reset completed');
      return true;
    } catch (error) {
      console.error('MaxLab OAuth state reset failed:', error);
      return false;
    }
  }

  /**
   * Get current state for debugging
   */
  public getDebugState(): any {
    return {
      ...this.state,
      currentTime: Date.now(),
      timeSinceLastAttempt: this.state.attempts.length > 0 
        ? Date.now() - this.state.attempts[this.state.attempts.length - 1].timestamp 
        : null,
      timeSinceLastSuccess: this.state.lastSuccessfulAuth 
        ? Date.now() - this.state.lastSuccessfulAuth 
        : null
    };
  }

  /**
   * Manual reset - for user-initiated recovery
   */
  public manualReset(): void {
    console.log('🔄 MaxLab manual reset initiated');
    this.resetState();
  }
}

// Export singleton instance
export const oauthLoopPrevention = new OAuthInfiniteLoopPrevention();

/**
 * Hook for React components to use OAuth loop prevention
 */
export function useOAuthLoopPrevention() {
  const canAttempt = (type: 'auto' | 'manual' | 'retry' = 'auto') => {
    return oauthLoopPrevention.canAttemptOAuth(type);
  };

  const recordAttempt = (type: 'auto' | 'manual' | 'retry', success: boolean, error?: string, path?: string) => {
    oauthLoopPrevention.recordAttempt(type, success, error, path);
  };

  const detectLoop = () => {
    return oauthLoopPrevention.detectInfiniteLoop();
  };

  const getRecoveryActions = () => {
    return oauthLoopPrevention.getRecoveryActions();
  };

  const executeRecovery = async (action: string) => {
    return oauthLoopPrevention.executeRecoveryAction(action);
  };

  const manualReset = () => {
    oauthLoopPrevention.manualReset();
  };

  const getDebugState = () => {
    return oauthLoopPrevention.getDebugState();
  };

  return {
    canAttempt,
    recordAttempt,
    detectLoop,
    getRecoveryActions,
    executeRecovery,
    manualReset,
    getDebugState
  };
}

/**
 * Enhanced auth service wrapper with loop prevention for MaxLab
 */
export class MaxLabOAuthServiceWithLoopPrevention {
  private loopPrevention: OAuthInfiniteLoopPrevention;

  constructor() {
    this.loopPrevention = new OAuthInfiniteLoopPrevention();
  }

  async attemptAuthentication(type: 'auto' | 'manual' | 'retry' = 'auto'): Promise<any> {
    // Check if attempt is allowed
    const canAttempt = this.loopPrevention.canAttemptOAuth(type);
    
    if (!canAttempt.allowed) {
      console.warn('🚫 MaxLab OAuth attempt blocked by loop prevention:', canAttempt.reason);
      
      // If it's an automatic attempt that's blocked, fail silently
      if (type === 'auto') {
        throw new Error(`Automatic OAuth blocked: ${canAttempt.reason}`);
      }
      
      // For manual attempts, provide user-friendly error
      const error = new Error(canAttempt.reason + '\n\nSuggested action: ' + canAttempt.suggestedAction);
      (error as any).blocked = true;
      (error as any).suggestion = canAttempt.suggestedAction;
      (error as any).waitTime = canAttempt.waitTime;
      throw error;
    }

    try {
      // Attempt authentication (this would call your existing OAuth service)
      console.log('🔐 MaxLab: Attempting OAuth authentication:', type);
      
      // This is where you'd call your existing PopupOAuthLogin or other auth method
      // For now, we'll simulate the call
      const result = await this.performActualAuthentication(type);
      
      // Record successful attempt
      this.loopPrevention.recordAttempt(type, true);
      
      return result;
    } catch (error: any) {
      // Record failed attempt
      this.loopPrevention.recordAttempt(type, false, error.message);
      
      // Check if we should trigger recovery
      const loopDetection = this.loopPrevention.detectInfiniteLoop();
      if (loopDetection.inLoop) {
        console.warn('🚨 MaxLab OAuth infinite loop detected!', loopDetection);
        
        // Try automated recovery
        const recoveryActions = this.loopPrevention.getRecoveryActions();
        const automatedAction = recoveryActions.find(action => action.automated);
        
        if (automatedAction) {
          console.log('🔄 MaxLab: Attempting automated recovery:', automatedAction.action);
          const recoverySuccess = await this.loopPrevention.executeRecoveryAction(automatedAction.action);
          
          if (recoverySuccess) {
            console.log('✅ MaxLab automated recovery successful');
          }
        }
        
        // Enhance error with loop information
        (error as any).infiniteLoop = true;
        (error as any).loopDetection = loopDetection;
        (error as any).recoveryActions = recoveryActions;
      }
      
      throw error;
    }
  }

  private async performActualAuthentication(type: string): Promise<any> {
    // This is where you'd integrate with your existing OAuth implementation
    // For example, calling PopupOAuthLogin.startAuth() or similar
    
    // Placeholder implementation
    throw new Error('Integration with actual OAuth service needed');
  }
}