"""
환경별 설정 관리
개발/스테이징/운영 환경의 설정을 일원화하고 관리합니다.
"""
import os
from typing import Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel, field_validator
import secrets


class Environment(str, Enum):
    """환경 타입"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TEST = "test"


class EnvironmentConfig(BaseModel):
    """환경별 설정"""
    # 데이터베이스
    db_ssl_mode: str
    db_pool_size: int
    db_max_overflow: int
    db_pool_pre_ping: bool
    db_echo: bool
    
    # 보안
    cookie_secure: bool
    cookie_samesite: str
    cors_allow_credentials: bool
    cors_allow_origins: list[str]
    
    # 로깅
    log_level: str
    log_format: str
    log_sql: bool
    
    # 성능
    cache_ttl: int
    rate_limit_enabled: bool
    rate_limit_fail_open: bool
    
    # 디버그
    debug: bool
    show_error_details: bool
    
    # 세션
    session_lifetime: int
    session_remember_me_lifetime: int
    
    # 기타
    static_files_enabled: bool
    auto_reload: bool


# 환경별 기본 설정
ENVIRONMENT_CONFIGS: Dict[Environment, EnvironmentConfig] = {
    Environment.DEVELOPMENT: EnvironmentConfig(
        # 데이터베이스
        db_ssl_mode="disable",
        db_pool_size=5,
        db_max_overflow=10,
        db_pool_pre_ping=True,
        db_echo=True,
        
        # 보안
        cookie_secure=False,
        cookie_samesite="lax",
        cors_allow_credentials=True,
        cors_allow_origins=[
            "http://localhost:3000",
            "http://localhost:3007",
            "http://localhost:3008",
            "http://localhost:3010",
            "http://localhost:5173",
            "http://localhost:8000",
            "http://localhost:8010",
        ],
        
        # 로깅
        log_level="DEBUG",
        log_format="console",
        log_sql=True,
        
        # 성능
        cache_ttl=300,  # 5 minutes
        rate_limit_enabled=True,
        rate_limit_fail_open=True,
        
        # 디버그
        debug=True,
        show_error_details=True,
        
        # 세션
        session_lifetime=3600,  # 1 hour
        session_remember_me_lifetime=86400 * 30,  # 30 days
        
        # 기타
        static_files_enabled=True,
        auto_reload=True
    ),
    
    Environment.STAGING: EnvironmentConfig(
        # 데이터베이스
        db_ssl_mode="prefer",
        db_pool_size=10,
        db_max_overflow=20,
        db_pool_pre_ping=True,
        db_echo=False,
        
        # 보안
        cookie_secure=True,
        cookie_samesite="strict",
        cors_allow_credentials=True,
        cors_allow_origins=[
            "https://staging.maxlab.com",
            "https://staging-api.maxlab.com",
        ],
        
        # 로깅
        log_level="INFO",
        log_format="json",
        log_sql=False,
        
        # 성능
        cache_ttl=600,  # 10 minutes
        rate_limit_enabled=True,
        rate_limit_fail_open=True,
        
        # 디버그
        debug=False,
        show_error_details=False,
        
        # 세션
        session_lifetime=3600,  # 1 hour
        session_remember_me_lifetime=86400 * 7,  # 7 days
        
        # 기타
        static_files_enabled=True,
        auto_reload=False
    ),
    
    Environment.PRODUCTION: EnvironmentConfig(
        # 데이터베이스
        db_ssl_mode="require",
        db_pool_size=20,
        db_max_overflow=40,
        db_pool_pre_ping=True,
        db_echo=False,
        
        # 보안
        cookie_secure=True,
        cookie_samesite="strict",
        cors_allow_credentials=True,
        cors_allow_origins=[
            "https://maxlab.com",
            "https://app.maxlab.com",
            "https://api.maxlab.com",
        ],
        
        # 로깅
        log_level="WARNING",
        log_format="json",
        log_sql=False,
        
        # 성능
        cache_ttl=1800,  # 30 minutes
        rate_limit_enabled=True,
        rate_limit_fail_open=False,
        
        # 디버그
        debug=False,
        show_error_details=False,
        
        # 세션
        session_lifetime=1800,  # 30 minutes
        session_remember_me_lifetime=86400 * 7,  # 7 days
        
        # 기타
        static_files_enabled=False,
        auto_reload=False
    ),
    
    Environment.TEST: EnvironmentConfig(
        # 데이터베이스
        db_ssl_mode="disable",
        db_pool_size=1,
        db_max_overflow=0,
        db_pool_pre_ping=False,
        db_echo=False,
        
        # 보안
        cookie_secure=False,
        cookie_samesite="lax",
        cors_allow_credentials=True,
        cors_allow_origins=["*"],
        
        # 로깅
        log_level="DEBUG",
        log_format="console",
        log_sql=False,
        
        # 성능
        cache_ttl=0,  # No caching
        rate_limit_enabled=False,
        rate_limit_fail_open=True,
        
        # 디버그
        debug=True,
        show_error_details=True,
        
        # 세션
        session_lifetime=3600,
        session_remember_me_lifetime=86400,
        
        # 기타
        static_files_enabled=False,
        auto_reload=False
    )
}


class SecretManager:
    """비밀키 관리"""
    
    @staticmethod
    def get_or_generate_secret(key_name: str, length: int = 32) -> str:
        """
        환경 변수에서 비밀키를 가져오거나 생성
        
        Args:
            key_name: 환경 변수 이름
            length: 생성할 비밀키 길이
            
        Returns:
            비밀키 문자열
        """
        secret = os.getenv(key_name)
        
        if not secret or secret.endswith("change-this-in-production"):
            # 개발 환경에서는 경고만 표시
            if os.getenv("ENVIRONMENT", "development") == "development":
                print(f"⚠️  WARNING: Using default {key_name}. Set a secure value in production!")
                return secret or f"dev-{key_name.lower()}-{secrets.token_urlsafe(16)}"
            else:
                # 운영 환경에서는 에러
                raise ValueError(
                    f"Security Error: {key_name} must be set in production environment!"
                )
        
        return secret
    
    @staticmethod
    def validate_encryption_key(key: Optional[str]) -> Optional[str]:
        """암호화 키 검증"""
        if not key:
            return None
            
        # Base64 인코딩된 32바이트 키인지 확인
        try:
            import base64
            decoded = base64.urlsafe_b64decode(key + "==")  # 패딩 추가
            if len(decoded) != 32:
                raise ValueError(f"Encryption key must be 32 bytes, got {len(decoded)}")
            return key
        except Exception as e:
            raise ValueError(f"Invalid encryption key format: {e}")


class EnvironmentManager:
    """환경 설정 관리자"""
    
    @staticmethod
    def get_environment() -> Environment:
        """현재 환경 가져오기"""
        env_str = os.getenv("ENVIRONMENT", "development").lower()
        
        try:
            return Environment(env_str)
        except ValueError:
            print(f"⚠️  Unknown environment '{env_str}', defaulting to development")
            return Environment.DEVELOPMENT
    
    @staticmethod
    def get_config() -> EnvironmentConfig:
        """현재 환경의 설정 가져오기"""
        env = EnvironmentManager.get_environment()
        return ENVIRONMENT_CONFIGS[env]
    
    @staticmethod
    def override_from_env(config: EnvironmentConfig) -> EnvironmentConfig:
        """환경 변수로 설정 재정의"""
        # 환경 변수로 개별 설정 재정의 가능
        overrides = {}
        
        # 데이터베이스 설정
        if db_ssl := os.getenv("DB_SSL_MODE"):
            overrides["db_ssl_mode"] = db_ssl
        if db_pool := os.getenv("DB_POOL_SIZE"):
            overrides["db_pool_size"] = int(db_pool)
            
        # 로깅 설정
        if log_level := os.getenv("LOG_LEVEL"):
            overrides["log_level"] = log_level
        if log_format := os.getenv("LOG_FORMAT"):
            overrides["log_format"] = log_format
            
        # CORS 설정
        if cors_origins := os.getenv("CORS_ALLOW_ORIGINS"):
            overrides["cors_allow_origins"] = [
                origin.strip() for origin in cors_origins.split(",")
            ]
        
        # 적용
        if overrides:
            return config.model_copy(update=overrides)
        return config
    
    @staticmethod
    def validate_production_config():
        """운영 환경 설정 검증"""
        env = EnvironmentManager.get_environment()
        
        if env != Environment.PRODUCTION:
            return
        
        errors = []
        
        # 필수 환경 변수 확인
        required_vars = [
            "DATABASE_URL",
            "JWT_SECRET_KEY",
            "SECRET_KEY",
            "CSRF_SECRET_KEY",
            "SESSION_SECRET_KEY",
            "ENCRYPTION_KEY",
            "AUTH_SERVER_URL",
        ]
        
        for var in required_vars:
            value = os.getenv(var)
            if not value:
                errors.append(f"{var} is not set")
            elif "change-this" in value.lower() or "your-" in value.lower():
                errors.append(f"{var} contains default/placeholder value")
        
        # 데이터베이스 URL 검증
        db_url = os.getenv("DATABASE_URL", "")
        if "localhost" in db_url or "127.0.0.1" in db_url:
            errors.append("DATABASE_URL points to localhost in production")
        
        # SSL 설정 확인
        if os.getenv("DB_SSL_MODE") == "disable":
            errors.append("DB_SSL_MODE is disabled in production")
        
        if errors:
            error_msg = "Production configuration errors:\n" + "\n".join(f"  - {e}" for e in errors)
            raise ValueError(error_msg)


# 환경별 설정 내보내기
def get_environment_config() -> EnvironmentConfig:
    """현재 환경의 설정 가져오기 (환경 변수 재정의 포함)"""
    config = EnvironmentManager.get_config()
    return EnvironmentManager.override_from_env(config)


# 운영 환경 검증
def validate_production_settings():
    """운영 환경 설정 검증"""
    EnvironmentManager.validate_production_config()