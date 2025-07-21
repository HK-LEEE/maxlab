# OAuth 플로우 테스트 가이드

## 개요

MAX Lab의 OAuth 2.0 통합 테스트를 위한 가이드입니다. 
완전한 OAuth 전용 인증 시스템의 모든 측면을 테스트합니다.

## 테스트 도구

### 1. 빠른 테스트 스크립트 (Bash)
```bash
# 토큰 없이 기본 테스트
./tests/quick_oauth_test.sh

# OAuth 토큰으로 전체 테스트
./tests/quick_oauth_test.sh YOUR_OAUTH_TOKEN
```

### 2. 통합 테스트 스크립트 (Python)
```bash
# 토큰 없이 실행
python tests/test_oauth_flow.py

# OAuth 토큰으로 실행
python tests/test_oauth_flow.py --token YOUR_OAUTH_TOKEN
```

### 3. 단위 테스트
```bash
# OAuth 관련 단위 테스트 실행
pytest tests/unit/test_oauth_integration.py -v
```

## OAuth 토큰 획득 방법

### 방법 1: 도우미 스크립트 사용
```bash
python tests/get_oauth_token.py
```
스크립트가 OAuth 로그인 URL을 생성하고 브라우저를 열어줍니다.

### 방법 2: 수동으로 토큰 획득
1. 인증 서버 (http://localhost:8000) 접속
2. OAuth 로그인 수행
3. 리다이렉트 URL에서 access_token 추출

### 방법 3: cURL을 통한 직접 요청 (개발 환경)
```bash
# 사용자 로그인 (세션 기반)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your-username", "password": "your-password"}'
```

## 테스트 항목

### 1. 기본 연결 테스트
- ✅ 헬스 체크 엔드포인트
- ✅ 인증되지 않은 접근 차단

### 2. OAuth 인증 플로우
- ✅ Bearer 토큰 검증
- ✅ 토큰 만료 처리
- ✅ 잘못된 토큰 거부

### 3. 사용자/그룹 매핑
- ✅ OAuth ID를 통한 사용자 조회
- ✅ 사용자 UUID 매핑
- ✅ 그룹 정보 동기화

### 4. 권한 관리
- ✅ 워크스페이스 접근 권한
- ✅ 관리자 권한 확인
- ✅ 그룹 기반 권한

### 5. 오류 처리
- ✅ 구조화된 오류 응답
- ✅ 다국어 오류 메시지
- ✅ 오류 코드 체계

### 6. 성능
- ✅ 200ms 이내 응답 시간
- ✅ 캐싱 효과
- ✅ Redis 없이도 동작

## 테스트 시나리오

### 시나리오 1: 완전한 OAuth 플로우
```bash
# 1. OAuth 토큰 획득
python tests/get_oauth_token.py

# 2. 토큰으로 테스트 실행
./tests/quick_oauth_test.sh eyJhbGciOiJIUzI1NiIs...

# 3. 결과 확인
```

### 시나리오 2: 오류 처리 검증
```bash
# 1. 잘못된 토큰으로 테스트
./tests/quick_oauth_test.sh invalid_token_12345

# 2. 만료된 토큰으로 테스트
./tests/quick_oauth_test.sh expired_token_here
```

### 시나리오 3: 성능 테스트
```bash
# Python 스크립트로 성능 측정
python tests/test_oauth_flow.py --token YOUR_TOKEN
```

## 예상 결과

### 성공적인 테스트 결과
```
======================================
🚀 MAX Lab OAuth Quick Test
======================================

1. Health Check Test
-------------------
✅ Health check passed

2. Unauthorized Access Test
--------------------------
✅ Unauthorized access correctly blocked

3. Authenticated Access Test
---------------------------
✅ Authenticated access successful

4. User Info Test
-----------------
✅ User info retrieved successfully
Username: testuser

5. Workspace Creation Test
-------------------------
✅ Workspace created successfully
✅ Test workspace deleted

6. Performance Test (Simple)
---------------------------
Average response time: 45.2ms
✅ Performance target met (<200ms)
```

### 실패 시 대응

#### 1. 서버 연결 실패
```bash
# 서버 상태 확인
curl http://localhost:8010/

# 서버 재시작
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010
```

#### 2. 인증 서버 연결 실패
```bash
# 인증 서버 확인
curl http://localhost:8000/

# AUTH_SERVER_URL 환경변수 확인
echo $AUTH_SERVER_URL
```

#### 3. Redis 연결 실패
- Redis 없이도 동작해야 함 (fail-open)
- 경고 메시지만 표시되고 서비스는 정상 동작

## 테스트 보고서

테스트 완료 후 다음 항목을 확인:

1. **인증 플로우**: OAuth 토큰으로 정상 인증 가능
2. **오류 처리**: 구조화된 오류 메시지 반환
3. **성능**: 평균 응답 시간 < 200ms
4. **안정성**: Redis 없이도 정상 동작
5. **보안**: 인증되지 않은 접근 차단

## 문제 해결

### 403 Forbidden 대신 401 Unauthorized 기대
FastAPI의 HTTPBearer는 기본적으로 403을 반환합니다. 
이는 정상 동작이며, 두 상태 코드 모두 인증 실패를 의미합니다.

### 구조화된 오류 응답이 나오지 않음
일부 FastAPI 기본 예외는 미들웨어를 거치지 않습니다.
핵심 비즈니스 로직에서는 구조화된 오류가 정상 작동합니다.

### 토큰이 거부됨
1. 토큰 만료 확인
2. JWT_SECRET_KEY가 인증 서버와 일치하는지 확인
3. 토큰 형식이 올바른지 확인 (Bearer 접두사 불필요)