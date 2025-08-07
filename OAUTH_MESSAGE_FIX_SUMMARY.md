# OAuth 메시지 구조 수정 요약

## 🎯 핵심 요약

**문제**: max.dwchem.co.kr → maxlab.dwchem.co.kr postMessage 구조 불일치  
**해결**: 인증 서버의 메시지를 표준 구조로 수정

## ❌ 현재 (문제)
```javascript
window.opener.postMessage({
  type: "OAUTH_LOGIN_SUCCESS_CONTINUE",  // 플랫 구조
  oauthParams: {...},
  timestamp: 1234567890
}, "https://maxlab.dwchem.co.kr");
```

## ✅ 수정 필요 (표준)
```javascript
window.opener.postMessage({
  type: "OAUTH_MESSAGE",           // 최상위 타입
  data: {                         // 데이터 캡슐화
    type: "OAUTH_LOGIN_SUCCESS_CONTINUE",
    oauthParams: {...},
    timestamp: 1234567890
  }
}, "https://maxlab.dwchem.co.kr");
```

## 📝 서버팀 작업 내용

1. **위치**: max.dwchem.co.kr OAuth 콜백 페이지
2. **수정**: 모든 postMessage를 위 표준 구조로 변경
3. **테스트**: `test-oauth-message.html` 파일로 검증

## 📌 중요
- **프론트엔드 구조가 표준**입니다
- 서버 측 메시지 구조만 수정하면 해결됩니다
- 백엔드 API는 수정 불필요

## 📁 제공 파일
1. `oauth-message-fix-request.md` - 상세 수정 요청서
2. `test-oauth-message.html` - 테스트 도구
3. `OAUTH_MESSAGE_FIX_SUMMARY.md` - 이 요약 문서