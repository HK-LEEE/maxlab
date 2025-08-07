#!/bin/bash
# MaxLab Backend Production Deployment Script
# 이 스크립트는 production 환경으로 백엔드를 배포합니다

set -e  # 오류 시 즉시 종료

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. 환경 변수 확인
log_info "환경 변수 확인 중..."

if [ ! -f ".env.production" ]; then
    log_error ".env.production 파일이 없습니다!"
    log_warn ".env.production.template을 복사하여 생성하세요:"
    echo "  cp .env.production.template .env.production"
    echo "  그리고 실제 값으로 수정하세요"
    exit 1
fi

# 2. 보안 키 생성 (필요한 경우)
log_info "보안 키 확인 중..."

generate_secret() {
    python3 -c "import secrets; print(secrets.token_urlsafe(32))"
}

# .env.production에서 키 확인
source .env.production

if [ -z "$SECRET_KEY" ] || [ "$SECRET_KEY" == "CHANGE_THIS_IN_PRODUCTION" ]; then
    log_warn "SECRET_KEY가 설정되지 않았습니다. 생성 중..."
    NEW_SECRET_KEY=$(generate_secret)
    sed -i "s/SECRET_KEY=.*/SECRET_KEY=$NEW_SECRET_KEY/" .env.production
fi

if [ -z "$JWT_SECRET_KEY" ] || [ "$JWT_SECRET_KEY" == "CHANGE_THIS_IN_PRODUCTION" ]; then
    log_warn "JWT_SECRET_KEY가 설정되지 않았습니다. 생성 중..."
    NEW_JWT_SECRET_KEY=$(generate_secret)
    sed -i "s/JWT_SECRET_KEY=.*/JWT_SECRET_KEY=$NEW_JWT_SECRET_KEY/" .env.production
fi

if [ -z "$CSRF_SECRET_KEY" ] || [ "$CSRF_SECRET_KEY" == "CHANGE_THIS_IN_PRODUCTION" ]; then
    log_warn "CSRF_SECRET_KEY가 설정되지 않았습니다. 생성 중..."
    NEW_CSRF_SECRET_KEY=$(generate_secret)
    sed -i "s/CSRF_SECRET_KEY=.*/CSRF_SECRET_KEY=$NEW_CSRF_SECRET_KEY/" .env.production
fi

if [ -z "$SESSION_SECRET_KEY" ] || [ "$SESSION_SECRET_KEY" == "CHANGE_THIS_IN_PRODUCTION" ]; then
    log_warn "SESSION_SECRET_KEY가 설정되지 않았습니다. 생성 중..."
    NEW_SESSION_SECRET_KEY=$(generate_secret)
    sed -i "s/SESSION_SECRET_KEY=.*/SESSION_SECRET_KEY=$NEW_SESSION_SECRET_KEY/" .env.production
fi

# 3. PM2 설정 파일 업데이트
log_info "PM2 설정 파일 업데이트 중..."

# .env.production 다시 로드
source .env.production

# ecosystem.config.js의 플레이스홀더를 실제 값으로 교체
cp ecosystem.config.js ecosystem.config.production.js
sed -i "s/\${SECRET_KEY}/$SECRET_KEY/g" ecosystem.config.production.js
sed -i "s/\${JWT_SECRET_KEY}/$JWT_SECRET_KEY/g" ecosystem.config.production.js
sed -i "s/\${CSRF_SECRET_KEY}/$CSRF_SECRET_KEY/g" ecosystem.config.production.js
sed -i "s/\${SESSION_SECRET_KEY}/$SESSION_SECRET_KEY/g" ecosystem.config.production.js

# 4. 가상환경 설정
log_info "Python 가상환경 설정 중..."

if [ ! -d ".venv" ]; then
    log_info "가상환경 생성 중..."
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 5. 데이터베이스 마이그레이션
log_info "데이터베이스 마이그레이션 실행 중..."
export ENVIRONMENT=production
alembic upgrade head

# 6. 로그 디렉토리 생성
log_info "로그 디렉토리 생성 중..."
mkdir -p logs

# 7. PM2 프로세스 관리
log_info "PM2 프로세스 재시작 중..."

# 기존 프로세스 중지
pm2 stop ecosystem.config.production.js || true
pm2 delete ecosystem.config.production.js || true

# 새 프로세스 시작
pm2 start ecosystem.config.production.js

# PM2 저장 (재부팅 시 자동 시작)
pm2 save
pm2 startup

# 8. 헬스체크
log_info "헬스체크 실행 중..."
sleep 5  # 서버 시작 대기

for port in 8010 8011 8012; do
    response=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$port/api/v1/health)
    if [ "$response" == "200" ]; then
        log_info "포트 $port 헬스체크 성공 ✓"
    else
        log_error "포트 $port 헬스체크 실패 (HTTP $response)"
    fi
done

# 9. API 엔드포인트 테스트
log_info "API 엔드포인트 테스트 중..."

test_endpoint() {
    local endpoint=$1
    local expected=$2
    response=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8010$endpoint)
    if [ "$response" == "$expected" ]; then
        log_info "$endpoint 테스트 성공 ✓ (HTTP $response)"
    else
        log_error "$endpoint 테스트 실패 (예상: $expected, 실제: $response)"
    fi
}

test_endpoint "/api/v1/info" "200"
test_endpoint "/api/oauth/validate-config" "200"

# 10. PM2 상태 확인
log_info "PM2 프로세스 상태:"
pm2 list

log_info "========================"
log_info "배포 완료!"
log_info "========================"
log_info ""
log_info "다음 명령어로 로그를 확인할 수 있습니다:"
echo "  pm2 logs maxlab-backend-8010"
echo "  pm2 logs maxlab-backend-8011"
echo "  pm2 logs maxlab-backend-8012"
echo ""
log_info "모든 로그 보기:"
echo "  pm2 logs"
echo ""
log_info "모니터링:"
echo "  pm2 monit"