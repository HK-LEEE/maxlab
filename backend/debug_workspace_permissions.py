#!/usr/bin/env python3
"""워크스페이스 권한 디버깅"""

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
import uuid

DATABASE_URL = "postgresql+asyncpg://postgres:2300@172.28.32.1:5432/max_lab"

async def debug_workspace_permissions():
    """워크스페이스 권한 디버깅"""
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # 테스트 사용자 정보
        test_user_email = "krn@test.com"
        test_user_uuid = "d65db892-9691-46e3-a2c6-d962980f2f51"
        test_group_uuid = "125006d1-4ed3-4e6e-87a3-2649a808901c"
        
        print(f"\n=== {test_user_email} 사용자의 워크스페이스 권한 디버깅 ===")
        print(f"User UUID: {test_user_uuid}")
        print(f"Group UUID: {test_group_uuid}")
        
        # 1. Group_Test 워크스페이스 정보 확인
        print("\n1. Group_Test 워크스페이스 정보:")
        result = await session.execute(text("""
            SELECT id, name, owner_id, owner_type, is_active
            FROM workspaces
            WHERE name = 'Group_Test'
        """))
        
        for row in result:
            ws_id = row[0]
            print(f"   - ID: {row[0]}")
            print(f"   - 이름: {row[1]}")
            print(f"   - 소유자 ID: {row[2]}")
            print(f"   - 소유자 타입: {row[3]}")
            print(f"   - 활성화: {row[4]}")
        
        # 2. Group_Test의 그룹 권한 확인
        print("\n2. Group_Test의 그룹 권한:")
        result = await session.execute(text("""
            SELECT wg.group_name, wg.group_id_uuid, wg.permission_level
            FROM workspace_groups wg
            JOIN workspaces w ON w.id = wg.workspace_id
            WHERE w.name = 'Group_Test'
        """))
        
        group_count = 0
        for row in result:
            group_count += 1
            print(f"   - 그룹명: {row[0]}")
            print(f"   - 그룹 UUID: {row[1]}")
            print(f"   - 권한: {row[2]}")
            print()
        
        if group_count == 0:
            print("   (그룹 권한 없음)")
        
        # 3. Group_Test의 사용자 권한 확인
        print("\n3. Group_Test의 사용자 권한:")
        result = await session.execute(text("""
            SELECT wu.user_id, wu.user_id_uuid, wu.permission_level
            FROM workspace_users wu
            JOIN workspaces w ON w.id = wu.workspace_id
            WHERE w.name = 'Group_Test'
        """))
        
        user_count = 0
        for row in result:
            user_count += 1
            print(f"   - 사용자 ID: {row[0]}")
            print(f"   - 사용자 UUID: {row[1]}")
            print(f"   - 권한: {row[2]}")
            print()
        
        if user_count == 0:
            print("   (사용자 권한 없음)")
        
        # 4. 사용자가 Group_Test를 볼 수 있는 이유 분석
        print(f"\n4. {test_user_email}이 Group_Test를 볼 수 있는 이유 분석:")
        
        # 소유자인지 확인
        result = await session.execute(text("""
            SELECT COUNT(*) 
            FROM workspaces 
            WHERE name = 'Group_Test' 
            AND owner_id = :owner_id
        """), {"owner_id": test_user_uuid})
        
        if result.scalar() > 0:
            print("   ✓ 사용자가 워크스페이스 소유자입니다")
        
        # 직접 권한이 있는지 확인
        result = await session.execute(text("""
            SELECT COUNT(*) 
            FROM workspace_users wu
            JOIN workspaces w ON w.id = wu.workspace_id
            WHERE w.name = 'Group_Test' 
            AND (wu.user_id_uuid = :user_uuid OR wu.user_id = :user_id)
        """), {"user_uuid": test_user_uuid, "user_id": test_user_uuid})
        
        if result.scalar() > 0:
            print("   ✓ 사용자가 직접 권한을 가지고 있습니다")
        
        # 그룹 권한이 있는지 확인
        result = await session.execute(text("""
            SELECT wg.group_name, wg.group_id_uuid
            FROM workspace_groups wg
            JOIN workspaces w ON w.id = wg.workspace_id
            WHERE w.name = 'Group_Test' 
            AND (wg.group_id_uuid = :group_uuid OR wg.group_name = :group_name)
        """), {"group_uuid": test_group_uuid, "group_name": "test_a"})
        
        for row in result:
            print(f"   ✓ 사용자의 그룹 '{row[0]}' (UUID: {row[1]})이 권한을 가지고 있습니다")
        
        # 5. 모든 워크스페이스와 test_a 그룹의 관계
        print("\n5. test_a 그룹이 권한을 가진 모든 워크스페이스:")
        result = await session.execute(text("""
            SELECT w.name, wg.permission_level
            FROM workspace_groups wg
            JOIN workspaces w ON w.id = wg.workspace_id
            WHERE wg.group_id_uuid = :group_uuid
            OR wg.group_name = 'test_a'
            ORDER BY w.name
        """), {"group_uuid": test_group_uuid})
        
        for row in result:
            print(f"   - {row[0]}: {row[1]}")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(debug_workspace_permissions())