#!/usr/bin/env python3
"""
Test script to verify that display names are properly fetched and stored
when adding new users and groups to workspaces.
"""
import asyncio
import logging
import sys
import httpx
from typing import Optional

# Add the app directory to the Python path
sys.path.insert(0, '/home/lee/proejct/maxlab/backend')

from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DisplayNameTestClient:
    """Test client for verifying display name fixes"""
    
    def __init__(self, base_url: str, admin_token: str):
        self.base_url = base_url
        self.admin_token = admin_token
        self.headers = {"Authorization": f"Bearer {admin_token}"}
    
    async def get_workspace_users(self, workspace_id: str) -> list:
        """Get users for a workspace"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v1/workspaces/{workspace_id}/users/",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
    
    async def get_workspace_groups(self, workspace_id: str) -> list:
        """Get groups for a workspace"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v1/workspaces/{workspace_id}/groups/",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
    
    async def add_user_to_workspace(self, workspace_id: str, user_id: str, permission_level: str = "read"):
        """Add a user to a workspace"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/v1/workspaces/{workspace_id}/users/",
                headers=self.headers,
                json={
                    "user_id": user_id,
                    "permission_level": permission_level
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def add_group_to_workspace(self, workspace_id: str, group_id: str, permission_level: str = "read"):
        """Add a group to a workspace"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/v1/workspaces/{workspace_id}/groups/",
                headers=self.headers,
                json={
                    "group_id": group_id,
                    "permission_level": permission_level
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def run_tests(self, workspace_id: str, test_user_id: str, test_group_id: str):
        """Run the display name tests"""
        logger.info("Starting display name fix tests...")
        logger.info(f"Testing with workspace: {workspace_id}")
        
        # Test 1: Check current users and groups
        logger.info("\n--- Test 1: Checking current workspace permissions ---")
        
        users = await self.get_workspace_users(workspace_id)
        logger.info(f"Current users ({len(users)}):")
        for user in users:
            display_name = user.get('user_display_name', 'N/A')
            user_id = user.get('user_id', 'N/A')
            is_uuid_display = display_name == user_id
            logger.info(f"  - User ID: {user_id}")
            logger.info(f"    Display Name: {display_name} {'(⚠️ UUID shown)' if is_uuid_display else '(✓ Proper name)'}")
        
        groups = await self.get_workspace_groups(workspace_id)
        logger.info(f"\nCurrent groups ({len(groups)}):")
        for group in groups:
            display_name = group.get('group_display_name', 'N/A')
            group_id = group.get('group_id', 'N/A')
            is_uuid_display = display_name == group_id
            logger.info(f"  - Group ID: {group_id}")
            logger.info(f"    Display Name: {display_name} {'(⚠️ UUID shown)' if is_uuid_display else '(✓ Proper name)'}")
        
        # Test 2: Add a new user (if provided)
        if test_user_id:
            logger.info(f"\n--- Test 2: Adding new user {test_user_id} ---")
            try:
                new_user = await self.add_user_to_workspace(workspace_id, test_user_id, "read")
                logger.info("New user added successfully:")
                logger.info(f"  - User ID: {new_user.get('user_id', 'N/A')}")
                logger.info(f"  - Display Name: {new_user.get('user_display_name', 'N/A')}")
                logger.info(f"  - Email: {new_user.get('user_email', 'N/A')}")
                
                # Check if display name is properly set (not a UUID)
                if new_user.get('user_display_name') != new_user.get('user_id'):
                    logger.info("  ✓ Display name properly fetched!")
                else:
                    logger.warning("  ⚠️ Display name is still showing as UUID")
            except Exception as e:
                logger.error(f"Failed to add user: {e}")
        
        # Test 3: Add a new group (if provided)
        if test_group_id:
            logger.info(f"\n--- Test 3: Adding new group {test_group_id} ---")
            try:
                new_group = await self.add_group_to_workspace(workspace_id, test_group_id, "read")
                logger.info("New group added successfully:")
                logger.info(f"  - Group ID: {new_group.get('group_id', 'N/A')}")
                logger.info(f"  - Display Name: {new_group.get('group_display_name', 'N/A')}")
                
                # Check if display name is properly set (not a UUID)
                if new_group.get('group_display_name') != new_group.get('group_id'):
                    logger.info("  ✓ Display name properly fetched!")
                else:
                    logger.warning("  ⚠️ Display name is still showing as UUID")
            except Exception as e:
                logger.error(f"Failed to add group: {e}")
        
        logger.info("\n--- Test Summary ---")
        logger.info("Tests completed. Check the output above to verify:")
        logger.info("1. Existing users/groups should show proper display names after running update script")
        logger.info("2. New users/groups should immediately show proper display names (not UUIDs)")


async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Test display name fixes for workspace permissions')
    parser.add_argument(
        '--base-url',
        default='http://localhost:8000',
        help='Base URL of the API (default: http://localhost:8000)'
    )
    parser.add_argument(
        '--admin-token',
        required=True,
        help='Admin token for API access'
    )
    parser.add_argument(
        '--workspace-id',
        required=True,
        help='Workspace ID to test with'
    )
    parser.add_argument(
        '--test-user-id',
        help='User ID (email or UUID) to test adding'
    )
    parser.add_argument(
        '--test-group-id',
        help='Group ID (name or UUID) to test adding'
    )
    
    args = parser.parse_args()
    
    client = DisplayNameTestClient(args.base_url, args.admin_token)
    await client.run_tests(args.workspace_id, args.test_user_id, args.test_group_id)


if __name__ == "__main__":
    asyncio.run(main())