# 🔧 OAuth Port Mismatch 문제 해결 가이드

## 🚨 문제 요약

OAuth 서버가 인증 완료 후 `http://localhost:3000/login` (MAX Platform Frontend)으로 리다이렉트하여 cross-origin 통신 문제가 발생합니다.

- **예상**: `http://localhost:3010/oauth/callback` (User's React App)
- **실제**: `http://localhost:3000/login?oauth_return=...` (MAX Platform Frontend)
- **결과**: 팝업이 자동으로 닫히지 않고 인증이 완료되지 않음

## 🎯 근본적인 해결 방법 (권장)

### 1. OAuth 서버 설정 수정

백엔드 OAuth 서버에서 redirect URI 설정을 확인하고 수정해야 합니다:

```python
# backend/app/routers/oauth.py 또는 관련 설정 파일에서

# 현재 (문제가 있는 설정)
OAUTH_REDIRECT_URI = "http://localhost:3000/login"

# 수정 후 (올바른 설정)
OAUTH_REDIRECT_URI = "http://localhost:3010/oauth/callback"

# 또는 환경 변수로 설정
OAUTH_REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:3010/oauth/callback")
```

### 2. OAuth Client 등록 정보 확인

OAuth 서버의 client 등록 정보에서 허용된 redirect URIs를 확인:

```python
# OAuth client 설정에서
allowed_redirect_uris = [
    "http://localhost:3010/oauth/callback",  # 추가 필요
    "http://localhost:3011/oauth/callback",  # 개발 환경
    "http://localhost:3012/oauth/callback",  # 테스트 환경
]
```

## 🩹 임시 해결 방법 (프론트엔드만으로)

백엔드 수정이 어려운 경우, 프론트엔드에서 처리:

### 1. Cross-Origin Recovery 개선 (이미 적용됨)

```typescript
// src/utils/popupOAuth.ts
// 3초 후 cross-origin 감지 시 자동 recovery
// 다양한 storage keys 검사
// 무한 루프 방지 로직 포함
```

### 2. Port 3000 Handler 페이지 추가

MAX Platform Frontend (port 3000)에 OAuth 처리 페이지 추가:

```html
<!-- port 3000에서 제공되어야 함 -->
<!-- /login 경로에 OAuth 파라미터 처리 로직 추가 -->
<script>
if (window.location.search.includes('oauth_return')) {
    // OAuth 데이터를 sessionStorage에 저장
    // BroadcastChannel로 port 3010에 전송
    // 창 자동 닫기
}
</script>
```

### 3. Proxy 설정 사용

개발 환경에서 proxy 설정으로 우회:

```javascript
// vite.config.ts
export default {
  server: {
    proxy: {
      '/api/oauth/callback': {
        target: 'http://localhost:3010',
        changeOrigin: true
      }
    }
  }
}
```

## 📊 문제 진단 방법

### 1. OAuth Redirect 추적

제공된 진단 도구 사용:
- `test-oauth-redirect-investigation-v2.html` 실행
- OAuth 플로우 시작 후 URL 변화 추적
- 최종 redirect URL과 port 확인

### 2. Console 로그 확인

```
🚨 Cross-origin access blocked - possible port mismatch
🔍 OAuth completion detection analysis
🚨 Port 3000 확인됨 - 이것이 문제의 원인!
```

### 3. Network 탭 확인

1. 개발자 도구 > Network 탭
2. OAuth 인증 완료 후 302 Redirect 확인
3. Location 헤더에서 실제 redirect URL 확인

## 🏗️ 시스템 아키텍처

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  React App      │     │  OAuth Server   │     │ MAX Platform    │
│  (Port 3010)    │────▶│  (Port 8000)    │────▶│  (Port 3000)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                        │                        │
        │   1. OAuth Request     │                        │
        │──────────────────────▶│                        │
        │                        │   2. Redirect to       │
        │                        │──────────────────────▶│
        │                        │      (Wrong Port!)     │
        │◀ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
        │   3. Cross-Origin Blocked                       │
```

## ✅ 권장 조치 사항

1. **즉시**: 백엔드 팀에 OAuth redirect URI 수정 요청
2. **단기**: Cross-origin recovery 메커니즘 유지 (이미 구현됨)
3. **장기**: OAuth 서버 설정을 환경 변수로 관리하여 유연성 확보

## 🔍 추가 디버깅

문제가 지속되는 경우:

```bash
# OAuth 서버 로그 확인
tail -f backend/logs/oauth.log | grep redirect_uri

# 현재 OAuth client 설정 확인
python -c "from app.core.oauth import get_client_config; print(get_client_config())"
```

---

이 문서는 OAuth port mismatch 문제의 근본 원인과 해결 방법을 설명합니다.
백엔드에서 redirect URI를 수정하는 것이 가장 확실한 해결책입니다.