# OAuth Popup Redirect Fix - MAX Lab

## 🔍 문제 진단

### 증상
1. 사용자가 이미 인증된 상태(`isAuthenticated: true`)에서 OAuth 팝업이 열림
2. 팝업이 authorization code를 얻기 위해 리다이렉트 시도
3. `ECONNABORTED` 에러 발생
4. 인증 상태가 `false`로 변경됨
5. 메인 창이 로그인 페이지로 리다이렉트됨

### 근본 원인
OAuth 팝업이 `https://max.dwchem.co.kr/api/oauth/authorize`로 리다이렉트할 때:
- 팝업 창의 페이지 전환이 발생
- 부모 창의 App.tsx가 이를 에러로 인식
- 인증 초기화 프로세스가 실행되어 인증 상태를 리셋

## ✅ 적용된 수정 사항

### 1. **popupOAuth.ts 수정**
**위치**: `/home/lee/maxproject/maxlab/frontend/src/utils/popupOAuth.ts`

#### 리다이렉트 플래그 추가 (Line 946-969)
```typescript
// 팝업이 리다이렉트 중임을 표시
sessionStorage.setItem('oauth_popup_redirecting', 'true');
sessionStorage.setItem('oauth_popup_redirect_time', Date.now().toString());

// Cross-origin 에러 무시
if (e instanceof DOMException && e.name === 'SecurityError') {
  console.log('🔄 Cross-origin navigation detected (expected during OAuth flow)');
  return; // 에러를 무시하고 계속 대기
}
```

#### Cleanup 메서드 수정 (Line 1216-1218)
```typescript
private cleanup(): void {
  // OAuth 팝업 리다이렉트 플래그 제거
  sessionStorage.removeItem('oauth_popup_redirecting');
  sessionStorage.removeItem('oauth_popup_redirect_time');
  // ... 기존 cleanup 코드
}
```

### 2. **App.tsx 수정**
**위치**: `/home/lee/maxproject/maxlab/frontend/src/App.tsx`

#### 인증 초기화 가드 추가 (Line 317-330)
```typescript
// OAuth 팝업이 리다이렉트 중인지 확인
const oauthRedirecting = sessionStorage.getItem('oauth_popup_redirecting');
const redirectTime = sessionStorage.getItem('oauth_popup_redirect_time');

if (oauthRedirecting === 'true' && redirectTime) {
  const timeSinceRedirect = Date.now() - parseInt(redirectTime);
  // 5초 이내의 리다이렉트면 인증 초기화 건너뛰기
  if (timeSinceRedirect < 5000) {
    console.log('🔄 OAuth popup is currently redirecting, skipping auth initialization');
    return;
  } else {
    // 오래된 플래그 정리
    sessionStorage.removeItem('oauth_popup_redirecting');
    sessionStorage.removeItem('oauth_popup_redirect_time');
  }
}
```

## 🎯 동작 방식

### 수정 전 플로우
```
1. OAuth 팝업 열림
2. 팝업이 authorize URL로 리다이렉트
3. ❌ ECONNABORTED 에러 발생
4. ❌ App.tsx가 인증 상태를 false로 변경
5. ❌ 메인 창이 로그인 페이지로 리다이렉트
```

### 수정 후 플로우
```
1. OAuth 팝업 열림
2. 리다이렉트 플래그 설정
3. 팝업이 authorize URL로 리다이렉트
4. ✅ App.tsx가 플래그 확인하고 초기화 건너뛰기
5. ✅ 팝업이 정상적으로 OAuth 플로우 완료
6. ✅ 인증 성공 후 플래그 제거
```

## 📊 영향 범위

### 수정된 파일
- `/home/lee/maxproject/maxlab/frontend/src/utils/popupOAuth.ts`
- `/home/lee/maxproject/maxlab/frontend/src/App.tsx`

### 개선된 시나리오
- 이미 인증된 사용자의 재로그인
- OAuth 팝업 리다이렉트 중 에러 처리
- Cross-origin 네비게이션 처리

## 🔒 보안 고려사항

1. **플래그 타임아웃**: 5초 후 자동으로 플래그 무효화
2. **Cleanup 보장**: OAuth 완료/실패 시 항상 플래그 제거
3. **Cross-origin 안전**: SecurityError를 적절히 처리

## 🚀 배포

```bash
# 빌드
cd /home/lee/maxproject/maxlab/frontend
npm run build

# 배포
npm run deploy
```

## 📝 테스트 체크리스트

- [ ] 일반 로그인 정상 작동
- [ ] 이미 인증된 상태에서 재로그인
- [ ] OAuth 팝업 닫기 처리
- [ ] 네트워크 오류 시 복구
- [ ] 5초 타임아웃 후 정상 초기화

---

*작성일: 2025-08-07*  
*문제: OAuth 팝업 리다이렉트 시 인증 상태 초기화 문제*  
*해결: 리다이렉트 플래그를 통한 인증 초기화 가드 구현*