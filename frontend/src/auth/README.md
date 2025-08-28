# MaxLab 인증 모듈 (Auth Module)

MAX Platform과의 OAuth/OIDC 통합을 위한 완전한 SSO 클라이언트 구현입니다.

## 주요 기능

- **OAuth 2.0 + OpenID Connect**: PKCE 플로우 지원
- **보안 강화**: 메모리 기반 토큰 저장, 자동 토큰 갱신
- **세션 관리**: Cross-tab 동기화, Silent renewal
- **권한 관리**: 역할 기반 접근 제어 (RBAC)
- **React 통합**: Provider, Hook, 컴포넌트 제공

## 빠른 시작

### 1. 기본 설정

```typescript
import { AuthProvider } from '@/auth';

function App() {
  return (
    <AuthProvider
      config={{
        authServerUrl: 'https://max.dwchem.co.kr',
        clientId: 'maxlab',
        redirectUri: 'https://maxlab.dwchem.co.kr/oauth/callback'
      }}
    >
      <YourAppContent />
    </AuthProvider>
  );
}
```

### 2. 로그인 버튼 사용

```typescript
import { LoginButton } from '@/auth';

function LoginPage() {
  return (
    <div>
      <h1>로그인</h1>
      <LoginButton
        redirectTo="/dashboard"
        showRememberMe
        onLoginSuccess={(user) => {
          console.log('로그인 성공:', user);
        }}
      >
        MAX Platform으로 로그인
      </LoginButton>
    </div>
  );
}
```

### 3. 인증 상태 사용

```typescript
import { useAuth } from '@/auth';

function Dashboard() {
  const { user, isAuthenticated, logout } = useAuth();
  
  if (!isAuthenticated) {
    return <div>로그인이 필요합니다.</div>;
  }
  
  return (
    <div>
      <h1>환영합니다, {user.username}님!</h1>
      <button onClick={() => logout()}>로그아웃</button>
    </div>
  );
}
```

### 4. 라우트 보호

```typescript
import { ProtectedRoute, AdminRoute } from '@/auth';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      
      <Route path="/admin" element={
        <AdminRoute>
          <AdminPanel />
        </AdminRoute>
      } />
    </Routes>
  );
}
```

## 모듈 구조

### 핵심 모듈

- **`pkce.js`**: PKCE 코드 생성 및 관리
- **`oidc-client.js`**: OAuth/OIDC 클라이언트 구현
- **`token-manager.js`**: 보안 토큰 저장 및 관리
- **`session.js`**: 세션 관리 및 SSO 동기화
- **`auth-guard.js`**: 라우트 보호 및 권한 검사

### React 컴포넌트

- **`AuthProvider.tsx`**: 인증 컨텍스트 제공
- **`LoginButton.tsx`**: 로그인 버튼 컴포넌트
- **`LogoutButton.tsx`**: 로그아웃 버튼 컴포넌트
- **`ProtectedRoute.tsx`**: 권한 기반 라우트 보호

## 고급 사용법

### 커스텀 권한 검증

```typescript
<ProtectedRoute
  requiredPermission="authenticated"
  allowedRoles={['admin', 'manager']}
  allowedGroups={['engineering']}
  customValidator={(user) => {
    return user.department === 'IT';
  }}
>
  <SecurePage />
</ProtectedRoute>
```

### 세션 이벤트 처리

```typescript
import { useAuth } from '@/auth';

function App() {
  const auth = useAuth();
  
  useEffect(() => {
    const handleSessionExpired = () => {
      alert('세션이 만료되었습니다.');
    };
    
    window.addEventListener('session:expired', handleSessionExpired);
    
    return () => {
      window.removeEventListener('session:expired', handleSessionExpired);
    };
  }, []);
}
```

### 수동 토큰 갱신

```typescript
import { useAuth } from '@/auth';

function TokenStatus() {
  const { refreshSession, timeToExpiry } = useAuth();
  
  return (
    <div>
      <p>토큰 만료까지: {Math.floor(timeToExpiry / 60)}분</p>
      <button onClick={refreshSession}>
        토큰 새로고침
      </button>
    </div>
  );
}
```

## 보안 고려사항

### 1. 토큰 저장
- 액세스 토큰은 메모리에만 저장 (XSS 보호)
- 리프레시 토큰은 httpOnly 쿠키 권장
- 페이지 새로고침 시 임시 암호화 복구

### 2. CSRF 보호
- State 파라미터를 통한 CSRF 방지
- Nonce를 통한 ID Token replay 공격 방지

### 3. 세션 관리
- Cross-tab 로그아웃 동기화
- 비활성 세션 자동 만료
- Silent renewal을 통한 끊김 없는 인증

## 디버깅

개발 모드에서는 브라우저 콘솔에서 디버깅 함수를 사용할 수 있습니다:

```javascript
// 현재 인증 상태 확인
window.__maxlab_auth_debug.getAuthStatus();

// 상세 디버깅 정보
window.__maxlab_auth_debug.getAuthDebugInfo();
```

## 환경 변수

```bash
# .env 파일에 설정
VITE_AUTH_SERVER_URL=https://max.dwchem.co.kr
VITE_CLIENT_ID=maxlab
```

## 문제 해결

### 자주 발생하는 문제

1. **팝업 차단**: 브라우저 팝업 차단 해제 필요
2. **CORS 오류**: 서버에서 CORS 설정 확인
3. **토큰 만료**: 자동 갱신 설정 확인
4. **Cross-tab 동기화**: BroadcastChannel 지원 확인

### 로그 확인

브라우저 콘솔에서 다음 접두사로 로그 확인:
- `🔐` : 인증 관련 로그
- `🛡️` : 권한 검사 로그
- `🔄` : 토큰 갱신 로그
- `❌` : 오류 로그

## 라이센스

이 모듈은 MaxLab 프로젝트의 일부로 내부 사용을 위해 개발되었습니다.