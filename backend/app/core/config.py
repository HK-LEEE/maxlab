"""
MAX Lab MVP 종합 플랫폼 설정
동적 MVP 페이지 관리, 워크스페이스 및 권한 관리를 위한 설정입니다.
"""
from typing import Optional, Any, List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

from .env_config import (
    Environment, EnvironmentManager, SecretManager, 
    get_environment_config, validate_production_settings
)


class Settings(BaseSettings):
    """MAX Lab MVP 플랫폼 설정 클래스"""
    
    # 애플리케이션 정보
    APP_NAME: str = "MAX Lab MVP Platform"
    APP_VERSION: str = "1.0.0"
    APP_DESCRIPTION: str = "MAX Lab 동적 MVP 페이지 관리 플랫폼"
    
    # 데이터베이스 (PostgreSQL 17)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:2300@172.28.32.1:5432/max_lab"
    
    # 데이터베이스 SSL/TLS 보안 설정 (환경별 기본값)
    DB_SSL_MODE: Optional[str] = None  # 환경별 자동 설정
    DB_SSL_CERT_PATH: Optional[str] = None  # 클라이언트 인증서 경로
    DB_SSL_KEY_PATH: Optional[str] = None   # 클라이언트 키 경로
    DB_SSL_CA_PATH: Optional[str] = None    # CA 인증서 경로
    
    @field_validator('DB_SSL_MODE')
    @classmethod
    def validate_ssl_mode(cls, v: Optional[str], info) -> str:
        """환경에 따른 SSL 모드 자동 조정"""
        # 환경별 기본값 사용
        if v is None:
            env_config = get_environment_config()
            return env_config.db_ssl_mode
        
        # 명시적으로 설정된 경우 검증
        valid_modes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']
        if v not in valid_modes:
            raise ValueError(f"DB_SSL_MODE must be one of {valid_modes}")
        
        return v
    
    # 보안
    SECRET_KEY: Optional[str] = None
    JWT_SECRET_KEY: Optional[str] = None
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # CSRF 보안 설정
    CSRF_SECRET_KEY: Optional[str] = None
    CSRF_TOKEN_LENGTH: int = 32
    CSRF_COOKIE_NAME: str = "csrf_token"
    CSRF_HEADER_NAME: str = "X-CSRF-Token"
    CSRF_COOKIE_SAMESITE: Optional[str] = None
    CSRF_COOKIE_SECURE: Optional[bool] = None
    
    # 세션 보안 설정
    SESSION_SECRET_KEY: Optional[str] = None
    SESSION_COOKIE_NAME: str = "maxlab_session"
    SESSION_LIFETIME_SECONDS: Optional[int] = None
    SESSION_REMEMBER_ME_LIFETIME_SECONDS: Optional[int] = None
    SESSION_MAX_PER_USER: int = 5
    SESSION_RENEWAL_THRESHOLD_SECONDS: int = 300  # 5 minutes
    SESSION_COOKIE_SECURE: Optional[bool] = None
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: Optional[str] = None
    
    # 레이트 리미팅 설정
    REDIS_URL: str = "redis://localhost:6379/0"
    RATE_LIMITING_ENABLED: Optional[bool] = None
    RATE_LIMITING_FAIL_OPEN: Optional[bool] = None
    RATE_LIMITING_HEADERS_ENABLED: bool = True  # Include rate limit headers in responses
    
    # 외부 인증 서버 (localhost:8000의 MAXDP 인증 서버)
    AUTH_SERVER_URL: str = "http://localhost:8000"
    AUTH_SERVER_TIMEOUT: int = 10
    
    # OAuth/OIDC Client Configuration
    CLIENT_ID: str = "maxlab"  # OAuth client ID for this application
    
    # External Authentication Service Settings
    # Note: SERVICE_TOKEN, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET are no longer needed
    # User OAuth tokens are now used directly for API calls
    
    # Legacy get_service_token method removed
    # OAuth user tokens are now used directly for API calls
    
    def validate_oauth_config(self) -> bool:
        """
        OAuth 설정 검증
        
        Returns:
            bool: 설정이 유효한 경우 True
            
        Raises:
            ValueError: 필수 설정이 누락된 경우
        """
        if not self.AUTH_SERVER_URL:
            raise ValueError("AUTH_SERVER_URL is not configured")
        
        if not self.AUTH_SERVER_URL.startswith(('http://', 'https://')):
            raise ValueError("AUTH_SERVER_URL must start with http:// or https://")
        
        return True
    
    # User/Group UUID Mapping Settings
    USER_MAPPING_CACHE_TTL: int = 3600  # User mapping cache TTL (seconds)
    GROUP_MAPPING_CACHE_TTL: int = 3600  # Group mapping cache TTL (seconds)
    PERMISSION_CACHE_TTL: int = 300  # Permission cache TTL (seconds)
    
    # External API Endpoints for UUID mapping
    AUTH_USERS_SEARCH_URL: str = "/api/users/search"
    AUTH_GROUPS_SEARCH_URL: str = "/api/groups/search"
    AUTH_USER_GROUPS_URL: str = "/api/users/{user_id}/groups"
    
    # UUID Mapping Fallback Settings
    ENABLE_DETERMINISTIC_UUID_GENERATION: bool = True
    UUID_NAMESPACE_USERS: str = "maxlab_users"
    UUID_NAMESPACE_GROUPS: str = "maxlab_groups"
    
    # Legacy/External API URLs (for compatibility)
    MAXPLATFORM_API_URL: Optional[str] = None  # Added for .env compatibility
    
    # 서버 설정
    HOST: str = "0.0.0.0"
    PORT: int = 8010  # MAX Lab MVP 플랫폼 포트
    
    # 환경 설정
    ENVIRONMENT: str = "development"
    DEBUG: Optional[bool] = None
    
    # CORS 설정
    BACKEND_CORS_ORIGINS: Optional[List[str]] = None
    
    # MVP 모듈 설정
    MVP_MODULES_DIR: str = "workspaces"  # MVP 모듈 디렉토리
    AUTO_LOAD_MODULES: bool = True       # 시작시 자동 모듈 로딩
    
    # 워크스페이스 기본 설정
    DEFAULT_WORKSPACE_LIMIT: int = 100   # 기본 워크스페이스 조회 제한
    MAX_WORKSPACES_PER_USER: int = 50    # 사용자당 최대 워크스페이스
    
    # 파일 업로드 설정
    UPLOAD_PATH: str = "uploads"          # 파일 업로드 경로
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 최대 업로드 크기 (100MB)
    
    # 스케줄러 및 자동화 설정
    AUTO_CLOSE_DAYS_DEFAULT: int = 90    # Added for .env compatibility
    
    # 정적 파일 설정
    STATIC_FILES_DIR: str = "static"     # 빌드된 React 앱 경로
    SERVE_STATIC_FILES: bool = True      # 정적 파일 서빙 여부
    
    # 로깅 설정
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"  # json 또는 console
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"  # Ignore extra fields from environment to prevent validation errors
    )
    
    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: str | List[str]) -> List[str]:
        """CORS origins 설정 파싱"""
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v
    
    @field_validator("DEBUG", mode="before")
    def set_debug_mode(cls, v: Any) -> bool:
        """디버그 모드 설정"""
        if v is None:
            env_config = get_environment_config()
            return env_config.debug
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes", "on")
        return bool(v)
    
    @field_validator("SECRET_KEY")
    def set_secret_key(cls, v: Optional[str]) -> str:
        """비밀키 설정"""
        if v is None:
            return SecretManager.get_or_generate_secret("SECRET_KEY", 32)
        return v
    
    @field_validator("JWT_SECRET_KEY")
    def set_jwt_secret_key(cls, v: Optional[str]) -> str:
        """JWT 비밀키 설정"""
        if v is None:
            return SecretManager.get_or_generate_secret("JWT_SECRET_KEY", 32)
        return v
    
    @field_validator("CSRF_SECRET_KEY")
    def set_csrf_secret_key(cls, v: Optional[str]) -> str:
        """CSRF 비밀키 설정"""
        if v is None:
            return SecretManager.get_or_generate_secret("CSRF_SECRET_KEY", 32)
        return v
    
    @field_validator("SESSION_SECRET_KEY")
    def set_session_secret_key(cls, v: Optional[str]) -> str:
        """세션 비밀키 설정"""
        if v is None:
            return SecretManager.get_or_generate_secret("SESSION_SECRET_KEY", 32)
        return v
    
    @field_validator("CSRF_COOKIE_SECURE", "SESSION_COOKIE_SECURE")
    def set_cookie_secure(cls, v: Optional[bool]) -> bool:
        """쿠키 보안 설정"""
        if v is None:
            env_config = get_environment_config()
            return env_config.cookie_secure
        return v
    
    @field_validator("CSRF_COOKIE_SAMESITE", "SESSION_COOKIE_SAMESITE")
    def set_cookie_samesite(cls, v: Optional[str]) -> str:
        """쿠키 SameSite 설정"""
        if v is None:
            env_config = get_environment_config()
            return env_config.cookie_samesite
        return v
    
    @field_validator("SESSION_LIFETIME_SECONDS")
    def set_session_lifetime(cls, v: Optional[int]) -> int:
        """세션 유효 시간 설정"""
        if v is None:
            env_config = get_environment_config()
            return env_config.session_lifetime
        return v
    
    @field_validator("SESSION_REMEMBER_ME_LIFETIME_SECONDS")
    def set_remember_me_lifetime(cls, v: Optional[int]) -> int:
        """Remember Me 세션 유효 시간 설정"""
        if v is None:
            env_config = get_environment_config()
            return env_config.session_remember_me_lifetime
        return v
    
    @field_validator("BACKEND_CORS_ORIGINS")
    def set_cors_origins(cls, v: Optional[List[str]]) -> List[str]:
        """CORS origins 설정"""
        if v is None:
            env_config = get_environment_config()
            return env_config.cors_allow_origins
        return v
    
    @field_validator("RATE_LIMITING_ENABLED")
    def set_rate_limiting(cls, v: Optional[bool]) -> bool:
        """레이트 리미팅 활성화 설정"""
        if v is None:
            env_config = get_environment_config()
            return env_config.rate_limit_enabled
        return v
    
    @field_validator("RATE_LIMITING_FAIL_OPEN")
    def set_rate_limiting_fail_open(cls, v: Optional[bool]) -> bool:
        """레이트 리미팅 실패 시 동작 설정"""
        if v is None:
            env_config = get_environment_config()
            return env_config.rate_limit_fail_open
        return v
    
    @field_validator("LOG_LEVEL")
    def set_log_level(cls, v: str) -> str:
        """로그 레벨 설정"""
        env_config = get_environment_config()
        return env_config.log_level
    
    @field_validator("LOG_FORMAT")
    def set_log_format(cls, v: str) -> str:
        """로그 포맷 설정"""
        env_config = get_environment_config()
        return env_config.log_format

    def get_auth_server_url(self) -> str:
        """외부 인증 서버 URL 반환 (호환성을 위해 MAXPLATFORM_API_URL도 확인)"""
        return self.MAXPLATFORM_API_URL or self.AUTH_SERVER_URL
    
    @property
    def full_auth_users_search_url(self) -> str:
        """Get full URL for users search API"""
        return f"{self.get_auth_server_url().rstrip('/')}{self.AUTH_USERS_SEARCH_URL}"
    
    @property
    def full_auth_groups_search_url(self) -> str:
        """Get full URL for groups search API"""
        return f"{self.get_auth_server_url().rstrip('/')}{self.AUTH_GROUPS_SEARCH_URL}"
    
    def get_user_groups_url(self, user_id: str) -> str:
        """Get full URL for user groups API"""
        return f"{self.get_auth_server_url().rstrip('/')}{self.AUTH_USER_GROUPS_URL.format(user_id=user_id)}"
    
    def model_post_init(self, __context) -> None:
        """모델 초기화 후 검증"""
        # 운영 환경 설정 검증
        if self.ENVIRONMENT == "production":
            try:
                validate_production_settings()
            except ValueError as e:
                # 운영 환경에서는 엄격하게 검증
                raise ValueError(f"Production configuration error: {e}")
        
        # 암호화 키 검증
        if hasattr(self, 'ENCRYPTION_KEY') and self.ENCRYPTION_KEY:
            self.ENCRYPTION_KEY = SecretManager.validate_encryption_key(self.ENCRYPTION_KEY)


settings = Settings()
