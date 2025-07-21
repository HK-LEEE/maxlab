#!/usr/bin/env python3
"""
Script to update missing display names in workspace_users and workspace_groups tables.
This script fetches display names from the external authentication server for records
where display names are missing (NULL or UUID strings).
"""
import asyncio
import logging
import sys
from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

# Add the app directory to the Python path
sys.path.insert(0, '/home/lee/proejct/maxlab/backend')

from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.models.workspace import WorkspaceUser, WorkspaceGroup
from app.services.user_mapping import user_mapping_service
from app.services.group_mapping import group_mapping_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DisplayNameUpdater:
    """Updates missing display names in workspace tables"""
    
    def __init__(self, admin_token: str):
        self.admin_token = admin_token
        self.stats = {
            'users_checked': 0,
            'users_updated': 0,
            'users_failed': 0,
            'groups_checked': 0,
            'groups_updated': 0,
            'groups_failed': 0
        }
    
    async def update_user_display_names(self, db: AsyncSession):
        """Update missing display names for workspace users"""
        logger.info("Updating user display names...")
        
        # Query users with missing or UUID-like display names
        stmt = select(WorkspaceUser).where(
            or_(
                WorkspaceUser.user_display_name.is_(None),
                WorkspaceUser.user_display_name == '',
                # Check if display name looks like a UUID
                WorkspaceUser.user_display_name.op('~')('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
            )
        )
        
        result = await db.execute(stmt)
        users = result.scalars().all()
        
        logger.info(f"Found {len(users)} users with missing/UUID display names")
        
        for user in users:
            self.stats['users_checked'] += 1
            
            try:
                # Get user UUID
                user_uuid = user.user_uuid  # This uses the property that handles legacy compatibility
                if not user_uuid:
                    logger.warning(f"Could not determine UUID for user {user.user_id}")
                    self.stats['users_failed'] += 1
                    continue
                
                # Fetch user info from external service
                user_info = await user_mapping_service.get_user_info_by_uuid(user_uuid, self.admin_token)
                
                if user_info and user_info.get('display_name'):
                    # Update display name and email
                    user.user_display_name = user_info['display_name']
                    if user_info.get('email'):
                        user.user_email = user_info['email']
                    user.user_info_updated_at = datetime.now()
                    
                    self.stats['users_updated'] += 1
                    logger.info(f"Updated user {user_uuid}: {user_info['display_name']}")
                else:
                    logger.warning(f"No display name found for user {user_uuid}")
                    self.stats['users_failed'] += 1
                    
            except Exception as e:
                logger.error(f"Failed to update user {user.id}: {e}")
                self.stats['users_failed'] += 1
        
        # Commit all user updates
        await db.commit()
    
    async def update_group_display_names(self, db: AsyncSession):
        """Update missing display names for workspace groups"""
        logger.info("Updating group display names...")
        
        # Query groups with missing or UUID-like display names
        stmt = select(WorkspaceGroup).where(
            or_(
                WorkspaceGroup.group_display_name.is_(None),
                WorkspaceGroup.group_display_name == '',
                # Check if display name looks like a UUID
                WorkspaceGroup.group_display_name.op('~')('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
            )
        )
        
        result = await db.execute(stmt)
        groups = result.scalars().all()
        
        logger.info(f"Found {len(groups)} groups with missing/UUID display names")
        
        for group in groups:
            self.stats['groups_checked'] += 1
            
            try:
                # Get group UUID
                group_uuid = group.group_uuid  # This uses the property that handles legacy compatibility
                if not group_uuid:
                    logger.warning(f"Could not determine UUID for group {group.group_name}")
                    self.stats['groups_failed'] += 1
                    continue
                
                # Fetch group info from external service
                group_info = await group_mapping_service.get_group_info_by_uuid(group_uuid, self.admin_token)
                
                if group_info and group_info.get('display_name'):
                    # Update display name
                    group.group_display_name = group_info['display_name']
                    group.group_info_updated_at = datetime.now()
                    
                    self.stats['groups_updated'] += 1
                    logger.info(f"Updated group {group_uuid}: {group_info['display_name']}")
                else:
                    logger.warning(f"No display name found for group {group_uuid}")
                    self.stats['groups_failed'] += 1
                    
            except Exception as e:
                logger.error(f"Failed to update group {group.id}: {e}")
                self.stats['groups_failed'] += 1
        
        # Commit all group updates
        await db.commit()
    
    async def run(self):
        """Run the display name update process"""
        logger.info("Starting display name update process...")
        
        async with AsyncSessionLocal() as db:
            try:
                # Update users
                await self.update_user_display_names(db)
                
                # Update groups
                await self.update_group_display_names(db)
            except Exception as e:
                logger.error(f"Error during update process: {e}")
                await db.rollback()
                raise
            finally:
                await db.close()
        
        # Print summary
        logger.info("\n" + "="*50)
        logger.info("Display Name Update Summary:")
        logger.info("="*50)
        logger.info(f"Users checked: {self.stats['users_checked']}")
        logger.info(f"Users updated: {self.stats['users_updated']}")
        logger.info(f"Users failed: {self.stats['users_failed']}")
        logger.info(f"Groups checked: {self.stats['groups_checked']}")
        logger.info(f"Groups updated: {self.stats['groups_updated']}")
        logger.info(f"Groups failed: {self.stats['groups_failed']}")
        logger.info("="*50)
        
        # Return success if at least some updates succeeded
        return (self.stats['users_updated'] + self.stats['groups_updated']) > 0


async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Update missing display names in workspace tables')
    parser.add_argument(
        '--admin-token',
        required=True,
        help='Admin token for accessing the external auth server'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be updated without making changes'
    )
    
    args = parser.parse_args()
    
    if args.dry_run:
        logger.info("DRY RUN MODE - No changes will be made")
        # TODO: Implement dry run mode if needed
    
    updater = DisplayNameUpdater(admin_token=args.admin_token)
    success = await updater.run()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))