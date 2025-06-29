"""
테스트 설정 및 공통 픽스처
"""
import pytest
import asyncio
from typing import AsyncGenerator, Generator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from httpx import AsyncClient
import uuid

from app.core.database import Base
from app.core.config import settings
from app.main import app
from app.core.database import get_db


# 테스트용 데이터베이스 URL
TEST_DATABASE_URL = settings.DATABASE_URL.replace(
    "max_lab", "max_lab_test"
)

# 테스트용 엔진 및 세션
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    test_engine, 
    class_=AsyncSession,
    expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """이벤트 루프 픽스처"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """데이터베이스 세션 픽스처"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    async with TestSessionLocal() as session:
        yield session
        await session.close()


@pytest.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP 클라이언트 픽스처"""
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.fixture
def mock_user():
    """테스트용 사용자 데이터"""
    return {
        "user_id": str(uuid.uuid4()),
        "username": "testuser",
        "email": "test@example.com",
        "role": "user",
        "is_active": True,
        "groups": ["group1", "group2"]
    }


@pytest.fixture
def mock_admin_user():
    """테스트용 관리자 데이터"""
    return {
        "user_id": str(uuid.uuid4()),
        "username": "admin",
        "email": "admin@example.com",
        "role": "admin",
        "is_active": True,
        "groups": ["admin"]
    }


@pytest.fixture
def auth_headers(mock_user):
    """인증 헤더"""
    # 실제 구현에서는 JWT 토큰을 생성해야 함
    return {"Authorization": "Bearer test-token"}


@pytest.fixture
def admin_auth_headers(mock_admin_user):
    """관리자 인증 헤더"""
    return {"Authorization": "Bearer admin-test-token"}