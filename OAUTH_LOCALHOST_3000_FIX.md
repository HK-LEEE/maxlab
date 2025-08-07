# Production OAuth localhost:3000 리다이렉트 문제 해결 가이드

## 문제 설명
Production 환경에서 "통합 로그인" 또는 "다른 사용자로 로그인" 버튼 클릭 시 `localhost:3000`으로 리다이렉트되는 문제

## 문제 원인

### 1. 프론트엔드 환경 변수 미설정
Production 빌드 시 환경 변수가 올바르게 설정되지 않아 fallback URL 사용

### 2. OAuth 서버 하드코딩
MAX Platform OAuth 서버가 계정 선택 화면 URL을 하드코딩하고 있을 가능성

## 해결 방법

### 1. Production 환경 변수 설정 (즉시 적용 가능)

#### A. 프론트엔드 빌드 시 환경 변수 설정

```bash
# .env.production 파일 생성
cd /home/lee/maxproject/maxlab/frontend
cat > .env.production << EOF
# OAuth 2.0 Settings
VITE_AUTH_SERVER_URL=https://max.dwchem.co.kr
VITE_CLIENT_ID=maxlab
VITE_REDIRECT_URI=https://maxlab.dwchem.co.kr/oauth/callback

# Backend API URL
VITE_API_BASE_URL=https://maxlab.dwchem.co.kr/api
VITE_AUTH_API_URL=https://maxlab.dwchem.co.kr

# Environment
VITE_NODE_ENV=production
VITE_ENABLE_DEBUG_LOGS=false
EOF

# Production 빌드
npm run build

# 빌드된 파일 배포
sudo cp -r dist/* /var/www/maxlab/frontend/dist/
```

#### B. 빌드 후 환경 변수 확인

빌드된 JavaScript 파일에서 환경 변수가 올바르게 치환되었는지 확인:

```bash
# 빌드 파일에서 localhost 참조 확인
grep -r "localhost:8000\|localhost:3000" dist/

# 환경 변수 치환 확인
grep -r "VITE_AUTH_SERVER_URL" dist/
```

### 2. 런타임 환경 변수 설정 (동적 구성)

프론트엔드 코드에 런타임 설정 추가:

#### A. public/config.js 생성

```javascript
// public/config.js - 런타임에 로드되는 설정
window.ENV_CONFIG = {
  AUTH_SERVER_URL: 'https://max.dwchem.co.kr',
  CLIENT_ID: 'maxlab',
  REDIRECT_URI: 'https://maxlab.dwchem.co.kr/oauth/callback',
  API_BASE_URL: 'https://maxlab.dwchem.co.kr/api'
};
```

#### B. index.html에 추가

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 다른 head 태그들 -->
  <script src="/config.js"></script>
</head>
<body>
  <!-- ... -->
</body>
</html>
```

#### C. 코드에서 사용

```typescript
// frontend/src/utils/popupOAuth.ts 수정
constructor() {
  // 런타임 설정 우선, 환경 변수 fallback
  this.authUrl = window.ENV_CONFIG?.AUTH_SERVER_URL || 
                 import.meta.env.VITE_AUTH_SERVER_URL || 
                 'http://localhost:8000';
  
  this.clientId = window.ENV_CONFIG?.CLIENT_ID || 
                  import.meta.env.VITE_CLIENT_ID || 
                  'maxlab';
  
  this.redirectUri = window.ENV_CONFIG?.REDIRECT_URI || 
                     import.meta.env.VITE_REDIRECT_URI || 
                     `${window.location.origin}/oauth/callback`;
}
```

### 3. OAuth 서버 설정 확인 (백엔드 팀 요청 사항)

#### MAX Platform OAuth 서버에서 확인 필요

1. **계정 선택 화면 URL 설정**
   - `prompt=login` 또는 `prompt=select_account` 처리 시 리다이렉트 URL
   - 하드코딩된 `localhost:3000` 참조 제거

2. **Allowed Redirect URIs 확인**
   ```python
   ALLOWED_REDIRECT_URIS = [
       'https://maxlab.dwchem.co.kr/oauth/callback',  # Production
       'http://localhost:3010/oauth/callback',  # Development
       # localhost:3000 제거!
   ]
   ```

3. **OAuth 서버 환경 변수**
   ```bash
   # OAuth 서버 .env
   FRONTEND_URL=https://max.dwchem.co.kr  # localhost:3000 아님!
   MAXLAB_URL=https://maxlab.dwchem.co.kr
   ```

### 4. 임시 해결책 (즉시 적용)

프론트엔드에 리다이렉트 감지 및 수정 로직 추가:

```typescript
// frontend/src/utils/oauthRedirectFix.ts
export function fixOAuthRedirect() {
  // URL에서 localhost:3000 감지
  if (window.location.href.includes('localhost:3000') && 
      window.location.hostname !== 'localhost') {
    
    // Production URL로 치환
    const fixedUrl = window.location.href.replace(
      'http://localhost:3000',
      'https://maxlab.dwchem.co.kr'
    );
    
    // 올바른 URL로 리다이렉트
    window.location.replace(fixedUrl);
  }
}

// App.tsx에서 호출
useEffect(() => {
  fixOAuthRedirect();
}, []);
```

## 테스트 방법

### 1. 환경 변수 확인
```bash
# 빌드된 파일에서 확인
cd /var/www/maxlab/frontend/dist
grep -r "localhost" assets/

# 브라우저 콘솔에서 확인
console.log(import.meta.env.VITE_AUTH_SERVER_URL);
```

### 2. OAuth 플로우 테스트
1. Production 환경 접속: https://maxlab.dwchem.co.kr
2. "다른 사용자로 로그인" 클릭
3. OAuth 팝업 URL 확인 (localhost:3000이 아닌 production URL이어야 함)

### 3. 네트워크 탭 확인
- 브라우저 개발자 도구 > Network 탭
- OAuth authorize 요청의 URL 확인
- redirect_uri 파라미터 확인

## 권장 사항

### 단기 (즉시)
1. ✅ Production 환경 변수 설정 및 재빌드
2. ✅ 런타임 config.js 추가
3. ✅ 임시 리다이렉트 수정 로직 추가

### 장기 (백엔드 팀 협력)
1. ⚠️ OAuth 서버 하드코딩 제거
2. ⚠️ 환경별 설정 분리
3. ⚠️ 계정 선택 화면 동적 URL 처리

## 추가 보안 권장사항

1. **CSP 헤더 설정**
   ```nginx
   add_header Content-Security-Policy "frame-ancestors 'self' https://max.dwchem.co.kr";
   ```

2. **OAuth State 검증 강화**
3. **Redirect URI 화이트리스트 엄격 관리**

## 문의사항
- 프론트엔드 환경 변수 설정: DevOps 팀
- OAuth 서버 설정: 백엔드 팀
- 네트워크 설정: 인프라 팀