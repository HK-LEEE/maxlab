#!/usr/bin/env python3
"""
환경 설정 디버그 스크립트
현재 설정된 환경 변수와 설정값을 확인합니다.
"""
import os
import sys
from pathlib import Path

# 프로젝트 경로 추가
sys.path.insert(0, str(Path(__file__).parent))

# 환경 변수 출력
print("="*60)
print("환경 변수 (Environment Variables)")
print("="*60)

important_vars = [
    "ENVIRONMENT",
    "DEBUG",
    "NODE_ENV",
    "DATABASE_URL",
    "AUTH_SERVER_URL",
    "BACKEND_CORS_ORIGINS",
    "SERVE_STATIC_FILES",
    "LOG_LEVEL",
    "HOST",
    "PORT",
]

for var in important_vars:
    value = os.environ.get(var, "NOT SET")
    if var == "DATABASE_URL" and value != "NOT SET":
        # 비밀번호 마스킹
        import re
        value = re.sub(r'://[^:]+:[^@]+@', '://***:***@', value)
    print(f"{var:25s} = {value}")

print("\n" + "="*60)
print("Settings 객체 값 (Pydantic Settings)")
print("="*60)

try:
    from app.core.config import settings
    
    print(f"ENVIRONMENT:              {settings.ENVIRONMENT}")
    print(f"DEBUG:                    {settings.DEBUG}")
    print(f"APP_NAME:                 {settings.APP_NAME}")
    print(f"HOST:                     {settings.HOST}")
    print(f"PORT:                     {settings.PORT}")
    print(f"LOG_LEVEL:                {settings.LOG_LEVEL}")
    print(f"SERVE_STATIC_FILES:       {settings.SERVE_STATIC_FILES}")
    print(f"STATIC_FILES_DIR:         {settings.STATIC_FILES_DIR}")
    print(f"AUTH_SERVER_URL:          {settings.AUTH_SERVER_URL}")
    print(f"CLIENT_ID:                {settings.CLIENT_ID}")
    
    print("\nCORS Origins:")
    if settings.BACKEND_CORS_ORIGINS:
        for origin in settings.BACKEND_CORS_ORIGINS:
            print(f"  - {origin}")
    else:
        print("  (none)")
    
    print("\n" + "="*60)
    print("환경별 설정 (Environment Config)")
    print("="*60)
    
    from app.core.env_config import get_environment_config, Environment
    
    env_config = get_environment_config()
    print(f"현재 환경: {settings.ENVIRONMENT}")
    print(f"Debug 모드: {env_config.debug}")
    print(f"Log Level: {env_config.log_level}")
    print(f"Cookie Secure: {env_config.cookie_secure}")
    print(f"Static Files: {env_config.static_files_enabled}")
    print(f"Rate Limiting: {env_config.rate_limit_enabled}")
    print(f"DB SSL Mode: {env_config.db_ssl_mode}")
    
    print("\n" + "="*60)
    print("라우터 등록 상태 확인")
    print("="*60)
    
    from app.main import app
    
    # 등록된 라우트 확인
    routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            routes.append((route.path, list(route.methods)))
    
    # 정렬하여 출력
    routes.sort(key=lambda x: x[0])
    
    api_routes = [r for r in routes if r[0].startswith('/api')]
    other_routes = [r for r in routes if not r[0].startswith('/api')]
    
    print(f"\nAPI 라우트 ({len(api_routes)}개):")
    for path, methods in api_routes[:20]:  # 처음 20개만
        methods_str = ', '.join(sorted(methods))
        print(f"  {path:50s} [{methods_str}]")
    
    if len(api_routes) > 20:
        print(f"  ... 그리고 {len(api_routes) - 20}개 더")
    
    print(f"\n기타 라우트 ({len(other_routes)}개):")
    for path, methods in other_routes[:10]:  # 처음 10개만
        methods_str = ', '.join(sorted(methods))
        print(f"  {path:50s} [{methods_str}]")
    
    if len(other_routes) > 10:
        print(f"  ... 그리고 {len(other_routes) - 10}개 더")
    
    # OAuth 관련 라우트 확인
    print("\n" + "="*60)
    print("OAuth 관련 라우트")
    print("="*60)
    
    oauth_routes = [r for r in routes if 'oauth' in r[0].lower()]
    if oauth_routes:
        for path, methods in oauth_routes:
            methods_str = ', '.join(sorted(methods))
            print(f"  {path:50s} [{methods_str}]")
    else:
        print("  OAuth 라우트가 등록되지 않았습니다!")
    
except ImportError as e:
    print(f"ERROR: 모듈 임포트 실패: {e}")
    print("\n가상환경이 활성화되었는지 확인하세요:")
    print("  source .venv/bin/activate")
    
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*60)
print("진단 완료")
print("="*60)