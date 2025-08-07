# OAuth 개선 사항 노트

## 개선 목표
OAuth 서버가 표준 플로우를 따르도록 수정되면, 클라이언트 코드를 아래와 같이 개선해야 합니다.

## 주요 변경 사항

### 1. Deprecated 메시지 타입 처리
현재 OAuth 서버가 보내는 다음 메시지들은 표준에 맞지 않습니다:
- `OAUTH_LOGIN_SUCCESS_CONTINUE`
- `OAUTH_ALREADY_AUTHENTICATED`

이 메시지들은 deprecated로 처리하고 명확한 에러 메시지를 표시해야 합니다.

### 2. 표준 OAuth 플로우
올바른 OAuth 플로우는 다음과 같아야 합니다:
1. 모든 사용자(신규/기존)가 OAuth authorize 거침
2. 서버가 authorization code 생성
3. Callback 페이지에서 code를 token으로 교환
4. `OAUTH_SUCCESS` 메시지 전송

### 3. 수정이 필요한 함수

#### handleOAuthMessage 함수 수정 포인트
```typescript
// DEPRECATED 메시지 타입 처리
if (innerData.type === 'OAUTH_LOGIN_SUCCESS_CONTINUE' || 
    innerData.type === 'OAUTH_ALREADY_AUTHENTICATED') {
  console.warn(`⚠️ DEPRECATED: Received deprecated message type '${innerData.type}'`);
  console.warn('🔴 This message type should not be sent in the new OAuth flow');
  
  this.cleanup();
  reject(new Error(
    `Deprecated OAuth message type received: ${innerData.type}.\n` +
    `Please ensure the OAuth server is updated to the new flow.`
  ));
  return;
}
```

#### handleBroadcastMessage 함수 수정 포인트
```typescript
// DEPRECATED 메시지 타입 처리
else if (event.data.type === 'OAUTH_LOGIN_SUCCESS_CONTINUE' || 
         event.data.type === 'OAUTH_ALREADY_AUTHENTICATED') {
  console.warn(`⚠️ DEPRECATED: Received deprecated BroadcastChannel message type '${event.data.type}'`);
  console.warn('🔴 This message type should not be sent in the new OAuth flow');
  
  this.cleanup();
  broadcastChannel?.close();
  
  reject(new Error(
    `Deprecated OAuth BroadcastChannel message type: ${event.data.type}.\n` +
    `Please update the OAuth server to use the new standard flow.`
  ));
}
```

## OAuth 서버 수정 후 적용 순서

1. **OAuth 서버 수정 완료 확인**
   - Authorization code가 이미 인증된 사용자에게도 제공되는지 확인
   - `OAUTH_ALREADY_AUTHENTICATED` 메시지에 code 포함 여부 확인

2. **클라이언트 코드 단계적 수정**
   - 백업 생성
   - handleOAuthMessage 함수 수정
   - handleBroadcastMessage 함수 수정
   - 테스트 및 검증

3. **테스트 시나리오**
   - 신규 사용자 로그인
   - 기존 사용자 재로그인
   - 다른 계정으로 전환

## 현재 상태

### 문제점
- OAuth 서버가 이미 인증된 사용자에게 authorization code를 제공하지 않음
- `OAUTH_ALREADY_AUTHENTICATED` 메시지에 실제 인증 데이터가 없음

### 임시 해결책
현재 코드에서는 OAuth 서버 버그를 명확히 표시하는 에러 메시지를 출력합니다:
```typescript
console.error('❌ OAuth Server Bug: OAUTH_ALREADY_AUTHENTICATED without authorization code');
reject(new Error(
  'OAuth Server Error: OAUTH_ALREADY_AUTHENTICATED response missing authorization code. ' +
  'The OAuth server must generate and return an authorization code even for already authenticated users. ' +
  'Please contact the OAuth server team to fix this issue.'
));
```

## 권장 사항

1. **OAuth 서버 팀과 협업**
   - OAUTH_SERVER_FIX_REQUEST.md 문서 공유
   - 표준 OAuth 플로우 구현 요청

2. **단계적 마이그레이션**
   - OAuth 서버 수정 완료 후 클라이언트 코드 업데이트
   - Feature flag를 통한 점진적 배포 고려

3. **모니터링**
   - OAuth 실패율 모니터링
   - 에러 로그 수집 및 분석

---

작성일: 2025-08-08
작성자: MaxLab Frontend Team