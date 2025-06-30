#!/usr/bin/env python3
"""
Script to seed test data into workspace tables
"""
import asyncio
import os
import sys
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv
import uuid

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv()

# Import settings and models
from app.core.config import settings
from app.core.database import Base, engine
from app.models.workspace import Workspace, WorkspaceUser, WorkspaceGroup, WorkspaceType, OwnerType

async def seed_data():
    """Seed test data into workspace tables"""
    
    # Create session
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with AsyncSessionLocal() as session:
        try:
            print("🌱 Seeding workspace data...")
            
            # Create test workspaces
            test_workspaces = [
                {
                    "name": "Data Analysis Workspace",
                    "slug": "data-analysis",
                    "description": "Workspace for data analysis team",
                    "workspace_type": WorkspaceType.GROUP,
                    "owner_type": OwnerType.GROUP,
                    "owner_id": "data-analysts",
                    "created_by": "admin",
                },
                {
                    "name": "John's Personal Workspace",
                    "slug": "john-personal",
                    "description": "Personal workspace for John Doe",
                    "workspace_type": WorkspaceType.PERSONAL,
                    "owner_type": OwnerType.USER,
                    "owner_id": "john.doe",
                    "created_by": "john.doe",
                },
                {
                    "name": "Development Team",
                    "slug": "dev-team",
                    "description": "Workspace for development team",
                    "workspace_type": WorkspaceType.GROUP,
                    "owner_type": OwnerType.GROUP,
                    "owner_id": "developers",
                    "created_by": "admin",
                },
            ]
            
            workspace_ids = []
            
            # Check if workspaces already exist
            result = await session.execute(text("SELECT COUNT(*) FROM workspaces"))
            existing_count = result.scalar()
            
            if existing_count > 0:
                print(f"ℹ️  Found {existing_count} existing workspaces. Skipping workspace creation.")
                # Get existing workspace IDs
                result = await session.execute(text("SELECT id FROM workspaces LIMIT 3"))
                workspace_ids = [row[0] for row in result]
            else:
                # Create workspaces
                for ws_data in test_workspaces:
                    workspace = Workspace(**ws_data)
                    session.add(workspace)
                    await session.flush()
                    workspace_ids.append(workspace.id)
                    print(f"✅ Created workspace: {ws_data['name']}")
            
            # Add workspace users
            if workspace_ids:
                workspace_users = [
                    {
                        "workspace_id": workspace_ids[0],
                        "user_id": "alice.smith",
                        "user_display_name": "Alice Smith",
                        "permission_level": "write",
                        "created_by": "admin",
                    },
                    {
                        "workspace_id": workspace_ids[0],
                        "user_id": "bob.jones",
                        "user_display_name": "Bob Jones",
                        "permission_level": "read",
                        "created_by": "admin",
                    },
                    {
                        "workspace_id": workspace_ids[1] if len(workspace_ids) > 1 else workspace_ids[0],
                        "user_id": "jane.doe",
                        "user_display_name": "Jane Doe",
                        "permission_level": "admin",
                        "created_by": "john.doe",
                    },
                ]
                
                # Check existing workspace_users
                result = await session.execute(text("SELECT COUNT(*) FROM workspace_users"))
                existing_users = result.scalar()
                
                if existing_users == 0:
                    for user_data in workspace_users:
                        workspace_user = WorkspaceUser(**user_data)
                        session.add(workspace_user)
                    print(f"✅ Added {len(workspace_users)} workspace users")
                else:
                    print(f"ℹ️  Found {existing_users} existing workspace users")
            
            # Add workspace groups
            if workspace_ids:
                workspace_groups = [
                    {
                        "workspace_id": workspace_ids[0],
                        "group_name": "data-analysts",
                        "group_display_name": "Data Analysts",
                        "permission_level": "admin",
                        "created_by": "admin",
                    },
                    {
                        "workspace_id": workspace_ids[2] if len(workspace_ids) > 2 else workspace_ids[0],
                        "group_name": "developers",
                        "group_display_name": "Development Team",
                        "permission_level": "admin",
                        "created_by": "admin",
                    },
                    {
                        "workspace_id": workspace_ids[0],
                        "group_name": "viewers",
                        "group_display_name": "Read-only Viewers",
                        "permission_level": "read",
                        "created_by": "admin",
                    },
                ]
                
                # Check existing workspace_groups
                result = await session.execute(text("SELECT COUNT(*) FROM workspace_groups"))
                existing_groups = result.scalar()
                
                if existing_groups == 0:
                    for group_data in workspace_groups:
                        workspace_group = WorkspaceGroup(**group_data)
                        session.add(workspace_group)
                    print(f"✅ Added {len(workspace_groups)} workspace groups")
                else:
                    print(f"ℹ️  Found {existing_groups} existing workspace groups")
            
            # Commit all changes
            await session.commit()
            print("\n✨ Data seeding complete!")
            
            # Show summary
            print("\n📊 Database summary:")
            for table in ['workspaces', 'workspace_users', 'workspace_groups']:
                result = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))
                count = result.scalar()
                print(f"  - {table}: {count} records")
                
        except Exception as e:
            await session.rollback()
            print(f"❌ Error seeding data: {e}")
            raise
        finally:
            await session.close()

async def main():
    """Main function"""
    # Ensure tables exist first
    if settings.ENVIRONMENT == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            print("✅ Ensured all tables exist")
    
    # Seed data
    await seed_data()
    
    # Cleanup
    await engine.dispose()

if __name__ == "__main__":
    print("MAX Lab Workspace Data Seeder")
    print("=============================")
    print(f"Database URL: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'local'}")
    print(f"Environment: {settings.ENVIRONMENT}")
    
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)