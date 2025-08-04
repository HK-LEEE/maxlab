# OAuth "다른 사용자로 로그인" 문제 근본 원인 분석

## 핵심 문제

MAX Platform (localhost:8000)에 이미 사용자가 로그인되어 있어서, OAuth 서버가 자동으로 해당 사용자로 인증을 진행하려고 합니다.

## 상세 분석

### 1. 현재 동작 방식
```
사용자가 "다른 사용자로 로그인" 클릭
→ Frontend가 prompt=select_account + max_age=0 전송
→ OAuth 서버 (localhost:8000)가 요청 받음
→ 이미 로그인된 세션 발견
→ "User must select an account" 에러 반환 (계정 선택 UI를 보여주는 대신)
```

### 2. 문제가 발생하는 이유

#### 쿠키/세션 공유
- MAX Platform (localhost:8000)과 OAuth 서버가 같은 도메인/포트를 사용
- 브라우저가 자동으로 인증 쿠키를 전송
- OAuth 서버가 기존 세션을 감지하고 자동 로그인 시도

#### Frontend (localhost:3010)의 제한
- Frontend는 다른 포트에서 실행되므로 localhost:8000의 쿠키에 직접 접근 불가
- Cross-origin 정책으로 인해 OAuth 서버의 세션을 직접 삭제할 수 없음

### 3. 현재 구현 상태

#### Frontend (✅ 완료)
- `prompt=select_account`: 계정 선택 요청
- `max_age=0`: 강제 재인증 요청
- 에러 처리 및 사용자 안내

#### OAuth Server (❌ 미구현)
- 현재: 에러 반환 ("User must select an account")
- 필요: 실제 계정 선택 UI 표시

## 해결 방안

### 1. 즉시 가능한 임시 해결책
```bash
# 방법 1: MAX Platform에서 수동 로그아웃
1. 새 탭에서 http://localhost:8000 접속
2. 로그아웃 버튼 클릭
3. Frontend로 돌아와서 "다른 사용자로 로그인" 재시도

# 방법 2: 브라우저 쿠키 삭제
1. 개발자 도구 (F12) 열기
2. Application → Cookies → localhost:8000
3. 모든 쿠키 삭제
4. "다른 사용자로 로그인" 재시도
```

### 2. OAuth 서버 수정 (근본적 해결)

```python
# backend/app/routers/oauth.py

@router.get("/api/oauth/authorize")
async def authorize(..., prompt: Optional[str] = None, max_age: Optional[str] = None):
    current_user = get_current_user_from_session(request)
    
    # prompt=select_account 또는 max_age=0 인 경우
    if prompt == "select_account" or (max_age is not None and int(max_age) == 0):
        if current_user:
            # 현재 세션 삭제
            response.delete_cookie("session_id")
            # 계정 선택 페이지로 리다이렉트
            return RedirectResponse(url=f"/select-account?redirect_to={...}")
        else:
            # 로그인 페이지로 리다이렉트
            return RedirectResponse(url=f"/login?redirect_to={...}")
```

### 3. Frontend 추가 개선 (선택사항)

```typescript
// 로그아웃 도우미 버튼 추가
<button onClick={openMaxPlatformLogout}>
  MAX Platform에서 로그아웃하기
</button>

function openMaxPlatformLogout() {
  window.open('http://localhost:8000/logout', '_blank');
}
```

## 요약

문제의 원인은 MAX Platform (localhost:8000)의 로그인 세션이 OAuth 서버와 공유되어, OAuth 서버가 자동으로 기존 사용자로 인증하려고 하기 때문입니다. 

Frontend는 이미 올바르게 구현되어 있으며, OAuth 서버가 `prompt=select_account` 요청을 받았을 때 계정 선택 UI를 보여주도록 수정되면 문제가 해결됩니다.