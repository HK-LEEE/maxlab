#!/usr/bin/env python3
"""워크스페이스 그룹 데이터 확인"""

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
import os
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()

DATABASE_URL = "postgresql+asyncpg://postgres:2300@172.28.32.1:5432/max_lab"

async def check_workspace_groups():
    """워크스페이스 그룹 데이터 확인"""
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # 1. 전체 워크스페이스 수 확인
        result = await session.execute(text("SELECT COUNT(*) FROM workspaces"))
        total_workspaces = result.scalar()
        print(f"\n=== 전체 워크스페이스 수: {total_workspaces} ===")
        
        # 2. 워크스페이스 그룹 권한 확인
        result = await session.execute(text("""
            SELECT 
                w.id, 
                w.name, 
                wg.group_name,
                wg.group_id_uuid,
                wg.group_display_name,
                wg.permission_level
            FROM workspaces w
            LEFT JOIN workspace_groups wg ON w.id = wg.workspace_id
            WHERE w.is_active = true
            ORDER BY w.name, wg.group_name
            LIMIT 20
        """))
        
        print("\n=== 워크스페이스 그룹 권한 ===")
        current_ws = None
        for row in result:
            ws_id, ws_name, group_name, group_uuid, group_display, permission = row
            if current_ws != ws_name:
                print(f"\n워크스페이스: {ws_name} (ID: {ws_id})")
                current_ws = ws_name
            if group_name:
                print(f"  - 그룹: {group_display or group_name}")
                print(f"    UUID: {group_uuid}")
                print(f"    권한: {permission}")
        
        # 3. 특정 사용자의 그룹 확인 (d65db892-9691-46e3-a2c6-d962980f2f51)
        test_user_uuid = "d65db892-9691-46e3-a2c6-d962980f2f51"
        print(f"\n=== 사용자 {test_user_uuid} 관련 권한 확인 ===")
        
        # 사용자 직접 권한
        result = await session.execute(text("""
            SELECT w.name, wu.permission_level
            FROM workspaces w
            JOIN workspace_users wu ON w.id = wu.workspace_id
            WHERE (wu.user_id_uuid = :user_uuid OR wu.user_id = :user_id)
            AND w.is_active = true
        """), {"user_uuid": test_user_uuid, "user_id": test_user_uuid})
        
        print("\n직접 사용자 권한:")
        for row in result:
            print(f"  - {row[0]}: {row[1]}")
        
        # 4. 빈 그룹 UUID 확인
        result = await session.execute(text("""
            SELECT COUNT(*) 
            FROM workspace_groups 
            WHERE group_id_uuid IS NULL
        """))
        null_groups = result.scalar()
        print(f"\n=== NULL group_id_uuid를 가진 그룹 수: {null_groups} ===")
        
        # 5. 샘플 워크스페이스 상세 정보
        result = await session.execute(text("""
            SELECT id, name, owner_id, owner_type
            FROM workspaces
            WHERE is_active = true
            LIMIT 5
        """))
        
        print("\n=== 샘플 워크스페이스 정보 ===")
        for row in result:
            print(f"ID: {row[0]}")
            print(f"이름: {row[1]}")
            print(f"소유자: {row[3]} - {row[2]}")
            print("---")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_workspace_groups())