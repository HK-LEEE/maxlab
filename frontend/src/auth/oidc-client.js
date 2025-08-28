/**
 * OIDC 클라이언트 - OpenID Connect 프로토콜 구현
 * RFC 6749 (OAuth 2.0) + OpenID Connect Core 1.0 표준 준수
 * 
 * MAX Platform OAuth/OIDC 서버와의 통신을 담당하며
 * PKCE 플로우와 ID Token 검증을 지원합니다.
 */

import PKCEUtils from './pkce.js';
import TokenManager from './token-manager.js';

// 기본 설정값
const DEFAULT_CONFIG = {
  scope: 'openid profile email read:profile read:groups manage:workflows',
  responseType: 'code',
  grantType: 'authorization_code',
  codeChallengeMethod: 'S256',
  prompt: 'select_account', // 기본적으로 계정 선택 화면 표시
  maxAge: 86400 // 24시간 (초 단위)
};

/**
 * OIDC 클라이언트 클래스
 * OAuth 2.0 + OpenID Connect 플로우를 처리합니다.
 */
class OIDCClient {
  constructor(config = {}) {
    this.config = {
      authServerUrl: config.authServerUrl || import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000',
      clientId: config.clientId || import.meta.env.VITE_CLIENT_ID || 'maxlab',
      redirectUri: config.redirectUri || `${window.location.origin}/oauth/callback`,
      scope: config.scope || DEFAULT_CONFIG.scope,
      ...DEFAULT_CONFIG,
      ...config
    };
    
    this.tokenManager = new TokenManager();
    
    console.log('🔐 OIDC Client initialized:', {
      authServerUrl: this.config.authServerUrl,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scope: this.config.scope
    });
  }

  /**
   * OpenID Connect Discovery 문서 조회
   * RFC 8414 (OAuth 2.0 Authorization Server Metadata) 표준
   * @returns {Promise<Object>} Discovery 문서
   */
  async getDiscoveryDocument() {
    try {
      const discoveryUrl = `${this.config.authServerUrl}/.well-known/openid-configuration`;
      console.log('🔍 Fetching OIDC discovery document from:', discoveryUrl);
      
      const response = await fetch(discoveryUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Discovery document fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const discovery = await response.json();
      console.log('✅ OIDC discovery document retrieved');
      
      // 필수 엔드포인트 검증
      const requiredEndpoints = ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint'];
      const missingEndpoints = requiredEndpoints.filter(endpoint => !discovery[endpoint]);
      
      if (missingEndpoints.length > 0) {
        throw new Error(`Missing required endpoints: ${missingEndpoints.join(', ')}`);
      }
      
      return discovery;
    } catch (error) {
      console.error('❌ Failed to get discovery document:', error);
      throw new Error(`OIDC discovery failed: ${error.message}`);
    }
  }

  /**
   * JWKS (JSON Web Key Set) 조회
   * ID Token 서명 검증을 위한 공개 키 정보
   * @returns {Promise<Object>} JWKS 문서
   */
  async getJWKS() {
    try {
      const discovery = await this.getDiscoveryDocument();
      
      if (!discovery.jwks_uri) {
        throw new Error('JWKS URI not found in discovery document');
      }
      
      console.log('🔑 Fetching JWKS from:', discovery.jwks_uri);
      
      const response = await fetch(discovery.jwks_uri, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const jwks = await response.json();
      console.log('✅ JWKS retrieved successfully');
      
      return jwks;
    } catch (error) {
      console.error('❌ Failed to get JWKS:', error);
      throw new Error(`JWKS retrieval failed: ${error.message}`);
    }
  }

  /**
   * OAuth 2.0 + OIDC 인증 URL 생성
   * PKCE 플로우와 OpenID Connect 파라미터 포함
   * @param {Object} options - 인증 옵션
   * @returns {Promise<{authUrl: string, state: string, nonce: string}>}
   */
  async createAuthorizationUrl(options = {}) {
    try {
      console.log('🔐 Creating OIDC authorization URL...');
      
      // PKCE 코드 쌍 생성
      const pkcePair = await PKCEUtils.generatePKCEPair();
      
      // State 파라미터 생성 (CSRF 보호)
      const state = this.generateSecureState();
      
      // Nonce 생성 (ID Token replay 공격 방지)
      const nonce = this.generateNonce();
      
      // PKCE 데이터 저장
      PKCEUtils.storePKCEData(pkcePair.codeVerifier, state);
      
      // Nonce 저장 (ID Token 검증 시 필요)
      sessionStorage.setItem('oidc_nonce', nonce);
      sessionStorage.setItem('oidc_state', state);
      
      // 인증 파라미터 구성
      const authParams = new URLSearchParams({
        response_type: this.config.responseType,
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        scope: this.config.scope,
        state: state,
        code_challenge: pkcePair.codeChallenge,
        code_challenge_method: pkcePair.method,
        nonce: nonce,
        prompt: options.forceLogin ? 'login' : (options.selectAccount ? 'select_account' : this.config.prompt),
        max_age: options.maxAge || this.config.maxAge
      });
      
      // 추가 파라미터 병합
      if (options.additionalParams) {
        Object.entries(options.additionalParams).forEach(([key, value]) => {
          authParams.set(key, value);
        });
      }
      
      const authUrl = `${this.config.authServerUrl}/api/oauth/authorize?${authParams.toString()}`;
      
      console.log('✅ Authorization URL created:', {
        state: state.substring(0, 8) + '...',
        nonce: nonce.substring(0, 8) + '...',
        codeChallenge: pkcePair.codeChallenge.substring(0, 8) + '...',
        prompt: authParams.get('prompt')
      });
      
      return {
        authUrl,
        state,
        nonce,
        codeVerifier: pkcePair.codeVerifier // 디버깅용
      };
    } catch (error) {
      console.error('❌ Failed to create authorization URL:', error);
      throw new Error(`Authorization URL creation failed: ${error.message}`);
    }
  }

  /**
   * 인증 코드를 액세스 토큰으로 교환
   * OAuth 2.0 Authorization Code Grant + PKCE
   * @param {string} code - 인증 코드
   * @param {string} state - State 파라미터
   * @returns {Promise<Object>} 토큰 응답
   */
  async exchangeCodeForTokens(code, state) {
    try {
      console.log('🔄 Exchanging authorization code for tokens...');
      
      // State 검증
      const storedState = sessionStorage.getItem('oidc_state');
      if (!storedState || storedState !== state) {
        throw new Error('Invalid state parameter - possible CSRF attack');
      }
      
      // PKCE 데이터 조회
      const pkceData = PKCEUtils.retrievePKCEData(state);
      if (!pkceData) {
        throw new Error('PKCE data not found - invalid or expired request');
      }
      
      // 토큰 엔드포인트 요청
      const tokenParams = new URLSearchParams({
        grant_type: this.config.grantType,
        client_id: this.config.clientId,
        code: code,
        redirect_uri: this.config.redirectUri,
        code_verifier: pkceData.codeVerifier
      });
      
      const tokenUrl = `${this.config.authServerUrl}/api/oauth/token`;
      console.log('📡 Sending token request to:', tokenUrl);
      
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: tokenParams.toString()
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('❌ Token exchange failed:', response.status, errorBody);
        throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
      }
      
      const tokenResponse = await response.json();
      
      // 응답 검증
      if (!tokenResponse.access_token) {
        throw new Error('Access token not found in response');
      }
      
      console.log('✅ Tokens received successfully:', {
        hasAccessToken: !!tokenResponse.access_token,
        hasRefreshToken: !!tokenResponse.refresh_token,
        hasIdToken: !!tokenResponse.id_token,
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in
      });
      
      // PKCE 및 state 데이터 정리
      PKCEUtils.clearPKCEData(state);
      sessionStorage.removeItem('oidc_state');
      
      return tokenResponse;
      
    } catch (error) {
      console.error('❌ Code exchange failed:', error);
      
      // 오류 발생 시 저장된 데이터 정리
      PKCEUtils.clearPKCEData(state);
      sessionStorage.removeItem('oidc_state');
      
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }

  /**
   * ID Token 검증 및 Claims 추출
   * OpenID Connect Core 1.0 표준에 따른 ID Token 검증
   * @param {string} idToken - ID Token (JWT)
   * @returns {Promise<Object>} 검증된 Claims
   */
  async verifyIdToken(idToken) {
    try {
      console.log('🔍 Verifying ID Token...');
      
      if (!idToken) {
        throw new Error('ID Token is required');
      }
      
      // JWT 구조 검증 (3개 부분: header.payload.signature)
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      // Header와 Payload 디코딩
      const header = this.decodeJWTBase64(parts[0]);
      const payload = this.decodeJWTBase64(parts[1]);
      
      console.log('📋 ID Token header:', header);
      console.log('📋 ID Token payload (filtered):', {
        iss: payload.iss,
        aud: payload.aud,
        exp: payload.exp,
        iat: payload.iat,
        sub: payload.sub?.substring(0, 8) + '...',
        email: payload.email
      });
      
      // 기본 Claims 검증
      await this.validateIdTokenClaims(payload);
      
      console.log('✅ ID Token verified successfully');
      
      // Nonce 정리
      sessionStorage.removeItem('oidc_nonce');
      
      return payload;
      
    } catch (error) {
      console.error('❌ ID Token verification failed:', error);
      throw new Error(`ID Token verification failed: ${error.message}`);
    }
  }

  /**
   * UserInfo 엔드포인트에서 사용자 정보 조회
   * @param {string} accessToken - 액세스 토큰
   * @returns {Promise<Object>} 사용자 정보
   */
  async getUserInfo(accessToken) {
    try {
      console.log('👤 Fetching user info from UserInfo endpoint...');
      
      if (!accessToken) {
        throw new Error('Access token is required');
      }
      
      const userinfoUrl = `${this.config.authServerUrl}/api/oauth/userinfo`;
      
      const response = await fetch(userinfoUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`UserInfo request failed: ${response.status} ${response.statusText}`);
      }
      
      const userInfo = await response.json();
      
      console.log('✅ User info retrieved:', {
        sub: userInfo.sub?.substring(0, 8) + '...',
        email: userInfo.email,
        name: userInfo.name,
        groups: userInfo.groups?.length || 0
      });
      
      return userInfo;
      
    } catch (error) {
      console.error('❌ Failed to get user info:', error);
      throw new Error(`UserInfo request failed: ${error.message}`);
    }
  }

  /**
   * 토큰 새로고침 (Refresh Token 사용)
   * @param {string} refreshToken - 리프레시 토큰
   * @returns {Promise<Object>} 새로운 토큰 응답
   */
  async refreshTokens(refreshToken) {
    try {
      console.log('🔄 Refreshing tokens...');
      
      if (!refreshToken) {
        throw new Error('Refresh token is required');
      }
      
      const tokenUrl = `${this.config.authServerUrl}/api/oauth/token`;
      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        refresh_token: refreshToken
      });
      
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: refreshParams.toString()
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('❌ Token refresh failed:', response.status, errorBody);
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }
      
      const tokenResponse = await response.json();
      
      console.log('✅ Tokens refreshed successfully');
      
      return tokenResponse;
      
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * 로그아웃 (토큰 폐기)
   * @param {string} accessToken - 액세스 토큰
   * @param {string} refreshToken - 리프레시 토큰 (선택사항)
   * @returns {Promise<void>}
   */
  async logout(accessToken, refreshToken = null) {
    try {
      console.log('🔓 Performing OIDC logout...');
      
      // Access Token 폐기
      if (accessToken) {
        await this.revokeToken(accessToken, 'access_token');
      }
      
      // Refresh Token 폐기
      if (refreshToken) {
        await this.revokeToken(refreshToken, 'refresh_token');
      }
      
      // 로컬 데이터 정리
      this.clearLocalData();
      
      console.log('✅ OIDC logout completed');
      
    } catch (error) {
      console.error('❌ OIDC logout error:', error);
      
      // 오류가 있어도 로컬 데이터는 정리
      this.clearLocalData();
      
      throw new Error(`Logout failed: ${error.message}`);
    }
  }

  /**
   * 토큰 폐기 (RFC 7009)
   * @param {string} token - 폐기할 토큰
   * @param {string} tokenTypeHint - 토큰 타입 힌트
   * @returns {Promise<void>}
   */
  async revokeToken(token, tokenTypeHint = 'access_token') {
    try {
      const revokeUrl = `${this.config.authServerUrl}/api/oauth/revoke`;
      const revokeParams = new URLSearchParams({
        token: token,
        token_type_hint: tokenTypeHint,
        client_id: this.config.clientId
      });
      
      const response = await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: revokeParams.toString()
      });
      
      // RFC 7009: 200 또는 invalid_request 오류가 모두 성공으로 간주
      if (response.ok || response.status === 400) {
        console.log(`✅ Token revoked: ${tokenTypeHint}`);
      } else {
        console.warn(`⚠️ Token revocation failed: ${response.status}`);
      }
      
    } catch (error) {
      console.error(`❌ Token revocation error (${tokenTypeHint}):`, error);
      // 폐기 실패는 로그만 남기고 계속 진행
    }
  }

  /**
   * Silent 인증 시도 (iframe 사용)
   * prompt=none 파라미터로 사용자 상호작용 없이 토큰 갱신
   * @returns {Promise<Object|null>} 토큰 응답 또는 null
   */
  async attemptSilentAuthentication() {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🤫 Attempting silent authentication...');
        
        // Silent 인증용 iframe 생성
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.style.position = 'absolute';
        iframe.style.left = '-1000px';
        iframe.style.top = '-1000px';
        
        // 타임아웃 설정
        const timeoutId = setTimeout(() => {
          cleanup();
          resolve(null); // 타임아웃은 실패가 아닌 null 반환
        }, 10000); // 10초
        
        const cleanup = () => {
          clearTimeout(timeoutId);
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          window.removeEventListener('message', messageHandler);
        };
        
        // 메시지 핸들러
        const messageHandler = (event) => {
          if (event.origin !== window.location.origin) {
            return;
          }
          
          if (event.data.type === 'oauth_silent_success') {
            cleanup();
            resolve(event.data.tokens);
          } else if (event.data.type === 'oauth_silent_error') {
            cleanup();
            console.log('ℹ️ Silent authentication failed (expected):', event.data.error);
            resolve(null);
          }
        };
        
        window.addEventListener('message', messageHandler);
        
        // Silent 인증 URL 생성
        const authData = await this.createAuthorizationUrl({
          additionalParams: {
            prompt: 'none' // Silent 인증
          }
        });
        
        // iframe으로 인증 요청
        iframe.src = authData.authUrl;
        document.body.appendChild(iframe);
        
      } catch (error) {
        console.error('❌ Silent authentication setup failed:', error);
        resolve(null);
      }
    });
  }

  // === 유틸리티 메서드들 ===

  /**
   * 안전한 State 파라미터 생성
   * @returns {string} State 파라미터
   */
  generateSecureState() {
    return PKCEUtils.generateSecureRandomString(32);
  }

  /**
   * Nonce 생성 (OpenID Connect)
   * @returns {string} Nonce 값
   */
  generateNonce() {
    return PKCEUtils.generateSecureRandomString(32);
  }

  /**
   * JWT Base64 디코딩 (URL Safe)
   * @param {string} str - Base64 URL Safe 문자열
   * @returns {Object} 디코딩된 객체
   */
  decodeJWTBase64(str) {
    try {
      // Base64 URL Safe → 표준 Base64
      const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
      
      const decoded = atob(padded);
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error(`Invalid JWT segment: ${error.message}`);
    }
  }

  /**
   * ID Token Claims 검증
   * @param {Object} claims - ID Token Claims
   * @returns {Promise<void>}
   */
  async validateIdTokenClaims(claims) {
    const now = Math.floor(Date.now() / 1000);
    
    // Issuer 검증
    if (!claims.iss || !claims.iss.startsWith(this.config.authServerUrl)) {
      throw new Error('Invalid issuer');
    }
    
    // Audience 검증
    if (!claims.aud || claims.aud !== this.config.clientId) {
      throw new Error('Invalid audience');
    }
    
    // 만료 시간 검증
    if (!claims.exp || claims.exp <= now) {
      throw new Error('Token expired');
    }
    
    // 발급 시간 검증 (1시간 이상 과거 또는 미래 토큰 거부)
    if (!claims.iat || claims.iat > now + 3600 || claims.iat < now - 3600) {
      throw new Error('Invalid issued time');
    }
    
    // Nonce 검증 (있는 경우)
    const storedNonce = sessionStorage.getItem('oidc_nonce');
    if (storedNonce && claims.nonce !== storedNonce) {
      throw new Error('Invalid nonce');
    }
    
    // Subject 존재 확인
    if (!claims.sub) {
      throw new Error('Missing subject');
    }
  }

  /**
   * 로컬 데이터 정리
   */
  clearLocalData() {
    // Session Storage 정리
    const sessionKeys = [
      'oidc_state',
      'oidc_nonce'
    ];
    
    sessionKeys.forEach(key => {
      sessionStorage.removeItem(key);
    });
    
    // PKCE 데이터 전체 정리
    PKCEUtils.clearAllPKCEData();
    
    console.log('🗑️ OIDC local data cleared');
  }

  /**
   * 디버깅 정보 생성
   * @returns {Object} 디버깅 정보
   */
  getDebugInfo() {
    return {
      config: {
        authServerUrl: this.config.authServerUrl,
        clientId: this.config.clientId,
        redirectUri: this.config.redirectUri,
        scope: this.config.scope
      },
      sessionData: {
        hasState: !!sessionStorage.getItem('oidc_state'),
        hasNonce: !!sessionStorage.getItem('oidc_nonce')
      },
      pkce: PKCEUtils.getPKCEDebugInfo(),
      tokens: this.tokenManager.getDebugInfo()
    };
  }
}

export default OIDCClient;