# MaxLab Backend Deployment Guide

Production/Development 환경 분리 및 배포 가이드입니다.

## 환경 정보

- **Production**: https://maxlab.chem.co.kr
- **Development**: https://devmaxlab.chem.co.kr

## 디렉토리 구조

```
/opt/maxlab/
├── backend/              # Production 코드
├── backend-dev/          # Development 코드
├── venv/                 # Production Python 가상환경
├── venv-dev/             # Development Python 가상환경
├── backups/              # 백업 디렉토리
└── logs/                 # 애플리케이션 로그

/var/log/maxlab/          # 시스템 로그
/var/www/maxlab/          # Production 정적 파일
├── static/
└── media/
/var/www/maxlab-dev/      # Development 정적 파일
├── static/
└── media/
```

## 초기 서버 설정

### 1. 시스템 준비

```bash
# 초기 설정 스크립트 실행
cd /path/to/maxlab/backend
sudo ./scripts/setup.sh
```

이 스크립트는 다음을 수행합니다:
- 필요한 시스템 패키지 설치
- PostgreSQL, Redis, Nginx 설정
- 사용자 및 디렉토리 생성
- 방화벽 규칙 설정
- 비밀 키 생성

### 2. 코드 배포

```bash
# Production 코드 클론
sudo -u maxlab git clone https://github.com/your-org/maxlab-backend.git /opt/maxlab/backend

# Development 코드 클론 (동일 저장소, 다른 브랜치 사용 가능)
sudo -u maxlab git clone https://github.com/your-org/maxlab-backend.git /opt/maxlab/backend-dev
cd /opt/maxlab/backend-dev
sudo -u maxlab git checkout development
```

### 3. 환경 설정

#### Production 환경

```bash
cd /opt/maxlab/backend
sudo -u maxlab cp .env.production.template .env
sudo -u maxlab nano .env

# 다음 항목들을 반드시 수정:
# - DATABASE_URL (실제 DB 정보)
# - 모든 SECRET_KEY 값들
# - AUTH_SERVER_URL
# - REDIS_URL
# - 도메인 관련 설정
```

#### Development 환경

```bash
cd /opt/maxlab/backend-dev
sudo -u maxlab cp .env.development .env
sudo -u maxlab nano .env

# 개발 환경에 맞게 수정
```

## 배포 프로세스

### Production 배포

```bash
cd /opt/maxlab/backend
sudo ./scripts/deploy.sh production
```

### Development 배포

```bash
cd /opt/maxlab/backend-dev
sudo ./scripts/deploy.sh development
```

## SSL 인증서 설정

### Let's Encrypt 사용 (권장)

```bash
# Production
sudo certbot certonly --nginx -d maxlab.chem.co.kr -d www.maxlab.chem.co.kr

# Development
sudo certbot certonly --nginx -d devmaxlab.chem.co.kr

# 자동 갱신 설정
sudo crontab -e
# 추가: 0 3 * * * /usr/bin/certbot renew --quiet --post-hook "systemctl reload nginx"
```

자세한 내용은 [SSL_CERTIFICATE_SETUP.md](SSL_CERTIFICATE_SETUP.md) 참조

## 서비스 관리

### 서비스 제어

```bash
# 서비스 시작
./scripts/manage-service.sh start production
./scripts/manage-service.sh start development

# 서비스 중지
./scripts/manage-service.sh stop production

# 서비스 재시작
./scripts/manage-service.sh restart production

# 서비스 상태 확인
./scripts/manage-service.sh status production

# 로그 보기
./scripts/manage-service.sh logs production
./scripts/manage-service.sh logs production -f  # 실시간 로그

# 헬스 체크
./scripts/manage-service.sh health production

# 메트릭 확인
./scripts/manage-service.sh metrics production
```

### Systemd 직접 제어

```bash
# Production (2개 인스턴스)
sudo systemctl start maxlab-backend-production
sudo systemctl start maxlab-backend-production-2

# Development
sudo systemctl start maxlab-backend-development

# 로그 확인
sudo journalctl -u maxlab-backend-production -f
```

## Nginx 관리

### 설정 확인 및 적용

```bash
# 설정 파일 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx

# Nginx 리로드 (무중단)
sudo systemctl reload nginx
```

### 사이트 활성화/비활성화

```bash
# Production 활성화
sudo ln -s /etc/nginx/sites-available/maxlab-production.conf /etc/nginx/sites-enabled/

# Development 활성화
sudo ln -s /etc/nginx/sites-available/maxlab-development.conf /etc/nginx/sites-enabled/

# 비활성화
sudo rm /etc/nginx/sites-enabled/maxlab-production.conf
```

## 로드밸런싱

Production 환경에서는 2개의 백엔드 인스턴스가 실행됩니다:
- Instance 1: 포트 8010 (주 인스턴스)
- Instance 2: 포트 8011 (백업 인스턴스)

Nginx는 자동으로 로드밸런싱을 수행합니다.

## 모니터링

### 로그 위치

- **애플리케이션 로그**: `/var/log/maxlab/`
  - `backend-production.log`
  - `backend-development.log`
- **Nginx 로그**: `/var/log/nginx/`
  - `maxlab-production-access.log`
  - `maxlab-production-error.log`
- **Systemd 로그**: `journalctl`

### 헬스 체크 엔드포인트

- Production: https://maxlab.chem.co.kr/health
- Development: https://devmaxlab.chem.co.kr/health

### 메트릭

Prometheus 형식의 메트릭:
- Production: http://localhost:9090/metrics
- Development: http://localhost:9091/metrics

## 백업 및 복구

### 자동 백업

배포 시 자동으로 이전 버전이 백업됩니다:
```
/opt/maxlab/backups/backup_YYYYMMDD_HHMMSS.tar.gz
```

### 수동 백업

```bash
# 데이터베이스 백업
sudo -u postgres pg_dump max_lab > /opt/maxlab/backups/db_backup_$(date +%Y%m%d).sql

# 코드 백업
cd /opt/maxlab
sudo tar -czf backups/code_backup_$(date +%Y%m%d).tar.gz backend/
```

### 복구

```bash
# 코드 복구
cd /opt/maxlab
sudo tar -xzf backups/backup_YYYYMMDD_HHMMSS.tar.gz -C backend/

# 데이터베이스 복구
sudo -u postgres psql max_lab < /opt/maxlab/backups/db_backup_YYYYMMDD.sql

# 서비스 재시작
sudo ./scripts/manage-service.sh restart production
```

## 보안 고려사항

1. **방화벽 설정**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

2. **Fail2ban 설정** (선택사항)
   ```bash
   sudo apt install fail2ban
   # Nginx 및 SSH 보호 규칙 설정
   ```

3. **정기적인 업데이트**
   ```bash
   sudo apt update && sudo apt upgrade
   ```

4. **비밀 키 관리**
   - `.env` 파일은 절대 Git에 커밋하지 않음
   - 정기적으로 비밀 키 로테이션
   - 백업 시 `.env` 파일 제외

## 문제 해결

### 서비스가 시작되지 않을 때

1. 로그 확인:
   ```bash
   sudo journalctl -u maxlab-backend-production -n 100
   ```

2. 환경 파일 확인:
   ```bash
   sudo -u maxlab cat /opt/maxlab/backend/.env
   ```

3. 포트 충돌 확인:
   ```bash
   sudo netstat -tlnp | grep :8010
   ```

### 502 Bad Gateway 오류

1. 백엔드 서비스 상태 확인:
   ```bash
   ./scripts/manage-service.sh status production
   ```

2. Nginx 에러 로그 확인:
   ```bash
   sudo tail -f /var/log/nginx/maxlab-production-error.log
   ```

### 데이터베이스 연결 오류

1. PostgreSQL 상태 확인:
   ```bash
   sudo systemctl status postgresql
   ```

2. 연결 테스트:
   ```bash
   sudo -u maxlab psql -h localhost -U maxlab -d max_lab
   ```

## 성능 튜닝

### Gunicorn Workers

워커 수 조정 (CPU 코어 수 * 2 + 1):
```bash
# .env 파일에서
WORKERS=4  # 2 CPU cores
```

### PostgreSQL 튜닝

`/etc/postgresql/*/main/postgresql.conf`:
```
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
```

### Redis 튜닝

`/etc/redis/redis.conf`:
```
maxmemory 512mb
maxmemory-policy allkeys-lru
```

## 업데이트 절차

### 코드 업데이트

```bash
cd /opt/maxlab/backend
sudo -u maxlab git pull origin main
sudo ./scripts/deploy.sh production
```

### 데이터베이스 마이그레이션

```bash
cd /opt/maxlab/backend
sudo -u maxlab /opt/maxlab/venv/bin/python -m alembic upgrade head
```

## 연락처

문제 발생 시:
- 시스템 관리자: admin@chem.co.kr
- 개발팀: dev@chem.co.kr