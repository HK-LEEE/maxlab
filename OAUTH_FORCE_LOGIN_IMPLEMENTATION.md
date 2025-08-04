# OAuth 강제 재로그인 구현 가이드

## 현재 문제

OAuth 서버가 `prompt=login` 파라미터를 받았을 때 `login_required` 에러를 반환하고 있습니다.

## 필요한 구현

### OAuth Authorization Endpoint 수정

```python
# backend/app/routers/oauth.py

@router.get("/api/oauth/authorize")
async def authorize(
    request: Request,
    response: Response,  # Response 객체 추가
    response_type: str,
    client_id: str,
    redirect_uri: str,
    scope: str,
    state: str,
    code_challenge: Optional[str] = None,
    code_challenge_method: Optional[str] = None,
    nonce: Optional[str] = None,
    prompt: Optional[str] = None,
    max_age: Optional[str] = None,
    db: Session = Depends(get_db)
):
    # 현재 로그인된 사용자 확인
    current_user = get_current_user_from_session(request, db)
    
    # prompt=login 처리 (강제 재로그인)
    if prompt == "login":
        # 현재 세션이 있어도 무시하고 재로그인 요구
        if current_user:
            # 현재 세션 쿠키 삭제
            response.delete_cookie("session_id")
            response.delete_cookie("session_token")
            
            # 세션 DB에서도 삭제 (선택사항)
            # delete_user_session(current_user.id, db)
        
        # 로그인 페이지로 리다이렉트
        # OAuth 요청 정보를 전달하여 로그인 후 다시 처리할 수 있도록 함
        login_url = f"/login?force_login=true&redirect_to={quote(request.url._url)}"
        return RedirectResponse(url=login_url, status_code=302)
    
    # max_age=0 처리 (재인증 요구)
    if max_age is not None and int(max_age) == 0:
        # prompt=login과 동일하게 처리
        if current_user:
            response.delete_cookie("session_id")
            response.delete_cookie("session_token")
        
        login_url = f"/login?force_login=true&redirect_to={quote(request.url._url)}"
        return RedirectResponse(url=login_url, status_code=302)
    
    # 일반적인 OAuth 플로우
    if not current_user:
        # 로그인되지 않은 경우 로그인 페이지로
        login_url = f"/login?redirect_to={quote(request.url._url)}"
        return RedirectResponse(url=login_url)
    
    # 로그인된 경우 authorization code 생성 및 리다이렉트
    auth_code = generate_authorization_code(
        user_id=current_user.id,
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=scope,
        code_challenge=code_challenge,
        nonce=nonce
    )
    
    # 클라이언트로 리다이렉트
    redirect_url = f"{redirect_uri}?code={auth_code}&state={state}"
    return RedirectResponse(url=redirect_url)
```

### 로그인 페이지 수정

```python
# backend/app/routers/auth.py

@router.get("/login")
async def login_page(
    request: Request,
    redirect_to: Optional[str] = None,
    force_login: Optional[bool] = False
):
    # force_login=true인 경우 특별한 메시지 표시
    if force_login:
        return templates.TemplateResponse(
            "login.html",
            {
                "request": request,
                "redirect_to": redirect_to,
                "message": "다른 계정으로 로그인하려면 이메일과 비밀번호를 입력하세요.",
                "force_login": True
            }
        )
    
    # 일반 로그인 페이지
    return templates.TemplateResponse(
        "login.html",
        {
            "request": request,
            "redirect_to": redirect_to
        }
    )
```

## 중요 포인트

1. **에러를 반환하지 말고 로그인 페이지로 리다이렉트**
   - `login_required` 에러 대신 실제 로그인 페이지로 이동

2. **세션 쿠키 삭제**
   - 현재 로그인된 사용자의 세션을 무효화

3. **리다이렉트 URL 보존**
   - OAuth 요청 전체 URL을 보존하여 로그인 후 다시 처리

4. **Response 객체 사용**
   - 쿠키를 삭제하려면 Response 객체가 필요함

## 테스트 방법

1. 이미 로그인된 상태에서 "다른 사용자로 로그인" 클릭
2. OAuth 서버가 세션을 삭제하고 로그인 페이지로 리다이렉트
3. 새로운 계정으로 로그인
4. OAuth 플로우가 정상적으로 완료되어 프론트엔드로 돌아옴