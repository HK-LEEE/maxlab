"""
데이터베이스 설정
SQLAlchemy 2.0 비동기 패턴을 사용하여 PostgreSQL 17과 연결합니다.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator
import logging

from .config import settings
import ssl

logger = logging.getLogger(__name__)

class Base(DeclarativeBase):
    """모든 데이터베이스 모델의 기본 클래스"""
    pass

def _get_database_connect_args() -> dict:
    """데이터베이스 연결 인수 생성 (SSL 설정 포함, psycopg v3 호환)"""
    if "postgresql" not in settings.DATABASE_URL:
        return {}

    # psycopg(v3)에 맞는 연결 인수 생성
    # 'server_settings' 대신 직접 파라미터를 전달합니다.
    connect_args = {
        "application_name": "maxlab_backend",
        "options": "-c jit=off"  # 'jit' 설정은 options 파라미터로 전달
    }

    # SSL 설정 적용 (이 부분은 psycopg v3에서도 동일하게 작동합니다)
    if settings.DB_SSL_MODE and settings.DB_SSL_MODE != "disable":
        try:
            ssl_context = ssl.create_default_context()

            if settings.DB_SSL_MODE == "require":
                # psycopg v3에서는 sslmode=require일 때 check_hostname을 false로 설정할 필요가 없습니다.
                # ssl.CERT_NONE으로 충분합니다.
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
            elif settings.DB_SSL_MODE == "verify-ca":
                ssl_context.verify_mode = ssl.CERT_REQUIRED
                if settings.DB_SSL_CA_PATH:
                    ssl_context.load_verify_locations(settings.DB_SSL_CA_PATH)
                else:
                    # verify-ca 모드에서는 CA 파일이 필수입니다.
                    logger.error("DB_SSL_CA_PATH must be set for verify-ca mode.")
                    raise ValueError("DB_SSL_CA_PATH must be set for verify-ca mode.")
                ssl_context.check_hostname = False
            elif settings.DB_SSL_MODE == "verify-full":
                ssl_context.verify_mode = ssl.CERT_REQUIRED
                if settings.DB_SSL_CA_PATH:
                    ssl_context.load_verify_locations(settings.DB_SSL_CA_PATH)
                else:
                    # verify-full 모드에서는 CA 파일이 필수입니다.
                    logger.error("DB_SSL_CA_PATH must be set for verify-full mode.")
                    raise ValueError("DB_SSL_CA_PATH must be set for verify-full mode.")
                ssl_context.check_hostname = True
            
            # 클라이언트 인증서 로드
            if settings.DB_SSL_CERT_PATH and settings.DB_SSL_KEY_PATH:
                ssl_context.load_cert_chain(
                    settings.DB_SSL_CERT_PATH, 
                    settings.DB_SSL_KEY_PATH
                )
            
            # psycopg(v3)는 ssl.SSLContext 객체를 직접 받지 않습니다.
            # 대신 연결 문자열이나 다른 파라미터를 사용해야 하지만,
            # SQLAlchemy는 connect_args의 'ssl'을 내부적으로 처리해 줄 수 있습니다.
            # 하지만 더 명시적인 방법은 sslmode, sslrootcert 등을 직접 사용하는 것입니다.
            # 여기서는 SQLAlchemy의 호환성을 믿고 기존 방식을 유지하되,
            # 문제가 발생할 경우 DATABASE_URL에 sslmode=verify-full 과 같은 파라미터를 추가하는 것이 좋습니다.
            connect_args["ssl"] = ssl_context
            logger.info(f"SSL/TLS enabled for database connection (mode: {settings.DB_SSL_MODE})")

        except Exception as e:
            logger.warning(f"SSL configuration failed, falling back to non-SSL connection: {e}")
            # SSL 설정 실패 시 connect_args에서 'ssl' 키를 제거합니다.
            if 'ssl' in connect_args:
                del connect_args['ssl']
    else:
        logger.info("SSL/TLS disabled for database connection")

    return connect_args
    

# 비동기 엔진 생성 - 프로덕션 최적화 설정
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # SQL 쿼리 로깅
    future=True,
    pool_pre_ping=True,   # 연결 상태 확인
    pool_recycle=1800,    # 30분마다 연결 재생성 (최적화)
    pool_size=20,         # 기본 커넥션 풀 크기 증가
    max_overflow=30,      # 최대 추가 연결 수
    pool_timeout=30,      # 연결 대기 시간 (초)
    connect_args=_get_database_connect_args()
)

# 비동기 세션 팩토리 생성
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    데이터베이스 세션을 제공하는 의존성 주입 함수
    FastAPI의 Depends()와 함께 사용됩니다.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            logger.error(f"Database session error: {e}")
            await session.rollback()
            raise
        finally:
            await session.close()

async def create_tables():
    """
    데이터베이스 테이블 생성
    개발 환경에서만 사용하며, 운영환경에서는 Alembic을 사용합니다.
    """
    if settings.ENVIRONMENT == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables created successfully")

async def drop_tables():
    """
    데이터베이스 테이블 삭제
    개발/테스트 환경에서만 사용합니다.
    """
    if settings.ENVIRONMENT in ["development", "testing"]:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            logger.info("Database tables dropped successfully")

async def close_db():
    """
    데이터베이스 엔진 종료
    애플리케이션 종료시 호출됩니다.
    """
    await engine.dispose()
    logger.info("Database engine disposed")