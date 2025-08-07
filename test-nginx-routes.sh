#!/bin/bash
# Nginx 라우팅 테스트 스크립트

echo "================================"
echo "MaxLab Nginx Routing Test"
echo "================================"

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 테스트할 도메인
DOMAIN="https://maxlab.dwchem.co.kr"

# 테스트 함수
test_route() {
    local path=$1
    local expected=$2
    local description=$3
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$DOMAIN$path")
    
    if [ "$response" = "$expected" ]; then
        echo -e "${GREEN}✓${NC} $path → $response (예상: $expected) - $description"
    else
        echo -e "${RED}✗${NC} $path → $response (예상: $expected) - $description"
    fi
}

echo ""
echo "API 엔드포인트 테스트:"
echo "----------------------"
test_route "/api/v1/health" "200" "헬스체크"
test_route "/api/oauth/validate-config" "200" "OAuth 설정 확인"
test_route "/api/oauth/token" "405" "토큰 엔드포인트 (GET 요청이므로 405 예상)"
test_route "/api/v1/info" "200" "앱 정보"

echo ""
echo "프론트엔드 라우트 테스트:"
echo "------------------------"
test_route "/" "200" "홈페이지"
test_route "/oauth/callback" "200" "OAuth 콜백 (React Router가 처리)"
test_route "/login" "200" "로그인 페이지 (SPA)"
test_route "/dashboard" "200" "대시보드 (SPA)"

echo ""
echo "정적 파일 테스트:"
echo "----------------"
test_route "/favicon.ico" "200" "파비콘"

echo ""
echo "기타 테스트:"
echo "-----------"
test_route "/health" "200" "백엔드 헬스체크"
test_route "/nginx-health" "200" "Nginx 헬스체크"

echo ""
echo "POST 요청 테스트 (OAuth Token):"
echo "-------------------------------"
response=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$DOMAIN/api/oauth/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=authorization_code&code=test&redirect_uri=test&client_id=test&code_verifier=test")

if [ "$response" = "400" ] || [ "$response" = "401" ]; then
    echo -e "${GREEN}✓${NC} POST /api/oauth/token → $response (400/401 예상 - 잘못된 토큰)"
else
    echo -e "${RED}✗${NC} POST /api/oauth/token → $response (400/401 예상)"
fi

echo ""
echo "================================"
echo "테스트 완료"
echo "================================"