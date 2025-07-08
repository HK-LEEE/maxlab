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
  private readonly scopes = ['read:profile', 'read:groups', 'manage:workflows'];
  private readonly timeout = 5000; // 5초 타임아웃

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

  async attemptSilentAuth(): Promise<SilentAuthResult> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    
    return new Promise((resolve) => {
      try {
        console.log('🔇 Starting silent authentication...');

        // PKCE 파라미터 생성
        const state = generateState();

        // 세션 스토리지에 저장
        sessionStorage.setItem('silent_oauth_state', state);
        sessionStorage.setItem('silent_oauth_code_verifier', codeVerifier);

        // Silent OAuth URL 생성 (prompt=none이 핵심)
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
          scope: this.scopes.join(' '),
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          prompt: 'none' // 🔑 사용자 상호작용 없이 인증 시도
        });

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
            'http://localhost:3000'  // MAX Platform
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
  if (window.location.pathname === '/login' || window.location.pathname === '/oauth/callback') {
    return { success: false, error: 'Cannot attempt silent auth on current page' };
  }

  const silentAuth = new SilentAuth();
  try {
    return await silentAuth.attemptSilentAuth();
  } finally {
    silentAuth.forceCleanup();
  }
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