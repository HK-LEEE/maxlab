#!/usr/bin/env python3
"""
Workspace UUID Migration Script
Migrates workspace_groups and workspace_users from string-based identifiers to UUID-based

This script:
1. Populates group_id_uuid fields for all workspace_groups
2. Populates user_id_uuid fields for all workspace_users  
3. Validates the migration
4. Provides rollback capability
"""

import asyncio
import logging
import sys
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import click

from app.core.config import settings
from app.core.database import Base
from app.services.group_mapping import group_mapping_service
from app.services.user_mapping import user_mapping_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'workspace_uuid_migration_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class WorkspaceUUIDMigration:
    """Handles the migration of workspace groups and users to UUID-based system"""
    
    def __init__(self, db_url: str, admin_token: str):
        self.db_url = db_url
        self.admin_token = admin_token
        self.engine = None
        self.async_session = None
        self.stats = {
            'groups_total': 0,
            'groups_mapped': 0,
            'groups_failed': 0,
            'users_total': 0,
            'users_mapped': 0,
            'users_failed': 0,
            'start_time': None,
            'end_time': None
        }
        self.failed_mappings = {
            'groups': [],
            'users': []
        }
    
    async def setup(self):
        """Initialize database connection"""
        self.engine = create_async_engine(self.db_url, echo=False)
        self.async_session = sessionmaker(
            self.engine, 
            class_=AsyncSession, 
            expire_on_commit=False
        )
        logger.info("Database connection initialized")
    
    async def teardown(self):
        """Close database connection"""
        if self.engine:
            await self.engine.dispose()
        logger.info("Database connection closed")
    
    async def validate_prerequisites(self) -> bool:
        """Validate that prerequisites for migration are met"""
        async with self.async_session() as session:
            try:
                # Check if UUID columns exist
                result = await session.execute(text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'workspace_groups' 
                    AND column_name = 'group_id_uuid'
                """))
                if not result.scalar():
                    logger.error("group_id_uuid column not found in workspace_groups table")
                    return False
                
                result = await session.execute(text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'workspace_users' 
                    AND column_name = 'user_id_uuid'
                """))
                if not result.scalar():
                    logger.error("user_id_uuid column not found in workspace_users table")
                    return False
                
                # Check backup tables exist
                result = await session.execute(text("""
                    SELECT COUNT(*) 
                    FROM information_schema.tables 
                    WHERE table_schema = 'workspace_backup' 
                    AND table_name IN ('workspace_users_backup', 'workspace_groups_backup')
                """))
                if result.scalar() < 2:
                    logger.error("Backup tables not found. Please run backup script first.")
                    return False
                
                logger.info("Prerequisites validated successfully")
                return True
                
            except Exception as e:
                logger.error(f"Error validating prerequisites: {e}")
                return False
    
    async def migrate_workspace_groups(self, dry_run: bool = False) -> bool:
        """Migrate workspace_groups to UUID-based system"""
        logger.info("Starting workspace_groups migration...")
        
        async with self.async_session() as session:
            try:
                # Get all groups that need migration
                result = await session.execute(text("""
                    SELECT id, workspace_id, group_name, group_display_name 
                    FROM workspace_groups 
                    WHERE group_id_uuid IS NULL
                    ORDER BY created_at
                """))
                groups = result.fetchall()
                self.stats['groups_total'] = len(groups)
                
                logger.info(f"Found {len(groups)} groups to migrate")
                
                for group in groups:
                    try:
                        # Try to map group_name to UUID
                        group_uuid = None
                        
                        # First check if group_name is already a UUID
                        try:
                            group_uuid = uuid.UUID(group.group_name)
                            logger.debug(f"Group {group.group_name} is already a UUID")
                        except ValueError:
                            # Not a UUID, need to map it
                            group_uuid = await group_mapping_service.get_group_uuid_by_name(
                                group.group_name, 
                                self.admin_token
                            )
                        
                        if group_uuid:
                            if not dry_run:
                                # Update the record
                                await session.execute(text("""
                                    UPDATE workspace_groups 
                                    SET group_id_uuid = :group_uuid,
                                        group_info_updated_at = NOW()
                                    WHERE id = :id
                                """), {
                                    'group_uuid': group_uuid,
                                    'id': group.id
                                })
                            
                            self.stats['groups_mapped'] += 1
                            logger.info(f"Mapped group '{group.group_name}' to UUID {group_uuid}")
                        else:
                            # Generate deterministic UUID if enabled
                            if settings.ENABLE_DETERMINISTIC_UUID_GENERATION:
                                group_uuid = group_mapping_service.generate_deterministic_uuid(group.group_name)
                                
                                if not dry_run:
                                    await session.execute(text("""
                                        UPDATE workspace_groups 
                                        SET group_id_uuid = :group_uuid,
                                            group_info_updated_at = NOW()
                                        WHERE id = :id
                                    """), {
                                        'group_uuid': group_uuid,
                                        'id': group.id
                                    })
                                
                                self.stats['groups_mapped'] += 1
                                logger.warning(f"Generated deterministic UUID for group '{group.group_name}': {group_uuid}")
                            else:
                                self.stats['groups_failed'] += 1
                                self.failed_mappings['groups'].append({
                                    'id': str(group.id),
                                    'workspace_id': str(group.workspace_id),
                                    'group_name': group.group_name,
                                    'reason': 'Could not map to UUID'
                                })
                                logger.error(f"Failed to map group '{group.group_name}'")
                                
                    except Exception as e:
                        self.stats['groups_failed'] += 1
                        self.failed_mappings['groups'].append({
                            'id': str(group.id),
                            'workspace_id': str(group.workspace_id),
                            'group_name': group.group_name,
                            'reason': str(e)
                        })
                        logger.error(f"Error processing group {group.id}: {e}")
                
                if not dry_run:
                    await session.commit()
                
                return self.stats['groups_failed'] == 0
                
            except Exception as e:
                logger.error(f"Error in migrate_workspace_groups: {e}")
                await session.rollback()
                return False
    
    async def migrate_workspace_users(self, dry_run: bool = False) -> bool:
        """Migrate workspace_users to UUID-based system"""
        logger.info("Starting workspace_users migration...")
        
        async with self.async_session() as session:
            try:
                # Get all users that need migration
                result = await session.execute(text("""
                    SELECT id, workspace_id, user_id, user_display_name 
                    FROM workspace_users 
                    WHERE user_id_uuid IS NULL
                    ORDER BY created_at
                """))
                users = result.fetchall()
                self.stats['users_total'] = len(users)
                
                logger.info(f"Found {len(users)} users to migrate")
                
                for user in users:
                    try:
                        # Try to map user_id to UUID
                        user_uuid = None
                        
                        # First check if user_id is already a UUID
                        try:
                            user_uuid = uuid.UUID(user.user_id)
                            logger.debug(f"User {user.user_id} is already a UUID")
                        except ValueError:
                            # Not a UUID, need to map it
                            user_uuid = await user_mapping_service.get_user_uuid_by_identifier(
                                user.user_id,
                                self.admin_token
                            )
                        
                        if user_uuid:
                            if not dry_run:
                                # Update the record
                                await session.execute(text("""
                                    UPDATE workspace_users 
                                    SET user_id_uuid = :user_uuid,
                                        user_info_updated_at = NOW()
                                    WHERE id = :id
                                """), {
                                    'user_uuid': user_uuid,
                                    'id': user.id
                                })
                            
                            self.stats['users_mapped'] += 1
                            logger.info(f"Mapped user '{user.user_id}' to UUID {user_uuid}")
                        else:
                            self.stats['users_failed'] += 1
                            self.failed_mappings['users'].append({
                                'id': str(user.id),
                                'workspace_id': str(user.workspace_id),
                                'user_id': user.user_id,
                                'reason': 'Could not map to UUID'
                            })
                            logger.error(f"Failed to map user '{user.user_id}'")
                                
                    except Exception as e:
                        self.stats['users_failed'] += 1
                        self.failed_mappings['users'].append({
                            'id': str(user.id),
                            'workspace_id': str(user.workspace_id),
                            'user_id': user.user_id,
                            'reason': str(e)
                        })
                        logger.error(f"Error processing user {user.id}: {e}")
                
                if not dry_run:
                    await session.commit()
                
                return self.stats['users_failed'] == 0
                
            except Exception as e:
                logger.error(f"Error in migrate_workspace_users: {e}")
                await session.rollback()
                return False
    
    async def validate_migration(self) -> bool:
        """Validate the migration was successful"""
        logger.info("Validating migration...")
        
        async with self.async_session() as session:
            try:
                # Check for any NULL UUIDs in groups
                result = await session.execute(text("""
                    SELECT COUNT(*) FROM workspace_groups WHERE group_id_uuid IS NULL
                """))
                null_group_uuids = result.scalar()
                
                # Check for any NULL UUIDs in users
                result = await session.execute(text("""
                    SELECT COUNT(*) FROM workspace_users WHERE user_id_uuid IS NULL
                """))
                null_user_uuids = result.scalar()
                
                # Check for duplicate UUIDs
                result = await session.execute(text("""
                    SELECT group_id_uuid, COUNT(*) as cnt
                    FROM workspace_groups 
                    WHERE group_id_uuid IS NOT NULL
                    GROUP BY workspace_id, group_id_uuid 
                    HAVING COUNT(*) > 1
                """))
                duplicate_groups = result.fetchall()
                
                result = await session.execute(text("""
                    SELECT user_id_uuid, COUNT(*) as cnt
                    FROM workspace_users 
                    WHERE user_id_uuid IS NOT NULL
                    GROUP BY workspace_id, user_id_uuid 
                    HAVING COUNT(*) > 1
                """))
                duplicate_users = result.fetchall()
                
                # Report validation results
                validation_passed = True
                
                if null_group_uuids > 0:
                    logger.error(f"Found {null_group_uuids} groups without UUID")
                    validation_passed = False
                
                if null_user_uuids > 0:
                    logger.error(f"Found {null_user_uuids} users without UUID")
                    validation_passed = False
                
                if duplicate_groups:
                    logger.error(f"Found {len(duplicate_groups)} duplicate group UUIDs")
                    validation_passed = False
                
                if duplicate_users:
                    logger.error(f"Found {len(duplicate_users)} duplicate user UUIDs")
                    validation_passed = False
                
                if validation_passed:
                    logger.info("Migration validation passed!")
                else:
                    logger.error("Migration validation failed!")
                
                return validation_passed
                
            except Exception as e:
                logger.error(f"Error in validate_migration: {e}")
                return False
    
    def print_summary(self):
        """Print migration summary"""
        duration = (self.stats['end_time'] - self.stats['start_time']).total_seconds() if self.stats['end_time'] else 0
        
        print("\n" + "="*50)
        print("MIGRATION SUMMARY")
        print("="*50)
        print(f"Duration: {duration:.2f} seconds")
        print(f"\nGroups:")
        print(f"  Total: {self.stats['groups_total']}")
        print(f"  Mapped: {self.stats['groups_mapped']}")
        print(f"  Failed: {self.stats['groups_failed']}")
        print(f"\nUsers:")
        print(f"  Total: {self.stats['users_total']}")
        print(f"  Mapped: {self.stats['users_mapped']}")
        print(f"  Failed: {self.stats['users_failed']}")
        
        if self.failed_mappings['groups']:
            print(f"\nFailed Group Mappings: {len(self.failed_mappings['groups'])}")
            for fail in self.failed_mappings['groups'][:5]:
                print(f"  - {fail['group_name']}: {fail['reason']}")
            if len(self.failed_mappings['groups']) > 5:
                print(f"  ... and {len(self.failed_mappings['groups']) - 5} more")
        
        if self.failed_mappings['users']:
            print(f"\nFailed User Mappings: {len(self.failed_mappings['users'])}")
            for fail in self.failed_mappings['users'][:5]:
                print(f"  - {fail['user_id']}: {fail['reason']}")
            if len(self.failed_mappings['users']) > 5:
                print(f"  ... and {len(self.failed_mappings['users']) - 5} more")
        
        print("="*50 + "\n")
    
    async def run(self, dry_run: bool = False):
        """Run the complete migration"""
        self.stats['start_time'] = datetime.now()
        
        try:
            await self.setup()
            
            # Validate prerequisites
            if not await self.validate_prerequisites():
                logger.error("Prerequisites not met. Aborting migration.")
                return False
            
            # Run migrations
            groups_success = await self.migrate_workspace_groups(dry_run)
            users_success = await self.migrate_workspace_users(dry_run)
            
            # Validate if not dry run
            if not dry_run:
                validation_success = await self.validate_migration()
            else:
                validation_success = True
                logger.info("Dry run mode - skipping validation")
            
            self.stats['end_time'] = datetime.now()
            self.print_summary()
            
            return groups_success and users_success and validation_success
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            return False
        finally:
            await self.teardown()


@click.command()
@click.option('--db-url', default=None, help='Database URL (defaults to settings.DATABASE_URL)')
@click.option('--admin-token', required=True, help='Admin authentication token')
@click.option('--dry-run', is_flag=True, help='Run in dry-run mode (no changes)')
@click.option('--skip-validation', is_flag=True, help='Skip post-migration validation')
def main(db_url: str, admin_token: str, dry_run: bool, skip_validation: bool):
    """Run workspace UUID migration"""
    if not db_url:
        db_url = settings.DATABASE_URL
    
    # Confirm before proceeding
    if not dry_run:
        click.confirm(
            "This will modify the database. Have you backed up the data?", 
            abort=True
        )
    
    migration = WorkspaceUUIDMigration(db_url, admin_token)
    
    # Run migration
    success = asyncio.run(migration.run(dry_run))
    
    if success:
        logger.info("Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("Migration failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()