#!/usr/bin/env python3
"""
Production 환경 테스트 스크립트
PM2로 실행된 서버의 API 엔드포인트를 테스트합니다.
"""
import os
import sys
import requests
import json
from typing import Dict, Any
from datetime import datetime

# 색상 코드
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_header(text: str):
    """헤더 출력"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}{text}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")

def print_success(text: str):
    """성공 메시지 출력"""
    print(f"{GREEN}✓ {text}{RESET}")

def print_error(text: str):
    """에러 메시지 출력"""
    print(f"{RED}✗ {text}{RESET}")

def print_warning(text: str):
    """경고 메시지 출력"""
    print(f"{YELLOW}⚠ {text}{RESET}")

def test_endpoint(url: str, expected_status: int = 200, method: str = "GET", **kwargs) -> bool:
    """API 엔드포인트 테스트"""
    try:
        response = requests.request(method, url, timeout=5, **kwargs)
        if response.status_code == expected_status:
            print_success(f"{method} {url} → {response.status_code}")
            return True
        else:
            print_error(f"{method} {url} → {response.status_code} (expected {expected_status})")
            if response.text:
                print(f"  Response: {response.text[:200]}")
            return False
    except requests.exceptions.ConnectionError:
        print_error(f"{method} {url} → Connection refused")
        return False
    except Exception as e:
        print_error(f"{method} {url} → {str(e)}")
        return False

def check_environment():
    """환경 변수 확인"""
    print_header("환경 변수 확인")
    
    env_vars = {
        "ENVIRONMENT": os.environ.get("ENVIRONMENT", "not set"),
        "DATABASE_URL": "***" if os.environ.get("DATABASE_URL") else "not set",
        "AUTH_SERVER_URL": os.environ.get("AUTH_SERVER_URL", "not set"),
        "DEBUG": os.environ.get("DEBUG", "not set"),
        "LOG_LEVEL": os.environ.get("LOG_LEVEL", "not set"),
    }
    
    for key, value in env_vars.items():
        if value == "not set":
            print_warning(f"{key}: {value}")
        else:
            print_success(f"{key}: {value}")

def test_health_endpoints():
    """헬스체크 엔드포인트 테스트"""
    print_header("헬스체크 엔드포인트 테스트")
    
    results = []
    for port in [8010, 8011, 8012]:
        url = f"http://127.0.0.1:{port}/api/v1/health"
        success = test_endpoint(url)
        results.append(success)
    
    return all(results)

def test_api_endpoints():
    """API 엔드포인트 테스트"""
    print_header("API 엔드포인트 테스트")
    
    base_url = "http://127.0.0.1:8010"
    
    endpoints = [
        ("/", 200),
        ("/api/v1/info", 200),
        ("/api/oauth/validate-config", 200),
        ("/api/v1/workspaces", 401),  # 인증 필요
        ("/docs", 404),  # production에서는 비활성화
        ("/api/oauth/token", 405),  # POST만 허용
        ("/api/oauth/userinfo", 401),  # 토큰 필요
    ]
    
    results = []
    for endpoint, expected_status in endpoints:
        url = f"{base_url}{endpoint}"
        success = test_endpoint(url, expected_status)
        results.append(success)
    
    return all(results)

def test_post_endpoints():
    """POST 엔드포인트 테스트"""
    print_header("POST 엔드포인트 테스트")
    
    base_url = "http://127.0.0.1:8010"
    
    # OAuth token endpoint test
    url = f"{base_url}/api/oauth/token"
    data = {
        "grant_type": "authorization_code",
        "code": "test_code",
        "redirect_uri": "http://localhost:3010/oauth/callback",
        "client_id": "maxlab",
        "code_verifier": "test_verifier"
    }
    
    # 400 에러를 예상 (잘못된 코드)
    success = test_endpoint(
        url, 
        expected_status=400,
        method="POST",
        data=data
    )
    
    return success

def check_static_files():
    """정적 파일 설정 확인"""
    print_header("정적 파일 설정 확인")
    
    static_dir = os.environ.get("STATIC_FILES_DIR", "/var/www/maxlab/static")
    serve_static = os.environ.get("SERVE_STATIC_FILES", "False")
    
    print(f"STATIC_FILES_DIR: {static_dir}")
    print(f"SERVE_STATIC_FILES: {serve_static}")
    
    if serve_static.lower() == "true":
        print_warning("Production에서는 nginx가 정적 파일을 처리해야 합니다")
    else:
        print_success("정적 파일은 nginx가 처리합니다")
    
    if os.path.exists(static_dir):
        print_success(f"정적 파일 디렉토리 존재: {static_dir}")
    else:
        print_warning(f"정적 파일 디렉토리 없음: {static_dir}")

def check_cors_settings():
    """CORS 설정 확인"""
    print_header("CORS 설정 확인")
    
    base_url = "http://127.0.0.1:8010"
    headers = {
        "Origin": "https://maxlab.chem.co.kr"
    }
    
    response = requests.options(f"{base_url}/api/v1/health", headers=headers, timeout=5)
    
    cors_headers = {
        "Access-Control-Allow-Origin": response.headers.get("Access-Control-Allow-Origin"),
        "Access-Control-Allow-Credentials": response.headers.get("Access-Control-Allow-Credentials"),
        "Access-Control-Allow-Methods": response.headers.get("Access-Control-Allow-Methods"),
    }
    
    for header, value in cors_headers.items():
        if value:
            print_success(f"{header}: {value}")
        else:
            print_warning(f"{header}: not set")

def main():
    """메인 테스트 실행"""
    print(f"\n{BLUE}MaxLab Backend Production Test{RESET}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 환경 확인
    check_environment()
    
    # 헬스체크
    health_ok = test_health_endpoints()
    
    if not health_ok:
        print_error("\n서버가 실행되지 않았거나 응답하지 않습니다.")
        print("다음 명령어로 서버 상태를 확인하세요:")
        print("  pm2 list")
        print("  pm2 logs")
        sys.exit(1)
    
    # API 엔드포인트 테스트
    api_ok = test_api_endpoints()
    
    # POST 엔드포인트 테스트
    post_ok = test_post_endpoints()
    
    # 정적 파일 설정 확인
    check_static_files()
    
    # CORS 설정 확인
    check_cors_settings()
    
    # 결과 요약
    print_header("테스트 결과 요약")
    
    if health_ok and api_ok and post_ok:
        print_success("모든 테스트 통과!")
    else:
        print_error("일부 테스트 실패")
        print("\n문제 해결 방법:")
        print("1. PM2 로그 확인: pm2 logs")
        print("2. 환경 변수 확인: ENVIRONMENT=production이 설정되었는지 확인")
        print("3. ecosystem.config.js 파일의 env 섹션 확인")
        print("4. .env.production 파일 확인")

if __name__ == "__main__":
    main()