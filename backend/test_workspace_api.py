#!/usr/bin/env python3
"""
워크스페이스 API 엔드포인트 테스트 스크립트
인증 없이 직접 데이터베이스를 통해 워크스페이스 조회 테스트
"""
import asyncio
import sys
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv()

# Import settings and models
from app.core.config import settings
from app.core.database import engine
from app.crud.workspace import workspace_crud

async def test_direct_workspace_access():
    """직접 데이터베이스를 통한 워크스페이스 접근 테스트"""
    
    print("🧪 Testing workspace database access...")
    print(f"Database URL: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'local'}")
    
    # Create session
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with AsyncSessionLocal() as session:
        try:
            # 1. 기본 워크스페이스 카운트 확인
            result = await session.execute(text("SELECT COUNT(*) FROM workspaces"))
            workspace_count = result.scalar()
            print(f"📊 Total workspaces in database: {workspace_count}")
            
            # 2. 활성 워크스페이스 카운트 확인
            result = await session.execute(text("SELECT COUNT(*) FROM workspaces WHERE is_active = true"))
            active_count = result.scalar()
            print(f"✅ Active workspaces: {active_count}")
            
            # 3. 샘플 워크스페이스 정보 조회
            result = await session.execute(text(
                "SELECT id, name, slug, workspace_type, owner_type, is_active "
                "FROM workspaces LIMIT 5"
            ))
            workspaces = result.fetchall()
            
            print(f"\n📋 Sample workspaces:")
            for ws in workspaces:
                print(f"  - ID: {ws[0]}")
                print(f"    Name: {ws[1]}")
                print(f"    Slug: {ws[2]}")
                print(f"    Type: {ws[3]}")
                print(f"    Owner Type: {ws[4]}")
                print(f"    Active: {ws[5]}")
                print()
            
            # 4. CRUD 클래스를 통한 조회 테스트
            print("🔧 Testing CRUD layer...")
            
            # 관리자 권한으로 모든 워크스페이스 조회
            admin_workspaces = await workspace_crud.get_multi(
                db=session,
                skip=0,
                limit=10,
                active_only=True,
                is_admin=True  # 관리자 권한으로 테스트
            )
            
            print(f"📦 Workspaces via CRUD (admin): {len(admin_workspaces)}")
            for ws in admin_workspaces:
                print(f"  - {ws.name} ({ws.id})")
            
            # 5. 워크스페이스 트리 구조 테스트
            print("\n🌳 Testing workspace tree...")
            tree_workspaces = await workspace_crud.get_workspace_tree(
                db=session,
                is_admin=True  # 관리자 권한으로 테스트
            )
            
            print(f"🌲 Tree workspaces: {len(tree_workspaces)}")
            for ws in tree_workspaces:
                print(f"  - {ws.name} (Parent: {ws.parent_id})")
            
            # 6. 워크스페이스 사용자 및 그룹 확인
            result = await session.execute(text("SELECT COUNT(*) FROM workspace_users"))
            user_count = result.scalar()
            
            result = await session.execute(text("SELECT COUNT(*) FROM workspace_groups"))
            group_count = result.scalar()
            
            print(f"\n👥 Workspace permissions:")
            print(f"  - Users: {user_count}")
            print(f"  - Groups: {group_count}")
            
            print("\n✅ Database access test completed successfully!")
            
        except Exception as e:
            print(f"❌ Database test failed: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await session.close()

async def main():
    """메인 함수"""
    try:
        await test_direct_workspace_access()
    finally:
        await engine.dispose()

if __name__ == "__main__":
    print("MAX Lab Workspace API Test")
    print("==========================")
    
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"\n❌ Test Error: {e}")
        sys.exit(1)