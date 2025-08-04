# OAuth Account Selection Implementation Guide

## 문제 상황

OAuth 서버가 `prompt=select_account` 파라미터를 받았을 때 "Account selection required" 에러를 반환하고 있습니다. 실제로 계정 선택 화면을 보여주도록 구현이 필요합니다.

## 프론트엔드 현재 상태

프론트엔드는 이미 "Account selection required" 에러를 처리할 준비가 완료되었습니다:

1. **popupOAuth.ts**: 에러 감지 및 사용자 친화적 메시지 표시
2. **OAuthCallback.tsx**: OAuth 콜백에서 에러 처리 및 팝업 통신
3. **Login.tsx**: 에러 발생 시 토스트 메시지로 안내

현재 "다른 사용자로 로그인" 버튼을 누르면:
- `prompt=select_account` + `max_age=0` 파라미터가 전송됨
- OAuth 서버가 "Account selection required" 에러를 반환함
- 프론트엔드가 에러를 감지하고 사용자에게 안내 메시지를 표시함

## 백엔드 구현 가이드

### 1. OAuth Authorization Endpoint 수정

```python
# backend/app/routers/oauth.py

@router.get("/api/oauth/authorize")
async def authorize(
    request: Request,
    response_type: str,
    client_id: str,
    redirect_uri: str,
    scope: str,
    state: str,
    code_challenge: Optional[str] = None,
    code_challenge_method: Optional[str] = None,
    nonce: Optional[str] = None,
    prompt: Optional[str] = None,  # NEW: Handle prompt parameter
    max_age: Optional[str] = None,  # NEW: Handle max_age parameter
    db: Session = Depends(get_db)
):
    # Check if user is already authenticated
    current_user = get_current_user_from_session(request)
    
    # Handle prompt=login (강제 재로그인)
    if prompt == "login" or (max_age is not None and int(max_age) == 0):
        # Force re-authentication even if user is logged in
        if current_user:
            # Clear current session
            response.delete_cookie("session_id")
            # Redirect to login page with special flag
            login_url = f"/login?prompt=login&redirect_to={quote(request.url.path + '?' + request.url.query)}"
            return RedirectResponse(url=login_url)
        else:
            # User not logged in, show login page
            login_url = f"/login?redirect_to={quote(request.url.path + '?' + request.url.query)}"
            return RedirectResponse(url=login_url)
    
    # Normal flow - if user is authenticated, proceed with authorization
    if current_user:
        # Generate authorization code and redirect
        auth_code = generate_authorization_code(
            user_id=current_user.id,
            client_id=client_id,
            redirect_uri=redirect_uri,
            scope=scope,
            code_challenge=code_challenge,
            nonce=nonce
        )
        
        # Redirect back to client with authorization code
        redirect_url = f"{redirect_uri}?code={auth_code}&state={state}"
        return RedirectResponse(url=redirect_url)
    else:
        # User not authenticated, redirect to login
        login_url = f"/login?redirect_to={quote(request.url.path + '?' + request.url.query)}"
        return RedirectResponse(url=login_url)
```

### 2. Login Page 수정

```python
# backend/app/routers/auth.py

@router.get("/login")
async def login_page(
    request: Request,
    redirect_to: Optional[str] = None,
    prompt: Optional[str] = None  # NEW: Handle prompt from OAuth
):
    # If prompt=select_account, show account selection UI
    if prompt == "select_account":
        return templates.TemplateResponse(
            "select_account.html",
            {
                "request": request,
                "redirect_to": redirect_to,
                "show_current_user": True,  # Show currently logged in user
                "allow_different_user": True  # Allow login as different user
            }
        )
    
    # Normal login page
    return templates.TemplateResponse(
        "login.html",
        {
            "request": request,
            "redirect_to": redirect_to
        }
    )
```

### 3. Account Selection Template

```html
<!-- backend/templates/select_account.html -->
<!DOCTYPE html>
<html>
<head>
    <title>계정 선택 - MAX Platform</title>
    <style>
        .account-selector {
            max-width: 400px;
            margin: 50px auto;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
        }
        .current-account {
            padding: 15px;
            margin: 10px 0;
            border: 1px solid #007bff;
            border-radius: 4px;
            cursor: pointer;
        }
        .different-account {
            padding: 15px;
            margin: 10px 0;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="account-selector">
        <h2>계정 선택</h2>
        
        {% if current_user %}
        <div class="current-account" onclick="selectCurrentAccount()">
            <strong>{{ current_user.email }}</strong>로 계속
            <br>
            <small>{{ current_user.name }}</small>
        </div>
        {% endif %}
        
        <div class="different-account" onclick="loginDifferentAccount()">
            다른 계정으로 로그인
        </div>
    </div>
    
    <script>
        function selectCurrentAccount() {
            // Continue with current account
            window.location.href = "{{ redirect_to }}";
        }
        
        function loginDifferentAccount() {
            // Clear session and show login form
            fetch('/api/auth/logout', { method: 'POST' })
                .then(() => {
                    window.location.href = "/login?redirect_to={{ redirect_to }}";
                });
        }
    </script>
</body>
</html>
```

### 4. OAuth Callback에서 에러 처리 개선

```python
# backend/app/routers/oauth.py

@router.get("/api/oauth/authorize")
async def authorize(...):
    # ... existing code ...
    
    # Instead of returning error, handle the flow properly
    if prompt == "select_account":
        # Don't return error, show account selection
        # Remove this:
        # return JSONResponse(
        #     status_code=400,
        #     content={"error": "Account selection required"}
        # )
        
        # Add proper handling as shown above
```

## 프론트엔드 대응

현재 프론트엔드는 이미 에러를 처리하도록 수정되었습니다. 백엔드가 제대로 구현되면:

1. `prompt=select_account` 파라미터와 함께 OAuth 요청
2. OAuth 서버가 계정 선택 화면 표시
3. 사용자가 계정 선택 또는 다른 계정으로 로그인
4. 정상적인 OAuth 플로우 진행

## 임시 해결책 (백엔드 수정 전)

백엔드 수정이 완료되기 전까지는:

1. 사용자에게 수동으로 로그아웃 후 재로그인 안내
2. MAX Platform에 직접 접속하여 로그아웃
3. 브라우저 쿠키 삭제

## 테스트 시나리오

1. **일반 로그인**: 로그인되지 않은 상태에서 로그인
2. **다른 사용자로 로그인**: 이미 로그인된 상태에서 다른 계정으로 전환
3. **동일 사용자 재인증**: 이미 로그인된 사용자가 다시 인증

## 보안 고려사항

- `prompt=select_account`는 현재 세션을 무시하고 재인증을 강제해야 함
- CSRF 토큰 검증 필수
- Redirect URI 검증 필수
- State 파라미터 검증 필수