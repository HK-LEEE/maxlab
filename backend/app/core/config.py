"""
MAX Lab MVP 종합 플랫폼 설정
동적 MVP 페이지 관리, 워크스페이스 및 권한 관리를 위한 설정입니다.
"""
from typing import Optional, Any, List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    """MAX Lab MVP 플랫폼 설정 클래스"""
    
    # 애플리케이션 정보
    APP_NAME: str = "MAX Lab MVP Platform"
    APP_VERSION: str = "1.0.0"
    APP_DESCRIPTION: str = "MAX Lab 동적 MVP 페이지 관리 플랫폼"
    
    # 데이터베이스 (PostgreSQL 17)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/max_lab"
    
    # 데이터베이스 SSL/TLS 보안 설정 (환경별 기본값)
    DB_SSL_MODE: str = "disable"  # 개발: disable, 프로덕션: require
    DB_SSL_CERT_PATH: Optional[str] = None  # 클라이언트 인증서 경로
    DB_SSL_KEY_PATH: Optional[str] = None   # 클라이언트 키 경로
    DB_SSL_CA_PATH: Optional[str] = None    # CA 인증서 경로
    
    @field_validator('DB_SSL_MODE')
    @classmethod
    def validate_ssl_mode(cls, v: str, info) -> str:
        """환경에 따른 SSL 모드 자동 조정"""
        # 환경 변수에서 직접 설정된 경우 그대로 사용
        if hasattr(info.data, 'get') and 'ENVIRONMENT' in info.data:
            env = info.data.get('ENVIRONMENT', 'development')
        else:
            env = 'development'
        
        # 프로덕션 환경에서는 SSL 보안 강화 권장
        if env == 'production' and v == 'disable':
            return 'require'  # 프로덕션에서는 최소 require 모드
        
        valid_modes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']
        if v not in valid_modes:
            raise ValueError(f"DB_SSL_MODE must be one of {valid_modes}")
        
        return v
    
    # 보안
    SECRET_KEY: str = "max-lab-secret-key-change-this-in-production"
    JWT_SECRET_KEY: str = "max-lab-jwt-secret-key-change-this"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # CSRF 보안 설정
    CSRF_SECRET_KEY: str = "csrf-secret-key-change-this-in-production"
    CSRF_TOKEN_LENGTH: int = 32
    CSRF_COOKIE_NAME: str = "csrf_token"
    CSRF_HEADER_NAME: str = "X-CSRF-Token"
    CSRF_COOKIE_SAMESITE: str = "strict"
    CSRF_COOKIE_SECURE: bool = False  # Set to True in production with HTTPS
    
    # 세션 보안 설정
    SESSION_SECRET_KEY: str = "session-secret-key-change-this-in-production"
    SESSION_COOKIE_NAME: str = "maxlab_session"
    SESSION_LIFETIME_SECONDS: int = 3600  # 1 hour
    SESSION_REMEMBER_ME_LIFETIME_SECONDS: int = 86400 * 30  # 30 days
    SESSION_MAX_PER_USER: int = 5
    SESSION_RENEWAL_THRESHOLD_SECONDS: int = 300  # 5 minutes
    SESSION_COOKIE_SECURE: bool = False  # Set to True in production with HTTPS
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "strict"
    
    # 레이트 리미팅 설정
    REDIS_URL: str = "redis://localhost:6379/0"
    RATE_LIMITING_ENABLED: bool = True
    RATE_LIMITING_FAIL_OPEN: bool = True  # Allow requests if Redis is down
    RATE_LIMITING_HEADERS_ENABLED: bool = True  # Include rate limit headers in responses
    
    # 외부 인증 서버 (localhost:8000의 MAXDP 인증 서버)
    AUTH_SERVER_URL: str = "http://localhost:8000"
    AUTH_SERVER_TIMEOUT: int = 10
    
    # Legacy/External API URLs (for compatibility)
    MAXPLATFORM_API_URL: Optional[str] = None  # Added for .env compatibility
    
    # 서버 설정
    HOST: str = "0.0.0.0"
    PORT: int = 8010  # MAX Lab MVP 플랫폼 포트
    
    # 환경 설정
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # CORS 설정
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",  # React dev server
        "http://localhost:3007",  # React dev server (alternative port)
        "http://localhost:3008",  # React dev server (your current frontend)
        "http://localhost:3010",  # React dev server (fixed port)
        "http://localhost:5173",  # Vite dev server
        "http://localhost:8000",  # Auth server
        "http://localhost:8001",  # Self
        "http://localhost:8010",  # Current server port
    ]
    
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
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes", "on")
        return bool(v)

    def get_auth_server_url(self) -> str:
        """외부 인증 서버 URL 반환 (호환성을 위해 MAXPLATFORM_API_URL도 확인)"""
        return self.MAXPLATFORM_API_URL or self.AUTH_SERVER_URL


settings = Settings()
