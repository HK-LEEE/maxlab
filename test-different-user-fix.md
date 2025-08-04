# 다른 사용자 로그인 수정 사항 테스트

## 🔧 구현된 수정 사항

### 1. AuthService 완전한 세션 정리 (authService.ts:39-82)
**다른 사용자 로그인 시 기존 세션 완전 정리:**
- ✅ Refresh tokens 정리
- ✅ User isolated tokens 정리  
- ✅ LocalStorage 사용자 데이터 정리
- ✅ Auth store 강제 로그아웃
- ✅ 다른 탭에 로그아웃 브로드캐스트

### 2. PopupOAuth 상태 정리 (popupOAuth.ts:86-121)
**OAuth 상태 완전 초기화:**
- ✅ 기존 팝업 강제 종료
- ✅ OAuth SessionStorage 완전 정리
- ✅ BroadcastChannel 정리 신호 전송
- ✅ 내부 상태 초기화

## 🧪 테스트 방법

### 테스트 시나리오
1. **기존 사용자로 로그인** (`MAX Platform으로 로그인`)
2. **로그아웃하지 않고** `다른 사용자로 로그인` 클릭
3. **인증 서버에서 다른 계정으로 인증**
4. **결과 확인**: 팝업 자동 닫기 + 메인페이지 이동

### 예상되는 로그 메시지
```
🔐 Starting popup OAuth login (force account selection: true)...
🧹 Performing complete session cleanup for different user login...
✅ Cleared refresh tokens
✅ Cleared user isolated tokens
✅ Cleared localStorage user data
✅ Forced auth store logout
✅ Broadcasted logout to other tabs
✅ Complete session cleanup finished for different user login
🧹 Performing complete OAuth state cleanup for different user login...
🚪 Closing existing popup
🗑️ Cleared OAuth sessionStorage keys: [...]
✅ Complete OAuth state cleanup finished
```

## 🎯 핵심 개선사항

### 기존 문제
- 기존 세션 데이터가 새로운 OAuth 플로우와 충돌
- OAuth State Manager가 기존 상태와 새로운 `_force_` 상태를 혼동
- 팝업 통신에서 기존 데이터와 새로운 데이터가 경합

### 해결 방법
- **완전한 세션 정리**: 다른 사용자 로그인 전 모든 기존 상태 제거
- **통신 경합 방지**: OAuth 관련 모든 SessionStorage 키 사전 정리
- **상태 동기화**: Auth store와 토큰 스토리지 일관성 보장

## 🔍 디버깅 도구

### 콘솔에서 실행 가능한 확인 명령어
```javascript
// 1. 현재 세션 상태 확인
console.log('Auth Store:', window.__authStore || 'Not available');
console.log('LocalStorage tokens:', localStorage.getItem('accessToken'));
console.log('User data:', localStorage.getItem('user'));

// 2. OAuth 관련 SessionStorage 확인
Object.keys(sessionStorage).filter(k => k.includes('oauth'))

// 3. 정리 후 상태 확인
console.log('Clean state check:', {
  localStorage: Object.keys(localStorage),
  sessionStorage: Object.keys(sessionStorage).filter(k => k.includes('oauth')),
  authStore: window.__authStore?.getState?.()
});
```

## ✅ 성공 기준

1. **✅ 완전한 세션 정리**: 기존 사용자 데이터 모든 정리
2. **✅ OAuth 상태 초기화**: 모든 OAuth 관련 키 정리  
3. **✅ 팝업 정상 동작**: 인증 후 자동 닫기
4. **✅ 메인페이지 이동**: 새로운 사용자로 자동 로그인
5. **✅ 상태 일관성**: 모든 스토리지와 스토어 동기화

이제 실제 테스트를 진행해주세요!