/**
 * 🔒 SECURITY: OAuth Cross-Origin Communication Recovery Utility
 * 
 * Handles OAuth server redirect URI mismatches and cross-origin communication failures.
 * This utility specifically addresses the issue where OAuth server redirects to 
 * http://localhost:3000/login instead of configured callback URL http://localhost:3010/oauth/callback
 */

export interface CrossOriginRecoveryOptions {
  // Expected callback URL patterns
  expectedCallbacks: string[];
  // Actual redirect URLs that might be misconfigured
  knownMisconfigurations: string[];
  // Maximum time to wait for cross-origin messages
  timeoutMs: number;
  // Whether to use aggressive recovery methods
  aggressiveRecovery: boolean;
}

export interface RecoveryResult {
  success: boolean;
  method: 'direct' | 'proxy' | 'storage' | 'broadcast' | 'polling';
  error?: string;
  tokenData?: any;
}

/**
 * 🔧 SECURITY FIX: Cross-Origin OAuth Communication Recovery
 * 
 * This class handles the specific case where OAuth server redirects to wrong port,
 * breaking popup-parent communication due to cross-origin restrictions.
 */
export class OAuthCrossOriginRecovery {
  private options: CrossOriginRecoveryOptions;
  private recoveryAttempts: number = 0;
  private maxRecoveryAttempts: number = 3; // Reduced from 5 to prevent excessive attempts
  private static recoveryInProgress: boolean = false; // Prevent concurrent recoveries

  constructor(options: Partial<CrossOriginRecoveryOptions> = {}) {
    this.options = {
      expectedCallbacks: [
        'http://localhost:3010/oauth/callback',
        'http://localhost:3011/oauth/callback',
        'http://localhost:3012/oauth/callback'
      ],
      knownMisconfigurations: [
        'http://localhost:3000/login',
        'http://localhost:3000/oauth/callback'
      ],
      timeoutMs: 30000, // 30 seconds
      aggressiveRecovery: true,
      ...options
    };
  }

  /**
   * 🔒 SECURITY: Detect OAuth redirect URI mismatch
   */
  public detectRedirectMismatch(): {
    hasMismatch: boolean;
    expectedOrigin: string;
    detectedOrigins: string[];
    recommendations: string[];
  } {
    const currentOrigin = window.location.origin;
    const detectedOrigins: string[] = [];
    
    // Check for evidence of cross-origin OAuth communication attempts
    try {
      // Check sessionStorage for cross-origin evidence
      const oauthKeys = Object.keys(sessionStorage).filter(key => key.includes('oauth'));
      const hasOAuthState = oauthKeys.length > 0;
      
      // Check for referrer evidence
      if (document.referrer) {
        try {
          const referrerOrigin = new URL(document.referrer).origin;
          if (referrerOrigin !== currentOrigin) {
            detectedOrigins.push(referrerOrigin);
          }
        } catch (e) {
          console.warn('Could not parse referrer URL:', e);
        }
      }
      
      // Check for postMessage evidence from other origins
      const messageOrigins = this.getDetectedOrigins();
      detectedOrigins.push(...messageOrigins);
      
      const hasMismatch = detectedOrigins.some(origin => 
        this.options.knownMisconfigurations.some(config => config.startsWith(origin))
      );
      
      return {
        hasMismatch,
        expectedOrigin: currentOrigin,
        detectedOrigins: [...new Set(detectedOrigins)],
        recommendations: hasMismatch ? [
          'Configure OAuth server to use correct redirect_uri',
          'Update OAuth server redirect configuration',
          'Use cross-origin recovery mechanisms',
          'Contact system administrator to fix OAuth server setup'
        ] : []
      };
    } catch (error) {
      console.error('Error detecting redirect mismatch:', error);
      return {
        hasMismatch: false,
        expectedOrigin: currentOrigin,
        detectedOrigins: [],
        recommendations: ['Run OAuth configuration validation']
      };
    }
  }

  /**
   * 🔧 ENHANCED: Attempt cross-origin communication recovery
   */
  public async attemptCrossOriginRecovery(): Promise<RecoveryResult> {
    // 🔧 PREVENT CONCURRENT: Only allow one recovery attempt at a time globally
    if (OAuthCrossOriginRecovery.recoveryInProgress) {
      console.log('⚠️ Cross-origin recovery already in progress, skipping duplicate attempt');
      return {
        success: false,
        method: 'direct',
        error: 'Recovery already in progress'
      };
    }
    
    this.recoveryAttempts++;
    
    if (this.recoveryAttempts > this.maxRecoveryAttempts) {
      return {
        success: false,
        method: 'direct',
        error: 'Maximum recovery attempts exceeded'
      };
    }
    
    OAuthCrossOriginRecovery.recoveryInProgress = true;
    console.log(`🔄 Attempting cross-origin OAuth recovery (attempt ${this.recoveryAttempts}/${this.maxRecoveryAttempts})`);
    
    // Method 1: Direct storage polling (most reliable)
    const storageResult = await this.attemptStorageRecovery();
    if (storageResult.success) {
      OAuthCrossOriginRecovery.recoveryInProgress = false;
      return storageResult;
    }
    
    // Method 2: BroadcastChannel recovery
    const broadcastResult = await this.attemptBroadcastRecovery();
    if (broadcastResult.success) {
      OAuthCrossOriginRecovery.recoveryInProgress = false;
      return broadcastResult;
    }
    
    // Method 3: PostMessage proxy recovery
    if (this.options.aggressiveRecovery) {
      const proxyResult = await this.attemptProxyRecovery();
      if (proxyResult.success) {
        OAuthCrossOriginRecovery.recoveryInProgress = false;
        return proxyResult;
      }
    }
    
    // Method 4: Polling recovery with extended timeout
    const pollingResult = await this.attemptPollingRecovery();
    if (pollingResult.success) {
      OAuthCrossOriginRecovery.recoveryInProgress = false;
      return pollingResult;
    }
    
    const finalResult: RecoveryResult = {
      success: false,
      method: 'polling' as const,
      error: 'All cross-origin recovery methods failed'
    };
    
    // 🔧 RESET: Clear the recovery lock regardless of result
    OAuthCrossOriginRecovery.recoveryInProgress = false;
    
    return finalResult;
  }

  /**
   * 🔧 Method 1: Storage-based recovery
   */
  private async attemptStorageRecovery(): Promise<RecoveryResult> {
    return new Promise((resolve) => {
      let pollCount = 0;
      const maxPolls = this.options.timeoutMs / 100; // 100ms intervals
      
      const pollStorage = () => {
        pollCount++;
        
        // Check for OAuth result in storage
        const result = sessionStorage.getItem('oauth_result');
        if (result) {
          try {
            const parsedResult = JSON.parse(result);
            if (parsedResult.success && parsedResult.tokenData) {
              sessionStorage.removeItem('oauth_result');
              console.log('✅ OAuth recovery via sessionStorage successful');
              resolve({
                success: true,
                method: 'storage',
                tokenData: parsedResult.tokenData
              });
              return;
            }
          } catch (e) {
            console.error('Failed to parse OAuth result from storage:', e);
          }
        }
        
        // Check for error
        const error = sessionStorage.getItem('oauth_error');
        if (error) {
          sessionStorage.removeItem('oauth_error');
          console.log('❌ OAuth error found in storage:', error);
          resolve({
            success: false,
            method: 'storage',
            error: error
          });
          return;
        }
        
        // Continue polling or timeout
        if (pollCount < maxPolls) {
          setTimeout(pollStorage, 100);
        } else {
          resolve({
            success: false,
            method: 'storage',
            error: 'Storage recovery timeout'
          });
        }
      };
      
      pollStorage();
    });
  }

  /**
   * 🔧 Method 2: BroadcastChannel recovery
   */
  private async attemptBroadcastRecovery(): Promise<RecoveryResult> {
    return new Promise((resolve) => {
      let resolved = false;
      
      try {
        const channel = new BroadcastChannel('oauth_channel');
        
        // Listen for OAuth messages
        channel.onmessage = (event) => {
          if (resolved) return;
          
          if (event.data?.type === 'OAUTH_SUCCESS') {
            resolved = true;
            channel.close();
            console.log('✅ OAuth recovery via BroadcastChannel successful');
            resolve({
              success: true,
              method: 'broadcast',
              tokenData: event.data.tokenData || { access_token: event.data.token }
            });
          } else if (event.data?.type === 'OAUTH_ERROR') {
            resolved = true;
            channel.close();
            console.log('❌ OAuth error via BroadcastChannel:', event.data.error);
            resolve({
              success: false,
              method: 'broadcast',
              error: event.data.error
            });
          }
        };
        
        // Timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            channel.close();
            resolve({
              success: false,
              method: 'broadcast',
              error: 'BroadcastChannel recovery timeout'
            });
          }
        }, this.options.timeoutMs);
        
      } catch (error) {
        resolve({
          success: false,
          method: 'broadcast',
          error: 'BroadcastChannel not supported'
        });
      }
    });
  }

  /**
   * 🔧 Method 3: PostMessage proxy recovery
   */
  private async attemptProxyRecovery(): Promise<RecoveryResult> {
    return new Promise((resolve) => {
      let resolved = false;
      
      // Listen for cross-origin messages
      const messageHandler = (event: MessageEvent) => {
        if (resolved) return;
        
        // Check if message is from known misconfigured origins
        const isFromMisconfiguredOrigin = this.options.knownMisconfigurations.some(config => 
          event.origin === new URL(config).origin
        );
        
        if (isFromMisconfiguredOrigin && event.data?.type === 'OAUTH_SUCCESS') {
          resolved = true;
          window.removeEventListener('message', messageHandler);
          console.log('✅ OAuth recovery via cross-origin PostMessage successful');
          resolve({
            success: true,
            method: 'proxy',
            tokenData: event.data.tokenData || { access_token: event.data.token }
          });
        } else if (isFromMisconfiguredOrigin && event.data?.type === 'OAUTH_ERROR') {
          resolved = true;
          window.removeEventListener('message', messageHandler);
          console.log('❌ OAuth error via cross-origin PostMessage:', event.data.error);
          resolve({
            success: false,
            method: 'proxy',
            error: event.data.error
          });
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', messageHandler);
          resolve({
            success: false,
            method: 'proxy',
            error: 'PostMessage proxy recovery timeout'
          });
        }
      }, this.options.timeoutMs);
    });
  }

  /**
   * 🔧 Method 4: Extended polling recovery
   */
  private async attemptPollingRecovery(): Promise<RecoveryResult> {
    return new Promise((resolve) => {
      let pollCount = 0;
      const maxPolls = (this.options.timeoutMs * 2) / 250; // Extended timeout, 250ms intervals
      
      const pollForResults = () => {
        pollCount++;
        
        // 🔧 ENHANCED: Check comprehensive list of possible OAuth storage keys
        const storageKeys = [
          'oauth_result',
          'oauth_success', 
          'oauth_token_data',
          'oauth_access_token',
          'oauth_completion_timestamp',
          'access_token',
          'id_token',
          'token_data',
          'user_data',
          'auth_result',
          'login_result',
          'oauth_error'
        ];
        
        // 🔧 NEW: Also check for any dynamic keys that might contain OAuth data
        const allSessionKeys = Object.keys(sessionStorage);
        const dynamicOAuthKeys = allSessionKeys.filter(key => 
          (key.includes('oauth') || key.includes('auth') || key.includes('token')) &&
          !storageKeys.includes(key) &&
          sessionStorage.getItem(key)
        );
        
        // Combine static and dynamic keys
        const allStorageKeysToCheck = [...storageKeys, ...dynamicOAuthKeys];
        
        for (const key of allStorageKeysToCheck) {
          const value = sessionStorage.getItem(key);
          if (value) {
            try {
              if (key === 'oauth_error') {
                sessionStorage.removeItem(key);
                resolve({
                  success: false,
                  method: 'polling',
                  error: value
                });
                return;
              } else {
                const parsedValue = JSON.parse(value);
                if (parsedValue && (parsedValue.access_token || parsedValue.tokenData)) {
                  sessionStorage.removeItem(key);
                  console.log(`✅ OAuth recovery via extended polling successful (key: ${key})`);
                  resolve({
                    success: true,
                    method: 'polling',
                    tokenData: parsedValue.tokenData || parsedValue
                  });
                  return;
                }
              }
            } catch (e) {
              console.warn(`Failed to parse storage value for key ${key}:`, e);
            }
          }
        }
        
        // 🔧 ENHANCED: Also check localStorage for OAuth tokens
        if (pollCount % 4 === 0) { // Check localStorage every 4th poll (every second)
          const localStorageOAuthKeys = [
            'accessToken', 'access_token', 'idToken', 'id_token', 'refreshToken', 'refresh_token',
            'oauth_token', 'oauth_access_token', 'oauth_id_token', 'user', 'currentUser', 'auth_user'
          ];
          
          for (const key of localStorageOAuthKeys) {
            const value = localStorage.getItem(key);
            if (value) {
              try {
                let tokenData;
                
                // Try to parse as JSON first
                try {
                  const parsed = JSON.parse(value);
                  if (parsed && (parsed.access_token || parsed.token || parsed.accessToken)) {
                    tokenData = parsed.access_token || parsed.token || parsed.accessToken;
                  } else if (typeof parsed === 'string' && parsed.length > 10) {
                    tokenData = parsed;
                  }
                } catch (parseError) {
                  // If not JSON, treat as raw token if it looks like one
                  if (typeof value === 'string' && value.length > 10 && value.includes('.')) {
                    tokenData = value;
                  }
                }
                
                if (tokenData) {
                  localStorage.removeItem(key);
                  console.log(`✅ OAuth recovery via localStorage polling successful (key: ${key})`);
                  resolve({
                    success: true,
                    method: 'polling',
                    tokenData: { access_token: tokenData }
                  });
                  return;
                }
              } catch (e) {
                console.warn(`Failed to parse localStorage value for key ${key}:`, e);
              }
            }
          }
        }
        
        // Continue polling or timeout
        if (pollCount < maxPolls) {
          setTimeout(pollForResults, 250);
        } else {
          resolve({
            success: false,
            method: 'polling',
            error: 'Extended polling recovery timeout'
          });
        }
      };
      
      pollForResults();
    });
  }

  /**
   * 🔍 Get detected origins from message listening
   */
  private getDetectedOrigins(): string[] {
    // This would be populated by a background message listener
    // For now, return empty array as this requires global state management
    return [];
  }

  /**
   * 🔧 Validate OAuth configuration
   */
  public async validateOAuthConfig(): Promise<{
    configValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    try {
      // Check backend OAuth configuration endpoint
      const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8010';
      const response = await fetch(`${backendUrl}/api/oauth/validate-config`);
      
      if (response.ok) {
        const config = await response.json();
        
        if (!config.configuration_valid) {
          issues.push('Backend OAuth configuration is invalid');
        }
        
        if (!config.oauth_server_reachable) {
          issues.push('OAuth server is not reachable');
          recommendations.push('Check OAuth server status');
        }
        
        if (config.security_warnings) {
          issues.push(...config.security_warnings);
        }
        
        if (config.recommendations) {
          recommendations.push(...config.recommendations);
        }
      } else {
        issues.push('Could not validate OAuth configuration');
        recommendations.push('Check backend API connectivity');
      }
    } catch (error) {
      issues.push('OAuth configuration validation failed');
      recommendations.push('Check network connectivity');
    }
    
    // Check redirect mismatch
    const mismatchResult = this.detectRedirectMismatch();
    if (mismatchResult.hasMismatch) {
      issues.push('OAuth redirect URI mismatch detected');
      recommendations.push(...mismatchResult.recommendations);
    }
    
    return {
      configValid: issues.length === 0,
      issues,
      recommendations
    };
  }
}

/**
 * 🔧 Convenience function for quick cross-origin recovery
 */
export async function recoverCrossOriginOAuth(options?: Partial<CrossOriginRecoveryOptions>): Promise<RecoveryResult> {
  const recovery = new OAuthCrossOriginRecovery(options);
  return recovery.attemptCrossOriginRecovery();
}

/**
 * 🔍 Quick function to detect OAuth configuration issues
 */
export function detectOAuthIssues(): {
  hasIssues: boolean;
  issues: string[];
  quickFixes: string[];
} {
  const recovery = new OAuthCrossOriginRecovery();
  const mismatchResult = recovery.detectRedirectMismatch();
  
  const issues: string[] = [];
  const quickFixes: string[] = [];
  
  if (mismatchResult.hasMismatch) {
    issues.push('OAuth server redirect URI mismatch detected');
    quickFixes.push('Use cross-origin recovery utility');
    quickFixes.push('Configure OAuth server with correct redirect_uri');
  }
  
  // Check for OAuth state in storage without valid tokens
  const hasOAuthState = sessionStorage.getItem('oauth_state') || sessionStorage.getItem('oauth_popup_mode');
  const hasValidTokens = localStorage.getItem('accessToken');
  
  if (hasOAuthState && !hasValidTokens) {
    issues.push('OAuth flow in progress but no tokens found');
    quickFixes.push('Clear OAuth state and retry authentication');
  }
  
  return {
    hasIssues: issues.length > 0,
    issues,
    quickFixes
  };
}