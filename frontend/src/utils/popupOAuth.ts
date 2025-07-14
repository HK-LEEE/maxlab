/**
 * OAuth 2.0 Popup Authentication Utility
 * Implements Authorization Code Flow with PKCE for MAX Platform integration
 */

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface OAuthMessage {
  type: 'OAUTH_SUCCESS' | 'OAUTH_ERROR';
  token?: string;
  tokenData?: TokenResponse;
  error?: string;
}

export class PopupOAuthLogin {
  private popup: Window | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private messageReceived: boolean = false;
  private authInProgress: boolean = false;

  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly authUrl: string;
  private readonly scopes = ['read:profile', 'read:groups', 'manage:workflows'];

  constructor() {
    this.clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
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

  // OAuth 시작
  async startAuth(): Promise<TokenResponse> {
    // 이미 진행 중인 인증이 있는지 확인
    if (this.authInProgress) {
      throw new Error('OAuth authentication already in progress');
    }

    this.authInProgress = true;

    return new Promise(async (resolve, reject) => {
      try {
        // PKCE 파라미터 생성
        const state = this.generateCodeVerifier();
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);

        // 세션 스토리지에 저장
        sessionStorage.setItem('oauth_state', state);
        sessionStorage.setItem('oauth_code_verifier', codeVerifier);
        sessionStorage.setItem('oauth_popup_mode', 'true');

        // OAuth URL 생성
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
          scope: this.scopes.join(' '),
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        });

        const authUrl = `${this.authUrl}/api/oauth/authorize?${params}`;
        console.log('🔐 Opening OAuth popup:', authUrl);

        // 팝업 열기
        this.popup = window.open(
          authUrl,
          'oauth_login',
          'width=500,height=600,scrollbars=yes,resizable=yes,top=100,left=100'
        );

        if (!this.popup) {
          reject(new Error('Popup was blocked. Please allow popups and try again.'));
          return;
        }

        // PostMessage 이벤트 리스너
        this.messageHandler = (event: MessageEvent<OAuthMessage>) => {
          // Origin 검증
          const trustedOrigins = [
            window.location.origin,
            'http://localhost:3000'  // MAX Platform
          ];
          
          if (!trustedOrigins.includes(event.origin)) {
            console.warn('Ignoring message from untrusted origin:', event.origin);
            return;
          }

          console.log('📨 Received OAuth message:', event.data);
          this.messageReceived = true;

          if (event.data.type === 'OAUTH_SUCCESS') {
            if (this.checkInterval) {
              clearInterval(this.checkInterval);
              this.checkInterval = null;
            }
            
            this.cleanup();
            if (event.data.tokenData) {
              resolve(event.data.tokenData);
            } else if (event.data.token) {
              resolve({
                access_token: event.data.token,
                token_type: 'Bearer',
                expires_in: 3600,
                scope: this.scopes.join(' ')
              });
            } else {
              reject(new Error('No token data received'));
            }
          } else if (event.data.type === 'OAUTH_ERROR') {
            this.cleanup();
            reject(new Error(event.data.error || 'OAuth authentication failed'));
          }
        };

        window.addEventListener('message', this.messageHandler);

        // 팝업 닫힘 감지
        this.checkInterval = setInterval(() => {
          if (this.popup?.closed) {
            setTimeout(() => {
              if (!this.messageReceived) {
                console.log('🚪 Popup closed without receiving message - user cancelled');
                this.cleanup();
                reject(new Error('Authentication was cancelled by the user'));
              }
            }, 100);
          }
        }, 500);

      } catch (error) {
        this.cleanup();
        reject(error);
      }
    });
  }

  // 정리
  private cleanup(): void {
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

    this.popup = null;
    this.messageReceived = false;
    this.authInProgress = false;
    
    sessionStorage.removeItem('oauth_popup_mode');
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_code_verifier');
  }

  public forceCleanup(): void {
    this.cleanup();
  }
}

// 중복 토큰 교환 요청 방지를 위한 전역 상태
const tokenExchangeInProgress = new Map<string, Promise<TokenResponse>>();

// 토큰 교환
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  // 동일한 코드로 이미 진행 중인 요청이 있는지 확인
  if (tokenExchangeInProgress.has(code)) {
    console.log('🔄 Token exchange already in progress for this code, waiting...');
    return tokenExchangeInProgress.get(code)!;
  }

  const codeVerifier = sessionStorage.getItem('oauth_code_verifier') || 
                      sessionStorage.getItem('silent_oauth_code_verifier');
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  
  if (!codeVerifier) {
    throw new Error('No code verifier found in session storage');
  }

  console.log('🔐 Starting token exchange with code:', code.substring(0, 8) + '...');

  // 토큰 교환 Promise 생성 및 저장
  const tokenExchangePromise = (async (): Promise<TokenResponse> => {
    try {
      const response = await fetch(`${authUrl}/api/oauth/token`, {
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
        
        // 특정 에러에 대한 추가 정보
        if (response.status === 400 && errorData.error === 'invalid_grant') {
          throw new Error('Invalid or expired authorization code');
        }
        
        throw new Error(errorMessage);
      }

      console.log('✅ Token exchange successful');
      const tokenResponse = await response.json() as TokenResponse;
      
      // 성공 후 코드 verifier 즉시 정리
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('silent_oauth_code_verifier');
      
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

// 팝업 모드 확인
export function isPopupMode(): boolean {
  return sessionStorage.getItem('oauth_popup_mode') === 'true' || 
         window.opener !== null;
}

// 사용자 정보 가져오기
export async function getUserInfo(accessToken: string): Promise<any> {
  const authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  
  const response = await fetch(`${authUrl}/api/oauth/userinfo`, {
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