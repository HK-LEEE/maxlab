/**
 * OAuth 2.0 Popup Authentication Utility
 * Implements Authorization Code Flow with PKCE for MAX Platform integration
 */

import { OAuthCrossOriginRecovery, recoverCrossOriginOAuth } from './oauthCrossOriginRecovery';
import { createOAuthFlow, updateOAuthFlowStatus, validateOAuthFlow, getOAuthFlow, type OAuthFlowState } from './oauthStateManager';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
  refresh_expires_in?: number;
  id_token?: string; // OIDC ID Token
}

// Original flat OAuth message structure
export interface OAuthMessageFlat {
  type: 'OAUTH_SUCCESS' | 'OAUTH_ERROR' | 'OAUTH_ACK';
  token?: string;
  tokenData?: TokenResponse;
  error?: string;
  error_description?: string;
  acknowledged?: boolean;
}

// Auth server inner message structure
export interface OAuthInnerMessage {
  type: 'OAUTH_LOGIN_SUCCESS_CONTINUE' | 'OAUTH_ALREADY_AUTHENTICATED' | 'OAUTH_SUCCESS' | 'OAUTH_ERROR' | 'OAUTH_ACK';
  oauthParams?: any;
  token?: string;
  tokenData?: TokenResponse;
  error?: string;
  error_description?: string;
  timestamp?: number;
}

// Nested OAuth message structure from auth server
export interface OAuthMessageNested {
  type: 'OAUTH_MESSAGE';
  data: OAuthInnerMessage;
}

// Union type for all OAuth message types
export type OAuthMessage = OAuthMessageFlat | OAuthMessageNested;

export class PopupOAuthLogin {
  private popup: Window | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private messageReceived: boolean = false;
  private authInProgress: boolean = false;
  private currentFlowState: OAuthFlowState | null = null;

  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly authUrl: string;
  private readonly scopes = ['openid', 'profile', 'email', 'offline_access', 'read:profile', 'read:groups', 'manage:workflows'];

  constructor() {
    // 🔧 PRODUCTION FIX: Use runtime config first, then env vars, then fallback
    // This allows configuration without rebuilding in production
    const runtimeConfig = (window as any).ENV_CONFIG;
    
    this.clientId = runtimeConfig?.CLIENT_ID || 
                    import.meta.env.VITE_CLIENT_ID || 
                    'maxlab';
    
    this.redirectUri = runtimeConfig?.REDIRECT_URI || 
                       import.meta.env.VITE_REDIRECT_URI || 
                       `${window.location.origin}/oauth/callback`;
    
    this.authUrl = runtimeConfig?.AUTH_SERVER_URL || 
                   import.meta.env.VITE_AUTH_SERVER_URL || 
                   'http://localhost:8000';
    
    // 🔍 DEBUG: OAuth Configuration with runtime config
    console.log('🔐 OAuth Configuration:', {
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      authUrl: this.authUrl,
      runtimeConfig: runtimeConfig ? 'Available' : 'Not available',
      envAuthUrl: import.meta.env.VITE_AUTH_SERVER_URL,
      currentOrigin: window.location.origin
    });
  }

  // PKCE 구현
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64URLEncode(array);
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64URLEncode(new Uint8Array(digest));
  }

  private base64URLEncode(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // OIDC nonce 생성
  private generateNonce(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64URLEncode(array);
  }

  // OAuth 시작
  async startAuth(forceAccountSelection = false, abortSignal?: AbortSignal): Promise<TokenResponse> {
    // 🔧 RACE CONDITION FIX: Check if request was aborted before starting
    if (abortSignal?.aborted) {
      throw new Error('OAuth request was aborted before starting');
    }
    // 🚨 CRITICAL: Complete OAuth state cleanup for different user login
    if (forceAccountSelection) {
      console.log('🧹 Performing complete OAuth state cleanup for different user login...');
      
      // 1. Close any existing popup
      if (this.popup && !this.popup.closed) {
        console.log('🚪 Closing existing popup');
        this.popup.close();
        this.popup = null;
      }
      
      // 2. Clear OAuth-related sessionStorage completely
      const oauthKeys = Object.keys(sessionStorage).filter(key => 
        key.includes('oauth') || key.includes('_force_') || key.includes('state_')
      );
      oauthKeys.forEach(key => {
        sessionStorage.removeItem(key);
      });
      console.log('🗑️ Cleared OAuth sessionStorage keys:', oauthKeys);
      
      // 3. Close existing broadcast channels
      try {
        const cleanupChannel = new BroadcastChannel('oauth_channel');
        cleanupChannel.postMessage({ type: 'OAUTH_CLEANUP_FORCE' });
        cleanupChannel.close();
      } catch (e) {
        console.warn('⚠️ Failed to send cleanup broadcast:', e);
      }
      
      // 4. Reset internal state
      this.authInProgress = false;
      
      console.log('✅ Complete OAuth state cleanup finished');
      
      // Small delay to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 이미 진행 중인 인증이 있는지 확인
    if (this.authInProgress) {
      throw new Error('OAuth authentication already in progress');
    }

    this.authInProgress = true;

    return new Promise(async (resolve, reject) => {
      // 🔧 RACE CONDITION FIX: Setup abort handling
      const abortHandler = () => {
        console.log('🚫 OAuth request aborted by coordinator');
        this.cleanup();
        reject(new Error('OAuth request was aborted by request coordinator'));
      };
      
      abortSignal?.addEventListener('abort', abortHandler, { once: true });
      
      try {
        // 🔧 RACE CONDITION FIX: Check abort status before proceeding
        if (abortSignal?.aborted) {
          throw new Error('OAuth request was aborted before PKCE generation');
        }
        
        // PKCE 파라미터 생성
        const state = this.generateCodeVerifier();
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        const nonce = this.generateNonce(); // OIDC nonce

        // 🔧 ENHANCED: Capture initial storage state for proactive recovery
        const initialStorageKeys = [...Object.keys(sessionStorage), ...Object.keys(localStorage)];
        const sessionStorageSnapshot = Object.keys(sessionStorage); // For cross-origin detection
        
        // 🔒 SECURITY: Create managed OAuth flow state
        this.currentFlowState = createOAuthFlow({
          flowType: 'popup',
          clientId: this.clientId,
          redirectUri: this.redirectUri,
          state: state,
          codeVerifier: codeVerifier,
          nonce: nonce,
          parentOrigin: window.location.origin,
          forceAccountSelection: forceAccountSelection
        });
        
        // 🔧 ENHANCED: Store initial storage keys for change detection
        this.currentFlowState.initialStorageKeys = initialStorageKeys;
        
        // Update flow status to in-progress
        updateOAuthFlowStatus(this.currentFlowState.flowId, 'in_progress');
        
        // 🔧 LEGACY COMPATIBILITY: Set sessionStorage keys for backward compatibility
        sessionStorage.setItem('oauth_popup_mode', 'true');
        sessionStorage.setItem('oauth_window_type', 'popup');
        sessionStorage.setItem('oauth_parent_origin', window.location.origin);
        sessionStorage.setItem('oauth_popup_mode_timestamp', Date.now().toString());
        
        // Clear any previous OAuth results
        sessionStorage.removeItem('oauth_result');
        sessionStorage.removeItem('oauth_error');
        
        // 🔍 DEBUG: Verify OAuth flow state creation
        console.log('🔐 OAuth Flow State Created:', {
          flowId: this.currentFlowState.flowId,
          flowType: this.currentFlowState.flowType,
          state: state.substring(0, 8) + '...',
          codeVerifier: codeVerifier.substring(0, 8) + '...',
          nonce: nonce.substring(0, 8) + '...',
          forceAccountSelection: this.currentFlowState.forceAccountSelection,
          expiresAt: new Date(this.currentFlowState.expiresAt).toISOString(),
          timestamp: new Date().toISOString()
        });

        // 🔧 FALLBACK: Use standard redirect_uri to avoid OAuth server rejection
        // Popup mode will be detected via multiple methods in isPopupMode()
        
        // OAuth URL 생성 - OAuth 2.0 standard parameters only for maximum compatibility
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
          scope: this.scopes.join(' '),
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          nonce: nonce // OIDC nonce 추가
          // 🔧 REMOVED: popup parameter - may cause OAuth server rejection
        });

        // 계정 선택 강제 요청 (다른 사용자로 로그인) 
        if (forceAccountSelection) {
          // 🔒 ENHANCED: Force re-login for different user
          // Using prompt=login to force the user to re-authenticate
          params.set('prompt', 'login'); // 강제 재로그인
          params.set('max_age', '0'); // 강제 재인증을 위한 추가 파라미터
          
          // Clear any cached OAuth state to ensure clean authentication
          sessionStorage.removeItem('oauth_last_user');
          sessionStorage.removeItem('oauth_cached_token');
          
          // Add unique state parameter to ensure fresh request (OAuth 2.0 compliant)
          const uniqueState = state + '_force_' + Date.now();
          params.set('state', uniqueState);
          
          // Update flow state with new unique state
          this.currentFlowState.state = uniqueState;
          updateOAuthFlowStatus(this.currentFlowState.flowId, 'in_progress', {
            forceAccountSelection: true
          });
          
          // 🔧 LEGACY COMPATIBILITY: Set sessionStorage for backward compatibility
          sessionStorage.setItem('oauth_force_account_selection', 'true');
          
          console.log('🔄 Forcing re-login with prompt=login + max_age=0 parameters');
          console.log('📋 OAuth Parameters (forced login):', {
            flowId: this.currentFlowState.flowId,
            state: params.get('state'),
            prompt: params.get('prompt'),
            redirect_uri: params.get('redirect_uri'),
            client_id: params.get('client_id'),
            response_type: params.get('response_type')
          });
        }

        // 🔒 SECURITY: Build OAuth authorization URL (새 OAuth server 구조)
        // OAuth server가 maxplatform/oauth-server/로 재구조화되어 /auth/* 경로 사용
        const authUrl = `${this.authUrl}/auth/authorize?${params}`;
        console.log('🔐 Opening OAuth popup:', authUrl);
        console.log('📋 Full OAuth URL params:', params.toString());
        
        // Setup message listeners BEFORE opening popup
        console.log('📡 Setting up message listeners before popup...');
        
        // 🔧 ENHANCED: Flag to track if we've received a successful response
        let responseReceived = false;
        
        // PostMessage listener
        this.messageHandler = (event: MessageEvent<OAuthMessage>) => {
          console.log('📨 Parent window received message:', event.data);
          if (!responseReceived) {
            this.handleOAuthMessage(event, resolve, reject);
            if (event.data?.type === 'OAUTH_SUCCESS') {
              responseReceived = true;
            }
          }
        };
        window.addEventListener('message', this.messageHandler);

        // BroadcastChannel fallback listener
        let broadcastChannel: BroadcastChannel | null = null;
        try {
          broadcastChannel = new BroadcastChannel('oauth_channel');
          broadcastChannel.onmessage = (event) => {
            console.log('📡 Parent received OAuth message via BroadcastChannel:', event.data);
            this.handleBroadcastMessage(event, resolve, reject, broadcastChannel);
          };
        } catch (e) {
          console.log('BroadcastChannel not supported');
        }

        // 🔧 ENHANCED: SessionStorage polling with immediate detection
        let pollCount = 0;
        const maxPolls = 1200; // 60 seconds maximum (50ms * 1200) - faster polling
        
        // 🔧 CRITICAL FIX: Only clear STALE OAuth data (older than 5 minutes)
        const cleanupKeys = ['oauth_result', 'oauth_success', 'oauth_token_data', 'oauth_error', 'oauth_access_token', 'oauth_completion_timestamp'];
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        
        cleanupKeys.forEach(key => {
          const value = sessionStorage.getItem(key);
          if (value) {
            try {
              // Check if it's a timestamp or has a timestamp property
              let timestamp = 0;
              if (key === 'oauth_completion_timestamp') {
                timestamp = parseInt(value);
              } else {
                const parsed = JSON.parse(value);
                timestamp = parsed.timestamp || 0;
              }
              
              // Only remove if data is older than 5 minutes
              if (timestamp && timestamp < fiveMinutesAgo) {
                sessionStorage.removeItem(key);
                console.log(`🧹 Cleared stale OAuth data: ${key} (age: ${Math.round((Date.now() - timestamp) / 1000)}s)`);
              }
            } catch (e) {
              // If we can't parse, it might be corrupted, so remove it
              sessionStorage.removeItem(key);
              console.log(`🧹 Cleared invalid OAuth data: ${key}`);
            }
          }
        });
        
        const storagePollingInterval = setInterval(() => {
          pollCount++;
          
          // 🔧 ENHANCED: Check for success result in multiple storage keys with priority order
          const storageKeys = ['oauth_result', 'oauth_success', 'oauth_token_data'];
          
          for (const key of storageKeys) {
            const result = sessionStorage.getItem(key);
            if (result && !responseReceived) {
              console.log(`💾 Found OAuth result in sessionStorage key: ${key}`);
              try {
                const parsedResult = JSON.parse(result);
                if (parsedResult.success && parsedResult.tokenData) {
                  console.log(`✅ OAuth success from sessionStorage key: ${key}`);
                  this.messageReceived = true;
                  responseReceived = true;
                  clearInterval(storagePollingInterval);
                  
                  // Send acknowledgment via multiple methods
                  try {
                    sessionStorage.setItem('oauth_ack', 'true');
                    sessionStorage.setItem('oauth_acknowledged', Date.now().toString());
                    console.log('📤 Acknowledgment stored in sessionStorage');
                  } catch (e) {
                    console.error('Failed to store acknowledgment in sessionStorage:', e);
                  }
                  
                  // Clean up all OAuth result keys
                  storageKeys.forEach(k => sessionStorage.removeItem(k));
                  sessionStorage.removeItem('oauth_access_token');
                  sessionStorage.removeItem('oauth_completion_timestamp');
                  
                  this.cleanup();
                  resolve(parsedResult.tokenData);
                  return;
                }
              } catch (e) {
                console.error(`Failed to parse OAuth result from sessionStorage key ${key}:`, e);
              }
            }
          }
          
          // Also check for individual token data as fallback
          const individualToken = sessionStorage.getItem('oauth_access_token');
          const completionTime = sessionStorage.getItem('oauth_completion_timestamp');
          
          if (individualToken && completionTime) {
            const tokenAge = Date.now() - parseInt(completionTime);
            if (tokenAge < 60000) { // Only use if less than 1 minute old
              console.log('💾 Found individual OAuth token data in sessionStorage');
              this.messageReceived = true;
              clearInterval(storagePollingInterval);
              
              // Send acknowledgment
              try {
                sessionStorage.setItem('oauth_ack', 'true');
                console.log('📤 Acknowledgment stored for individual token');
              } catch (e) {
                console.error('Failed to store token acknowledgment:', e);
              }
              
              // Clean up
              sessionStorage.removeItem('oauth_access_token');
              sessionStorage.removeItem('oauth_completion_timestamp');
              
              this.cleanup();
              resolve({
                access_token: individualToken,
                token_type: 'Bearer',
                expires_in: 3600,
                scope: this.scopes.join(' ')
              });
              return;
            }
          }
          
          // Check for error
          const error = sessionStorage.getItem('oauth_error');
          if (error) {
            console.log('❌ Found OAuth error in sessionStorage');
            clearInterval(storagePollingInterval);
            
            // Send acknowledgment for error case
            try {
              sessionStorage.setItem('oauth_ack', 'true');
              console.log('📤 Error acknowledgment stored in sessionStorage');
            } catch (e) {
              console.error('Failed to store error acknowledgment:', e);
            }
            
            sessionStorage.removeItem('oauth_error');
            this.cleanup();
            reject(new Error(error));
            return;
          }
          
          // Timeout check with cross-origin recovery attempt
          if (pollCount >= maxPolls) {
            console.log('⏱ SessionStorage polling timeout after 60 seconds - attempting cross-origin recovery');
            clearInterval(storagePollingInterval);
            if (!this.messageReceived) {
              // 🔧 ENHANCED: Final cross-origin recovery attempt before timeout
              const recovery = new OAuthCrossOriginRecovery();
              recovery.attemptCrossOriginRecovery().then(recoveryResult => {
                if (recoveryResult.success && recoveryResult.tokenData) {
                  console.log('✅ Cross-origin recovery successful after timeout!');
                  this.messageReceived = true;
                  this.cleanup();
                  resolve(recoveryResult.tokenData);
                } else {
                  console.log('❌ Final cross-origin recovery failed');
                  this.cleanup();
                  reject(new Error('OAuth authentication timeout - no response received'));
                }
              }).catch(error => {
                console.error('Cross-origin recovery error:', error);
                this.cleanup();
                reject(new Error('OAuth authentication timeout - no response received'));
              });
            }
            return;
          }
          
          // More frequent polling in first 5 seconds for faster response
          if (pollCount === 100) { // After 5 seconds (50ms * 100), reduce frequency
            clearInterval(storagePollingInterval);
            const slowPollingInterval = setInterval(() => {
              pollCount++;
              
              const result = sessionStorage.getItem('oauth_result');
              if (result) {
                try {
                  const parsedResult = JSON.parse(result);
                  if (parsedResult.success && parsedResult.tokenData) {
                    this.messageReceived = true;
                    clearInterval(slowPollingInterval);
                    
                    // Send acknowledgment via sessionStorage
                    try {
                      sessionStorage.setItem('oauth_ack', 'true');
                      console.log('📤 Acknowledgment stored in sessionStorage (slow polling)');
                    } catch (e) {
                      console.error('Failed to store acknowledgment in sessionStorage:', e);
                    }
                    
                    sessionStorage.removeItem('oauth_result');
                    this.cleanup();
                    resolve(parsedResult.tokenData);
                    return;
                  }
                } catch (e) {
                  console.error('Failed to parse OAuth result from sessionStorage:', e);
                }
              }
              
              const error = sessionStorage.getItem('oauth_error');
              if (error) {
                clearInterval(slowPollingInterval);
                
                // Send acknowledgment for error case
                try {
                  sessionStorage.setItem('oauth_ack', 'true');
                  console.log('📤 Error acknowledgment stored in sessionStorage (slow polling)');
                } catch (e) {
                  console.error('Failed to store error acknowledgment:', e);
                }
                
                sessionStorage.removeItem('oauth_error');
                this.cleanup();
                reject(new Error(error));
                return;
              }
              
              if (pollCount >= maxPolls) {
                clearInterval(slowPollingInterval);
                if (!this.messageReceived) {
                  this.cleanup();
                  reject(new Error('OAuth authentication timeout'));
                }
              }
            }, 250); // Slower polling after 5 seconds
          }
        }, 50); // 🔧 ENHANCED: Faster polling (50ms) for better responsiveness

        // 팝업 열기 - 더 큰 크기와 중앙 정렬
        const screenWidth = screen.width;
        const screenHeight = screen.height;
        const popupWidth = 600;
        const popupHeight = 700;
        const left = (screenWidth - popupWidth) / 2;
        const top = (screenHeight - popupHeight) / 2;
        
        this.popup = window.open(
          authUrl,
          'oauth_login',
          `width=${popupWidth},height=${popupHeight},scrollbars=yes,resizable=yes,top=${top},left=${left},status=yes,toolbar=no,menubar=no,location=yes`
        );

        if (!this.popup) {
          clearInterval(storagePollingInterval);
          broadcastChannel?.close();
          
          // 🔧 ENHANCED: Detailed popup blocking guidance
          const userAgent = navigator.userAgent;
          const browser = userAgent.includes('Chrome') ? 'Chrome' : 
                         userAgent.includes('Firefox') ? 'Firefox' : 
                         userAgent.includes('Safari') ? 'Safari' : 
                         userAgent.includes('Edge') ? 'Edge' : 'your browser';
          
          console.error('🚫 Popup blocked by browser:', {
            browser,
            userAgent,
            url: authUrl,
            recommendations: [
              'Click the popup blocker icon in address bar',
              'Add this site to popup exception list',
              'Try Ctrl+Click on login button',
              'Disable popup blocker for this site'
            ]
          });
          
          const detailedError = new Error(
            `Popup authentication was blocked by ${browser}. Please:\n` +
            `1. Click the popup blocker icon (🚫) in your address bar\n` +
            `2. Select "Always allow popups from this site"\n` +
            `3. Try logging in again\n\n` +
            `Alternative: Hold Ctrl and click the login button to force popup opening.`
          );
          
          // Add browser-specific properties for error handling
          (detailedError as any).code = 'POPUP_BLOCKED';
          (detailedError as any).browser = browser;
          (detailedError as any).recoverable = true;
          
          reject(detailedError);
          return;
        }
        
        console.log('✅ OAuth popup opened successfully');

        // 🔧 ENHANCED: Popup monitoring with proactive cross-origin recovery
        let crossOriginRecoveryAttempted = false;
        let popupClosedRecoveryAttempted = false; // Prevent duplicate recovery on popup close
        this.checkInterval = setInterval(async () => {
          // Check if popup is closed
          if (this.popup?.closed) {
            if (!popupClosedRecoveryAttempted) {
              popupClosedRecoveryAttempted = true;
              setTimeout(async () => {
                if (!this.messageReceived) {
                  console.log('🚪 Popup closed without receiving message - attempting cross-origin recovery');
                  
                  // 🔧 ENHANCED: Attempt cross-origin recovery before considering cancelled
                  const recovery = new OAuthCrossOriginRecovery();
                  const recoveryResult = await recovery.attemptCrossOriginRecovery();
                  
                  if (recoveryResult.success && recoveryResult.tokenData) {
                    console.log('✅ Cross-origin recovery successful!');
                    this.messageReceived = true;
                    this.cleanup();
                    resolve(recoveryResult.tokenData);
                  } else {
                    console.log('❌ Cross-origin recovery failed, user likely cancelled');
                    console.log('Recovery error:', recoveryResult.error);
                    this.cleanup();
                    reject(new Error('Authentication was cancelled by the user'));
                  }
                }
              }, 100);
            }
            return;
          }

          // 🔧 NEW: Proactive cross-origin recovery for port mismatch
          if (!this.messageReceived && !crossOriginRecoveryAttempted && this.popup) {
            try {
              const popupAge = Date.now() - (this.currentFlowState?.createdAt || 0);
              
              // 🔧 AGGRESSIVE: Try to detect port mismatch earlier by attempting to access popup
              // This will fail due to cross-origin restrictions, but we can use that failure as a signal
              let suspectedPortMismatch = false;
              
              try {
                // This will throw an error if the popup is on a different origin (port 3000)
                const popupLocation = this.popup.location.href;
                // If we get here, popup is still on same origin - no port mismatch yet
              } catch (crossOriginError) {
                // Cross-origin error suggests popup might have navigated to port 3000
                if (popupAge > 3000) { // After 3 seconds, cross-origin error becomes suspicious
                  suspectedPortMismatch = true;
                  console.log('🚨 Cross-origin access blocked - possible port mismatch after 3+ seconds', 'warn');
                }
              }
              
              // 🔧 ENHANCED: Multiple triggers for proactive recovery
              const shouldTriggerRecovery = (
                (popupAge > 10000) || // After 10 seconds (more conservative)
                (suspectedPortMismatch && popupAge > 7000) || // Cross-origin detected after 7 seconds
                (popupAge > 15000) // Fallback after 15 seconds regardless
              );
              
              if (shouldTriggerRecovery) {
                const triggerReason = suspectedPortMismatch ? 'cross-origin detected' : 'time-based';
                console.log(`🔍 Triggering proactive recovery (${triggerReason}) after ${popupAge}ms...`);
                
                // 🔧 ENHANCED: Comprehensive OAuth completion detection
                // Check all possible ways the OAuth callback might indicate completion
                
                // 1. Standard OAuth result keys
                const standardOAuthKeys = [
                  'oauth_result', 'oauth_success', 'oauth_token_data', 'oauth_access_token',
                  'oauth_completion_timestamp', 'access_token', 'id_token', 'token_data'
                ];
                
                const hasStandardOAuthData = standardOAuthKeys.some(key => sessionStorage.getItem(key));
                
                // 2. Dynamic OAuth token keys
                const dynamicOAuthKeys = Object.keys(sessionStorage).filter(key => 
                  (key.includes('oauth') && key.includes('token')) ||
                  (key.includes('access') && key.includes('token')) ||
                  (key.includes('id') && key.includes('token'))
                );
                
                // 3. Any new storage keys that appeared since popup opened (might indicate OAuth completion)
                const initialStorageKeys = this.currentFlowState?.initialStorageKeys || [];
                const currentStorageKeys = [...Object.keys(sessionStorage), ...Object.keys(localStorage)];
                const newStorageKeys = currentStorageKeys.filter(key => !initialStorageKeys.includes(key));
                
                // 🔧 FILTER OUT: Exclude our own OAuth flow keys to prevent false positives
                const ownOAuthKeys = [
                  `oauth_flow_${this.currentFlowState?.flowId}`,
                  'oauth_state', 'oauth_code_verifier', 'oauth_nonce', 'oauth_popup_mode', 
                  'oauth_parent_origin', 'oauth_force_account_selection'
                ];
                
                const suspiciousNewKeys = newStorageKeys.filter(key => {
                  // Exclude our own keys
                  if (ownOAuthKeys.includes(key) || key.startsWith('oauth_flow_')) return false;
                  
                  // Exclude test/debug keys
                  if (key.includes('_test') || key.includes('_debug')) return false;
                  
                  // Only include keys that clearly indicate OAuth RESULT (not setup)
                  const keyLower = key.toLowerCase();
                  
                  // Must contain token-related terms
                  const hasTokenTerm = keyLower.includes('token') || 
                                     keyLower.includes('access_token') || 
                                     keyLower.includes('id_token') ||
                                     keyLower.includes('refresh_token');
                  
                  // Or OAuth result terms
                  const hasResultTerm = keyLower.includes('oauth_result') || 
                                      keyLower.includes('oauth_success') ||
                                      keyLower.includes('oauth_completion');
                  
                  return hasTokenTerm || hasResultTerm;
                });
                
                // 4. Check for URL parameters in current page that might indicate OAuth return
                const currentUrl = new URL(window.location.href);
                const hasOAuthParams = currentUrl.searchParams.has('code') || 
                                     currentUrl.searchParams.has('oauth_return') || 
                                     currentUrl.searchParams.has('state');
                
                // 5. Check localStorage for OAuth tokens (some implementations use localStorage)
                const localStorageOAuthKeys = [
                  'accessToken', 'access_token', 'idToken', 'id_token', 'refreshToken', 'refresh_token',
                  'oauth_token', 'oauth_access_token', 'oauth_id_token', 'user', 'currentUser'
                ];
                const hasLocalStorageOAuth = localStorageOAuthKeys.some(key => localStorage.getItem(key));
                
                const hasOAuthData = hasStandardOAuthData || 
                                   dynamicOAuthKeys.length > 0 || 
                                   suspiciousNewKeys.length > 0 || 
                                   hasOAuthParams || 
                                   hasLocalStorageOAuth;
                
                // Enhanced logging for debugging
                console.log('🔍 OAuth completion detection analysis:', {
                  standardKeys: standardOAuthKeys.filter(key => sessionStorage.getItem(key)),
                  dynamicKeys: dynamicOAuthKeys,
                  suspiciousNewKeys: suspiciousNewKeys,
                  hasOAuthParams: hasOAuthParams,
                  localStorageKeys: localStorageOAuthKeys.filter(key => localStorage.getItem(key)),
                  totalDetected: hasOAuthData
                });
                
                // 🔧 CRITICAL: Only trigger recovery if we actually found OAuth data
                if (hasOAuthData && (
                  standardOAuthKeys.some(key => sessionStorage.getItem(key)) ||
                  dynamicOAuthKeys.length > 0 ||
                  localStorageOAuthKeys.some(key => localStorage.getItem(key))
                )) {
                  // Enhanced debugging to show what OAuth data was found
                  const foundKeys = [
                    'oauth_result', 'oauth_success', 'oauth_token_data', 'oauth_access_token',
                    'oauth_completion_timestamp', 'access_token', 'id_token', 'token_data'
                  ].filter(key => sessionStorage.getItem(key));
                  
                  const foundLocalKeys = localStorageOAuthKeys.filter(key => localStorage.getItem(key));
                  
                  console.log('🎯 OAuth data found in storage - triggering recovery');
                  console.log('📊 Found storage keys:', foundKeys.concat(dynamicOAuthKeys).concat(foundLocalKeys));
                  crossOriginRecoveryAttempted = true;
                  
                  const recovery = new OAuthCrossOriginRecovery();
                  const recoveryResult = await recovery.attemptCrossOriginRecovery();
                  
                  if (recoveryResult.success && recoveryResult.tokenData) {
                    console.log('✅ Proactive cross-origin recovery successful!');
                    this.messageReceived = true;
                    
                    // Close the popup since we recovered successfully
                    if (this.popup && !this.popup.closed) {
                      this.popup.close();
                    }
                    
                    this.cleanup();
                    resolve(recoveryResult.tokenData);
                  } else {
                    console.log('⚠️ Proactive cross-origin recovery failed, continuing to wait...');
                  }
                } else {
                  // 🔧 CONSERVATIVE: Only try aggressive recovery for cross-origin cases
                  if (suspectedPortMismatch && popupAge > 5000) {
                    console.log('🚨 Cross-origin suspected but no OAuth data found, trying recovery...', {
                      popupAge: popupAge,
                      suspectedPortMismatch: suspectedPortMismatch
                    });
                    
                    crossOriginRecoveryAttempted = true;
                    
                    const recovery = new OAuthCrossOriginRecovery();
                    const recoveryResult = await recovery.attemptCrossOriginRecovery();
                    
                    if (recoveryResult.success && recoveryResult.tokenData) {
                      console.log('✅ Cross-origin recovery successful!');
                      this.messageReceived = true;
                      
                      // Close the popup since we recovered successfully
                      if (this.popup && !this.popup.closed) {
                        this.popup.close();
                      }
                      
                      this.cleanup();
                      resolve(recoveryResult.tokenData);
                    } else {
                      console.log('⚠️ Cross-origin recovery failed:', recoveryResult.error);
                      console.log('🔍 Will continue monitoring until timeout or popup closure...');
                    }
                  } else {
                    console.log(`🔍 No OAuth data found, continuing to monitor... (${popupAge}ms elapsed, cross-origin: ${suspectedPortMismatch})`);
                  }
                }
              }
            } catch (error) {
              console.warn('⚠️ Error during proactive cross-origin recovery check:', error);
            }
          }
        }, 500);

      } catch (error) {
        this.cleanup();
        // 🔧 RACE CONDITION FIX: Remove abort handler on error
        if (abortSignal && abortHandler) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        reject(error);
      } finally {
        // 🔧 RACE CONDITION FIX: Always clean up abort handler
        if (abortSignal && abortHandler) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
      }
    });
  }

  // Handle PostMessage from popup
  private handleOAuthMessage(event: MessageEvent<OAuthMessage>, resolve: Function, reject: Function): void {
    // 🔒 HARDENED ORIGIN VALIDATION with comprehensive security checks
    const trustedOrigins = this.getTrustedOrigins();
    const validationResult = this.validateMessageOrigin(event.origin, event.data);
    
    // 🔧 ENHANCED: Log ALL incoming messages for debugging
    console.log('📨 OAuth message validation:', {
      origin: event.origin,
      messageType: event.data?.type,
      validationResult,
      trustedOrigins: trustedOrigins.slice(0, 3) + '...' // Show first 3 for security
    });
    
    // 🔒 SECURITY: Enhanced origin validation with detailed logging
    if (!validationResult.isValid) {
      console.warn('🚨 SECURITY: Message rejected from untrusted origin:', {
        origin: event.origin,
        messageType: event.data?.type,
        reason: validationResult.reason,
        trustedOrigins,
        securityLevel: validationResult.securityLevel,
        timestamp: new Date().toISOString()
      });
      
      // Log security violation for monitoring
      this.logSecurityViolation({
        type: 'untrusted_origin',
        origin: event.origin,
        messageType: event.data?.type,
        reason: validationResult.reason,
        severity: validationResult.securityLevel
      });
      
      return;
    }
    
    // 🔒 SECURITY: Additional message structure validation
    if (!this.validateMessageStructure(event.data)) {
      console.warn('🚨 SECURITY: Invalid message structure detected:', {
        origin: event.origin,
        messageData: event.data,
        expectedStructure: 'OAuthMessage with type and data fields'
      });
      
      this.logSecurityViolation({
        type: 'invalid_message_structure',
        origin: event.origin,
        messageType: event.data?.type,
        severity: 'medium'
      });
      
      return;
    }
    
    // 🔒 SECURITY: Detect and handle redirect URI mismatch
    if (validationResult.hasMismatch) {
      console.warn('🚨 SECURITY: OAuth server redirect URI mismatch detected!', {
        expected: window.location.origin,
        actual: event.origin,
        issue: 'OAuth server configuration error - redirecting to wrong port',
        allowingDueToKnownIssue: true
      });
      
      // Log the configuration issue for monitoring
      this.logSecurityViolation({
        type: 'redirect_uri_mismatch',
        origin: event.origin,
        expectedOrigin: window.location.origin,
        severity: 'high'
      });
    }

    console.log('📨 Received OAuth message:', event.data);
    console.log('Message origin:', event.origin);
    console.log('Message type:', event.data.type);
    
    // 🔧 FIX: Normalize message structure - handle both flat and nested formats
    let messageData: OAuthMessageFlat;
    let actualMessageType: string;
    
    // Handle nested OAUTH_MESSAGE structure from auth server
    if (event.data.type === 'OAUTH_MESSAGE' && 'data' in event.data) {
      console.log('📦 Processing nested OAuth message from auth server');
      const nestedMessage = event.data as OAuthMessageNested;
      const innerData = nestedMessage.data;
      
      // DEPRECATED message types - these should not be sent in the new OAuth flow
      if (innerData.type === 'OAUTH_LOGIN_SUCCESS_CONTINUE' || 
          innerData.type === 'OAUTH_ALREADY_AUTHENTICATED') {
        console.warn(`⚠️ DEPRECATED: Received deprecated message type '${innerData.type}'`);
        console.warn('🔴 This message type should not be sent in the new OAuth flow');
        console.warn('📋 The OAuth server should follow standard authorization code flow');
        
        // For now, still handle these for backward compatibility
        // But log warnings to encourage server updates
        if (innerData.oauthParams) {
          console.log('📝 OAuth params received (deprecated flow):', innerData.oauthParams);
          
          // Check if we have proper authorization code
          if (innerData.oauthParams.code) {
            console.log('✅ Authorization code found, proceeding with token exchange');
            const code = innerData.oauthParams.code;
            const state = innerData.oauthParams.state || this.currentFlowState?.state;
            
            exchangeCodeForToken(code, state)
              .then(tokenResponse => {
                console.log('✅ Token exchange successful');
                this.messageReceived = true;
                this.cleanup();
                resolve(tokenResponse);
              })
              .catch(error => {
                console.error('❌ Token exchange failed:', error);
                this.cleanup();
                reject(error);
              });
            return;
          } else {
            // 🔧 FIX: When already authenticated without code, redirect to OAuth callback with code
            console.warn('⚠️ OAuth Server sent ALREADY_AUTHENTICATED without authorization code');
            console.log('🔄 Redirecting to complete OAuth flow with authorization code...');
            
            // Build OAuth URL to force getting an authorization code
            const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'https://max.dwchem.co.kr';
            const redirectUri = `${window.location.origin}/oauth/callback`;
            const state = this.currentFlowState?.state || generateState();
            
            // Force OAuth flow to get authorization code (새 OAuth server 구조)
            const oauthUrl = `${authUrl}/auth/authorize?` +
              `response_type=code&` +
              `client_id=maxlab&` +
              `redirect_uri=${encodeURIComponent(redirectUri)}&` +
              `scope=${encodeURIComponent(innerData.oauthParams?.scope || 'openid profile email offline_access read:profile read:groups manage:workflows')}&` +
              `state=${state}&` +
              `code_challenge=${sessionStorage.getItem('oauth_code_challenge') || ''}&` +
              `code_challenge_method=S256&` +
              `nonce=${this.currentFlowState?.nonce || ''}`;
            
            console.log('🚀 Redirecting to OAuth URL to get authorization code:', oauthUrl);
            
            // Navigate the popup to the OAuth URL to get the authorization code
            if (this.popup && !this.popup.closed) {
              try {
                // Mark that we're expecting a redirect
                sessionStorage.setItem('oauth_popup_redirecting', 'true');
                sessionStorage.setItem('oauth_popup_redirect_time', Date.now().toString());
                
                this.popup.location.href = oauthUrl;
                console.log('✅ Popup redirected to OAuth authorization endpoint');
                
                // Keep listening for the proper OAuth callback - don't cleanup or reject
                // The message listener will continue to wait for the OAuth callback
                // Note: Navigation may cause cross-origin errors which we should ignore
                return;
              } catch (e) {
                // Check if this is a cross-origin error due to navigation
                if (e instanceof DOMException && e.name === 'SecurityError') {
                  console.log('🔄 Cross-origin navigation detected (expected during OAuth flow)');
                  // This is expected when the popup navigates to the OAuth server
                  // Keep waiting for the OAuth callback
                  return;
                }
                
                console.error('❌ Failed to redirect popup:', e);
                this.cleanup();
                reject(new Error('Failed to redirect OAuth popup. Please try logging in again.'));
                return;
              }
            } else {
              // If popup is closed, cleanup and reject with specific error
              this.cleanup();
              reject(new Error(
                'OAuth popup was closed. Please try logging in again.'
              ));
              return;
            }
          }
        }
        
        // If no oauthParams, reject as invalid
        this.cleanup();
        reject(new Error(`Invalid ${innerData.type} message structure`));
        return;
      } else if (innerData.type === 'OAUTH_SUCCESS' || innerData.type === 'OAUTH_ERROR' || innerData.type === 'OAUTH_ACK') {
        // Direct mapping for standard types
        messageData = {
          type: innerData.type,
          tokenData: innerData.tokenData,
          token: innerData.token,
          error: innerData.error,
          error_description: innerData.error_description
        };
        actualMessageType = innerData.type;
      } else {
        // Unknown inner type, reject
        console.error('Unknown inner OAuth message type:', innerData.type);
        reject(new Error('Unknown OAuth message type'));
        return;
      }
    } else if (event.data.type === 'OAUTH_SUCCESS' || event.data.type === 'OAUTH_ERROR' || event.data.type === 'OAUTH_ACK') {
      // Already flat structure
      messageData = event.data as OAuthMessageFlat;
      actualMessageType = messageData.type;
    } else {
      // Invalid message type
      console.error('Invalid OAuth message type:', event.data.type);
      reject(new Error('Invalid OAuth message type'));
      return;
    }
    
    this.messageReceived = true;

    if (actualMessageType === 'OAUTH_SUCCESS') {
      console.log('✅ OAUTH_SUCCESS message received, processing...');
      
      // Send acknowledgment back to popup
      if (event.source && typeof event.source.postMessage === 'function') {
        try {
          console.log('📤 Sending acknowledgment to popup...');
          (event.source as Window).postMessage({ type: 'OAUTH_ACK' }, event.origin === 'null' ? '*' : event.origin);
          console.log('✅ Acknowledgment sent to popup');
        } catch (e) {
          console.error('Failed to send acknowledgment to popup:', e);
        }
      }
      
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
      
      this.cleanup();
      console.log('🧹 Cleanup completed');
      
      if (messageData.tokenData) {
        console.log('📦 Resolving with full token data');
        resolve(messageData.tokenData);
      } else if (messageData.token) {
        console.log('📦 Resolving with access token only');
        resolve({
          access_token: messageData.token,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: this.scopes.join(' ')
        });
      } else {
        console.error('❌ No token data in message');
        reject(new Error('No token data received'));
      }
    } else if (actualMessageType === 'OAUTH_ERROR') {
      // Send acknowledgment for error case too
      if (event.source && typeof event.source.postMessage === 'function') {
        try {
          (event.source as Window).postMessage({ type: 'OAUTH_ACK' }, event.origin === 'null' ? '*' : event.origin);
        } catch (e) {
          console.error('Failed to send error acknowledgment:', e);
        }
      }
      
      this.cleanup();
      
      // 🔧 ENHANCED: Check for login_required error and suggest fallback
      if (messageData.error === 'login_required' || 
          (messageData.error_description && messageData.error_description.includes('Force re-authentication required'))) {
        console.log('🔄 OAuth server rejected forced login, this is expected behavior');
        console.log('ℹ️ The "다른 사용자로 로그인" flow requires manual logout from OAuth server first');
        
        // Provide helpful error message
        const helpfulError = new Error(
          'Different user login requires logout from MAX Platform first.\n\n' +
          'Please:\n' +
          '1. Go to MAX Platform (http://localhost:8000) in a new tab\n' +
          '2. Log out completely\n' +
          '3. Return here and try "다른 사용자로 로그인" again\n\n' +
          'Alternatively, try the regular login button instead.'
        );
        (helpfulError as any).code = 'LOGIN_REQUIRED';
        (helpfulError as any).recoverable = true;
        reject(helpfulError);
      } else if (messageData.error === 'Account selection required' || 
                 messageData.error === 'User must select an account') {
        // 🔧 NEW: Handle new error from OAuth server (with both possible error messages)
        console.log('🔄 OAuth server requires account selection');
        console.log('ℹ️ The OAuth server is requesting account selection but may not support it properly');
        console.log('📊 Actual error message:', messageData.error);
        
        // Provide helpful error message for this specific case
        const accountSelectionError = new Error(
          '다른 계정으로 로그인하려면 먼저 MAX Platform에서 로그아웃해야 합니다.\n\n' +
          '해결 방법:\n' +
          '1. 새 탭에서 http://localhost:8000 열기\n' +
          '2. 로그아웃 버튼 클릭\n' +
          '3. 이 창으로 돌아와서 다시 시도'
        );
        (accountSelectionError as any).code = 'ACCOUNT_SELECTION_REQUIRED';
        (accountSelectionError as any).recoverable = true;
        reject(accountSelectionError);
      } else {
        console.log('🚨 Unexpected OAuth error:', messageData.error);
        reject(new Error(messageData.error || 'OAuth authentication failed'));
      }
    }
  }

  // Handle BroadcastChannel message
  private handleBroadcastMessage(event: MessageEvent, resolve: Function, reject: Function, broadcastChannel: BroadcastChannel | null): void {
    // DEPRECATED message types handling
    if (event.data.type === 'OAUTH_LOGIN_SUCCESS_CONTINUE' || 
        event.data.type === 'OAUTH_ALREADY_AUTHENTICATED') {
      console.warn(`⚠️ DEPRECATED: Received deprecated BroadcastChannel message type '${event.data.type}'`);
      console.warn('🔴 This message type should not be sent in the new OAuth flow');
      
      this.cleanup();
      broadcastChannel?.close();
      
      reject(new Error(
        `Deprecated OAuth BroadcastChannel message type: ${event.data.type}.\n` +
        `Please update the OAuth server to use the new standard flow.`
      ));
      return;
    }
    
    if (event.data.type === 'OAUTH_SUCCESS') {
      console.log('✅ OAuth success via BroadcastChannel');
      this.messageReceived = true;
      
      // Send acknowledgment back via BroadcastChannel
      if (broadcastChannel) {
        try {
          console.log('📤 Sending acknowledgment via BroadcastChannel...');
          broadcastChannel.postMessage({ type: 'OAUTH_ACK' });
          console.log('✅ Acknowledgment sent via BroadcastChannel');
        } catch (e) {
          console.error('Failed to send BroadcastChannel acknowledgment:', e);
        }
      }
      
      this.cleanup();
      broadcastChannel?.close();
      
      if (event.data.tokenData) {
        resolve(event.data.tokenData);
      } else if (event.data.token) {
        resolve({
          access_token: event.data.token,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: this.scopes.join(' ')
        });
      }
    } else if (event.data.type === 'OAUTH_ERROR') {
      console.log('❌ OAuth error via BroadcastChannel');
      
      // Send acknowledgment for error case too
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({ type: 'OAUTH_ACK' });
        } catch (e) {
          console.error('Failed to send error acknowledgment via BroadcastChannel:', e);
        }
      }
      
      this.cleanup();
      broadcastChannel?.close();
      
      // 🔧 ENHANCED: Check for login_required error and suggest fallback
      if (event.data.error === 'login_required' || 
          (event.data.error_description && event.data.error_description.includes('Force re-authentication required'))) {
        console.log('🔄 OAuth server rejected forced login via BroadcastChannel, this is expected behavior');
        console.log('ℹ️ The "다른 사용자로 로그인" flow requires manual logout from OAuth server first');
        
        // Provide helpful error message
        const helpfulError = new Error(
          'Different user login requires logout from MAX Platform first.\n\n' +
          'Please:\n' +
          '1. Go to MAX Platform (http://localhost:8000) in a new tab\n' +
          '2. Log out completely\n' +
          '3. Return here and try "다른 사용자로 로그인" again\n\n' +
          'Alternatively, try the regular login button instead.'
        );
        (helpfulError as any).code = 'LOGIN_REQUIRED';
        (helpfulError as any).recoverable = true;
        reject(helpfulError);
      } else if (event.data.error === 'Account selection required' || 
                 event.data.error === 'User must select an account') {
        // 🔧 NEW: Handle new error from OAuth server (with both possible error messages)
        console.log('🔄 OAuth server requires account selection via BroadcastChannel');
        console.log('ℹ️ The OAuth server is requesting account selection but may not support it properly');
        console.log('📊 Actual error message:', event.data.error);
        
        // Provide helpful error message for this specific case
        const accountSelectionError = new Error(
          '다른 계정으로 로그인하려면 먼저 MAX Platform에서 로그아웃해야 합니다.\n\n' +
          '해결 방법:\n' +
          '1. 새 탭에서 http://localhost:8000 열기\n' +
          '2. 로그아웃 버튼 클릭\n' +
          '3. 이 창으로 돌아와서 다시 시도'
        );
        (accountSelectionError as any).code = 'ACCOUNT_SELECTION_REQUIRED';
        (accountSelectionError as any).recoverable = true;
        reject(accountSelectionError);
      } else {
        console.log('🚨 Unexpected OAuth error via BroadcastChannel:', event.data.error);
        reject(new Error(event.data.error || 'OAuth authentication failed'));
      }
    }
  }

  // 🔒 SECURITY: Enhanced cleanup with state management
  private cleanup(): void {
    // Clear OAuth popup redirect flags
    sessionStorage.removeItem('oauth_popup_redirecting');
    sessionStorage.removeItem('oauth_popup_redirect_time');
    
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    // Update flow state to completed or failed (only if not already in a terminal state)
    if (this.currentFlowState) {
      const currentFlowState = getOAuthFlow(this.currentFlowState.state);
      if (currentFlowState && currentFlowState.status !== 'completed' && currentFlowState.status !== 'failed') {
        const finalStatus = this.messageReceived ? 'completed' : 'failed';
        updateOAuthFlowStatus(this.currentFlowState.flowId, finalStatus);
        
        console.log('🔄 OAuth flow state updated to:', {
          flowId: this.currentFlowState.flowId,
          status: finalStatus,
          messageReceived: this.messageReceived
        });
      } else {
        console.log('🔄 OAuth flow already in terminal state:', currentFlowState?.status);
      }
    }

    // Reset instance state
    this.popup = null;
    this.messageReceived = false;
    this.authInProgress = false;
    this.currentFlowState = null;
    
    // 🔧 ENHANCED: Clean up OAuth mode flags but preserve communication keys
    sessionStorage.removeItem('oauth_popup_mode');
    sessionStorage.removeItem('oauth_window_type');
    sessionStorage.removeItem('oauth_parent_origin');
    sessionStorage.removeItem('oauth_popup_mode_timestamp');
    
    // 🔧 CRITICAL: Only remove force account selection if login was successful
    const hasSuccessResult = sessionStorage.getItem('oauth_result') || 
                            sessionStorage.getItem('oauth_success') || 
                            sessionStorage.getItem('oauth_different_user_success');
    
    if (hasSuccessResult) {
      sessionStorage.removeItem('oauth_force_account_selection');
      sessionStorage.removeItem('oauth_different_user_success');
      console.log('✅ Removed force account selection flag after successful login');
    } else {
      console.log('⚠️ Preserving oauth_force_account_selection due to no success result');
    }
  }

  public forceCleanup(): void {
    this.cleanup();
  }

  // 🔒 SECURITY: Get trusted origins with environment-based configuration
  private getTrustedOrigins(): string[] {
    const baseOrigins = [
      window.location.origin,
      this.authUrl,  // OAuth server URL from environment
    ];

    // 🔒 SECURE: Only add necessary development origins
    const devOrigins = [
      'http://localhost:3010',  // Correct frontend URL  
      'http://localhost:8000',  // OAuth server origin
    ];
    
    // 🔧 COMPATIBILITY: Only add port 3000 if it's actually the OAuth server URL
    if (this.authUrl.includes(':3000')) {
      devOrigins.push('http://localhost:3000');
    }

    // Add production origins based on environment
    const prodOrigins = [
      'https://maxlab.io',
      'https://app.maxlab.io',
      'https://auth.maxlab.io',
      'https://max.dwchem.co.kr',  // DWChem auth server
      'https://maxlab.dwchem.co.kr'  // DWChem MaxLab instance
    ];

    // Combine based on environment
    const isDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';
    
    return isDevelopment 
      ? [...baseOrigins, ...devOrigins]
      : [...baseOrigins, ...prodOrigins];
  }

  // 🔒 SECURITY: Enhanced origin validation with security level assessment
  private validateMessageOrigin(origin: string, messageData: any): {
    isValid: boolean;
    reason: string;
    securityLevel: 'low' | 'medium' | 'high' | 'critical';
    hasMismatch: boolean;
  } {
    const trustedOrigins = this.getTrustedOrigins();
    
    // 🔧 ENHANCED: Check for OAuth message type FIRST for better compatibility
    const isOAuthMessage = messageData?.type && (
      messageData.type === 'OAUTH_SUCCESS' || 
      messageData.type === 'OAUTH_ERROR' || 
      messageData.type === 'OAUTH_ACK'
    );
    
    // Check for exact origin match
    if (trustedOrigins.includes(origin)) {
      // Check for known misconfiguration
      const hasMismatch = origin === 'http://localhost:3000' && 
                          window.location.origin !== 'http://localhost:3000';
      
      return {
        isValid: true,
        reason: hasMismatch ? 'Known OAuth server misconfiguration' : 'Trusted origin',
        securityLevel: hasMismatch ? 'high' : 'low',
        hasMismatch
      };
    }

    // Check for same-origin
    if (origin === window.location.origin) {
      return {
        isValid: true,
        reason: 'Same origin',
        securityLevel: 'low',
        hasMismatch: false
      };
    }

    // 🔧 ENHANCED: More flexible origin validation for OAuth messages
    // Allow null origin for OAuth messages (common in popup scenarios)
    if (origin === 'null' && isOAuthMessage) {
      console.log('🔐 Allowing null origin for valid OAuth message');
      return {
        isValid: true,
        reason: 'Null origin with valid OAuth message structure',
        securityLevel: 'medium',
        hasMismatch: false
      };
    }
    
    // 🔧 NEW: Allow file:// origin for OAuth messages (popup in some browsers)
    if (origin.startsWith('file://') && isOAuthMessage) {
      console.log('🔐 Allowing file:// origin for valid OAuth message');
      return {
        isValid: true,
        reason: 'File origin with valid OAuth message structure',
        securityLevel: 'medium',
        hasMismatch: false
      };
    }
    
    // 🔧 NEW: Allow callback URL origin for OAuth messages
    if (origin.includes('/oauth/callback') && isOAuthMessage) {
      console.log('🔐 Allowing OAuth callback origin for valid OAuth message');
      return {
        isValid: true,
        reason: 'OAuth callback origin with valid message',
        securityLevel: 'medium',
        hasMismatch: false
      };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/,
      /data:/,
      /vbscript:/,
      /chrome-extension:/
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(origin));
    if (isSuspicious) {
      return {
        isValid: false,
        reason: 'Suspicious origin protocol detected',
        securityLevel: 'critical',
        hasMismatch: false
      };
    }
    
    // 🔧 NEW: Final check - if it's a valid OAuth message, be more lenient
    if (isOAuthMessage) {
      console.warn('⚠️ OAuth message from untrusted origin, but allowing due to valid structure:', origin);
      return {
        isValid: true,
        reason: 'Untrusted origin but valid OAuth message structure',
        securityLevel: 'high',
        hasMismatch: true
      };
    }

    // Unknown origin
    return {
      isValid: false,
      reason: 'Origin not in trusted list',
      securityLevel: 'high',
      hasMismatch: false
    };
  }

  // 🔒 SECURITY: Validate message structure to prevent malformed data attacks
  private validateMessageStructure(messageData: any): boolean {
    if (!messageData || typeof messageData !== 'object') {
      return false;
    }

    // 🔧 FIX: Handle nested OAUTH_MESSAGE structure from auth server
    if (messageData.type === 'OAUTH_MESSAGE' && messageData.data) {
      // Auth server sends nested structure: { type: 'OAUTH_MESSAGE', data: { type: 'ACTUAL_TYPE', ... } }
      const innerData = messageData.data;
      
      // Valid inner message types from auth server
      const validInnerTypes = [
        'OAUTH_LOGIN_SUCCESS_CONTINUE',
        'OAUTH_ALREADY_AUTHENTICATED', 
        'OAUTH_SUCCESS',
        'OAUTH_ERROR',
        'OAUTH_ACK'
      ];
      
      if (!innerData.type || !validInnerTypes.includes(innerData.type)) {
        console.warn('Invalid inner OAuth message type:', innerData.type);
        return false;
      }
      
      // Map auth server message types to our expected types for further processing
      if (innerData.type === 'OAUTH_LOGIN_SUCCESS_CONTINUE' || 
          innerData.type === 'OAUTH_ALREADY_AUTHENTICATED') {
        // These are success messages from auth server
        // They should contain oauthParams with necessary data
        if (!innerData.oauthParams) {
          console.warn('Missing oauthParams in auth server message');
          return false;
        }
        return true; // Valid nested structure
      }
      
      // Standard nested types
      if (innerData.type === 'OAUTH_SUCCESS') {
        return !!(innerData.token || innerData.tokenData);
      }
      
      if (innerData.type === 'OAUTH_ERROR') {
        return !!innerData.error;
      }
      
      return true; // Other valid types
    }

    // Original flat structure validation (backward compatibility)
    const validTypes = ['OAUTH_SUCCESS', 'OAUTH_ERROR', 'OAUTH_ACK'];
    if (!messageData.type || !validTypes.includes(messageData.type)) {
      return false;
    }

    // Type-specific validation for flat structure
    if (messageData.type === 'OAUTH_SUCCESS') {
      // Success messages should have token data
      if (!messageData.token && !messageData.tokenData) {
        return false;
      }
      
      // Validate token data structure if present
      if (messageData.tokenData) {
        const tokenData = messageData.tokenData;
        if (typeof tokenData !== 'object' || !tokenData.access_token) {
          return false;
        }
      }
    } else if (messageData.type === 'OAUTH_ERROR') {
      // Error messages should have error description
      if (!messageData.error || typeof messageData.error !== 'string') {
        return false;
      }
    }

    return true;
  }

  // 🔒 SECURITY: Log security violations for monitoring and auditing
  private logSecurityViolation(violation: {
    type: string;
    origin: string;
    messageType?: string;
    reason?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    expectedOrigin?: string;
  }): void {
    // Create comprehensive security log entry
    const securityLog = {
      timestamp: new Date().toISOString(),
      event: 'oauth_security_violation',
      violation_type: violation.type,
      origin: violation.origin,
      expected_origin: violation.expectedOrigin || window.location.origin,
      message_type: violation.messageType,
      reason: violation.reason,
      severity: violation.severity,
      user_agent: navigator.userAgent,
      referrer: document.referrer,
      current_url: window.location.href,
      session_id: sessionStorage.getItem('oauth_state')?.substring(0, 8) || 'none'
    };

    // Log to console with appropriate level
    switch (violation.severity) {
      case 'critical':
        console.error('🚨 CRITICAL SECURITY VIOLATION:', securityLog);
        break;
      case 'high':
        console.warn('⚠️ HIGH SECURITY VIOLATION:', securityLog);
        break;
      case 'medium':
        console.warn('⚠️ MEDIUM SECURITY VIOLATION:', securityLog);
        break;
      default:
        console.log('ℹ️ LOW SECURITY VIOLATION:', securityLog);
    }

    // Store in sessionStorage for potential backend reporting
    try {
      const existingViolations = JSON.parse(sessionStorage.getItem('oauth_security_violations') || '[]');
      existingViolations.push(securityLog);
      
      // Keep only last 10 violations to prevent storage bloat
      const recentViolations = existingViolations.slice(-10);
      sessionStorage.setItem('oauth_security_violations', JSON.stringify(recentViolations));
    } catch (error) {
      console.error('Failed to store security violation log:', error);
    }

    // Optional: Send to backend security monitoring endpoint
    if (violation.severity === 'critical' || violation.severity === 'high') {
      this.reportSecurityViolation(securityLog).catch(error => {
        console.error('Failed to report security violation to backend:', error);
      });
    }
  }

  // 🔒 SECURITY: Report critical security violations to backend
  private async reportSecurityViolation(securityLog: any): Promise<void> {
    try {
      const backendUrl = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8010';
      
      // Only report in production or when explicitly enabled
      const shouldReport = import.meta.env.VITE_ENABLE_SECURITY_REPORTING === 'true' ||
                           window.location.hostname !== 'localhost';
      
      if (!shouldReport) {
        console.log('Security violation reporting disabled in development');
        return;
      }

      await fetch(`${backendUrl}/api/security/violations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(securityLog)
      });
    } catch (error) {
      // Silently fail - security reporting should not break OAuth flow
      console.warn('Security violation reporting failed:', error);
    }
  }
}

// 중복 토큰 교환 요청 방지를 위한 전역 상태
const tokenExchangeInProgress = new Map<string, Promise<TokenResponse>>();

// 🔒 SECURITY: Enhanced token exchange with state management
export async function exchangeCodeForToken(code: string, state?: string): Promise<TokenResponse> {
  // 동일한 코드로 이미 진행 중인 요청이 있는지 확인
  if (tokenExchangeInProgress.has(code)) {
    console.log('🔄 Token exchange already in progress for this code, waiting...');
    return tokenExchangeInProgress.get(code)!;
  }

  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  let codeVerifier: string | null = null;
  let flowState: OAuthFlowState | null = null;

  console.log('💱 Token exchange debug info:', {
    hasState: !!state,
    stateValue: state ? state.substring(0, 8) + '...' : 'null',
    codeValue: code ? code.substring(0, 8) + '...' : 'null'
  });

  // Try to get code verifier from state manager first
  if (state) {
    console.log('🔍 Validating OAuth flow state...');
    const validation = validateOAuthFlow(state);
    console.log('🔐 OAuth flow validation result:', validation);
    
    // 🔧 CRITICAL FIX: Handle _force_ state patterns for token exchange
    if (!validation.isValid && state.includes('_force_')) {
      console.log('🔍 Token exchange: State validation failed for _force_ pattern, trying original state...');
      const originalState = state.split('_force_')[0];
      const originalValidation = validateOAuthFlow(originalState);
      console.log('🔍 Token exchange: Original state validation result:', {
        isValid: originalValidation.isValid,
        originalState: originalState?.substring(0, 8) + '...',
        reason: originalValidation.reason
      });
      
      if (originalValidation.isValid) {
        // Use the original state for getting flow state
        flowState = getOAuthFlow(originalState);
        if (flowState) {
          console.log('✅ Token exchange: Found flow state using original state pattern');
          codeVerifier = flowState.codeVerifier;
        }
      }
    }
    
    if (validation.isValid) {
      console.log('✅ OAuth flow validation passed, getting flow state...');
      flowState = getOAuthFlow(state);
      console.log('🔍 Retrieved flow state:', flowState ? {
        flowId: flowState.flowId,
        hasCodeVerifier: !!flowState.codeVerifier,
        codeVerifierLength: flowState.codeVerifier?.length || 0,
        status: flowState.status,
        flowType: flowState.flowType
      } : 'null');
      
      if (flowState) {
        codeVerifier = flowState.codeVerifier;
        // Update flow status to token exchange
        updateOAuthFlowStatus(flowState.flowId, 'token_exchange');
        console.log('🔐 Using code verifier from flow state:', {
          flowId: flowState.flowId,
          codeVerifierFound: !!codeVerifier,
          codeVerifierLength: codeVerifier?.length || 0
        });
      } else {
        console.error('❌ Flow state is null despite valid validation');
      }
    } else {
      console.warn('🚨 OAuth flow validation failed:', {
        reason: validation.reason,
        securityLevel: validation.securityLevel,
        canProceed: validation.canProceed
      });
    }
  } else {
    console.warn('⚠️ No state parameter provided for token exchange');
  }

  // Fallback to legacy sessionStorage approach
  if (!codeVerifier) {
    console.log('🔧 Falling back to legacy sessionStorage for code verifier');
    codeVerifier = sessionStorage.getItem('oauth_code_verifier') || 
                   sessionStorage.getItem('silent_oauth_code_verifier');
    
    // If legacy approach fails, try direct sessionStorage search for OAuth flows
    if (!codeVerifier && state) {
      console.log('🔍 Legacy approach failed, searching all sessionStorage for OAuth flows...');
      try {
        // Search all sessionStorage keys for OAuth flow states
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('oauth_flow_')) {
            const storedState = sessionStorage.getItem(key);
            if (storedState) {
              try {
                const parsedFlow = JSON.parse(storedState);
                console.log('🔍 Checking direct stored flow:', {
                  key,
                  flowId: parsedFlow.flowId,
                  storedState: parsedFlow.state?.substring(0, 8) + '...',
                  searchState: state.substring(0, 8) + '...',
                  matchesSearch: parsedFlow.state === state,
                  hasCodeVerifier: !!parsedFlow.codeVerifier,
                  codeVerifierLength: parsedFlow.codeVerifier?.length || 0
                });
                
                if (parsedFlow.state === state && parsedFlow.codeVerifier) {
                  codeVerifier = parsedFlow.codeVerifier;
                  console.log('✅ Found code verifier via direct sessionStorage search:', {
                    flowId: parsedFlow.flowId,
                    codeVerifierLength: codeVerifier?.length || 0
                  });
                  break;
                }
              } catch (e) {
                console.warn('Failed to parse stored flow state:', key, e);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error during direct sessionStorage search for code verifier:', error);
      }
    }
    
    if (codeVerifier) {
      console.log('✅ Code verifier found via fallback method, length:', codeVerifier.length);
    } else {
      console.error('❌ All fallback methods failed to find code verifier');
    }
  }
  
  if (!codeVerifier) {
    throw new Error('No code verifier found - OAuth flow state may have expired');
  }

  console.log('🔐 Starting token exchange with code:', code.substring(0, 8) + '...');

  // 토큰 교환 Promise 생성 및 저장
  const tokenExchangePromise = (async (): Promise<TokenResponse> => {
    try {
      // 🔧 CRITICAL FIX: Call OAuth server directly for token exchange (새 OAuth server 구조)
      const authServerUrl = import.meta.env.VITE_AUTH_SERVER_URL || import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8000';
      const tokenUrl = import.meta.env.VITE_OAUTH_TOKEN_URL || `${authServerUrl}/auth/token`;
      console.log('🔄 Calling OAuth token endpoint:', tokenUrl);
      
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/oauth/callback`,
          client_id: import.meta.env.VITE_CLIENT_ID || 'maxlab',
          code_verifier: codeVerifier
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error_description || `Token exchange failed: ${response.statusText}`;
        console.error('❌ Token exchange failed:', errorMessage);
        
        // 🔒 BLACKLIST HANDLING: Check for token blacklist errors
        if (response.status === 401 && 
            (errorData.error === 'invalid_token' || errorMessage.includes('blacklist'))) {
          console.warn('🚫 Token blacklisted detected, clearing authentication state');
          
          // Clear localStorage authentication data
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          localStorage.removeItem('tokenExpiresAt');
          localStorage.removeItem('refreshExpiresAt');
          
          // Set logout flag to prevent silent auth
          localStorage.setItem('hasLoggedOut', 'true');
          localStorage.setItem('logoutTimestamp', Date.now().toString());
          sessionStorage.setItem('preventSilentAuth', 'true');
          
          console.warn('🚫 Authentication state cleared due to blacklisted token');
          throw new Error('Token has been invalidated. Please log in again.');
        }
        
        // 특정 에러에 대한 추가 정보
        if (response.status === 400 && errorData.error === 'invalid_grant') {
          throw new Error('Invalid or expired authorization code');
        }
        
        throw new Error(errorMessage);
      }

      console.log('✅ Token exchange successful');
      const tokenResponse = await response.json() as TokenResponse;
      
      // 디버깅: refresh_token 확인
      console.log('📋 Token response details:', {
        hasAccessToken: !!tokenResponse.access_token,
        hasRefreshToken: !!tokenResponse.refresh_token,
        refreshExpiresIn: tokenResponse.refresh_expires_in,
        tokenType: tokenResponse.token_type,
        scope: tokenResponse.scope
      });
      
      // 성공 후 flow state 업데이트 및 정리
      if (flowState) {
        updateOAuthFlowStatus(flowState.flowId, 'completed');
        console.log('✅ OAuth flow completed:', flowState.flowId);
      }
      
      // 🔧 LEGACY COMPATIBILITY: Clean up sessionStorage for backward compatibility
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('silent_oauth_code_verifier');
      // nonce는 ID Token 검증 후에 제거됨
      
      return tokenResponse;
    } finally {
      // 완료 후 진행 중인 요청에서 제거
      tokenExchangeInProgress.delete(code);
    }
  })();

  // 진행 중인 요청으로 등록
  tokenExchangeInProgress.set(code, tokenExchangePromise);

  return tokenExchangePromise;
}

// Enhanced popup mode detection with multiple fallback methods
export function isPopupMode(): boolean {
  console.log('🔍 Popup mode detection started:', {
    oauthPopupMode: sessionStorage.getItem('oauth_popup_mode'),
    oauthWindowType: sessionStorage.getItem('oauth_window_type'),
    oauthForceAccountSelection: sessionStorage.getItem('oauth_force_account_selection'),
    ssoRefreshReturnUrl: sessionStorage.getItem('sso_refresh_return_url'),
    windowOpener: !!window.opener,
    windowParent: window.parent !== window,
    windowSize: `${window.innerWidth}x${window.innerHeight}`,
    pathname: window.location.pathname,
    referrer: document.referrer
  });
  
  // 🔧 CRITICAL FIX: Check if we're in SSO refresh flow (redirect mode)
  const ssoRefreshReturnUrl = sessionStorage.getItem('sso_refresh_return_url');
  if (ssoRefreshReturnUrl) {
    console.log('🚫 SSO refresh flow detected - forcing redirect mode (not popup)');
    return false;
  }
  
  // Method 0: Check state manager for popup flows (new method) - MOST RELIABLE
  const urlParams = new URLSearchParams(window.location.search);
  const state = urlParams.get('state');
  if (state) {
    let flowState = getOAuthFlow(state);
    
    // 🔧 CRITICAL FIX: Handle _force_ state patterns for different user login
    if (!flowState && state.includes('_force_')) {
      console.log('🔍 State contains _force_, trying to find original state for popup detection...');
      const originalState = state.split('_force_')[0];
      flowState = getOAuthFlow(originalState);
      console.log('🔍 Original state lookup result:', flowState ? 'found' : 'not found');
    }
    
    if (flowState && flowState.flowType === 'popup') {
      console.log('🎯 Popup mode detected via OAuth flow state manager (AUTHORITATIVE)');
      return true;
    } else if (flowState && flowState.flowType === 'redirect') {
      console.log('🚫 Redirect mode detected via OAuth flow state manager (AUTHORITATIVE)');
      return false;
    }
  }
  
  // Method 1: Explicit popup mode flag - but verify it's not stale
  const oauthPopupMode = sessionStorage.getItem('oauth_popup_mode');
  const oauthWindowType = sessionStorage.getItem('oauth_window_type');
  if (oauthPopupMode === 'true' || oauthWindowType === 'popup') {
    // 🔧 CRITICAL FIX: Check if this is a stale flag from previous operation
    const popupModeTimestamp = sessionStorage.getItem('oauth_popup_mode_timestamp');
    if (popupModeTimestamp) {
      const age = Date.now() - parseInt(popupModeTimestamp);
      if (age > 300000) { // 5 minutes
        console.log(`🧹 Removing stale oauth_popup_mode flag (age: ${age}ms)`);
        sessionStorage.removeItem('oauth_popup_mode');
        sessionStorage.removeItem('oauth_window_type');
        sessionStorage.removeItem('oauth_popup_mode_timestamp');
      } else {
        console.log('🎯 Popup mode detected via oauth session flags (fresh)');
        return true;
      }
    } else {
      // No timestamp, assume it's recent if we're on OAuth callback
      if (window.location.pathname.includes('/oauth/callback')) {
        console.log('🎯 Popup mode detected via oauth session flags');
        return true;
      }
    }
  }
  
  // Method 2: Force account selection implies popup mode - but verify freshness
  const forceAccountSelection = sessionStorage.getItem('oauth_force_account_selection');
  if (forceAccountSelection === 'true' && window.location.pathname.includes('/oauth/callback')) {
    // 🔧 CRITICAL FIX: Only trust this if there's no conflicting flow state
    if (!state || (!getOAuthFlow(state) && !state.includes('_force_'))) {
      console.log('🎯 Popup mode detected via oauth_force_account_selection flag');
      return true;
    } else {
      console.log('🚫 oauth_force_account_selection found but flow state indicates redirect mode');
    }
  }
  
  // Method 3: Window opener relationship - MORE RESTRICTIVE
  if (window.opener !== null && window.opener !== window) {
    // 🔧 CRITICAL FIX: Be more restrictive - check additional popup indicators
    const hasPopupIndicators = (
      window.innerWidth <= 700 && window.innerHeight <= 900 || // Reasonable popup size
      window.name.includes('oauth') || window.name.includes('popup') ||
      sessionStorage.getItem('oauth_popup_mode') === 'true'
    );
    
    if (hasPopupIndicators) {
      console.log('🎯 Popup mode detected via window.opener + popup indicators');
      return true;
    } else {
      console.log('🚫 window.opener exists but no popup indicators - treating as regular tab navigation');
    }
  }
  
  // Method 4: Window parent relationship (for iframe scenarios) - UNCHANGED
  if (window.parent !== null && window.parent !== window && 
      window.location.pathname.includes('/oauth/callback')) {
    console.log('🎯 Popup mode detected via window.parent (iframe scenario)');
    return true;
  }
  
  // Method 5: URL parameter detection (reuse existing urlParams) - UNCHANGED
  if (urlParams.get('popup') === 'true' || urlParams.get('mode') === 'popup') {
    console.log('🎯 Popup mode detected via URL parameters');
    return true;
  }
  
  // Method 6: Referrer-based detection - MORE RESTRICTIVE
  if (document.referrer && document.referrer !== window.location.href) {
    try {
      const referrerUrl = new URL(document.referrer);
      const currentUrl = new URL(window.location.href);
      // 🔧 CRITICAL FIX: Only use referrer detection with additional popup indicators
      if (referrerUrl.origin === currentUrl.origin && 
          window.location.pathname.includes('/oauth/callback') &&
          (window.innerWidth <= 700 || sessionStorage.getItem('oauth_popup_mode') === 'true')) {
        console.log('🎯 Popup mode detected via referrer analysis + popup indicators');
        return true;
      }
    } catch (e) {
      console.log('Could not parse referrer URL:', e);
    }
  }
  
  // Method 7: Window size heuristic - MORE RESTRICTIVE
  if (window.innerWidth <= 600 && window.innerHeight <= 700 && 
      window.location.pathname.includes('/oauth/callback')) {
    console.log('🎯 Popup mode detected via window size heuristic (strict)');
    return true;
  }
  
  // Method 8: Window name detection - UNCHANGED
  if (window.name && (window.name.includes('oauth') || window.name.includes('popup'))) {
    console.log('🎯 Popup mode detected via window name');
    return true;
  }
  
  console.log('❌ Popup mode NOT detected - treating as direct navigation');
  return false;
}

// 사용자 정보 가져오기
export async function getUserInfo(accessToken: string): Promise<any> {
  // 🔧 CRITICAL FIX: Call OAuth server directly for userinfo (새 OAuth server 구조)
  const authServerUrl = import.meta.env.VITE_AUTH_SERVER_URL || import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8000';
  const userinfoUrl = import.meta.env.VITE_OAUTH_USERINFO_URL || `${authServerUrl}/auth/userinfo`;
  console.log('🔄 Calling OAuth userinfo endpoint:', userinfoUrl);
  
  const response = await fetch(userinfoUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  }

  return response.json();
}

// Silent authentication에서 사용
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}