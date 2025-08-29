# MaxLab OAuth Configuration

## OAuth Server 재구조화 대응

MAX Platform OAuth Server가 `maxplatform/oauth-server/` 위치로 재구조화되었습니다.

### 주요 변경사항

#### 1. Endpoints 경로 변경
- **기존**: `/api/oauth/*`
- **신규**: `/auth/*`

#### 2. 지원하는 OAuth 2.0 기능
- Authorization Code Flow with PKCE
- Refresh Token 지원
- OIDC (OpenID Connect) 완전 지원
- Token Revocation
- Discovery Document

## 파일 구조

```
src/auth/
├── oidc-client.js         # OIDC 클라이언트 설정 (PKCE 지원)
├── oauth-test-config.js   # OAuth 테스트 설정 및 도구
└── README.md             # 이 파일
```

## 환경 설정

### 개발 환경 (.env.development)
```env
VITE_AUTH_SERVER_URL=https://max.dwchem.co.kr
VITE_CLIENT_ID=maxlab
VITE_REDIRECT_URI=http://localhost:3010/oauth/callback

# 새 OAuth Server endpoints
VITE_OAUTH_AUTHORIZE_URL=https://max.dwchem.co.kr/auth/authorize
VITE_OAUTH_TOKEN_URL=https://max.dwchem.co.kr/auth/token
VITE_OAUTH_USERINFO_URL=https://max.dwchem.co.kr/auth/userinfo
VITE_OAUTH_LOGOUT_URL=https://max.dwchem.co.kr/auth/logout
```

### 운영 환경 (.env.production)
```env
VITE_AUTH_SERVER_URL=https://max.dwchem.co.kr
VITE_CLIENT_ID=maxlab
VITE_REDIRECT_URI=https://maxlab.dwchem.co.kr/oauth/callback

# 새 OAuth Server endpoints
VITE_OAUTH_AUTHORIZE_URL=https://max.dwchem.co.kr/auth/authorize
VITE_OAUTH_TOKEN_URL=https://max.dwchem.co.kr/auth/token
VITE_OAUTH_USERINFO_URL=https://max.dwchem.co.kr/auth/userinfo
VITE_OAUTH_LOGOUT_URL=https://max.dwchem.co.kr/auth/logout
```

## 사용법

### 1. 기본 OIDC 클라이언트 사용
```javascript
import { oidcClient, startOAuthLogin, handleOAuthCallback } from './auth/oidc-client.js';

// OAuth 로그인 시작
await startOAuthLogin();

// OAuth 콜백 처리
const user = await handleOAuthCallback();
```

### 2. OAuth 테스트 도구 사용
```javascript
import { testCompleteOAuthFlow } from './auth/oauth-test-config.js';

// 개발 환경에서 OAuth flow 전체 테스트
const result = await testCompleteOAuthFlow('development');

// 브라우저 개발자 도구에서 테스트
window.maxlabOAuthTest.testCompleteOAuthFlow('development');
```

## OAuth Client 설정 (maxplatform/oauth-server/)

MaxLab 클라이언트는 다음과 같이 설정되어 있습니다:

```javascript
{
  client_id: 'maxlab',
  client_secret: process.env.MAXLAB_CLIENT_SECRET,
  
  redirect_uris: [
    // 운영
    'https://maxlab.dwchem.co.kr/oauth/callback',
    // 개발
    'http://localhost:3010/oauth/callback',
    'http://localhost:3001/oauth/callback' // 하위호환성
  ],
  
  scope: 'openid profile email groups read:profile manage:experiments manage:workspaces',
  
  // PKCE 지원
  code_challenge_method: 'S256',
  token_endpoint_auth_method: 'client_secret_post'
}
```

## PKCE (Proof Key for Code Exchange)

보안 강화를 위해 PKCE를 지원합니다:

- **Code Challenge Method**: S256 (SHA256)
- **자동 생성**: Code Verifier 및 Code Challenge 자동 생성
- **검증**: Token exchange 시 자동 검증

## 토큰 관리

### Access Token
- **유효기간**: 24시간
- **자동 갱신**: Refresh Token을 통한 자동 갱신 지원
- **저장위치**: LocalStorage (암호화 권장)

### Refresh Token
- **유효기간**: 7일
- **로테이션**: 보안 강화를 위한 토큰 로테이션 지원
- **저장위치**: HttpOnly Cookie (권장) 또는 SecureStorage

## 디버깅

### 1. Discovery Document 확인
```javascript
await window.maxlabOAuthTest.testDiscoveryDocument('development');
```

### 2. 전체 OAuth Flow 테스트
```javascript
const result = await window.maxlabOAuthTest.testCompleteOAuthFlow('development');
console.log('OAuth Flow 테스트 결과:', result);
```

### 3. 개발자 도구 네트워크 탭
OAuth 요청/응답을 모니터링하여 문제 진단:
- Authorization 요청
- Token Exchange
- UserInfo 조회
- Token Revocation

## 문제 해결

### 일반적인 오류

1. **Invalid Redirect URI**
   - `.env` 파일의 `VITE_REDIRECT_URI` 확인
   - OAuth Server의 클라이언트 설정 확인

2. **Invalid Client**
   - `VITE_CLIENT_ID` 확인
   - OAuth Server에서 클라이언트 등록 상태 확인

3. **PKCE Validation Failed**
   - Code Verifier/Challenge 생성 로직 확인
   - 브라우저 세션 스토리지 상태 확인

4. **Token Exchange Failed**
   - Authorization Code 유효성 확인
   - State 값 일치 여부 확인
   - Network 요청 로그 분석

### 로그 활성화

개발 환경에서 상세한 로그를 보려면:
```javascript
import { Log } from 'oidc-client-ts';

Log.setLogger(console);
Log.setLevel(Log.DEBUG);
```

## 보안 고려사항

1. **HTTPS 강제**: 운영 환경에서는 반드시 HTTPS 사용
2. **State 검증**: CSRF 공격 방지를 위한 State 파라미터 검증
3. **Nonce 검증**: OIDC ID Token의 Replay 공격 방지
4. **Token 저장**: 민감한 토큰은 안전한 저장소 사용
5. **PKCE 사용**: 공개 클라이언트의 보안 강화

## 업데이트 노트

### v2025.1.0 (OAuth Server 재구조화)
- OAuth Server 경로 `/api/oauth/*` → `/auth/*` 변경
- PKCE 완전 지원 추가
- 개발 포트 3010 지원 추가
- Discovery Document 자동 감지 개선
- 테스트 도구 추가