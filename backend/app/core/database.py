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

logger = logging.getLogger(__name__)

class Base(DeclarativeBase):
    """모든 데이터베이스 모델의 기본 클래스"""
    pass

# 비동기 엔진 생성
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # SQL 쿼리 로깅
    future=True,
    pool_pre_ping=True,   # 연결 상태 확인
    pool_recycle=3600,    # 1시간마다 연결 재생성
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