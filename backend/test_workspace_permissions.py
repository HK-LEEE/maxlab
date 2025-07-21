#!/usr/bin/env python3
"""
Test script to verify workspace permission filtering
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_async_session_context
from app.crud.workspace import workspace_crud
from app.models.workspace import Workspace, WorkspaceUser, WorkspaceGroup
from sqlalchemy import select
import uuid
import logging

# Configure logging to see debug output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_workspace_permissions():
    """Test workspace permission filtering"""
    
    async with get_async_session_context() as db:
        # Test 1: List all workspaces (to see what exists)
        print("\n=== Test 1: List all workspaces ===")
        all_workspaces_stmt = select(Workspace).where(Workspace.is_active == True)
        result = await db.execute(all_workspaces_stmt)
        all_workspaces = result.scalars().all()
        print(f"Total active workspaces in database: {len(all_workspaces)}")
        for ws in all_workspaces[:5]:  # Show first 5
            print(f"  - {ws.id}: {ws.name}")
        
        # Test 2: Check workspace permissions
        if all_workspaces:
            print("\n=== Test 2: Check workspace permissions ===")
            workspace_id = all_workspaces[0].id
            
            # Check users with permissions
            users_stmt = select(WorkspaceUser).where(WorkspaceUser.workspace_id == workspace_id)
            users_result = await db.execute(users_stmt)
            workspace_users = users_result.scalars().all()
            print(f"\nUsers with permissions to workspace {workspace_id}:")
            for wu in workspace_users:
                print(f"  - User UUID: {wu.user_id_uuid}, User ID: {wu.user_id}, Level: {wu.permission_level}")
            
            # Check groups with permissions
            groups_stmt = select(WorkspaceGroup).where(WorkspaceGroup.workspace_id == workspace_id)
            groups_result = await db.execute(groups_stmt)
            workspace_groups = groups_result.scalars().all()
            print(f"\nGroups with permissions to workspace {workspace_id}:")
            for wg in workspace_groups:
                print(f"  - Group UUID: {wg.group_id_uuid}, Group Name: {wg.group_name}, Level: {wg.permission_level}")
        
        # Test 3: Test filtering as admin
        print("\n=== Test 3: Test filtering as admin ===")
        admin_workspaces = await workspace_crud.get_multi(
            db=db,
            skip=0,
            limit=100,
            active_only=True,
            is_admin=True
        )
        print(f"Workspaces visible to admin: {len(admin_workspaces)}")
        
        # Test 4: Test filtering as non-admin with no permissions
        print("\n=== Test 4: Test filtering as non-admin with no permissions ===")
        test_user_uuid = uuid.uuid4()  # Random UUID that shouldn't have permissions
        non_admin_workspaces = await workspace_crud.get_multi(
            db=db,
            skip=0,
            limit=100,
            active_only=True,
            user_uuid=test_user_uuid,
            user_group_uuids=[],
            is_admin=False
        )
        print(f"Workspaces visible to user {test_user_uuid} (should be 0): {len(non_admin_workspaces)}")
        
        # Test 5: Test filtering with specific user permissions
        if workspace_users:
            print("\n=== Test 5: Test filtering with specific user permissions ===")
            test_user = workspace_users[0]
            user_workspaces = await workspace_crud.get_multi(
                db=db,
                skip=0,
                limit=100,
                active_only=True,
                user_uuid=test_user.user_id_uuid,
                user_group_uuids=[],
                is_admin=False
            )
            print(f"Workspaces visible to user {test_user.user_id_uuid}: {len(user_workspaces)}")
            for ws in user_workspaces:
                print(f"  - {ws.id}: {ws.name}")
        
        # Test 6: Test filtering with specific group permissions
        if workspace_groups:
            print("\n=== Test 6: Test filtering with specific group permissions ===")
            test_group = workspace_groups[0]
            group_workspaces = await workspace_crud.get_multi(
                db=db,
                skip=0,
                limit=100,
                active_only=True,
                user_uuid=None,
                user_group_uuids=[test_group.group_id_uuid] if test_group.group_id_uuid else [],
                is_admin=False
            )
            print(f"Workspaces visible to group {test_group.group_id_uuid}: {len(group_workspaces)}")
            for ws in group_workspaces:
                print(f"  - {ws.id}: {ws.name}")

if __name__ == "__main__":
    asyncio.run(test_workspace_permissions())