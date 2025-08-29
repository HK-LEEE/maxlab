/**
 * OIDC (OpenID Connect) 서비스
 * 
 * MAX Platform OAuth Server 연동을 위한 OIDC 서비스
 * - Discovery 설정 자동 탐지 및 캐싱
 * - JWKS 키 관리 및 토큰 검증
 * - Single Logout (RP-Initiated Logout) 지원
 * - 새 OAuth server 구조 (/auth/*) 대응
 * 
 * OIDC-specific functionality including discovery, JWKS verification, and enhanced authentication
 */

import { jwtDecode } from 'jwt-decode';
import type { OIDCClaims, MAXPlatformClaims } from '../types/auth';

// OIDC Discovery Configuration
export interface OIDCConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  claims_supported: string[];
  code_challenge_methods_supported?: string[];
}

// JWKS Key Structure
interface JWK {
  kty: string;
  use?: string;
  kid: string;
  alg: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

interface JWKS {
  keys: JWK[];
}

class OIDCService {
  private discoveryCache: OIDCConfiguration | null = null;
  private discoveryPromise: Promise<OIDCConfiguration> | null = null;
  private jwksCache: JWKS | null = null;
  private jwksPromise: Promise<JWKS> | null = null;
  private readonly authUrl: string;
  
  constructor() {
    this.authUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000';
  }

  /**
   * Get OIDC Discovery configuration
   */
  async getDiscoveryConfiguration(): Promise<OIDCConfiguration> {
    // Return cached configuration if available
    if (this.discoveryCache) {
      return this.discoveryCache;
    }

    // Return existing promise if discovery is in progress
    if (this.discoveryPromise) {
      return this.discoveryPromise;
    }

    // Start discovery process
    this.discoveryPromise = this.fetchDiscoveryConfiguration();
    
    try {
      this.discoveryCache = await this.discoveryPromise;
      return this.discoveryCache;
    } catch (error) {
      this.discoveryPromise = null;
      throw error;
    }
  }

  private async fetchDiscoveryConfiguration(): Promise<OIDCConfiguration> {
    console.log('🔍 Fetching OIDC Discovery configuration...');
    
    // OAuth Server 재구조화: 새로운 discovery endpoints 시도
    const discoveryEndpoints = [
      // 새 OAuth server 경로들
      '/auth/.well-known/openid-configuration',
      '/auth/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
      // 기존 경로들 (하위호환성 - OAuth server 재구조화 이전)
      '/api/oauth/.well-known/openid-configuration',
      '/api/oauth/.well-known/oauth-authorization-server'
    ];

    for (const endpoint of discoveryEndpoints) {
      try {
        const response = await fetch(`${this.authUrl}${endpoint}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (response.ok) {
          const config = await response.json();
          console.log('✅ OIDC Discovery configuration loaded:', {
            issuer: config.issuer,
            endpoints: {
              authorize: config.authorization_endpoint,
              token: config.token_endpoint,
              userinfo: config.userinfo_endpoint,
              jwks: config.jwks_uri,
              logout: config.end_session_endpoint
            }
          });
          return config;
        }
      } catch (error) {
        console.warn(`Failed to fetch discovery from ${endpoint}:`, error);
      }
    }

    // Fallback to static configuration
    console.warn('⚠️ OIDC Discovery failed, using static configuration');
    return this.getStaticConfiguration();
  }

  private getStaticConfiguration(): OIDCConfiguration {
    // 🔧 OAuth Server 재구조화 대응: 새로운 OAuth server 경로 사용
    // OAuth server가 maxplatform/oauth-server/ 로 이동됨
    const authServerUrl = import.meta.env.VITE_AUTH_SERVER_URL || import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8000';
    
    return {
      // OAuth server의 OIDC issuer URL
      issuer: this.authUrl,
      
      // 🚀 새 OAuth server endpoints (maxplatform/oauth-server/ 구조)
      authorization_endpoint: import.meta.env.VITE_OAUTH_AUTHORIZE_URL || `${authServerUrl}/auth/authorize`, // 새 OAuth server
      token_endpoint: import.meta.env.VITE_OAUTH_TOKEN_URL || `${authServerUrl}/auth/token`, // 새 OAuth server  
      userinfo_endpoint: import.meta.env.VITE_OAUTH_USERINFO_URL || `${authServerUrl}/auth/userinfo`, // 새 OAuth server
      jwks_uri: `${authServerUrl}/auth/jwks`, // 새 OAuth server
      end_session_endpoint: import.meta.env.VITE_OAUTH_LOGOUT_URL || `${authServerUrl}/auth/logout`, // 새 OAuth server
      revocation_endpoint: `${authServerUrl}/auth/revoke`, // 새 OAuth server
      
      // 지원되는 OAuth/OIDC 스코프
      scopes_supported: ['openid', 'profile', 'email', 'offline_access', 'groups', 'roles', 'read:profile', 'manage:experiments', 'manage:workspaces'],
      response_types_supported: ['code', 'id_token', 'token', 'code id_token', 'code token', 'id_token token', 'code id_token token'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      id_token_signing_alg_values_supported: ['RS256', 'HS256'],
      claims_supported: ['sub', 'name', 'email', 'email_verified', 'groups', 'roles', 'permissions'],
      code_challenge_methods_supported: ['S256', 'plain'] // PKCE 지원
    };
  }

  /**
   * Get JWKS (JSON Web Key Set)
   */
  async getJWKS(): Promise<JWKS> {
    // Return cached JWKS if available
    if (this.jwksCache) {
      return this.jwksCache;
    }

    // Return existing promise if JWKS fetch is in progress
    if (this.jwksPromise) {
      return this.jwksPromise;
    }

    // Start JWKS fetch process
    this.jwksPromise = this.fetchJWKS();
    
    try {
      this.jwksCache = await this.jwksPromise;
      return this.jwksCache;
    } catch (error) {
      this.jwksPromise = null;
      throw error;
    }
  }

  private async fetchJWKS(): Promise<JWKS> {
    console.log('🔑 Fetching JWKS...');
    
    const config = await this.getDiscoveryConfiguration();
    const response = await fetch(config.jwks_uri, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch JWKS');
    }

    const jwks = await response.json();
    console.log('✅ JWKS loaded:', {
      keyCount: jwks.keys?.length || 0,
      kids: jwks.keys?.map((k: JWK) => k.kid) || []
    });
    
    return jwks;
  }

  /**
   * Verify ID Token with JWKS (simplified version without jose)
   * In production, you should use jose library for proper verification
   */
  async verifyIDToken(idToken: string, nonce?: string): Promise<MAXPlatformClaims> {
    try {
      // Decode token to get claims
      const claims = jwtDecode<MAXPlatformClaims>(idToken);
      
      // Get header to find key ID
      const [headerB64] = idToken.split('.');
      const header = JSON.parse(atob(headerB64));
      
      console.log('🔐 Verifying ID Token:', {
        algorithm: header.alg,
        keyId: header.kid,
        issuer: claims.iss,
        audience: claims.aud
      });

      // TODO: Implement actual signature verification with jose library
      // For now, we'll do claim-based validation only
      console.warn('⚠️ ID Token signature verification not implemented. Install jose library for production use.');

      // Validate claims
      const now = Math.floor(Date.now() / 1000);
      
      // Check expiration
      if (claims.exp && claims.exp < now) {
        throw new Error('ID Token has expired');
      }
      
      // Check issued at time
      if (claims.iat && claims.iat > now + 60) {
        throw new Error('ID Token issued in the future');
      }
      
      // Check issuer
      const config = await this.getDiscoveryConfiguration();
      if (claims.iss !== config.issuer) {
        throw new Error(`Invalid issuer. Expected ${config.issuer}, got ${claims.iss}`);
      }
      
      // Check audience
      const clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
      if (claims.aud !== clientId) {
        throw new Error(`Invalid audience. Expected ${clientId}, got ${claims.aud}`);
      }
      
      // Check nonce if provided
      if (nonce && claims.nonce !== nonce) {
        throw new Error('Invalid nonce in ID Token');
      }
      
      // Check auth_time if present
      if (claims.auth_time) {
        const authAge = now - claims.auth_time;
        const maxAge = sessionStorage.getItem('oauth_max_age');
        
        if (maxAge && authAge > parseInt(maxAge)) {
          throw new Error('Authentication too old');
        }
      }
      
      console.log('✅ ID Token validation passed');
      return claims;
      
    } catch (error: any) {
      console.error('❌ ID Token verification failed:', error);
      throw new Error(`ID Token verification failed: ${error.message}`);
    }
  }

  /**
   * Perform RP-Initiated Logout (Single Logout)
   */
  async performSingleLogout(idToken?: string, postLogoutRedirectUri?: string): Promise<string> {
    try {
      const config = await this.getDiscoveryConfiguration();
      
      if (!config.end_session_endpoint) {
        console.warn('⚠️ No end_session_endpoint found, using fallback');
        // 새 OAuth server 구조 사용
        return `${this.authUrl}/auth/logout`;
      }
      
      const logoutUrl = new URL(config.end_session_endpoint);
      
      // Add post logout redirect URI
      if (postLogoutRedirectUri) {
        logoutUrl.searchParams.append('post_logout_redirect_uri', postLogoutRedirectUri);
      }
      
      // Add ID token hint for better logout
      if (idToken) {
        logoutUrl.searchParams.append('id_token_hint', idToken);
      }
      
      // Add client ID
      const clientId = import.meta.env.VITE_CLIENT_ID || 'maxlab';
      logoutUrl.searchParams.append('client_id', clientId);
      
      console.log('🚪 Single Logout URL:', logoutUrl.toString());
      return logoutUrl.toString();
      
    } catch (error) {
      console.error('❌ Single Logout preparation failed:', error);
      // Fallback to basic logout (새 OAuth server 구조)
      return `${this.authUrl}/auth/logout`;
    }
  }

  /**
   * Revoke tokens
   */
  async revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
    try {
      const config = await this.getDiscoveryConfiguration();
      // 새 OAuth server 구조: /auth/* 경로 사용
      const revokeEndpoint = config.revocation_endpoint || `${this.authUrl}/auth/revoke`;
      
      console.log('🔒 Revoking token...');
      
      const response = await fetch(revokeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          token: token,
          token_type_hint: tokenTypeHint || 'access_token',
          client_id: import.meta.env.VITE_CLIENT_ID || 'maxlab',
          client_secret: import.meta.env.VITE_CLIENT_SECRET || '' // Only for confidential clients
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Token revocation failed:', error);
        // Token revocation is best-effort, don't throw
      } else {
        console.log('✅ Token revoked successfully');
      }
      
    } catch (error) {
      console.error('❌ Token revocation error:', error);
      // Token revocation is best-effort, don't throw
    }
  }

  /**
   * Get the standard OIDC logout endpoint from discovery document
   */
  async getLogoutEndpoint(): Promise<string> {
    try {
      const config = await this.getDiscoveryConfiguration();
      // 새 OAuth server 구조 사용
      return config.end_session_endpoint || `${this.authUrl}/auth/logout`;
    } catch (error) {
      console.warn('⚠️ Failed to get logout endpoint from discovery, using fallback');
      // 새 OAuth server 구조 사용
      return `${this.authUrl}/auth/logout`;
    }
  }

  /**
   * Build OIDC Single Logout URL with proper parameters
   */
  buildSingleLogoutUrl(options: {
    post_logout_redirect_uri?: string;
    id_token_hint?: string;
    client_id?: string;
    state?: string;
  }): Promise<string> {
    return this.performSingleLogout(options.id_token_hint, options.post_logout_redirect_uri);
  }

  /**
   * Generate random state for CSRF protection
   */
  generateRandomState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.discoveryCache = null;
    this.discoveryPromise = null;
    this.jwksCache = null;
    this.jwksPromise = null;
    console.log('🧹 OIDC caches cleared');
  }
}

// Export singleton instance
export const oidcService = new OIDCService();