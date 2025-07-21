# MAX Lab 환경 설정 가이드

## 개요

MAX Lab은 개발(development), 스테이징(staging), 운영(production) 환경별로 최적화된 설정을 제공합니다. 
환경별 설정은 자동으로 적용되며, 필요시 개별 설정을 재정의할 수 있습니다.

## 환경 구분

### 1. Development (개발)
- **목적**: 로컬 개발 및 디버깅
- **특징**:
  - SSL 비활성화
  - 상세한 로깅 (DEBUG 레벨)
  - 넓은 CORS 허용
  - 에러 상세 정보 표시
  - 자동 리로드 활성화

### 2. Staging (스테이징)
- **목적**: 운영 환경 테스트
- **특징**:
  - SSL 선호 모드
  - 정보 수준 로깅 (INFO 레벨)
  - 제한된 CORS 설정
  - 에러 상세 정보 숨김
  - 운영과 유사한 성능 설정

### 3. Production (운영)
- **목적**: 실제 서비스 운영
- **특징**:
  - SSL 필수
  - 최소 로깅 (WARNING 레벨)
  - 엄격한 CORS 설정
  - 에러 상세 정보 완전 숨김
  - 최적화된 성능 설정

## 환경별 기본 설정

### 데이터베이스 설정
| 설정 | Development | Staging | Production |
|------|-------------|---------|------------|
| SSL Mode | disable | prefer | require |
| Pool Size | 5 | 10 | 20 |
| Max Overflow | 10 | 20 | 40 |
| Echo SQL | true | false | false |

### 보안 설정
| 설정 | Development | Staging | Production |
|------|-------------|---------|------------|
| Cookie Secure | false | true | true |
| Cookie SameSite | lax | strict | strict |
| Rate Limit Fail Open | true | true | false |

### 세션 설정
| 설정 | Development | Staging | Production |
|------|-------------|---------|------------|
| Session Lifetime | 1시간 | 1시간 | 30분 |
| Remember Me | 30일 | 7일 | 7일 |

## 환경 설정 파일

### 1. 기본 환경 파일
- `.env` - 현재 활성 환경 설정
- `.env.development` - 개발 환경 설정
- `.env.staging.template` - 스테이징 환경 템플릿
- `.env.production.template` - 운영 환경 템플릿

### 2. 환경 변수 우선순위
1. 시스템 환경 변수
2. `.env` 파일
3. 환경별 기본값 (`env_config.py`)

## 환경 관리 스크립트 사용법

### 현재 환경 확인
```bash
python scripts/manage_env.py current
```

### 환경 전환
```bash
# 개발 환경으로 전환
python scripts/manage_env.py switch development

# 스테이징 환경으로 전환
python scripts/manage_env.py switch staging

# 운영 환경으로 전환
python scripts/manage_env.py switch production
```

### 비밀키 생성
```bash
python scripts/manage_env.py generate-keys
```

### 환경 파일 검증
```bash
# 현재 .env 파일 검증
python scripts/manage_env.py validate

# 특정 환경 파일 검증
python scripts/manage_env.py validate --env production
```

## 환경별 설정 재정의

### 1. 환경 변수로 재정의
```bash
# 데이터베이스 설정 재정의
export DB_SSL_MODE=require
export DB_POOL_SIZE=30

# 로깅 설정 재정의
export LOG_LEVEL=DEBUG
export LOG_FORMAT=json

# CORS 설정 재정의 (쉼표로 구분)
export CORS_ALLOW_ORIGINS=https://app1.com,https://app2.com
```

### 2. .env 파일에서 재정의
```env
# 개별 설정 재정의
DB_SSL_MODE=verify-full
LOG_LEVEL=INFO
SESSION_LIFETIME_SECONDS=1800
```

## 운영 환경 배포 체크리스트

### 1. 환경 파일 준비
- [ ] `.env.production.template`을 `.env`로 복사
- [ ] 모든 `CHANGE_THIS` 플레이스홀더 값 변경
- [ ] 데이터베이스 연결 정보 설정
- [ ] 외부 서비스 URL 설정

### 2. 비밀키 생성 및 설정
- [ ] `SECRET_KEY` 생성 및 설정
- [ ] `JWT_SECRET_KEY` 생성 및 설정
- [ ] `CSRF_SECRET_KEY` 생성 및 설정
- [ ] `SESSION_SECRET_KEY` 생성 및 설정
- [ ] `ENCRYPTION_KEY` 생성 및 설정 (32바이트 base64)

### 3. SSL/TLS 설정
- [ ] 데이터베이스 SSL 인증서 준비
- [ ] `DB_SSL_MODE=require` 또는 `verify-full` 설정
- [ ] SSL 인증서 경로 설정 (필요시)

### 4. CORS 설정
- [ ] 운영 도메인만 `CORS_ALLOW_ORIGINS`에 추가
- [ ] 와일드카드(*) 사용 금지

### 5. 검증
- [ ] `python scripts/manage_env.py validate --env production` 실행
- [ ] 모든 필수 환경 변수 확인
- [ ] 플레이스홀더 값이 없는지 확인
- [ ] 운영 환경 보안 설정 확인

## 주의사항

### 1. 보안
- 운영 환경에서는 절대 기본값이나 개발용 비밀키를 사용하지 마세요
- `.env` 파일은 절대 Git에 커밋하지 마세요
- 환경별로 다른 비밀키를 사용하세요

### 2. 성능
- 운영 환경에서는 `DEBUG=false` 확인
- 적절한 데이터베이스 풀 크기 설정
- Redis 연결 상태 모니터링

### 3. 모니터링
- 로그 레벨이 환경에 맞게 설정되었는지 확인
- 운영 환경에서는 JSON 포맷 로깅 권장
- 에러 추적 시스템과 통합 확인

## 문제 해결

### 환경 변수가 적용되지 않는 경우
1. 환경 변수 이름이 정확한지 확인
2. `.env` 파일의 문법 확인 (따옴표, 공백 등)
3. 애플리케이션 재시작

### SSL 연결 오류
1. `DB_SSL_MODE` 설정 확인
2. SSL 인증서 파일 경로 및 권한 확인
3. 데이터베이스 서버의 SSL 설정 확인

### CORS 오류
1. `CORS_ALLOW_ORIGINS`에 요청 origin이 포함되어 있는지 확인
2. 프로토콜(http/https)이 정확한지 확인
3. 포트 번호가 포함되어 있는지 확인