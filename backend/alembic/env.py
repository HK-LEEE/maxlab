"""
Alembic 환경 설정
PostgreSQL 기반 MAX Lab MVP Platform의 데이터베이스 마이그레이션 설정
"""
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context
import asyncio
import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
sys.path.append(str(Path(__file__).parent.parent))

from app.core.config import settings
from app.core.database import Base

# MAX Lab 모델들을 명시적으로 import (Alembic이 테이블 정의를 찾을 수 있도록)
from app.models.workspace import Workspace, WorkspaceGroup, MVPModule, MVPModuleLog

# Alembic Config 객체
config = context.config

# logging 설정 (alembic.ini에서 구성)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 메타데이터 설정 - 모든 모델들이 포함됨
target_metadata = Base.metadata

# 데이터베이스 URL 설정
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)


def run_migrations_offline() -> None:
    """오프라인 모드에서 마이그레이션 실행"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """실제 마이그레이션 실행"""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        # PostgreSQL 특화 설정
        render_as_batch=False,  # PostgreSQL은는 배치 모드 불필요
        include_schemas=True,   # 스키마 포함
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """비동기 마이그레이션 실행"""
    connectable = create_async_engine(
        settings.DATABASE_URL,
        poolclass=pool.NullPool,
        future=True,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """온라인 모드에서 마이그레이션 실행 (비동기)"""
    asyncio.run(run_async_migrations())


# 컨텍스트 모드에 따라 실행
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()