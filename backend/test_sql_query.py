#!/usr/bin/env python3
"""SQL 쿼리 테스트"""

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text, and_, or_, exists
from sqlalchemy.orm import selectinload
import uuid

DATABASE_URL = "postgresql+asyncpg://postgres:2300@172.28.32.1:5432/max_lab"

async def test_sql_query():
    """SQL 쿼리 테스트"""
    engine = create_async_engine(DATABASE_URL, echo=True)  # SQL 쿼리 출력
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # 테스트 사용자 정보
        test_user_uuid = uuid.UUID("d65db892-9691-46e3-a2c6-d962980f2f51")
        test_group_uuids = [uuid.UUID("125006d1-4ed3-4e6e-87a3-2649a808901c")]
        
        print("\n=== 권한 필터링 SQL 쿼리 테스트 ===")
        
        # SQLAlchemy ORM으로 쿼리 생성
        from app.models.workspace import Workspace, WorkspaceUser, WorkspaceGroup
        
        stmt = select(Workspace)
        stmt = stmt.where(Workspace.is_active == True)
        
        permission_conditions = []
        
        # 1. 소유자 권한
        permission_conditions.append(Workspace.owner_id == str(test_user_uuid))
        
        # 2. 사용자 권한
        user_exists = exists().where(
            and_(
                WorkspaceUser.workspace_id == Workspace.id,
                or_(
                    WorkspaceUser.user_id_uuid == test_user_uuid,
                    WorkspaceUser.user_id == str(test_user_uuid)
                )
            )
        )
        permission_conditions.append(user_exists)
        
        # 3. 그룹 권한
        group_exists = exists().where(
            and_(
                WorkspaceGroup.workspace_id == Workspace.id,
                or_(
                    WorkspaceGroup.group_id_uuid.in_(test_group_uuids),
                    WorkspaceGroup.group_name.in_([str(g) for g in test_group_uuids])
                )
            )
        )
        permission_conditions.append(group_exists)
        
        stmt = stmt.where(or_(*permission_conditions))
        
        print("\n실행될 쿼리:")
        print(stmt)
        
        result = await session.execute(stmt)
        workspaces = result.scalars().all()
        
        print(f"\n결과: {len(workspaces)}개 워크스페이스")
        for ws in workspaces:
            print(f"  - {ws.name} (Owner: {ws.owner_type}/{ws.owner_id})")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_sql_query())