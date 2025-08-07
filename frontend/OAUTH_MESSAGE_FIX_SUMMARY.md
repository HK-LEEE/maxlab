# OAuth 서버 긴급 수정 요청

## 문제
OAuth 서버가 이미 인증된 사용자에게 `OAUTH_ALREADY_AUTHENTICATED` 메시지를 보낼 때 **authorization code를 제공하지 않아** 로그인이 실패합니다.

## 현재 서버 응답 (잘못됨)
```json
{
  "type": "OAUTH_ALREADY_AUTHENTICATED",
  "oauthParams": {
    "response_type": "code",  // ❌ 요청 파라미터만 반환
    "client_id": "maxlab",
    "redirect_uri": "...",
    // code가 없음!
  }
}
```

## 필요한 서버 응답 (수정 필요)
```json
{
  "type": "OAUTH_ALREADY_AUTHENTICATED",
  "oauthParams": {
    "code": "abc123xyz",  // ✅ 실제 authorization code 필요
    "state": "..."
  }
}
```

## 수정 코드 (서버 측)
```python
if user_already_authenticated:
    auth_code = generate_authorization_code(user_id, client_id, scope)
    return {
        'type': 'OAUTH_ALREADY_AUTHENTICATED',
        'oauthParams': {
            'code': auth_code,  # 핵심: authorization code 생성 및 전달
            'state': state
        }
    }
```

## 영향
- **현재**: 이미 인증된 사용자는 로그인 불가
- **수정 후**: 모든 사용자 정상 로그인 가능

## 우선순위: 🔴 긴급
프로덕션 환경에서 발생 중인 치명적 버그입니다.