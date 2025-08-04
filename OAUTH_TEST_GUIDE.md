# OAuth "다른 사용자로 로그인" 테스트 가이드

## 🧪 테스트 목적
"다른 사용자로 로그인" 버튼의 OAuth 플로우가 정상적으로 작동하는지 확인

## 🎯 기대하는 동작
1. "다른 사용자로 로그인" 버튼 클릭
2. 보안 정리 수행 (OAuth 통신 키는 보존)
3. OAuth 팝업 창 열림
4. 인증 서버에서 인증 완료
5. 팝업이 자동으로 닫힘
6. 메인 페이지로 자동 리디렉션

## 📋 테스트 단계

### 1단계: 환경 준비
- 브라우저: Chrome 또는 Firefox (팝업 차단 해제)
- 개발자 도구 콘솔 열기 (F12)
- URL: http://localhost:3010/login

### 2단계: 테스트 실행
1. **로그인 페이지 접속**
   ```
   http://localhost:3010/login
   ```

2. **"다른 사용자로 로그인" 버튼 클릭**
   - 버튼 위치: "MAX Platform으로 로그인" 버튼 아래
   - 모양: 테두리만 있는 파란색 버튼 (Shield 아이콘)

3. **콘솔 로그 확인**
   중요한 로그 메시지들:
   ```
   🔍 OAuth communication keys verification: - 키 보존 확인
   🔍 State contains _force_, trying to find original state... - State 패턴 감지
   ✅ Found matching flow state using original state pattern - State 매칭 성공
   💾 OAuth result pre-stored in sessionStorage - 결과 저장
   🚪 Close attempt - 팝업 닫기 시도
   ```

### 3단계: 결과 확인

#### ✅ 성공 시 예상되는 로그
```
🔥 handleOAuth Login called with forceAccountSelection: true
🔍 OAuth communication keys verification: [...]
🔐 Security cleanup completed, starting fresh OAuth flow...
🎯 OAuth Callback - Popup Mode Processing Started
🔍 State contains _force_, trying to find original state...
✅ Found matching flow state using original state pattern
✅ Updating flow state to use modified state
💾 OAuth result pre-stored in sessionStorage for immediate detection
✅ OAuth success from sessionStorage key: oauth_result
🚪 Close attempt 1...
✅ 로그인이 성공적으로 완료되었습니다!
```

#### ❌ 실패 시 예상되는 로그
```
❌ OAuth State Validation Failed: Flow state not found or expired
❌ All error communication methods failed!
⚠️ No acknowledgment received from parent after 2 seconds
```

### 4단계: 상세 디버깅

만약 문제가 발생한다면, 다음 정보를 확인:

#### SessionStorage 상태 확인
콘솔에서 실행:
```javascript
// OAuth 관련 키 확인
Object.keys(sessionStorage).filter(k => k.includes('oauth'))

// 각 키의 값 확인
Object.keys(sessionStorage)
  .filter(k => k.includes('oauth'))
  .forEach(k => console.log(k, sessionStorage.getItem(k)))
```

#### 네트워크 요청 확인
개발자 도구 Network 탭에서:
- OAuth authorization 요청 (`/api/oauth/authorize`)
- Token exchange 요청 (`/api/oauth/token`)
- User info 요청 (`/api/oauth/userinfo`)

## 🐛 알려진 문제와 해결방법

### 문제 1: 팝업이 차단됨
**증상**: 팝업이 열리지 않음
**해결**: 브라우저 주소창의 팝업 차단 아이콘 클릭 → "항상 허용"

### 문제 2: State 검증 실패
**증상**: "OAuth State Validation Failed" 에러
**해결**: 새로고침 후 다시 시도

### 문제 3: 팝업이 닫히지 않음
**증상**: 인증 완료 후 팝업이 열린 상태로 유지
**해결**: 수동으로 팝업 닫기, 메인 페이지에서 로그인 상태 확인

## 📊 테스트 체크리스트

- [ ] 1. 보안 정리 로그 확인됨
- [ ] 2. OAuth 팝업 정상 열림
- [ ] 3. State 검증 통과
- [ ] 4. 인증 서버 인증 완료
- [ ] 5. SessionStorage에 결과 저장 확인
- [ ] 6. 팝업 자동 닫기 성공
- [ ] 7. 메인 페이지 리디렉션 성공
- [ ] 8. 새로운 사용자 정보로 로그인 완료

## 📞 지원

테스트 중 문제가 발생하면:
1. 콘솔 로그 전체 복사
2. 네트워크 탭 스크린샷
3. SessionStorage 상태 캡처
4. 문제 발생 단계 상세 기록