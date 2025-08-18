/**
 * OAuth Callback Handler
 * Handles OAuth authorization code callbacks for both popup and silent authentication
 */

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { exchangeCodeForToken, isPopupMode } from '../utils/popupOAuth';
import { migrateLegacyOAuthState, validateOAuthFlow, getOAuthFlow, updateOAuthFlowStatus } from '../utils/oauthStateManager';
import { performEmergencyOAuthRecovery, shouldPerformEmergencyRecovery } from '../utils/oauthEmergencyRecovery';
import { SsoRefreshCircuitBreaker } from '../utils/ssoRefreshCircuitBreaker';

interface CallbackState {
  status: 'loading' | 'success' | 'error';
  message: string;
  error?: string;
}

export const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CallbackState>({
    status: 'loading',
    message: 'Processing OAuth callback...'
  });
  
  // 중복 실행 방지를 위한 ref
  const isProcessingRef = useRef(false);
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      // 🔍 DIAGNOSTIC: Check if this is a diagnostic test
      const urlParams = new URLSearchParams(window.location.search);
      const isDiagnostic = urlParams.get('diagnostic') === 'true';
      
      if (isDiagnostic) {
        console.log('🔍 DIAGNOSTIC MODE: OAuth callback loaded in diagnostic mode');
        
        // Send immediate notification that callback page loaded
        try {
          const loadedMessage = {
            type: 'POPUP_LOADED',
            timestamp: Date.now(),
            isDiagnostic: true,
            windowInfo: {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              opener: !!window.opener,
              parent: window.parent !== window
            },
            sessionStorageKeys: Object.keys(sessionStorage).filter(k => k.includes('oauth'))
          };

          // Send via multiple channels
          if (window.opener) {
            window.opener.postMessage(loadedMessage, '*');
            console.log('🔍 DIAGNOSTIC: Sent POPUP_LOADED to opener');
          }
          
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(loadedMessage, '*');
            console.log('🔍 DIAGNOSTIC: Sent POPUP_LOADED to parent');
          }

          const channel = new BroadcastChannel('oauth_channel');
          channel.postMessage(loadedMessage);
          channel.close();
          console.log('🔍 DIAGNOSTIC: Sent POPUP_LOADED via BroadcastChannel');

          sessionStorage.setItem('oauth_diagnostic_loaded', JSON.stringify(loadedMessage));
          console.log('🔍 DIAGNOSTIC: Stored POPUP_LOADED in sessionStorage');
        } catch (e) {
          console.error('🔍 DIAGNOSTIC ERROR: Failed to send POPUP_LOADED:', e);
        }
      }

      // 🔒 SECURITY: Migrate legacy OAuth state to new state manager
      const migrationResult = migrateLegacyOAuthState();
      if (migrationResult.migrated > 0) {
        console.log('🔄 Legacy OAuth state migrated:', migrationResult);
      }
      
      // 🎯 Check if we're in popup mode FIRST
      const inPopupMode = isPopupMode();
      const isSilentAuth = sessionStorage.getItem('silent_oauth_state') !== null;
      
      // 🔒 CRITICAL FIX: Only redirect immediately if NOT in popup/silent mode AND no authorization code
      // In popup mode, we need to send message to parent window first
      // IMPORTANT: Always process authorization codes for session upgrades, even with existing tokens
      if (!inPopupMode && !isSilentAuth) {
        const hasValidToken = localStorage.getItem('accessToken');
        const hasAuthorizationCode = searchParams.has('code');
        const hasError = searchParams.has('error');
        const state = searchParams.get('state');
        const isSSORrefreshCallback = state?.startsWith('sso_refresh_');
        
        // 🔒 CRITICAL: Detect if this is a stale OAuth callback (user refreshed the page or navigated directly)
        // Check if there's no authorization code AND no error, which indicates an invalid access
        if (!hasAuthorizationCode && !hasError) {
          console.log('⚠️ OAuth callback accessed without authorization code or error - likely a direct access or refresh');
          
          // If user has valid token, redirect to dashboard
          if (hasValidToken) {
            console.log('✅ User authenticated, redirecting to dashboard...');
            window.location.replace('/');
            return;
          } else {
            // No token and no auth code - redirect to login
            console.log('❌ No valid session, redirecting to login...');
            window.location.replace('/login');
            return;
          }
        }
        
        // 🔒 CRITICAL: Only redirect if user has valid token AND no authorization code to process
        // This prevents infinite loops when refreshing the OAuth callback page
        // BUT allows session upgrades and OAuth completion to work properly
        if (hasValidToken && !hasAuthorizationCode && !isSSORrefreshCallback) {
          console.log('✅ User authenticated on OAuth callback page with no authorization code, redirecting immediately...');
          const redirectTo = sessionStorage.getItem('oauthRedirectTo') || '/';
          sessionStorage.removeItem('oauthRedirectTo');
          sessionStorage.removeItem('oauth_flow_in_progress');
          sessionStorage.removeItem('oauth_callback_processing');
          sessionStorage.removeItem('oauth_state');
          sessionStorage.removeItem('silent_oauth_state');
          document.body.removeAttribute('data-oauth-processing');
          
          // Force immediate redirect to prevent OAuth callback loop
          window.location.replace(redirectTo);
          return;
        } else if (hasValidToken && hasAuthorizationCode) {
          console.log('🔄 User has existing token but authorization code present - processing OAuth completion for session upgrade...');
        }
      }
      
      console.log('🔍 OAuth Callback Mode Detection:', {
        inPopupMode,
        isSilentAuth,
        hasCode: searchParams.has('code'),
        hasError: searchParams.has('error'),
        sessionKeys: Object.keys(sessionStorage).filter(key => key.includes('oauth'))
      });

      // If OAuth was already processed successfully, handle based on mode
      if (hasProcessedRef.current && !inPopupMode && !isSilentAuth) {
        const hasValidToken = localStorage.getItem('accessToken');
        if (hasValidToken) {
          console.log('✅ OAuth already completed successfully, redirecting...');
          const redirectTo = sessionStorage.getItem('oauthRedirectTo') || '/';
          sessionStorage.removeItem('oauthRedirectTo');
          sessionStorage.removeItem('oauth_flow_in_progress');
          sessionStorage.removeItem('oauth_callback_processing');
          document.body.removeAttribute('data-oauth-processing');
          window.location.replace(redirectTo);
          return;
        }
      }

      // 중복 실행 방지 체크 (processing 중인 경우만)
      if (isProcessingRef.current) {
        console.log('🚫 OAuth callback currently processing, skipping...');
        return;
      }
      
      isProcessingRef.current = true;
      
      // OAuth 플로우 진행 중 상태 설정 (토큰 갱신 차단용)
      sessionStorage.setItem('oauth_flow_in_progress', 'true');
      sessionStorage.setItem('oauth_callback_processing', Date.now().toString());
      
      // DOM에 OAuth 처리 중 상태 마킹 (다른 컴포넌트에서 감지 가능)
      document.body.setAttribute('data-oauth-processing', 'true');
      
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        
        console.log('🔍 OAuth Callback URL Analysis:', {
          fullUrl: window.location.href,
          pathname: window.location.pathname,
          search: window.location.search,
          code: code ? code.substring(0, 8) + '...' : 'null',
          state: state ? state.substring(0, 8) + '...' : 'null',
          error: error,
          errorDescription: errorDescription,
          allParams: Object.fromEntries(searchParams.entries())
        });
        
        // CHECK: Is this an SSO token refresh callback?
        const isSSORrefreshCallback = state?.startsWith('sso_refresh_') || sessionStorage.getItem('sso_refresh_return_url');
        if (isSSORrefreshCallback) {
          console.log('🔄 SSO Token Refresh Callback Detected');
          
          // 🚨 CRITICAL FIX: Handle SSO refresh failures immediately
          if (error === 'login_required') {
            console.log('🚨 SSO Token Refresh Failed - MAX Platform session invalid');
            
            // Record SSO refresh failure in circuit breaker
            SsoRefreshCircuitBreaker.recordFailure(errorDescription || error, state || 'unknown');
            
            // CRITICAL FIX: Record failure time to prevent rapid retries
            sessionStorage.setItem('last_sso_failure', Date.now().toString());
            
            // CRITICAL FIX: Clear all SSO session data immediately to prevent retry
            localStorage.removeItem('auth_method');
            localStorage.removeItem('max_platform_session');
            localStorage.removeItem('token_renewable_via_sso');
            localStorage.removeItem('has_refresh_token');
            sessionStorage.removeItem('sso_refresh_return_url');
            sessionStorage.removeItem('sso_refresh_return_data');
            sessionStorage.removeItem('last_sso_attempt');
            
            // Circuit breaker will automatically clear SSO metadata when it opens
            console.log('✅ SSO refresh failure recorded and all SSO metadata cleared - loop prevention complete');
            
            // Set flag to prevent any further silent auth attempts
            sessionStorage.setItem('preventSilentAuth', 'true');
            
            // Redirect to login page instead of continuing loop
            setState({
              status: 'error',
              message: 'Session expired. Please log in again.',
              error: 'Your MAX Platform session has expired. Please log in to continue.'
            });
            
            setTimeout(() => {
              navigate('/login', { replace: true });
            }, 2000);
            
            return; // Exit immediately
          }
        }
        
        if (error) {
          const errorMessage = errorDescription || `OAuth error: ${error}`;
          
          console.error('🚨 OAuth Server Error:', {
            error,
            errorDescription,
            fullUrl: window.location.href,
            allParams: Object.fromEntries(searchParams.entries())
          });
          
          // 🔧 ENHANCED: Handle login_required error specifically for "different user" flow
          if (error === 'login_required' && errorDescription?.includes('Force re-authentication required')) {
            console.log('🔄 Handling login_required error for different user login');
            
            if (inPopupMode || isSilentAuth) {
              // Store error in sessionStorage for parent window recovery
              sessionStorage.setItem('oauth_error', error);
              sessionStorage.setItem('oauth_error_description', errorDescription || '');
              sessionStorage.setItem('oauth_error_timestamp', Date.now().toString());
              
              // Send error via multiple channels with enhanced payload
              const errorPayload = {
                type: 'OAUTH_ERROR',
                error: error,
                error_description: errorDescription,
                code: 'LOGIN_REQUIRED',
                recoverable: true
              };
              
              // Method 1: PostMessage with wildcard for cross-origin
              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage(errorPayload, '*');
                  console.log('📤 Sent login_required error to opener');
                } catch (e) {
                  console.error('Failed to send error via postMessage:', e);
                }
              }
              
              // Method 2: BroadcastChannel
              try {
                const channel = new BroadcastChannel('oauth_channel');
                channel.postMessage(errorPayload);
                console.log('📡 Sent login_required error via BroadcastChannel');
                
                // Wait a bit to ensure message is sent before closing channel
                setTimeout(() => {
                  channel.close();
                }, 100);
              } catch (e) {
                console.error('Failed to send error via BroadcastChannel:', e);
              }
              
              // Wait to ensure messages are sent, then close
              setTimeout(() => {
                if (inPopupMode && !window.closed) {
                  console.log('🚪 Closing popup after login_required error');
                  window.close();
                }
              }, 500);
              return;
            }
          } else if (error === 'Account selection required') {
            // 🔧 NEW: Handle account selection required error
            console.log('🔄 Handling Account selection required error');
            
            if (inPopupMode || isSilentAuth) {
              // Store error in sessionStorage for parent window recovery
              sessionStorage.setItem('oauth_error', error);
              sessionStorage.setItem('oauth_error_description', errorDescription || '');
              sessionStorage.setItem('oauth_error_timestamp', Date.now().toString());
              
              // Send error via multiple channels with enhanced payload
              const errorPayload = {
                type: 'OAUTH_ERROR',
                error: error,
                error_description: errorDescription || 'OAuth server requires account selection',
                code: 'ACCOUNT_SELECTION_REQUIRED',
                recoverable: true
              };
              
              // Method 1: PostMessage with wildcard for cross-origin
              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage(errorPayload, '*');
                  console.log('📤 Sent Account selection required error to opener');
                } catch (e) {
                  console.error('Failed to send error via postMessage:', e);
                }
              }
              
              // Method 2: BroadcastChannel
              try {
                const channel = new BroadcastChannel('oauth_channel');
                channel.postMessage(errorPayload);
                console.log('📡 Sent Account selection required error via BroadcastChannel');
                
                // Wait a bit to ensure message is sent before closing channel
                setTimeout(() => {
                  channel.close();
                }, 100);
              } catch (e) {
                console.error('Failed to send error via BroadcastChannel:', e);
              }
              
              // Wait to ensure messages are sent, then close
              setTimeout(() => {
                if (inPopupMode && !window.closed) {
                  console.log('🚪 Closing popup after Account selection required error');
                  window.close();
                }
              }, 500);
              return;
            }
          } else {
            // Handle other errors normally
            if (inPopupMode || isSilentAuth) {
              window.opener?.postMessage({
                type: 'OAUTH_ERROR',
                error: errorMessage
              }, window.location.origin);
              
              if (inPopupMode) window.close();
              return;
            }
          }
          
          throw new Error(errorMessage);
        }

        if (!code) {
          // 🔍 ENHANCED DEBUGGING: Log missing authorization code details
          console.error('🚨 No Authorization Code Received:', {
            expectedCode: 'Missing from OAuth server response',
            fullUrl: window.location.href,
            pathname: window.location.pathname,
            search: window.location.search,
            hash: window.location.hash,
            allParams: Object.fromEntries(searchParams.entries()),
            possibleCauses: [
              'OAuth server configuration error',
              'Invalid redirect_uri',
              'User denied authorization',
              'OAuth server internal error',
              'Network/proxy interference'
            ]
          });
          
          throw new Error('No authorization code received');
        }

        setState({
          status: 'loading',
          message: 'Exchanging authorization code for access token...'
        });

        if (inPopupMode || isSilentAuth) {
          try {
            console.log('🎯 OAuth Callback - Popup Mode Processing Started');
            
            // 🔒 SECURITY: Enhanced state validation using new state manager
            let validation = validateOAuthFlow(state || '');
            let flowState = getOAuthFlow(state || '');
            
            // 🔧 CRITICAL FIX: Handle _force_ state patterns for different user login
            if ((!validation.isValid || !flowState) && state?.includes('_force_')) {
              console.log('🔍 State validation failed for _force_ pattern, trying original state...');
              const originalState = state.split('_force_')[0];
              
              console.log('🔍 Force pattern state handling:', {
                fullState: state,
                originalState: originalState,
                stateLength: state.length,
                originalLength: originalState.length
              });
              
              validation = validateOAuthFlow(originalState);
              flowState = getOAuthFlow(originalState);
              
              console.log('🔍 Original state validation result:', {
                isValid: validation.isValid,
                flowStateFound: !!flowState,
                originalState: originalState?.substring(0, 8) + '...',
                validationReason: validation.reason,
                flowStateData: flowState ? {
                  flowId: flowState.flowId,
                  flowType: flowState.flowType,
                  status: flowState.status,
                  forceAccountSelection: flowState.forceAccountSelection
                } : null
              });
              
              // If found with original state, update flow state to use modified state
              if (validation.isValid && flowState) {
                console.log('✅ Found matching flow state using original state pattern for callback');
                // Update the flow state to use the modified state for consistency
                flowState.state = state || '';
                const { updateOAuthFlowStatus } = await import('../utils/oauthStateManager');
                updateOAuthFlowStatus(flowState.flowId, 'token_exchange');
                console.log('✅ Updated flow state with force pattern state');
              } else {
                console.error('❌ Failed to find flow state even with original state:', {
                  originalState: originalState?.substring(0, 8) + '...',
                  validationIsValid: validation.isValid,
                  flowStateFound: !!flowState,
                  sessionStorageKeys: Object.keys(sessionStorage).filter(k => k.includes('oauth'))
                });
              }
            }
            
            console.log('🔐 OAuth State Validation Debug:', {
              urlState: state ? state.substring(0, 8) + '...' : 'null',
              fullState: state, // Full state for debugging
              isForceAccountSelection: state?.includes('_force_'),
              validationResult: validation,
              flowState: flowState ? {
                flowId: flowState.flowId,
                flowType: flowState.flowType,
                status: flowState.status,
                storedState: flowState.state?.substring(0, 8) + '...',
                fullStoredState: flowState.state, // Full stored state for debugging
                forceAccountSelection: flowState.forceAccountSelection,
                createdAt: new Date(flowState.createdAt).toISOString(),
                expiresAt: new Date(flowState.expiresAt).toISOString()
              } : null,
              inPopupMode,
              isSilentAuth,
              origin: window.location.origin,
              sessionStorageOAuthKeys: Object.keys(sessionStorage).filter(k => k.includes('oauth'))
            });
            
            if (!validation.isValid || !flowState) {
              console.error('❌ OAuth State Validation Failed:', {
                reason: validation.reason,
                securityLevel: validation.securityLevel,
                canProceed: validation.canProceed,
                flowStateExists: !!flowState,
                possibleCauses: [
                  'OAuth flow state expired (15 minute timeout)',
                  'Browser security cleanup removed OAuth state',
                  'Session storage cleared during OAuth flow',
                  'CSRF attack attempt',
                  'Multiple OAuth flows interfering'
                ]
              });
              
              // 🔧 FALLBACK: Check for basic OAuth sessionStorage values for force account selection
              const hasBasicOAuthState = sessionStorage.getItem('oauth_popup_mode') === 'true' && 
                                        sessionStorage.getItem('oauth_force_account_selection') === 'true' &&
                                        sessionStorage.getItem('oauth_code_verifier');
              
              if (hasBasicOAuthState && state?.includes('_force_')) {
                console.log('🔧 FALLBACK: Found basic OAuth sessionStorage for force account selection, attempting to proceed...');
                
                // Create a minimal flow state to allow processing
                const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
                const nonce = sessionStorage.getItem('oauth_nonce');
                
                if (codeVerifier) {
                  console.log('✅ FALLBACK: Proceeding with basic OAuth parameters');
                  
                  // Skip to token exchange with available parameters
                  console.log('💱 FALLBACK: Starting token exchange with basic parameters...');
                  const tokenResponse = await exchangeCodeForToken(code, state || '');
                  console.log('✅ FALLBACK: Token exchange successful:', {
                    hasAccessToken: !!tokenResponse.access_token,
                    hasRefreshToken: !!tokenResponse.refresh_token,
                    tokenType: tokenResponse.token_type
                  });
                  
                  // Success handling
                  hasProcessedRef.current = true;
                  
                  // Clean up sessionStorage
                  sessionStorage.removeItem('oauth_popup_mode');
                  sessionStorage.removeItem('oauth_window_type');
                  sessionStorage.removeItem('oauth_parent_origin');
                  sessionStorage.removeItem('oauth_force_account_selection');
                  sessionStorage.removeItem('silent_oauth_state');
                  sessionStorage.removeItem('silent_oauth_code_verifier');
                  sessionStorage.removeItem('oauth_nonce');
                  sessionStorage.removeItem('oauth_flow_in_progress');
                  sessionStorage.removeItem('oauth_callback_processing');
                  
                  // 🔒 CRITICAL FIX: Clean up any pending silent auth cleanup flags
                  sessionStorage.removeItem('silent_auth_cleanup_pending');
                  
                  const messagePayload = {
                    type: 'OAUTH_SUCCESS',
                    token: tokenResponse.access_token,
                    tokenData: tokenResponse
                  };
                  
                  console.log('📤 FALLBACK: Sending success message...');
                  
                  // Send success message using all available methods
                  // Method 1: Store in SessionStorage first
                  try {
                    const resultData = {
                      success: true,
                      tokenData: tokenResponse,
                      timestamp: Date.now()
                    };
                    sessionStorage.setItem('oauth_result', JSON.stringify(resultData));
                    sessionStorage.setItem('oauth_success', JSON.stringify(resultData));
                    sessionStorage.setItem('oauth_access_token', tokenResponse.access_token);
                    console.log('✅ FALLBACK: Success result stored in sessionStorage');
                  } catch (e) {
                    console.error('❌ FALLBACK: Failed to store success result:', e);
                  }
                  
                  // Method 2: PostMessage
                  if (window.opener && window.opener !== window) {
                    try {
                      window.opener.postMessage(messagePayload, '*');
                      console.log('✅ FALLBACK: PostMessage sent to opener');
                    } catch (e) {
                      console.error('❌ FALLBACK: PostMessage failed:', e);
                    }
                  }
                  
                  // Method 3: BroadcastChannel
                  try {
                    const channel = new BroadcastChannel('oauth_channel');
                    channel.postMessage(messagePayload);
                    channel.close();
                    console.log('✅ FALLBACK: BroadcastChannel message sent');
                  } catch (e) {
                    console.error('❌ FALLBACK: BroadcastChannel failed:', e);
                  }
                  
                  // Close popup
                  if (inPopupMode) {
                    console.log('🚪 FALLBACK: Closing popup after success...');
                    setTimeout(() => {
                      window.close();
                    }, 100);
                  }
                  
                  return; // Exit the function successfully
                }
              }
              
              // 🚨 EMERGENCY RECOVERY: Check if emergency recovery is needed
              const recoveryCheck = shouldPerformEmergencyRecovery();
              let errorMessage = validation.reason === 'Flow state not found or expired'
                ? 'OAuth session expired or was cleared. Please try logging in again.'
                : `OAuth validation failed: ${validation.reason}`;
              
              if (recoveryCheck.needed && recoveryCheck.severity === 'high') {
                console.warn('🚨 Emergency OAuth recovery needed:', recoveryCheck);
                try {
                  const recoveryResult = await performEmergencyOAuthRecovery({
                    clearAllState: true,
                    resetStorage: false,
                    forceReload: false,
                    showUserGuidance: false
                  });
                  
                  if (recoveryResult.success) {
                    errorMessage = 'OAuth session has been reset. Please close this window and try logging in again.';
                    console.log('✅ Emergency OAuth recovery completed:', recoveryResult);
                  }
                } catch (recoveryError) {
                  console.error('❌ Emergency OAuth recovery failed:', recoveryError);
                }
              }
              
              // 🔧 ENHANCED ERROR COMMUNICATION: Use all available methods with better error details
              let errorSent = false;
              const errorDetails = {
                error: errorMessage,
                reason: validation.reason,
                timestamp: Date.now(),
                url: window.location.href,
                flowState: state
              };
              
              // Method 1: SessionStorage FIRST for immediate availability
              try {
                sessionStorage.setItem('oauth_error', errorMessage);
                sessionStorage.setItem('oauth_error_details', JSON.stringify(errorDetails));
                console.log('💾 OAuth error stored in sessionStorage for immediate detection');
                errorSent = true;
              } catch (e) {
                console.error('❌ SessionStorage error fallback failed:', e);
              }
              
              // Method 2: PostMessage to opener
              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage({
                    type: 'OAUTH_ERROR',
                    error: errorMessage,
                    details: errorDetails
                  }, '*');
                  console.log('✅ OAuth error sent via PostMessage to opener');
                  errorSent = true;
                } catch (e) {
                  console.error('❌ Failed to send OAuth error via PostMessage:', e);
                }
              }
              
              // Method 3: BroadcastChannel fallback
              try {
                const channel = new BroadcastChannel('oauth_channel');
                channel.postMessage({
                  type: 'OAUTH_ERROR',
                  error: errorMessage,
                  details: errorDetails
                });
                console.log('📡 OAuth error sent via BroadcastChannel');
                setTimeout(() => channel.close(), 100); // Delay close to ensure message is sent
                errorSent = true;
              } catch (e) {
                console.error('❌ BroadcastChannel error failed:', e);
              }
              
              if (!errorSent) {
                console.error('❌ All error communication methods failed!');
              }
              
              if (inPopupMode) window.close();
              return;
            }
            
            console.log('✅ OAuth State Validation Passed');
            
            // Update flow state to token exchange
            updateOAuthFlowStatus(flowState.flowId, 'token_exchange');

            // 토큰 교환 with state parameter for new state manager
            console.log('💱 Starting token exchange for code:', code.substring(0, 8) + '...');
            const tokenResponse = await exchangeCodeForToken(code, state || undefined);
            console.log('✅ Token exchange successful:', {
              hasAccessToken: !!tokenResponse.access_token,
              hasRefreshToken: !!tokenResponse.refresh_token,
              tokenType: tokenResponse.token_type,
              isSSORrefreshCallback: isSSORrefreshCallback
            });
            
            // ENHANCED: Handle SSO token refresh callback in popup mode
            if (isSSORrefreshCallback) {
              console.log('✅ Processing successful SSO token refresh in popup mode...');
              
              // 🔒 CRITICAL FIX: Store tokens FIRST in popup mode too
              console.log('💾 Storing refreshed tokens before metadata update (popup mode)...');
              const { refreshTokenService } = await import('../services/refreshTokenService');
              await refreshTokenService.storeTokens(tokenResponse);
              console.log('✅ Refreshed tokens stored successfully (popup mode)');
              
              // Update SSO session metadata to reflect refreshed tokens
              localStorage.setItem('auth_method', 'sso_sync');
              localStorage.setItem('has_refresh_token', String(!!tokenResponse.refresh_token));
              localStorage.setItem('max_platform_session', 'true');
              localStorage.setItem('token_renewable_via_sso', 'true');
              localStorage.setItem('sync_time', String(Date.now()));
              
              // 🔒 CRITICAL: Set flag to prevent immediate re-refresh attempts
              localStorage.setItem('lastTokenRefresh', Date.now().toString());
              
              console.log('✅ SSO session metadata updated after successful token refresh (popup mode)');
            }
            
            // 성공 표시
            hasProcessedRef.current = true;
            
            // Update flow state to completed
            updateOAuthFlowStatus(flowState.flowId, 'completed');
            
            // 🔧 LEGACY COMPATIBILITY: Clean up sessionStorage for backward compatibility
            sessionStorage.removeItem('oauth_popup_mode');
            sessionStorage.removeItem('oauth_window_type');
            sessionStorage.removeItem('oauth_parent_origin');
            sessionStorage.removeItem('oauth_force_account_selection');
            sessionStorage.removeItem('silent_oauth_state');
            sessionStorage.removeItem('silent_oauth_code_verifier');
            sessionStorage.removeItem('oauth_nonce'); // OIDC nonce 정리
            sessionStorage.removeItem('oauth_flow_in_progress');
            sessionStorage.removeItem('oauth_callback_processing');
            
            // 🔒 CRITICAL FIX: Clean up any pending silent auth cleanup flags
            sessionStorage.removeItem('silent_auth_cleanup_pending');
            
            const messagePayload = {
              type: 'OAUTH_SUCCESS',
              token: tokenResponse.access_token,
              tokenData: tokenResponse
            };
            
            console.log('📤 Preparing to send OAUTH_SUCCESS message...');
            console.log('Window opener exists:', !!window.opener);
            console.log('Window parent exists:', !!window.parent);
            console.log('Window top exists:', !!window.top);
            console.log('Target origin:', window.location.origin);
            console.log('Message payload:', messagePayload);
            
            // 🔧 ENHANCED: Store result in SessionStorage FIRST for immediate availability
            try {
              const resultData = {
                success: true,
                tokenData: tokenResponse,
                timestamp: Date.now()
              };
              
              // Store in multiple keys for better detection
              sessionStorage.setItem('oauth_result', JSON.stringify(resultData));
              sessionStorage.setItem('oauth_success', JSON.stringify(resultData));
              sessionStorage.setItem('oauth_token_data', JSON.stringify(resultData));
              sessionStorage.setItem('oauth_access_token', tokenResponse.access_token);
              sessionStorage.setItem('oauth_completion_timestamp', Date.now().toString());
              
              // 🔧 CRITICAL: Also store force account selection status if applicable
              const wasForcedAccountSelection = sessionStorage.getItem('oauth_force_account_selection') === 'true';
              if (wasForcedAccountSelection) {
                sessionStorage.setItem('oauth_different_user_success', 'true');
                console.log('✅ Different user login success flag set');
              }
              
              console.log('✅ OAuth result pre-stored in sessionStorage for immediate detection');
            } catch (e) {
              console.error('Failed to pre-store OAuth result:', e);
            }
            
            let messageSent = false;
            
            // Method 1: PostMessage to opener (secure targeted attempts)
            if (window.opener && window.opener !== window) {
              const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
              
              // 🔒 SECURE: Only try specific known origins, not wildcard
              const trustedOrigins = [
                window.location.origin,  // Same origin (max.dwchem.co.kr)
                new URL(authUrl).origin,  // OAuth server origin
                'https://maxlab.dwchem.co.kr', // 🔧 FIX: Explicitly add MaxLab origin for SSO callbacks
                ...(document.referrer ? [new URL(document.referrer).origin] : []), // Referrer if available
              ];
              
              // Remove duplicates
              const uniqueOrigins = [...new Set(trustedOrigins)];
              
              for (const targetOrigin of uniqueOrigins) {
                try {
                  window.opener.postMessage(messagePayload, targetOrigin);
                  console.log(`✅ PostMessage sent to window.opener with origin: ${targetOrigin}`);
                  messageSent = true;
                  break; // Success, stop trying
                } catch (e) {
                  console.warn(`⚠️ PostMessage failed with origin ${targetOrigin}:`, e);
                }
              }
              
              // Final attempt with wildcard only if all secure attempts failed
              if (!messageSent) {
                try {
                  window.opener.postMessage(messagePayload, '*');
                  console.log('✅ PostMessage sent to window.opener with wildcard (fallback)');
                  messageSent = true;
                } catch (e) {
                  console.error('❌ All PostMessage attempts to opener failed:', e);
                }
              }
            }
            
            // Method 2: PostMessage to parent (if different from opener)
            if (window.parent && window.parent !== window && window.parent !== window.opener) {
              try {
                // 🔒 SECURITY FIX: Use wildcard for same-origin communication
                window.parent.postMessage(messagePayload, '*');
                console.log('✅ PostMessage sent to window.parent with wildcard origin');
                messageSent = true;
              } catch (e) {
                console.error('❌ Failed to send PostMessage to parent:', e);
              }
            }
            
            // Method 3: Enhanced BroadcastChannel fallback with retry mechanism
            let broadcastChannel: BroadcastChannel | null = null;
            try {
              broadcastChannel = new BroadcastChannel('oauth_channel');
              
              // Send message multiple times to ensure delivery
              const broadcastRetries = 3;
              for (let i = 0; i < broadcastRetries; i++) {
                try {
                  broadcastChannel.postMessage(messagePayload);
                  console.log(`✅ BroadcastChannel message sent (attempt ${i + 1}/${broadcastRetries})`);
                } catch (e) {
                  console.warn(`⚠️ BroadcastChannel send failed (attempt ${i + 1}):`, e);
                }
                // Small delay between retries
                if (i < broadcastRetries - 1) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              }
              
              // Set up listener for acknowledgment before sending
              if (inPopupMode) {
                broadcastChannel.onmessage = (event) => {
                  if (event.data && event.data.type === 'OAUTH_ACK') {
                    console.log('✅ Received BroadcastChannel acknowledgment, closing popup');
                    
                    // Clear the fallback timeout
                    if ((window as any).__oauthFallbackTimeout) {
                      clearTimeout((window as any).__oauthFallbackTimeout);
                      delete (window as any).__oauthFallbackTimeout;
                    }
                    
                    broadcastChannel?.close();
                    
                    // Show success and close
                    try {
                      document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:system-ui;"><h3 style="color:#10b981;">✅ 로그인 완료!</h3><p style="color:#6b7280;">이 창은 자동으로 닫힙니다...</p></div>';
                    } catch (e) {
                      console.log('Could not update content:', e);
                    }
                    
                    setTimeout(() => {
                      window.close();
                      self.close();
                    }, 100);
                  }
                };
              }
              
              broadcastChannel.postMessage(messagePayload);
              console.log('📡 Sent message via BroadcastChannel');
              messageSent = true;
              
              // Don't close immediately if in popup mode, wait for acknowledgment
              if (!inPopupMode) {
                broadcastChannel.close();
              }
            } catch (e) {
              console.error('❌ BroadcastChannel failed:', e);
              broadcastChannel?.close();
            }
            
            // Method 4: Enhanced SessionStorage fallback with multiple keys
            try {
              const resultData = {
                success: true,
                tokenData: tokenResponse,
                timestamp: Date.now()
              };
              
              // Store in multiple keys to increase chance of detection
              const storageKeys = ['oauth_result', 'oauth_success', 'oauth_token_data'];
              
              for (const key of storageKeys) {
                try {
                  sessionStorage.setItem(key, JSON.stringify(resultData));
                  console.log(`💾 Stored OAuth result in sessionStorage key: ${key}`);
                } catch (e) {
                  console.warn(`⚠️ Failed to store in sessionStorage key ${key}:`, e);
                }
              }
              
              // Also store individual token for easier access
              try {
                sessionStorage.setItem('oauth_access_token', tokenResponse.access_token);
                sessionStorage.setItem('oauth_completion_timestamp', Date.now().toString());
                console.log('💾 Stored individual OAuth token data');
              } catch (e) {
                console.warn('⚠️ Failed to store individual token data:', e);
              }
              
              messageSent = true;
            } catch (e) {
              console.error('❌ Enhanced SessionStorage fallback failed:', e);
            }
            
            if (!messageSent) {
              console.error('❌ All communication methods failed!');
            }
            
            if (inPopupMode) {
              console.log('🚪 Waiting for parent acknowledgment before closing popup...');
              
              // Set up acknowledgment listener
              const acknowledgmentHandler = (event: MessageEvent) => {
                console.log('📨 Popup received message:', event.data);
                
                // Check for acknowledgment from parent
                if (event.data && event.data.type === 'OAUTH_ACK') {
                  console.log('✅ Received acknowledgment from parent, closing popup now');
                  
                  // Clean up listener and fallback timeout
                  window.removeEventListener('message', acknowledgmentHandler);
                  
                  // Clear the fallback timeout
                  if ((window as any).__oauthFallbackTimeout) {
                    clearTimeout((window as any).__oauthFallbackTimeout);
                    delete (window as any).__oauthFallbackTimeout;
                  }
                  
                  // Clean up session storage poller
                  if ((window as any).__oauthSessionPoller) {
                    clearInterval((window as any).__oauthSessionPoller);
                    delete (window as any).__oauthSessionPoller;
                  }
                  
                  // Clean up any open BroadcastChannel
                  if (broadcastChannel) {
                    try {
                      broadcastChannel.close();
                    } catch (e) {
                      console.log('Could not close BroadcastChannel:', e);
                    }
                  }
                  
                  // Show success message before closing
                  try {
                    document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:system-ui;"><h3 style="color:#10b981;">✅ 로그인 완료!</h3><p style="color:#6b7280;">이 창은 자동으로 닫힙니다...</p></div>';
                  } catch (e) {
                    console.log('Could not update popup content:', e);
                  }
                  
                  // Attempt to close with multiple methods
                  setTimeout(() => {
                    window.close();
                    self.close();
                    
                    // If still not closed, try focusing parent
                    if (!window.closed && window.opener && !window.opener.closed) {
                      try {
                        window.opener.focus();
                        window.close();
                      } catch (e) {
                        console.log('Final close attempt failed:', e);
                      }
                    }
                  }, 100);
                }
              };
              
              window.addEventListener('message', acknowledgmentHandler);
              
              // Also poll sessionStorage for acknowledgment with multiple keys
              const sessionStoragePoller = setInterval(() => {
                const ackKeys = ['oauth_ack', 'oauth_acknowledged'];
                let ackReceived = false;
                
                for (const key of ackKeys) {
                  const ack = sessionStorage.getItem(key);
                  if (ack === 'true' || ack) {
                    console.log(`✅ Received acknowledgment via sessionStorage key: ${key}, closing popup`);
                    ackReceived = true;
                    
                    // Clean up acknowledgment keys
                    ackKeys.forEach(k => sessionStorage.removeItem(k));
                    break;
                  }
                }
                
                if (ackReceived) {
                  // Clean up
                  clearInterval(sessionStoragePoller);
                  window.removeEventListener('message', acknowledgmentHandler);
                  
                  // Clear the fallback timeout
                  if ((window as any).__oauthFallbackTimeout) {
                    clearTimeout((window as any).__oauthFallbackTimeout);
                    delete (window as any).__oauthFallbackTimeout;
                  }
                  
                  // Show success and close
                  try {
                    document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:system-ui;"><h3 style="color:#10b981;">✅ 로그인 완료!</h3><p style="color:#6b7280;">이 창은 자동으로 닫힙니다...</p></div>';
                  } catch (e) {
                    console.log('Could not update content:', e);
                  }
                  
                  setTimeout(() => {
                    window.close();
                    self.close();
                  }, 100);
                }
              }, 100);
              
              // Store the poller for cleanup
              (window as any).__oauthSessionPoller = sessionStoragePoller;
              
              // 🔧 ENHANCED: Shorter fallback timeout (2 seconds) for better UX
              const fallbackTimeout = setTimeout(() => {
                window.removeEventListener('message', acknowledgmentHandler);
                
                // Clean up session storage poller
                if ((window as any).__oauthSessionPoller) {
                  clearInterval((window as any).__oauthSessionPoller);
                  delete (window as any).__oauthSessionPoller;
                }
                
                if (!window.closed) {
                  console.log('⚠️ No acknowledgment received from parent after 2 seconds, attempting auto-close');
                  
                  // Clean up any open BroadcastChannel
                  if (broadcastChannel) {
                    try {
                      broadcastChannel.close();
                    } catch (e) {
                      console.log('Could not close BroadcastChannel:', e);
                    }
                  }
                  
                  // 🔧 ENHANCED: More aggressive close attempts
                  const closeAttempts = [
                    () => window.close(),
                    () => self.close(),
                    () => {
                      if (window.opener && !window.opener.closed) {
                        window.opener.focus();
                        window.close();
                      }
                    },
                    () => window.open('', '_self', '')?.close()
                  ];
                  
                  // Try all close methods
                  closeAttempts.forEach((attempt, index) => {
                    setTimeout(() => {
                      if (!window.closed) {
                        console.log(`🚪 Close attempt ${index + 1}...`);
                        try {
                          attempt();
                        } catch (e) {
                          console.log(`Close attempt ${index + 1} failed:`, e);
                        }
                      }
                    }, index * 100);
                  });
                  
                  // If still open after all attempts, show manual close instruction
                  setTimeout(() => {
                    if (!window.closed) {
                      try {
                        document.body.innerHTML = `
                          <div style="text-align:center;padding:50px;font-family:system-ui;">
                            <h3 style="color:#10b981;margin-bottom:16px;">✅ 로그인이 성공적으로 완료되었습니다!</h3>
                            <p style="color:#6b7280;margin-bottom:24px;">이 창을 닫고 원래 페이지로 돌아가주세요.</p>
                            <button onclick="window.close()" style="
                              background-color:#3b82f6;
                              color:white;
                              padding:12px 24px;
                              border:none;
                              border-radius:8px;
                              font-size:16px;
                              cursor:pointer;
                              font-weight:500;
                            ">창 닫기</button>
                          </div>
                        `;
                      } catch (e) {
                        console.error('Could not update popup content:', e);
                      }
                    }
                  }, 500);
                }
              }, 2000); // 🔧 REDUCED: From 5 seconds to 2 seconds
              
              // Store timeout ID for potential cleanup
              (window as any).__oauthFallbackTimeout = fallbackTimeout;
            }
            
          } catch (error: any) {
            console.error('OAuth token exchange error:', error);
            
            // 특정 에러에 대한 처리
            let errorMessage = error.message || 'Token exchange failed';
            if (error.message?.includes('Invalid or expired authorization code')) {
              errorMessage = 'Authorization code has already been used. Please try logging in again.';
            } else if (error.message?.includes('Bad Request')) {
              errorMessage = 'Authentication request failed. Please try again.';
            }
            
            window.opener?.postMessage({
              type: 'OAUTH_ERROR',
              error: errorMessage
            }, window.location.origin);
            if (inPopupMode) window.close();
          }
        } else {
          // 일반 모드 (direct navigation to callback URL)
          try {
            const tokenResponse = await exchangeCodeForToken(code, state || undefined);
            
            console.log('✅ Token exchange successful in non-popup mode:', {
              hasAccessToken: !!tokenResponse.access_token,
              hasRefreshToken: !!tokenResponse.refresh_token,
              tokenType: tokenResponse.token_type,
              isSSORrefreshCallback: isSSORrefreshCallback
            });
            
            // 성공 표시
            hasProcessedRef.current = true;
            
            // ENHANCED: Handle SSO token refresh callback in non-popup mode
            if (isSSORrefreshCallback) {
              console.log('✅ Processing successful SSO token refresh in non-popup mode...');
              
              // Record successful SSO refresh in circuit breaker
              SsoRefreshCircuitBreaker.recordSuccess();
              
              // 🔒 CRITICAL FIX: Store tokens FIRST before trying to update auth store
              console.log('💾 Storing refreshed tokens before auth store update...');
              const { refreshTokenService } = await import('../services/refreshTokenService');
              await refreshTokenService.storeTokens(tokenResponse);
              console.log('✅ Refreshed tokens stored successfully');
              
              // Update SSO session metadata to reflect refreshed tokens
              localStorage.setItem('auth_method', 'sso_sync');
              localStorage.setItem('has_refresh_token', String(!!tokenResponse.refresh_token));
              localStorage.setItem('max_platform_session', 'true');
              localStorage.setItem('token_renewable_via_sso', 'true');
              localStorage.setItem('sync_time', String(Date.now()));
              
              console.log('✅ SSO session metadata updated after successful token refresh');
              
              // Now update auth store with the stored tokens
              try {
                const { useAuthStore } = await import('../stores/authStore');
                const { setAuth, setUser } = useAuthStore.getState();
                
                // Get user info with the newly stored token
                const { authService } = await import('../services/authService');
                const userInfo = await authService.getCurrentUser();
                
                setAuth(tokenResponse.access_token, userInfo);
                setUser(userInfo);
                
                console.log('✅ Auth store updated after SSO token refresh with stored tokens');
              } catch (authUpdateError) {
                console.error('❌ Failed to update auth store after SSO token refresh:', authUpdateError);
                
                // Even if auth store update fails, continue with redirect to prevent loops
                console.log('⚠️ Continuing with redirect despite auth store update failure');
              }
              
              // 🔒 CRITICAL: Try multiple sources for return URL to prevent infinite loops
              let returnUrl = sessionStorage.getItem('sso_refresh_return_url');
              
              // Fallback to localStorage if sessionStorage was cleared
              if (!returnUrl) {
                try {
                  const returnData = localStorage.getItem('sso_refresh_return_data');
                  if (returnData) {
                    const parsed = JSON.parse(returnData);
                    // Only use if recent (within 5 minutes)
                    if (parsed.timestamp && (Date.now() - parsed.timestamp) < 5 * 60 * 1000) {
                      returnUrl = parsed.url;
                      console.log('📍 Retrieved return URL from localStorage fallback:', returnUrl);
                    }
                    // Clean up after use
                    localStorage.removeItem('sso_refresh_return_data');
                  }
                } catch (e) {
                  console.warn('Failed to parse return data from localStorage:', e);
                }
              }
              
              // Final fallback to dashboard to prevent staying on callback page
              if (!returnUrl) {
                returnUrl = '/';
                console.log('⚠️ No stored return URL found, defaulting to dashboard');
              }
              
              console.log('🔄 Redirecting back after SSO token refresh to:', returnUrl);
              
              // Clean up storage
              sessionStorage.removeItem('sso_refresh_return_url');
              localStorage.removeItem('sso_refresh_return_data');
              
              // 🔒 CRITICAL: Set a flag to prevent immediate re-refresh attempts
              localStorage.setItem('lastTokenRefresh', Date.now().toString());
              
              // Redirect to original location or dashboard
              window.location.replace(returnUrl);
              return;
            }
            
            // Check if this was a "different user login" attempt
            const wasForcedAccountSelection = sessionStorage.getItem('oauth_force_account_selection') === 'true';
            if (wasForcedAccountSelection) {
              console.log('🔄 Different user login detected, clearing previous user data...');
              
              // 🔧 CRITICAL FIX: Clear previous auth data but preserve popup communication keys
              localStorage.removeItem('user');
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('tokenExpiryTime');
              localStorage.removeItem('tokenCreatedAt');
              localStorage.removeItem('tokenType');
              localStorage.removeItem('expiresIn');
              localStorage.removeItem('scope');
              
              // Selective sessionStorage cleanup - preserve popup communication and OAuth flow
              const preserveKeys = [
                'oauth_popup_mode', 'oauth_window_type', 'oauth_parent_origin', // Popup detection
                'oauth_result', 'oauth_error', // Communication channels
                'oauth_state', 'oauth_code_verifier', 'oauth_nonce', // Current OAuth flow
                'oauth_force_account_selection', // Force account selection flag
                'theme', 'language', 'preferences' // User preferences
              ];
              
              // Remove all sessionStorage except preserved keys
              const sessionKeys = Object.keys(sessionStorage);
              sessionKeys.forEach(key => {
                if (!preserveKeys.includes(key)) {
                  sessionStorage.removeItem(key);
                }
              });
              
              console.log('✅ Previous user data cleared for account switching (popup communication preserved)');
            }
            
            // RefreshTokenService를 사용하여 토큰 저장 (refresh token 포함)
            const { refreshTokenService } = await import('../services/refreshTokenService');
            await refreshTokenService.storeTokens(tokenResponse);
            
            // 사용자 정보 가져오기 (authService 사용)  
            const { authService } = await import('../services/authService');
            const userInfo = await authService.getCurrentUser();
            
            console.log(`👤 New user authenticated: ${userInfo.username} (${userInfo.email})`);
            
            // Update auth store with new user (force update for account switching)
            if (wasForcedAccountSelection) {
              const { useAuthStore } = await import('../stores/authStore');
              const { setAuth } = useAuthStore.getState();
              const newToken = localStorage.getItem('accessToken') || '';
              setAuth(newToken, userInfo);
              console.log('🔄 Auth store updated with new user for account switching');
            }
            
            // Clear the forced account selection flag
            sessionStorage.removeItem('oauth_force_account_selection');
            
            // 세션 정리
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('oauth_code_verifier');
            sessionStorage.removeItem('oauth_nonce'); // OIDC nonce 정리
            sessionStorage.removeItem('oauth_popup_mode');
            
            // 🔒 CRITICAL FIX: Clean up any pending silent auth cleanup flags
            sessionStorage.removeItem('silent_auth_cleanup_pending');
            
            setState({
              status: 'success',
              message: 'Authentication successful! Redirecting...'
            });

            toast.success('Successfully logged in!');
            
            // 🔒 SECURITY: Immediate redirect to prevent auth loop
            // CRITICAL FIX: Clean up all stored URLs after successful auth
            const redirectTo = sessionStorage.getItem('oauthRedirectTo') || 
                             sessionStorage.getItem('original_navigation_url') || 
                             localStorage.getItem('pre_auth_url') || 
                             '/';
            
            // Clean up all auth-related storage
            sessionStorage.removeItem('oauthRedirectTo');
            sessionStorage.removeItem('oauth_flow_in_progress');
            sessionStorage.removeItem('oauth_callback_processing');
            sessionStorage.removeItem('original_navigation_url');
            sessionStorage.removeItem('sso_refresh_return_url');
            sessionStorage.removeItem('last_sso_attempt');
            sessionStorage.removeItem('last_sso_failure');
            localStorage.removeItem('pre_auth_url');
            localStorage.removeItem('sso_refresh_return_data');
            document.body.removeAttribute('data-oauth-processing');
            
            console.log('✅ Authentication successful, redirecting to:', redirectTo);
            
            // Force immediate redirect using window.location for security
            window.location.replace(redirectTo);
            
          } catch (error: any) {
            throw error;
          }
        }

      } catch (error: any) {
        console.error('OAuth callback error:', error);
        
        // 에러 처리 완료 표시
        hasProcessedRef.current = true;
        
        // 특정 에러에 대한 메시지 개선
        let errorMessage = error.message || 'Authentication failed';
        if (error.message?.includes('Invalid or expired authorization code')) {
          errorMessage = 'This login session has expired. Please try logging in again.';
        } else if (error.message?.includes('Bad Request')) {
          errorMessage = 'Authentication request failed. Please try again.';
        }
        
        if (isPopupMode()) {
          window.opener?.postMessage({
            type: 'OAUTH_ERROR',
            error: errorMessage
          }, window.location.origin);
          window.close();
        } else {
          setState({
            status: 'error',
            message: 'Authentication failed',
            error: errorMessage
          });

          toast.error(errorMessage);

          setTimeout(() => {
            navigate('/login', { replace: true });
          }, 5000);
        }
      } finally {
        isProcessingRef.current = false;
        // OAuth 플로우 상태 정리
        sessionStorage.removeItem('oauth_flow_in_progress');
        sessionStorage.removeItem('oauth_callback_processing');
        
        // 🔒 CRITICAL FIX: Always clean up pending silent auth cleanup flags
        sessionStorage.removeItem('silent_auth_cleanup_pending');
        
        // DOM에서 OAuth 처리 중 상태 제거
        document.body.removeAttribute('data-oauth-processing');
      }
    };

    handleOAuthCallback();
  }, [navigate, searchParams]);

  const renderIcon = () => {
    switch (state.status) {
      case 'loading':
        return (
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
        );
      case 'success':
        return (
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
        );
    }
  };

  // 팝업 모드일 때는 간단한 UI
  if (isPopupMode()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Processing Authentication...
          </h1>
          <p className="text-sm text-gray-600">
            Please wait while we complete your login.
          </p>
        </div>
      </div>
    );
  }

  // 일반 모드 UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-6">
            {renderIcon()}
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {state.status === 'loading' && 'Authenticating...'}
            {state.status === 'success' && 'Login Successful!'}
            {state.status === 'error' && 'Authentication Failed'}
          </h1>
          
          <p className="text-gray-600 mb-6">
            {state.message}
          </p>
          
          {state.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">
                <strong>Error:</strong> {state.error}
              </p>
            </div>
          )}

          {state.status === 'loading' && (
            <div className="text-sm text-gray-500">
              This may take a few moments...
            </div>
          )}

          {state.status === 'success' && (
            <div className="text-sm text-gray-500">
              Redirecting you to the application...
            </div>
          )}

          {state.status === 'error' && (
            <div className="space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Return to Login
              </button>
              <div className="text-sm text-gray-500">
                Redirecting automatically in 5 seconds...
              </div>
            </div>
          )}
        </div>

        {/* Copyright */}
        <div className="mt-8 text-center text-xs text-gray-500">
          © 2025 MAX Lab. All rights reserved.
        </div>
      </div>
    </div>
  );
};