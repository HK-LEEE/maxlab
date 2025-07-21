#!/usr/bin/env python3
"""
환경 설정 관리 스크립트
개발/스테이징/운영 환경 설정 파일을 관리합니다.
"""
import os
import sys
import shutil
import secrets
import base64
import argparse
from pathlib import Path
from typing import Optional


class EnvManager:
    """환경 설정 관리자"""
    
    def __init__(self, base_path: Path):
        self.base_path = base_path
        self.env_file = base_path / ".env"
        self.env_files = {
            "development": base_path / ".env.development",
            "staging": base_path / ".env.staging.template",
            "production": base_path / ".env.production.template"
        }
    
    def switch_environment(self, environment: str):
        """환경 전환"""
        if environment not in self.env_files:
            raise ValueError(f"Unknown environment: {environment}")
        
        source_file = self.env_files[environment]
        
        if not source_file.exists():
            raise FileNotFoundError(f"Environment file not found: {source_file}")
        
        # 백업 생성
        if self.env_file.exists():
            backup_file = self.env_file.with_suffix(".env.backup")
            shutil.copy2(self.env_file, backup_file)
            print(f"✅ Created backup: {backup_file}")
        
        # 환경 파일 복사
        shutil.copy2(source_file, self.env_file)
        print(f"✅ Switched to {environment} environment")
        
        # 경고 메시지
        if environment in ["staging", "production"]:
            print("\n⚠️  WARNING: Don't forget to update the following:")
            print("  - Database connection string")
            print("  - All secret keys (SECRET_KEY, JWT_SECRET_KEY, etc.)")
            print("  - External service URLs")
            print("  - CORS allowed origins")
    
    def generate_secret_key(self, length: int = 32) -> str:
        """비밀키 생성"""
        return secrets.token_urlsafe(length)
    
    def generate_encryption_key(self) -> str:
        """암호화 키 생성 (32바이트 base64)"""
        key_bytes = secrets.token_bytes(32)
        return base64.urlsafe_b64encode(key_bytes).decode()
    
    def generate_all_keys(self):
        """모든 비밀키 생성"""
        keys = {
            "SECRET_KEY": self.generate_secret_key(32),
            "JWT_SECRET_KEY": self.generate_secret_key(32),
            "CSRF_SECRET_KEY": self.generate_secret_key(32),
            "SESSION_SECRET_KEY": self.generate_secret_key(32),
            "ENCRYPTION_KEY": self.generate_encryption_key(),
            "WEBSOCKET_TOKEN": self.generate_secret_key(24)
        }
        
        print("🔐 Generated secret keys:")
        for key_name, key_value in keys.items():
            print(f"\n{key_name}={key_value}")
        
        return keys
    
    def validate_env_file(self, environment: Optional[str] = None):
        """환경 파일 검증"""
        if environment:
            env_file = self.env_files.get(environment)
            if not env_file:
                raise ValueError(f"Unknown environment: {environment}")
        else:
            env_file = self.env_file
        
        if not env_file.exists():
            raise FileNotFoundError(f"Environment file not found: {env_file}")
        
        # 환경 변수 로드
        env_vars = {}
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        key, value = line.split('=', 1)
                        env_vars[key.strip()] = value.strip()
        
        # 필수 변수 확인
        required_vars = [
            "ENVIRONMENT",
            "DATABASE_URL",
            "SECRET_KEY",
            "JWT_SECRET_KEY",
            "AUTH_SERVER_URL"
        ]
        
        missing_vars = []
        placeholder_vars = []
        
        for var in required_vars:
            if var not in env_vars:
                missing_vars.append(var)
            elif "CHANGE_THIS" in env_vars[var] or "your-" in env_vars[var]:
                placeholder_vars.append(var)
        
        # 환경별 추가 검증
        env_type = env_vars.get("ENVIRONMENT", "").lower()
        
        if env_type == "production":
            # 운영 환경 추가 검증
            if "localhost" in env_vars.get("DATABASE_URL", ""):
                print("❌ ERROR: DATABASE_URL contains localhost in production")
            
            if env_vars.get("DB_SSL_MODE") == "disable":
                print("❌ ERROR: DB_SSL_MODE is disabled in production")
            
            if env_vars.get("DEBUG", "").lower() == "true":
                print("❌ ERROR: DEBUG is enabled in production")
        
        # 결과 출력
        print(f"\n📋 Validation results for {env_file.name}:")
        print(f"   Environment: {env_type}")
        
        if missing_vars:
            print(f"\n❌ Missing required variables:")
            for var in missing_vars:
                print(f"   - {var}")
        
        if placeholder_vars:
            print(f"\n⚠️  Variables with placeholder values:")
            for var in placeholder_vars:
                print(f"   - {var}")
        
        if not missing_vars and not placeholder_vars:
            print("\n✅ All required variables are configured")
        
        return not missing_vars
    
    def show_current_environment(self):
        """현재 환경 표시"""
        if not self.env_file.exists():
            print("❌ No .env file found")
            return
        
        # 현재 환경 읽기
        with open(self.env_file, 'r') as f:
            for line in f:
                if line.strip().startswith("ENVIRONMENT="):
                    env_value = line.split('=', 1)[1].strip()
                    print(f"📍 Current environment: {env_value}")
                    return
        
        print("⚠️  ENVIRONMENT variable not found in .env file")


def main():
    """메인 함수"""
    parser = argparse.ArgumentParser(
        description="MAX Lab 환경 설정 관리",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # 현재 환경 확인
  python manage_env.py current
  
  # 개발 환경으로 전환
  python manage_env.py switch development
  
  # 비밀키 생성
  python manage_env.py generate-keys
  
  # 환경 파일 검증
  python manage_env.py validate
  python manage_env.py validate --env production
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # current 명령
    subparsers.add_parser('current', help='Show current environment')
    
    # switch 명령
    switch_parser = subparsers.add_parser('switch', help='Switch environment')
    switch_parser.add_argument(
        'environment',
        choices=['development', 'staging', 'production'],
        help='Target environment'
    )
    
    # generate-keys 명령
    subparsers.add_parser('generate-keys', help='Generate secret keys')
    
    # validate 명령
    validate_parser = subparsers.add_parser('validate', help='Validate environment file')
    validate_parser.add_argument(
        '--env',
        choices=['development', 'staging', 'production'],
        help='Environment to validate (default: current .env)'
    )
    
    args = parser.parse_args()
    
    # 기본 경로 설정
    base_path = Path(__file__).parent.parent
    manager = EnvManager(base_path)
    
    # 명령 실행
    try:
        if args.command == 'current':
            manager.show_current_environment()
        
        elif args.command == 'switch':
            manager.switch_environment(args.environment)
        
        elif args.command == 'generate-keys':
            manager.generate_all_keys()
        
        elif args.command == 'validate':
            manager.validate_env_file(args.env)
        
        else:
            parser.print_help()
    
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()