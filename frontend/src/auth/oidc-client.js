/**
 * OIDC Client 설정 (OAuth 2.0/OpenID Connect Client Configuration)
 * 
 * MAX Platform OAuth Server 연동을 위한 클라이언트 설정
 * - 재구조화된 OAuth server (maxplatform/oauth-server/) 대응
 * - PKCE (Proof Key for Code Exchange) 지원
 * - 개발/운영 환경 분리 설정
 * - MaxLab 클라이언트 전용 구성
 */

import { UserManager, WebStorageStateStore, Log } from 'oidc-client-ts';

/**
 * OIDC 클라이언트 설정 생성
 * @param {Object} options - 설정 옵션
 * @returns {UserManager} OIDC UserManager 인스턴스
 */
export function createOIDCClient(options = {}) {
  // 환경별 기본 설정
  const isDevelopment = import.meta.env.MODE === 'development' || import.meta.env.VITE_NODE_ENV === 'development';
  const isProduction = import.meta.env.MODE === 'production' || import.meta.env.VITE_NODE_ENV === 'production';
  
  // OAuth Server URL 설정 (재구조화된 서버 구조 반영)
  const authServerUrl = import.meta.env.VITE_AUTH_SERVER_URL || 
                        import.meta.env.VITE_MAX_PLATFORM_URL || 
                        'https://max.dwchem.co.kr';
  
  // 클라이언트 앱 URL 설정
  const clientUrl = isDevelopment 
    ? `http://localhost:${import.meta.env.VITE_DEV_SERVER_PORT || 3010}`
    : import.meta.env.VITE_API_BASE_URL || 'https://maxlab.dwchem.co.kr';

  // OIDC 클라이언트 기본 설정
  const defaultSettings = {
    // 🔗 OAuth Server Endpoints (새 구조)
    authority: authServerUrl,
    client_id: import.meta.env.VITE_CLIENT_ID || 'maxlab',
    
    // 🔄 Redirect URIs
    redirect_uri: `${clientUrl}/oauth/callback`,
    post_logout_redirect_uri: `${clientUrl}/logout/success`,
    silent_redirect_uri: `${clientUrl}/oauth/silent-callback`,
    
    // 📝 OAuth Flow 설정
    response_type: 'code',
    scope: 'openid profile email groups read:profile manage:experiments manage:workspaces',
    
    // 🛡️ 보안 설정 - PKCE (Proof Key for Code Exchange) 활성화
    // Public 클라이언트에서 Authorization Code Interception Attack 방지
    client_authentication: 'client_secret_post',
    code_challenge_method: 'S256', // PKCE S256 해시 방식 사용 (RFC 7636 준수)
    
    // 🍪 State 및 세션 관리
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    
    // 🔄 자동 갱신 설정
    automaticSilentRenew: true,
    silent_redirect_uri: `${clientUrl}/oauth/silent-callback`,
    includeIdTokenInSilentRenew: true,
    
    // ⏱️ 토큰 만료 설정
    accessTokenExpiringNotificationTime: 300, // 5분 전 알림
    clockSkew: 300, // 5분 클럭 스큐 허용
    
    // 🔍 메타데이터 설정 (재구조화된 OAuth server 경로)
    metadataUrl: `${authServerUrl}/auth/.well-known/openid-configuration`,
    metadata: {
      issuer: authServerUrl,
      authorization_endpoint: `${authServerUrl}/auth/authorize`,
      token_endpoint: `${authServerUrl}/auth/token`,
      userinfo_endpoint: `${authServerUrl}/auth/userinfo`,
      jwks_uri: `${authServerUrl}/auth/jwks`,
      end_session_endpoint: `${authServerUrl}/auth/logout`,
      revocation_endpoint: `${authServerUrl}/auth/revoke`,
      introspection_endpoint: `${authServerUrl}/auth/introspect`
    },
    
    // 🚨 에러 처리 설정
    filterProtocolClaims: true,
    loadUserInfo: true,
    
    // 사용자 정의 설정 적용
    ...options
  };

  // 개발 환경 전용 설정
  if (isDevelopment) {
    // 개발 환경에서 더 상세한 로깅
    Log.setLogger(console);
    Log.setLevel(Log.INFO);
    
    // 개발용 리다이렉트 URI 추가
    defaultSettings.redirect_uri = 'http://localhost:3010/oauth/callback';
    defaultSettings.post_logout_redirect_uri = 'http://localhost:3010/logout/success';
    defaultSettings.silent_redirect_uri = 'http://localhost:3010/oauth/silent-callback';
    
    console.log('🔧 MaxLab OIDC Client - 개발 모드 설정:', {
      authority: defaultSettings.authority,
      client_id: defaultSettings.client_id,
      redirect_uri: defaultSettings.redirect_uri,
      scope: defaultSettings.scope
    });
  }
  
  // 운영 환경 전용 설정  
  if (isProduction) {
    // 운영 환경에서는 에러만 로깅
    Log.setLogger(console);
    Log.setLevel(Log.ERROR);
    
    console.log('🚀 MaxLab OIDC Client - 운영 모드로 초기화 완료');
  }

  return new UserManager(defaultSettings);
}

/**
 * PKCE Code Verifier 생성
 * @returns {string} Base64URL 인코딩된 Code Verifier
 */
export function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * PKCE Code Challenge 생성
 * @param {string} codeVerifier - Code Verifier
 * @returns {Promise<string>} SHA256 해시된 Code Challenge
 */
export async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * 기본 OIDC 클라이언트 인스턴스 생성 및 내보내기
 */
export const oidcClient = createOIDCClient();

/**
 * OAuth 로그인 실행
 * @param {Object} options - 로그인 옵션
 * @returns {Promise} 로그인 프로미스
 */
export async function startOAuthLogin(options = {}) {
  try {
    console.log('🔐 MaxLab OAuth 로그인 시작...');
    
    // 계정 선택 강제 옵션 처리
    const loginArgs = {
      // prompt 파라미터로 계정 선택 강제
      extraQueryParams: {
        ...(options.forceAccountSelection && { prompt: 'select_account' }),
        ...options.extraQueryParams
      },
      ...options
    };
    
    await oidcClient.signinRedirect(loginArgs);
  } catch (error) {
    console.error('❌ MaxLab OAuth 로그인 실패:', error);
    throw new Error(`OAuth 로그인에 실패했습니다: ${error.message}`);
  }
}

/**
 * OAuth 콜백 처리
 * @returns {Promise<User>} 사용자 정보
 */
export async function handleOAuthCallback() {
  try {
    console.log('🔄 MaxLab OAuth 콜백 처리 중...');
    
    const user = await oidcClient.signinRedirectCallback();
    
    console.log('✅ MaxLab OAuth 콜백 처리 완료:', {
      userId: user.profile?.sub,
      email: user.profile?.email,
      name: user.profile?.name
    });
    
    return user;
  } catch (error) {
    console.error('❌ MaxLab OAuth 콜백 처리 실패:', error);
    throw new Error(`OAuth 콜백 처리에 실패했습니다: ${error.message}`);
  }
}

/**
 * 현재 인증된 사용자 정보 가져오기
 * @returns {Promise<User|null>} 사용자 정보 또는 null
 */
export async function getCurrentUser() {
  try {
    const user = await oidcClient.getUser();
    return user;
  } catch (error) {
    console.warn('⚠️ 사용자 정보 조회 실패:', error);
    return null;
  }
}

/**
 * OAuth 로그아웃 실행
 * @param {Object} options - 로그아웃 옵션
 * @returns {Promise} 로그아웃 프로미스
 */
export async function startOAuthLogout(options = {}) {
  try {
    console.log('🚪 MaxLab OAuth 로그아웃 시작...');
    
    // ID Token을 포함한 로그아웃
    const user = await oidcClient.getUser();
    const logoutArgs = {
      id_token_hint: user?.id_token,
      ...options
    };
    
    await oidcClient.signoutRedirect(logoutArgs);
  } catch (error) {
    console.error('❌ MaxLab OAuth 로그아웃 실패:', error);
    throw new Error(`OAuth 로그아웃에 실패했습니다: ${error.message}`);
  }
}

/**
 * Silent 인증 (토큰 갱신)
 * @returns {Promise<User|null>} 갱신된 사용자 정보
 */
export async function renewTokenSilently() {
  try {
    console.log('🔇 MaxLab Silent 토큰 갱신 중...');
    
    const user = await oidcClient.signinSilent();
    
    console.log('✅ MaxLab Silent 토큰 갱신 완료');
    return user;
  } catch (error) {
    console.warn('⚠️ MaxLab Silent 토큰 갱신 실패:', error);
    return null;
  }
}

/**
 * 토큰 검증 및 만료 확인
 * @returns {boolean} 토큰 유효성
 */
export async function isTokenValid() {
  try {
    const user = await oidcClient.getUser();
    if (!user || user.expired) {
      return false;
    }
    
    // 만료 5분 전까지를 유효로 간주
    const now = Date.now() / 1000;
    const expiresAt = user.expires_at;
    const buffer = 300; // 5분
    
    return expiresAt > (now + buffer);
  } catch (error) {
    console.warn('⚠️ 토큰 유효성 검사 실패:', error);
    return false;
  }
}

// 이벤트 리스너 등록
oidcClient.events.addUserLoaded((user) => {
  console.log('👤 MaxLab 사용자 로드됨:', user.profile?.name);
});

oidcClient.events.addUserUnloaded(() => {
  console.log('👋 MaxLab 사용자 언로드됨');
});

oidcClient.events.addAccessTokenExpiring(() => {
  console.log('⏰ MaxLab 액세스 토큰 만료 임박 - 자동 갱신 시도');
});

oidcClient.events.addAccessTokenExpired(() => {
  console.log('⚠️ MaxLab 액세스 토큰 만료됨');
});

oidcClient.events.addSilentRenewError((error) => {
  console.error('❌ MaxLab Silent 갱신 실패:', error);
});

export default oidcClient;