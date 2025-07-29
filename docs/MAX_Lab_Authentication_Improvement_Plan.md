# MAX Lab 인증 시스템 개선 계획

## 요약

MAX Lab 플랫폼의 현재 OAuth 2.0 인증 시스템을 MAX Platform OIDC & OAuth 2.0 표준에 맞춰 개선하는 계획서입니다. 주요 목표는 OpenID Connect 지원 추가, 보안 강화, 표준 준수성 향상입니다.

## 현재 상태 분석

### 구현된 기능 ✅
1. **OAuth 2.0 Authorization Code Flow with PKCE**
   - 팝업 기반 인증 플로우
   - PKCE를 통한 보안 강화
   - State 파라미터 검증

2. **토큰 관리**
   - Access Token / Refresh Token 발급 및 관리
   - Refresh Token 암호화 저장
   - Token Blacklist 구현
   - 자동 토큰 갱신 메커니즘

3. **보안 기능**
   - Circuit Breaker 패턴 (OAuth 서버 장애 대응)
   - CSRF Protection
   - Rate Limiting
   - Session Management
   - Admin Override 설정

### 미구현 기능 ❌
1. **OpenID Connect (OIDC)**
   - ID Token 미지원
   - Discovery Endpoint 없음
   - JWKS Endpoint 없음
   - Nonce 검증 없음

2. **표준 준수**
   - OIDC 표준 스코프 미지원 (openid, profile, email 등)
   - 표준 Claims 미지원
   - RS256 서명 미사용 (현재 HS256 사용)

3. **고급 기능**
   - Token Revocation 부분 구현
   - Hybrid Flow 미지원
   - UserInfo Endpoint 표준화 필요

## 개선 계획

### Phase 1: OIDC 기본 지원 (우선순위: 높음)

#### 1.1 OIDC 스코프 및 ID Token 지원
**구현 내용**:
- `openid` 스코프 인식 및 처리
- ID Token 요청 및 처리 로직 추가
- ID Token 검증 구현

**변경 파일**:
- `frontend/src/utils/popupOAuth.ts`: openid 스코프 추가
- `frontend/src/services/authService.ts`: ID Token 처리
- `backend/app/core/security.py`: ID Token 검증 로직

**예상 작업량**: 2-3일

#### 1.2 Nonce 검증 구현
**구현 내용**:
- 프론트엔드에서 nonce 생성 및 전송
- ID Token의 nonce claim 검증
- 재생 공격 방지

**변경 파일**:
- `frontend/src/utils/popupOAuth.ts`: nonce 생성 및 저장
- `frontend/src/pages/OAuthCallback.tsx`: nonce 검증
- `frontend/src/services/authService.ts`: nonce 관리

**예상 작업량**: 1일

#### 1.3 표준 Claims 매핑
**구현 내용**:
- MAX Platform의 사용자 정보를 OIDC 표준 claims로 매핑
- `sub`, `name`, `email`, `email_verified` 등 지원

**변경 파일**:
- `backend/app/core/security.py`: Claims 매핑 로직
- `frontend/src/types/auth.ts`: 타입 정의 업데이트

**예상 작업량**: 1일

### Phase 2: Discovery 및 JWKS 지원 (우선순위: 중간)

#### 2.1 Discovery Endpoint 프록시
**구현 내용**:
- MAX Platform의 Discovery 정보 프록시
- 클라이언트 자동 구성 지원

**새 파일**:
- `backend/app/routers/oidc_discovery.py`

**예상 작업량**: 1일

#### 2.2 JWKS Endpoint 활용
**구현 내용**:
- MAX Platform의 JWKS 정보 활용
- RS256 서명 검증 준비

**변경 파일**:
- `backend/app/core/security.py`: JWKS 기반 검증 추가

**예상 작업량**: 2일

### Phase 3: 보안 강화 (우선순위: 높음)

#### 3.1 RS256 서명 지원
**구현 내용**:
- ID Token의 RS256 서명 검증
- 키 로테이션 지원

**변경 파일**:
- `backend/app/core/security.py`: RS256 검증 로직
- `backend/requirements.txt`: cryptography 라이브러리 추가

**예상 작업량**: 2일

#### 3.2 Token Revocation 완전 구현
**구현 내용**:
- `/api/oauth/revoke` 엔드포인트 완성
- Access Token과 Refresh Token 모두 취소 지원

**변경 파일**:
- `backend/app/routers/oauth.py`: Revocation 로직 완성
- `frontend/src/services/authService.ts`: Logout 시 토큰 취소

**예상 작업량**: 1일

### Phase 4: 사용자 경험 개선 (우선순위: 낮음)

#### 4.1 Silent Authentication 개선
**구현 내용**:
- OIDC prompt 파라미터 활용
- SSO 경험 향상

**변경 파일**:
- `frontend/src/utils/silentAuth.ts`: prompt=none 지원

**예상 작업량**: 1일

#### 4.2 에러 처리 표준화
**구현 내용**:
- OIDC 표준 에러 응답 처리
- 사용자 친화적 에러 메시지

**변경 파일**:
- `frontend/src/services/authService.ts`: 에러 처리 개선
- `backend/app/core/exceptions.py`: OIDC 에러 추가

**예상 작업량**: 1일

## 구현 우선순위

### 즉시 구현 (1주일 내)
1. **OIDC 기본 지원** (Phase 1)
   - openid 스코프 지원
   - ID Token 처리
   - Nonce 검증
   - 표준 Claims 매핑

2. **핵심 보안 강화** (Phase 3.1, 3.2)
   - RS256 서명 지원
   - Token Revocation 완성

### 단기 구현 (2-3주)
1. **Discovery/JWKS 지원** (Phase 2)
   - 자동 구성 지원
   - 키 로테이션 대비

### 장기 구현 (1개월 이후)
1. **사용자 경험 개선** (Phase 4)
   - Silent Authentication 개선
   - 에러 처리 표준화

## 하위 호환성 유지

### 원칙
1. 기존 OAuth 2.0 전용 클라이언트는 변경 없이 작동
2. OIDC는 opt-in 방식으로 제공 (openid 스코프 요청 시에만 활성화)
3. 기존 토큰 형식 유지

### 마이그레이션 전략
```javascript
// 기존 코드 (계속 작동)
const scopes = ['read:profile', 'read:groups'];

// OIDC 지원 코드 (새로운 기능)
const scopes = ['openid', 'profile', 'email', 'read:profile', 'read:groups'];
```

## 테스트 계획

### 단위 테스트
- ID Token 검증 로직
- Nonce 생성 및 검증
- Claims 매핑

### 통합 테스트
- 전체 OIDC 플로우
- 기존 OAuth 2.0 플로우 호환성
- 에러 시나리오

### 보안 테스트
- Nonce 재사용 방지
- 토큰 위변조 방지
- CSRF 공격 방지

## 위험 요소 및 대응

### 위험 1: MAX Platform 서버 의존성
- **설명**: 외부 인증 서버에 대한 강한 의존성
- **대응**: Circuit Breaker 패턴 강화, 캐싱 전략 개선

### 위험 2: 하위 호환성 깨짐
- **설명**: 기존 클라이언트 영향
- **대응**: 철저한 테스트, 단계적 롤아웃

### 위험 3: 성능 저하
- **설명**: 추가 검증으로 인한 지연
- **대응**: 비동기 처리, 캐싱 최적화

## 성공 지표

1. **기능적 지표**
   - OIDC 플로우 성공률 > 99%
   - ID Token 검증 성공률 > 99.9%
   - 기존 OAuth 2.0 플로우 영향 없음

2. **성능 지표**
   - 인증 응답 시간 < 200ms 유지
   - ID Token 검증 시간 < 50ms

3. **보안 지표**
   - Nonce 재사용 공격 0건
   - 토큰 위변조 시도 차단률 100%

## 결론

MAX Lab의 인증 시스템을 MAX Platform 표준에 맞춰 개선하면 다음과 같은 이점을 얻을 수 있습니다:

1. **표준 준수**: OpenID Connect 표준 지원으로 상호 운용성 향상
2. **보안 강화**: RS256 서명, Nonce 검증 등으로 보안 수준 향상
3. **개발자 경험**: Discovery를 통한 자동 구성, 표준화된 에러 처리
4. **확장성**: 향후 다른 OIDC 기능 추가 용이

구현은 단계적으로 진행하며, 각 단계마다 철저한 테스트를 통해 안정성을 확보할 예정입니다.