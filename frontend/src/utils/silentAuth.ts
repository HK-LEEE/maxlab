/**
 * Silent Authentication Utility for SSO Auto-Login
 * Uses iframe-based authentication with prompt=none
 */

import { generateState } from './popupOAuth';

interface SilentAuthResult {
  success: boolean;
  token?: string;
  tokenData?: {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    refresh_token?: string;
    refresh_expires_in?: number;
  };
  error?: string;
}

export class SilentAuth {
  private iframe: HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  private readonly clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
  private readonly redirectUri: string;
  private readonly authUrl: string;
  private readonly scopes = ['openid', 'profile', 'email', 'read:profile', 'read:groups', 'manage:workflows'];
  private readonly timeout = 10000; // 10초 타임아웃 (UX 개선)

  constructor() {
    this.redirectUri = import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/oauth/callback`;
    this.authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
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

  // Generate nonce for OIDC
  private generateNonce(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async attemptSilentAuth(maxAge?: number): Promise<SilentAuthResult> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const nonce = this.generateNonce(); // OIDC nonce
    
    return new Promise((resolve) => {
      try {
        console.log('🔇 Starting silent authentication...');

        // PKCE 파라미터 생성
        const state = generateState();

        // 세션 스토리지에 저장
        sessionStorage.setItem('silent_oauth_state', state);
        sessionStorage.setItem('silent_oauth_code_verifier', codeVerifier);
        sessionStorage.setItem('silent_oauth_nonce', nonce); // OIDC nonce

        // Silent OAuth URL 생성 (prompt=none이 핵심)
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
          scope: this.scopes.join(' '),
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          prompt: 'none', // 🔑 사용자 상호작용 없이 인증 시도
          nonce: nonce // OIDC nonce 추가
        });

        // Add max_age if specified
        if (maxAge !== undefined) {
          params.append('max_age', maxAge.toString());
          sessionStorage.setItem('oauth_max_age', maxAge.toString());
        }

        const silentAuthUrl = `${this.authUrl}/api/oauth/authorize?${params}`;

        // 숨겨진 iframe 생성
        this.iframe = document.createElement('iframe');
        this.iframe.style.display = 'none';
        this.iframe.style.position = 'absolute';
        this.iframe.style.top = '-1000px';
        this.iframe.style.left = '-1000px';
        this.iframe.style.width = '1px';
        this.iframe.style.height = '1px';

        // PostMessage 이벤트 리스너 설정
        this.messageHandler = (event: MessageEvent) => {
          // 보안: origin 검증
          const trustedOrigins = [
            window.location.origin,
            this.authUrl  // OAuth 서버 URL (환경 변수에서 가져옴)
          ];
          
          if (!trustedOrigins.includes(event.origin)) {
            return;
          }

          if (event.data.type === 'OAUTH_SUCCESS') {
            this.cleanup();
            resolve({
              success: true,
              token: event.data.token,
              tokenData: event.data.tokenData
            });
          } else if (event.data.type === 'OAUTH_ERROR') {
            this.cleanup();
            resolve({
              success: false,
              error: event.data.error === 'login_required' ? 'login_required' : event.data.error
            });
          }
        };

        window.addEventListener('message', this.messageHandler);

        // 타임아웃 설정
        this.timeoutId = setTimeout(() => {
          console.log('🔇 Silent auth timeout');
          this.cleanup();
          resolve({
            success: false,
            error: 'silent_auth_timeout'
          });
        }, this.timeout);

        // iframe 로드
        document.body.appendChild(this.iframe);
        this.iframe.src = silentAuthUrl;

      } catch (error) {
        this.cleanup();
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Silent authentication setup failed'
        });
      }
    });
  }

  private cleanup(): void {
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    // 세션 스토리지 정리
    sessionStorage.removeItem('silent_oauth_state');
    sessionStorage.removeItem('silent_oauth_code_verifier');
    sessionStorage.removeItem('silent_oauth_nonce');
    sessionStorage.removeItem('oauth_max_age');

    this.iframe = null;
    this.messageHandler = null;
    this.timeoutId = null;
  }

  public forceCleanup(): void {
    this.cleanup();
  }
}

// 편의 함수
export async function attemptSilentLogin(): Promise<SilentAuthResult> {
  // 🔒 CRITICAL: Check if user has logged out recently
  const hasLoggedOut = localStorage.getItem('hasLoggedOut');
  const preventSilentAuth = sessionStorage.getItem('preventSilentAuth');
  const logoutTimestamp = localStorage.getItem('logoutTimestamp');
  
  if (hasLoggedOut === 'true' || preventSilentAuth === 'true') {
    console.log('🚫 Silent auth blocked - user has logged out recently');
    
    // Auto-clear the flag after 5 minutes for user convenience
    if (logoutTimestamp) {
      const timeSinceLogout = Date.now() - parseInt(logoutTimestamp);
      const fiveMinutes = 5 * 60 * 1000;
      
      if (timeSinceLogout > fiveMinutes) {
        console.log('🔓 Auto-clearing logout flags after 5 minutes');
        localStorage.removeItem('hasLoggedOut');
        localStorage.removeItem('logoutTimestamp');
        sessionStorage.removeItem('preventSilentAuth');
      } else {
        return { success: false, error: 'Silent auth blocked after logout' };
      }
    } else {
      return { success: false, error: 'Silent auth blocked after logout' };
    }
  }

  // 더 엄격한 페이지 검증
  if (!isSafePageForTokenRefresh()) {
    const currentPath = window.location.pathname;
    console.log('🚫 Silent auth not allowed on current page:', currentPath);
    return { success: false, error: 'Cannot attempt silent auth on current page' };
  }

  // Silent auth 지원 여부 확인
  if (!isSilentAuthSupported()) {
    console.log('🚫 Silent auth not supported in current environment');
    return { success: false, error: 'Silent authentication not supported' };
  }

  // 기존 silent auth 진행 중인지 확인
  if (sessionStorage.getItem('silent_oauth_state')) {
    console.log('🚫 Silent auth already in progress');
    return { success: false, error: 'Silent authentication already in progress' };
  }

  // OAuth 콜백 처리 중인지 추가 확인
  if (document.body.hasAttribute('data-oauth-processing')) {
    console.log('🚫 OAuth callback processing in progress, cannot start silent auth');
    return { success: false, error: 'OAuth callback in progress' };
  }

  // 팝업 OAuth 진행 중인지 확인
  if (sessionStorage.getItem('oauth_popup_mode') === 'true') {
    console.log('🚫 Popup OAuth in progress, cannot start silent auth');
    return { success: false, error: 'Popup OAuth in progress' };
  }

  console.log('✅ Silent auth conditions met, starting...');
  const silentAuth = new SilentAuth();
  try {
    // You can pass maxAge parameter to enforce fresh authentication
    // e.g., maxAge: 300 = require auth within last 5 minutes
    return await silentAuth.attemptSilentAuth();
  } finally {
    silentAuth.forceCleanup();
  }
}

// 토큰 갱신이 안전한 페이지인지 확인
export function isSafePageForTokenRefresh(): boolean {
  const currentPath = window.location.pathname;
  const currentHash = window.location.hash;
  
  // OAuth 관련 페이지들은 토큰 갱신 불허
  const unsafePaths = [
    '/login',
    '/logout', 
    '/oauth/callback',
    '/oauth/authorize',
    '/signup',
    '/register'
  ];
  
  // OAuth 콜백 처리 중인지 확인 (URL 파라미터 기준)
  const urlParams = new URLSearchParams(window.location.search);
  const isOAuthCallback = urlParams.has('code') && urlParams.has('state');
  
  // 해시에 OAuth 정보가 있는지 확인 (implicit flow)
  const isImplicitOAuth = currentHash.includes('access_token') || currentHash.includes('code');
  
  // OAuth 처리 진행 중인지 확인 (더 엄격한 검증)
  const isOAuthInProgress = Boolean(
    sessionStorage.getItem('oauth_state') || 
    sessionStorage.getItem('silent_oauth_state') ||
    sessionStorage.getItem('oauth_code_verifier') ||
    sessionStorage.getItem('oauth_flow_in_progress') ||
    window.location.search.includes('oauth_callback_processing')
  );

  // 🔒 SECURITY: Check if OAuth callback was recently completed
  const isRecentOAuthComplete = Boolean(
    currentPath === '/oauth/callback' && 
    !isOAuthInProgress && 
    !isOAuthCallback && 
    !isImplicitOAuth &&
    localStorage.getItem('accessToken') // User is already authenticated
  );

  // 글로벌 OAuth 콜백 처리 상태 확인 (DOM 기반)
  const isOAuthCallbackProcessing = Boolean(
    document.querySelector('[data-oauth-processing="true"]') ||
    window.location.search.includes('code=') ||
    window.location.search.includes('state=')
  );

  // 최근 토큰 갱신 시간 확인 (너무 빈번한 갱신 방지)
  const lastTokenRefresh = localStorage.getItem('lastTokenRefresh');
  const recentRefreshThreshold = 30000; // 30초
  const now = Date.now();
  
  if (lastTokenRefresh && (now - parseInt(lastTokenRefresh)) < recentRefreshThreshold) {
    console.log('🚫 Token was refreshed recently, skipping to prevent excessive refresh attempts');
    return false;
  }
  
  // 🔒 SECURITY: Allow token refresh if OAuth was recently completed
  if (isRecentOAuthComplete) {
    console.log('✅ OAuth callback completed, allowing token refresh');
    return true;
  }

  // 현재 페이지가 안전하지 않거나 OAuth 처리 중이면 false
  if (unsafePaths.some(path => currentPath.startsWith(path))) {
    console.log('🚫 Unsafe path for token refresh:', currentPath);
    return false;
  }
  
  if (isOAuthCallback || isImplicitOAuth) {
    console.log('🚫 OAuth callback in progress, token refresh not safe');
    return false;
  }
  
  if (isOAuthInProgress) {
    console.log('🚫 OAuth flow in progress, token refresh not safe');
    return false;
  }

  if (isOAuthCallbackProcessing) {
    console.log('🚫 OAuth callback processing detected, token refresh not safe');
    return false;
  }
  
  return true;
}

// Silent auth 상태 체크
export function isSilentAuthSupported(): boolean {
  // iframe 및 postMessage 지원 확인
  return typeof window !== 'undefined' && 
         'postMessage' in window && 
         document.createElement('iframe') !== null;
}

// 디버깅 헬퍼
export function debugSilentAuth(): void {
  console.log('🔍 Silent Auth Debug Info:');
  console.log('- oauth_state:', sessionStorage.getItem('oauth_state'));
  console.log('- silent_oauth_state:', sessionStorage.getItem('silent_oauth_state'));
  console.log('- oauth_code_verifier:', sessionStorage.getItem('oauth_code_verifier'));
  console.log('- silent_oauth_code_verifier:', sessionStorage.getItem('silent_oauth_code_verifier'));
  console.log('- accessToken:', localStorage.getItem('accessToken'));
  console.log('- Current origin:', window.location.origin);
  console.log('- Silent auth supported:', isSilentAuthSupported());
}