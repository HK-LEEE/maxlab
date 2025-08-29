/**
 * OAuth 테스트 설정 (OAuth Testing Configuration)
 * 
 * 재구조화된 OAuth Server와 MaxLab 연동 테스트용 설정
 * 개발 및 디버깅 목적으로 사용
 */

/**
 * 환경별 OAuth 테스트 설정
 */
export const oauthTestConfig = {
  // 개발 환경 설정
  development: {
    authServerUrl: 'https://max.dwchem.co.kr',
    clientId: 'maxlab',
    redirectUri: 'http://localhost:3010/oauth/callback',
    postLogoutRedirectUri: 'http://localhost:3010/logout/success',
    
    // 새 OAuth Server endpoints (재구조화됨)
    endpoints: {
      authorize: 'https://max.dwchem.co.kr/auth/authorize',
      token: 'https://max.dwchem.co.kr/auth/token',
      userinfo: 'https://max.dwchem.co.kr/auth/userinfo',
      jwks: 'https://max.dwchem.co.kr/auth/jwks',
      logout: 'https://max.dwchem.co.kr/auth/logout',
      revoke: 'https://max.dwchem.co.kr/auth/revoke',
      discovery: 'https://max.dwchem.co.kr/auth/.well-known/openid-configuration'
    },
    
    scopes: ['openid', 'profile', 'email', 'groups', 'read:profile', 'manage:experiments'],
    responseType: 'code',
    grantType: 'authorization_code',
    
    // PKCE 설정
    codeChallenge: true,
    codeChallengeMethod: 'S256'
  },
  
  // 운영 환경 설정
  production: {
    authServerUrl: 'https://max.dwchem.co.kr',
    clientId: 'maxlab',
    redirectUri: 'https://maxlab.dwchem.co.kr/oauth/callback',
    postLogoutRedirectUri: 'https://maxlab.dwchem.co.kr/logout/success',
    
    // 새 OAuth Server endpoints (재구조화됨)
    endpoints: {
      authorize: 'https://max.dwchem.co.kr/auth/authorize',
      token: 'https://max.dwchem.co.kr/auth/token',
      userinfo: 'https://max.dwchem.co.kr/auth/userinfo',
      jwks: 'https://max.dwchem.co.kr/auth/jwks',
      logout: 'https://max.dwchem.co.kr/auth/logout',
      revoke: 'https://max.dwchem.co.kr/auth/revoke',
      discovery: 'https://max.dwchem.co.kr/auth/.well-known/openid-configuration'
    },
    
    scopes: ['openid', 'profile', 'email', 'groups', 'read:profile', 'manage:experiments', 'manage:workspaces'],
    responseType: 'code',
    grantType: 'authorization_code',
    
    // PKCE 설정
    codeChallenge: true,
    codeChallengeMethod: 'S256'
  }
};

/**
 * OAuth Flow 테스트 함수들
 */

/**
 * Discovery Document 테스트
 * @param {string} environment - 환경 ('development' 또는 'production')
 */
export async function testDiscoveryDocument(environment = 'development') {
  const config = oauthTestConfig[environment];
  
  console.log(`🔍 [${environment}] Discovery Document 테스트 시작...`);
  
  try {
    const response = await fetch(config.endpoints.discovery, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const discovery = await response.json();
      console.log('✅ Discovery Document 로드 성공:', {
        issuer: discovery.issuer,
        authorization_endpoint: discovery.authorization_endpoint,
        token_endpoint: discovery.token_endpoint,
        userinfo_endpoint: discovery.userinfo_endpoint,
        jwks_uri: discovery.jwks_uri,
        end_session_endpoint: discovery.end_session_endpoint,
        scopes_supported: discovery.scopes_supported,
        response_types_supported: discovery.response_types_supported
      });
      
      return { success: true, discovery };
    } else {
      console.error('❌ Discovery Document 로드 실패:', response.status, response.statusText);
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
  } catch (error) {
    console.error('❌ Discovery Document 테스트 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Authorization URL 생성 테스트
 * @param {string} environment - 환경 ('development' 또는 'production')
 */
export async function generateAuthorizationUrl(environment = 'development', options = {}) {
  const config = oauthTestConfig[environment];
  
  console.log(`🔗 [${environment}] Authorization URL 생성 중...`);
  
  try {
    // PKCE Code Verifier 생성
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // State 생성
    const state = generateRandomString(32);
    
    // Nonce 생성 (OIDC)
    const nonce = generateRandomString(32);
    
    // Authorization URL 구성
    const authUrl = new URL(config.endpoints.authorize);
    const params = {
      client_id: config.clientId,
      response_type: config.responseType,
      scope: config.scopes.join(' '),
      redirect_uri: config.redirectUri,
      state: state,
      nonce: nonce,
      code_challenge: codeChallenge,
      code_challenge_method: config.codeChallengeMethod,
      // 계정 선택 강제 (옵션)
      ...(options.forceAccountSelection && { prompt: 'select_account' })
    };
    
    // URL 파라미터 추가
    Object.entries(params).forEach(([key, value]) => {
      authUrl.searchParams.append(key, value);
    });
    
    // 세션에 저장 (PKCE 및 State 검증용)
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_nonce', nonce);
    
    console.log('✅ Authorization URL 생성 완료:', {
      url: authUrl.toString(),
      state: state.substring(0, 8) + '...',
      codeChallenge: codeChallenge.substring(0, 16) + '...',
      scopes: config.scopes
    });
    
    return {
      success: true,
      authUrl: authUrl.toString(),
      state,
      codeVerifier,
      nonce
    };
  } catch (error) {
    console.error('❌ Authorization URL 생성 실패:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Token Exchange 테스트 (Authorization Code → Access Token)
 * @param {string} environment - 환경
 * @param {string} code - Authorization Code
 * @param {string} state - State 값
 */
export async function testTokenExchange(environment = 'development', code, state) {
  const config = oauthTestConfig[environment];
  
  console.log(`🎫 [${environment}] Token Exchange 테스트 시작...`);
  
  try {
    // 저장된 state와 code_verifier 검증
    const storedState = sessionStorage.getItem('oauth_state');
    const storedCodeVerifier = sessionStorage.getItem('oauth_code_verifier');
    
    if (storedState !== state) {
      throw new Error('State 값이 일치하지 않습니다 (CSRF 보호)');
    }
    
    if (!storedCodeVerifier) {
      throw new Error('Code Verifier가 없습니다');
    }
    
    // Token 요청
    const tokenResponse = await fetch(config.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: config.grantType,
        client_id: config.clientId,
        code: code,
        redirect_uri: config.redirectUri,
        code_verifier: storedCodeVerifier
      })
    });
    
    if (tokenResponse.ok) {
      const tokens = await tokenResponse.json();
      
      console.log('✅ Token Exchange 성공:', {
        tokenType: tokens.token_type,
        expiresIn: tokens.expires_in,
        scope: tokens.scope,
        hasRefreshToken: !!tokens.refresh_token,
        hasIdToken: !!tokens.id_token
      });
      
      // 세션 정리
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_code_verifier');
      
      return { success: true, tokens };
    } else {
      const error = await tokenResponse.json();
      console.error('❌ Token Exchange 실패:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('❌ Token Exchange 테스트 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * UserInfo 엔드포인트 테스트
 * @param {string} environment - 환경
 * @param {string} accessToken - Access Token
 */
export async function testUserInfo(environment = 'development', accessToken) {
  const config = oauthTestConfig[environment];
  
  console.log(`👤 [${environment}] UserInfo 테스트 시작...`);
  
  try {
    const response = await fetch(config.endpoints.userinfo, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const userInfo = await response.json();
      
      console.log('✅ UserInfo 조회 성공:', {
        sub: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        groups: userInfo.groups?.length || 0
      });
      
      return { success: true, userInfo };
    } else {
      const error = await response.text();
      console.error('❌ UserInfo 조회 실패:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('❌ UserInfo 테스트 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 전체 OAuth Flow 테스트
 * @param {string} environment - 환경
 */
export async function testCompleteOAuthFlow(environment = 'development') {
  console.log(`🚀 [${environment}] 전체 OAuth Flow 테스트 시작...`);
  
  // 1. Discovery Document 테스트
  const discoveryResult = await testDiscoveryDocument(environment);
  if (!discoveryResult.success) {
    console.error('❌ Discovery 단계 실패:', discoveryResult.error);
    return { success: false, step: 'discovery', error: discoveryResult.error };
  }
  
  // 2. Authorization URL 생성
  const authResult = await generateAuthorizationUrl(environment);
  if (!authResult.success) {
    console.error('❌ Authorization URL 생성 실패:', authResult.error);
    return { success: false, step: 'authorization', error: authResult.error };
  }
  
  console.log('✅ OAuth Flow 테스트 준비 완료');
  console.log('📋 다음 단계: 생성된 URL로 브라우저에서 로그인 진행');
  console.log('🔗 Authorization URL:', authResult.authUrl);
  
  return {
    success: true,
    authUrl: authResult.authUrl,
    testFunctions: {
      testTokenExchange: (code, state) => testTokenExchange(environment, code, state),
      testUserInfo: (accessToken) => testUserInfo(environment, accessToken)
    }
  };
}

/**
 * 유틸리티 함수들
 */

function generateRandomString(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// 개발자 콘솔에서 사용할 수 있도록 전역으로 노출
if (typeof window !== 'undefined') {
  window.maxlabOAuthTest = {
    testDiscoveryDocument,
    generateAuthorizationUrl,
    testTokenExchange,
    testUserInfo,
    testCompleteOAuthFlow,
    config: oauthTestConfig
  };
  
  console.log('🔧 MaxLab OAuth Test 도구가 준비되었습니다!');
  console.log('사용법: window.maxlabOAuthTest.testCompleteOAuthFlow("development")');
}