#!/bin/bash

# OAuth 플로우 빠른 테스트 스크립트
# 사용법: ./quick_oauth_test.sh [token]

BASE_URL="http://localhost:8010"
AUTH_SERVER_URL="http://localhost:8000"
TOKEN=$1

echo "======================================"
echo "🚀 MAX Lab OAuth Quick Test"
echo "======================================"
echo "Base URL: $BASE_URL"
echo "Auth Server: $AUTH_SERVER_URL"
echo ""

# 색상 설정
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 헬스 체크
echo "1. Health Check Test"
echo "-------------------"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Health check passed${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ Health check failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# 2. 인증되지 않은 접근 테스트
echo "2. Unauthorized Access Test"
echo "--------------------------"
UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -L "$BASE_URL/api/v1/workspaces/")
HTTP_CODE=$(echo "$UNAUTH_RESPONSE" | tail -n1)
BODY=$(echo "$UNAUTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    echo -e "${GREEN}✅ Unauthorized access correctly blocked${NC}"
    ERROR_CODE=$(echo "$BODY" | grep -o '"error_code":"[^"]*"' | cut -d'"' -f4)
    if [ -z "$ERROR_CODE" ]; then
        echo "Response: $BODY"
    else
        echo "Error code: $ERROR_CODE"
    fi
else
    echo -e "${RED}❌ Unexpected response (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# 토큰이 제공되지 않은 경우
if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}⚠️  No token provided. Skipping authenticated tests.${NC}"
    echo ""
    echo "To test authenticated endpoints, run:"
    echo "  $0 <your-oauth-token>"
    echo ""
    echo "To get a token:"
    echo "  1. Login to the auth server at $AUTH_SERVER_URL"
    echo "  2. Get your access token from the response"
    echo ""
    exit 0
fi

echo "Using token: ${TOKEN:0:20}..."
echo ""

# 3. 인증된 접근 테스트
echo "3. Authenticated Access Test"
echo "---------------------------"
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    "$BASE_URL/api/v1/workspaces")
HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)
BODY=$(echo "$AUTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Authenticated access successful${NC}"
    WORKSPACE_COUNT=$(echo "$BODY" | grep -o '"items":\[' | wc -l)
    echo "Response contains workspace list"
else
    echo -e "${RED}❌ Authenticated access failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# 4. 사용자 정보 테스트
echo "4. User Info Test"
echo "-----------------"
USER_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    "$BASE_URL/api/v1/users/me")
HTTP_CODE=$(echo "$USER_RESPONSE" | tail -n1)
BODY=$(echo "$USER_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ User info retrieved successfully${NC}"
    USERNAME=$(echo "$BODY" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    echo "Username: $USERNAME"
else
    echo -e "${RED}❌ User info retrieval failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# 5. 워크스페이스 생성 테스트
echo "5. Workspace Creation Test"
echo "-------------------------"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Test Workspace $TIMESTAMP\",\"description\":\"OAuth test workspace\",\"is_active\":true}" \
    "$BASE_URL/api/v1/workspaces")
HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
BODY=$(echo "$CREATE_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "201" ]; then
    echo -e "${GREEN}✅ Workspace created successfully${NC}"
    WORKSPACE_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | cut -d':' -f2)
    echo "Workspace ID: $WORKSPACE_ID"
    
    # 생성된 워크스페이스 삭제
    if [ ! -z "$WORKSPACE_ID" ]; then
        echo "Cleaning up test workspace..."
        DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" \
            -X DELETE \
            -H "Authorization: Bearer $TOKEN" \
            "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID")
        DELETE_CODE=$(echo "$DELETE_RESPONSE" | tail -n1)
        if [ "$DELETE_CODE" = "204" ]; then
            echo -e "${GREEN}✅ Test workspace deleted${NC}"
        fi
    fi
else
    echo -e "${RED}❌ Workspace creation failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# 6. 성능 테스트 (간단 버전)
echo "6. Performance Test (Simple)"
echo "---------------------------"
echo "Making 5 requests to measure response time..."

TOTAL_TIME=0
SUCCESS_COUNT=0

for i in {1..5}; do
    START_TIME=$(date +%s.%N)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/api/v1/workspaces")
    END_TIME=$(date +%s.%N)
    
    if [ "$HTTP_CODE" = "200" ]; then
        ELAPSED=$(echo "$END_TIME - $START_TIME" | bc)
        ELAPSED_MS=$(echo "$ELAPSED * 1000" | bc | cut -d'.' -f1)
        TOTAL_TIME=$(echo "$TOTAL_TIME + $ELAPSED" | bc)
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        echo "  Request $i: ${ELAPSED_MS}ms"
    else
        echo "  Request $i: Failed (HTTP $HTTP_CODE)"
    fi
done

if [ $SUCCESS_COUNT -gt 0 ]; then
    AVG_TIME=$(echo "scale=3; $TOTAL_TIME / $SUCCESS_COUNT * 1000" | bc)
    echo ""
    echo "Average response time: ${AVG_TIME}ms"
    
    if (( $(echo "$AVG_TIME < 200" | bc -l) )); then
        echo -e "${GREEN}✅ Performance target met (<200ms)${NC}"
    else
        echo -e "${RED}❌ Performance target not met (>200ms)${NC}"
    fi
else
    echo -e "${RED}❌ All performance test requests failed${NC}"
fi
echo ""

# 결과 요약
echo "======================================"
echo "📊 Test Summary"
echo "======================================"
echo "Tests completed. Check results above."
echo ""