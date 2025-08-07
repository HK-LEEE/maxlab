/**
 * OAuth Authorization Code Fix
 * Handles cases where OAuth server sends deprecated messages without authorization codes
 * This is a workaround for the issue where MAX Platform sends OAUTH_ALREADY_AUTHENTICATED
 * or OAUTH_LOGIN_SUCCESS_CONTINUE messages without proper authorization codes
 */

import { exchangeCodeForToken } from './popupOAuth';

interface OAuthFlowState {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  nonce: string;
  redirectUri: string;
}

/**
 * Force a proper OAuth authorization code flow when deprecated messages are received
 * This ensures we always get an authorization code even for already authenticated users
 */
export async function forceAuthorizationCodeFlow(
  oauthParams?: any,
  flowState?: OAuthFlowState
): Promise<void> {
  console.log('🔧 Forcing OAuth authorization code flow for already authenticated user');
  
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'https://max.dwchem.co.kr';
  const redirectUri = flowState?.redirectUri || `${window.location.origin}/oauth/callback`;
  const state = flowState?.state || generateRandomState();
  const codeChallenge = flowState?.codeChallenge || await generateCodeChallenge(flowState?.codeVerifier || generateCodeVerifier());
  const nonce = flowState?.nonce || generateNonce();
  
  // Build OAuth URL that will force the server to provide an authorization code
  const oauthUrl = new URL(`${authUrl}/api/oauth/authorize`);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'maxlab',
    redirect_uri: redirectUri,
    scope: oauthParams?.scope || 'openid profile email offline_access read:profile read:groups manage:workflows',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce: nonce,
    // Add a hint to the server that we need the authorization code
    prompt: 'none' // This tells the server to not show login/consent but still provide code
  });
  
  oauthUrl.search = params.toString();
  
  console.log('🚀 Redirecting to:', oauthUrl.toString());
  
  // Store flow state for callback to use
  sessionStorage.setItem('oauth_recovery_flow', JSON.stringify({
    state,
    codeVerifier: flowState?.codeVerifier || generateCodeVerifier(),
    timestamp: Date.now()
  }));
  
  // Redirect current window or popup to the OAuth URL
  window.location.href = oauthUrl.toString();
}

/**
 * Check if we need to recover from a deprecated OAuth message
 */
export function needsOAuthRecovery(messageType: string, oauthParams?: any): boolean {
  const deprecatedTypes = ['OAUTH_ALREADY_AUTHENTICATED', 'OAUTH_LOGIN_SUCCESS_CONTINUE'];
  const hasDeprecatedType = deprecatedTypes.includes(messageType);
  const missingAuthCode = !oauthParams?.code;
  
  return hasDeprecatedType && missingAuthCode;
}

/**
 * Handle OAuth recovery by initiating proper authorization code flow
 */
export async function handleOAuthRecovery(
  messageType: string,
  oauthParams?: any,
  popup?: Window | null
): Promise<void> {
  if (!needsOAuthRecovery(messageType, oauthParams)) {
    console.log('✅ OAuth recovery not needed');
    return;
  }
  
  console.warn('⚠️ OAuth recovery needed for deprecated message:', messageType);
  console.log('📋 Current params:', oauthParams);
  
  // Get current flow state if available
  const flowState = getStoredFlowState() || undefined;
  
  if (popup && !popup.closed) {
    // If we have a popup, redirect it to get the authorization code
    const authUrl = buildAuthorizationUrl(oauthParams, flowState);
    console.log('🔄 Redirecting popup to get authorization code');
    popup.location.href = authUrl;
  } else {
    // Otherwise force a new flow in the current window
    await forceAuthorizationCodeFlow(oauthParams, flowState);
  }
}

/**
 * Build authorization URL with proper parameters
 */
function buildAuthorizationUrl(oauthParams?: any, flowState?: any): string {
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'https://max.dwchem.co.kr';
  const redirectUri = `${window.location.origin}/oauth/callback`;
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'maxlab',
    redirect_uri: redirectUri,
    scope: oauthParams?.scope || 'openid profile email offline_access read:profile read:groups manage:workflows',
    state: flowState?.state || generateRandomState(),
    code_challenge: flowState?.codeChallenge || '',
    code_challenge_method: 'S256',
    nonce: flowState?.nonce || generateNonce(),
    prompt: 'none'
  });
  
  return `${authUrl}/api/oauth/authorize?${params.toString()}`;
}

/**
 * Get stored OAuth flow state from session storage
 */
function getStoredFlowState(): OAuthFlowState | null {
  try {
    // Check multiple possible storage keys
    const keys = [
      'oauth_flow_state',
      'oauth_state',
      'oauth_recovery_flow'
    ];
    
    for (const key of keys) {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.state || parsed.codeVerifier) {
          return {
            state: parsed.state || generateRandomState(),
            codeVerifier: parsed.codeVerifier || sessionStorage.getItem('oauth_code_verifier') || generateCodeVerifier(),
            codeChallenge: parsed.codeChallenge || '',
            nonce: parsed.nonce || sessionStorage.getItem('oauth_nonce') || generateNonce(),
            redirectUri: parsed.redirectUri || `${window.location.origin}/oauth/callback`
          };
        }
      }
    }
    
    // Fallback to individual session storage items
    const state = sessionStorage.getItem('oauth_state');
    const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
    const nonce = sessionStorage.getItem('oauth_nonce');
    
    if (state || codeVerifier) {
      return {
        state: state || generateRandomState(),
        codeVerifier: codeVerifier || generateCodeVerifier(),
        codeChallenge: '',
        nonce: nonce || generateNonce(),
        redirectUri: `${window.location.origin}/oauth/callback`
      };
    }
    
    return null;
  } catch (e) {
    console.error('Failed to get stored flow state:', e);
    return null;
  }
}

// Utility functions for OAuth parameters
function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(digest));
}

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

function base64URLEncode(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Inject authorization code into deprecated OAuth message
 * This is a temporary fix until the OAuth server is updated
 */
export async function injectAuthorizationCode(
  messageData: any,
  popup?: Window | null
): Promise<any> {
  if (!messageData.oauthParams || messageData.oauthParams.code) {
    // Already has code or no params to inject into
    return messageData;
  }
  
  console.log('💉 Attempting to inject authorization code into deprecated message');
  
  // Try to get authorization code from URL if we're on the callback page
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  
  if (code) {
    console.log('✅ Found authorization code in URL, injecting into message');
    return {
      ...messageData,
      oauthParams: {
        ...messageData.oauthParams,
        code: code,
        state: state || messageData.oauthParams.state
      }
    };
  }
  
  // If no code in URL, we need to trigger OAuth flow to get one
  console.warn('⚠️ No authorization code available, need to trigger OAuth flow');
  
  // Return null to indicate we need to get authorization code
  return null;
}