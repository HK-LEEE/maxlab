#!/usr/bin/env python3
"""
Workspace UUID Migration Rollback Script
Safely rolls back the UUID migration to the previous state
"""

import asyncio
import logging
import sys
from datetime import datetime
from typing import Dict, Tuple
import click
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'workspace_rollback_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class WorkspaceRollback:
    """Handles rollback of workspace UUID migration"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.engine = None
        self.async_session = None
        self.rollback_stats = {
            'users_before': 0,
            'users_after': 0,
            'groups_before': 0,
            'groups_after': 0,
            'start_time': None,
            'end_time': None,
            'success': False
        }
    
    async def setup(self):
        """Initialize database connection"""
        self.engine = create_async_engine(self.db_url, echo=False)
        self.async_session = sessionmaker(
            self.engine, 
            class_=AsyncSession, 
            expire_on_commit=False
        )
        logger.info("Database connection initialized for rollback")
    
    async def teardown(self):
        """Close database connection"""
        if self.engine:
            await self.engine.dispose()
        logger.info("Database connection closed")
    
    async def verify_prerequisites(self) -> Tuple[bool, str]:
        """Verify that rollback can be performed safely"""
        async with self.async_session() as session:
            try:
                # Check if backup tables exist
                result = await session.execute(text("""
                    SELECT COUNT(*) 
                    FROM information_schema.tables 
                    WHERE table_schema = 'workspace_backup' 
                    AND table_name IN ('workspace_users_backup', 'workspace_groups_backup')
                """))
                backup_count = result.scalar()
                
                if backup_count < 2:
                    return False, "Backup tables not found. Cannot rollback without backup data."
                
                # Check current state
                result = await session.execute(text("SELECT COUNT(*) FROM workspace_users"))
                self.rollback_stats['users_before'] = result.scalar()
                
                result = await session.execute(text("SELECT COUNT(*) FROM workspace_groups"))
                self.rollback_stats['groups_before'] = result.scalar()
                
                # Check if UUID columns exist (indicates migration was applied)
                result = await session.execute(text("""
                    SELECT COUNT(*) 
                    FROM information_schema.columns 
                    WHERE table_name = 'workspace_groups' 
                    AND column_name = 'group_id_uuid'
                """))
                uuid_columns = result.scalar()
                
                if uuid_columns == 0:
                    return False, "UUID columns not found. Migration may not have been applied."
                
                logger.info(f"Prerequisites verified. Users: {self.rollback_stats['users_before']}, "
                          f"Groups: {self.rollback_stats['groups_before']}")
                return True, "Prerequisites verified successfully"
                
            except Exception as e:
                return False, f"Error verifying prerequisites: {str(e)}"
    
    async def create_safety_backup(self) -> bool:
        """Create an additional backup of current state before rollback"""
        async with self.async_session() as session:
            try:
                # Create safety backup tables
                await session.execute(text("""
                    CREATE TABLE IF NOT EXISTS workspace_backup.workspace_users_rollback_safety AS 
                    SELECT * FROM workspace_users
                """))
                
                await session.execute(text("""
                    CREATE TABLE IF NOT EXISTS workspace_backup.workspace_groups_rollback_safety AS 
                    SELECT * FROM workspace_groups
                """))
                
                await session.commit()
                logger.info("Safety backup created successfully")
                return True
                
            except Exception as e:
                logger.error(f"Failed to create safety backup: {e}")
                await session.rollback()
                return False
    
    async def execute_rollback(self, force: bool = False) -> bool:
        """Execute the rollback SQL script"""
        rollback_sql_path = "migrations/002_rollback_workspace_uuid.sql"
        
        async with self.async_session() as session:
            try:
                # Read rollback SQL file
                with open(rollback_sql_path, 'r') as f:
                    rollback_sql = f.read()
                
                # Execute rollback in a transaction
                await session.execute(text("BEGIN"))
                
                # Execute each statement separately (simplified version)
                # In production, you'd want more sophisticated SQL parsing
                logger.info("Executing rollback SQL...")
                
                # The actual rollback is done by executing the SQL file
                # For this example, we'll execute key parts programmatically
                
                # Drop UUID columns from workspace_users
                await session.execute(text("""
                    ALTER TABLE workspace_users 
                    DROP COLUMN IF EXISTS user_id_uuid,
                    DROP COLUMN IF EXISTS user_email,
                    DROP COLUMN IF EXISTS user_info_updated_at
                """))
                
                # Drop UUID columns from workspace_groups
                await session.execute(text("""
                    ALTER TABLE workspace_groups 
                    DROP COLUMN IF EXISTS group_id_uuid,
                    DROP COLUMN IF EXISTS group_info_updated_at
                """))
                
                # Restore data from backup
                await session.execute(text("TRUNCATE TABLE workspace_users"))
                await session.execute(text("""
                    INSERT INTO workspace_users 
                    SELECT 
                        id, workspace_id, user_id, user_display_name,
                        permission_level, created_by, created_at, updated_at
                    FROM workspace_backup.workspace_users_backup
                """))
                
                await session.execute(text("TRUNCATE TABLE workspace_groups"))
                await session.execute(text("""
                    INSERT INTO workspace_groups 
                    SELECT 
                        id, workspace_id, group_name, group_display_name,
                        permission_level, created_by, created_at, updated_at
                    FROM workspace_backup.workspace_groups_backup
                """))
                
                # Recreate original indexes
                await session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_workspace_user_user_legacy 
                    ON workspace_users(user_id)
                """))
                await session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_workspace_group_name_legacy 
                    ON workspace_groups(group_name)
                """))
                
                await session.commit()
                logger.info("Rollback executed successfully")
                return True
                
            except Exception as e:
                logger.error(f"Rollback execution failed: {e}")
                await session.rollback()
                return False
    
    async def verify_rollback(self) -> Tuple[bool, str]:
        """Verify the rollback was successful"""
        async with self.async_session() as session:
            try:
                # Check record counts
                result = await session.execute(text("SELECT COUNT(*) FROM workspace_users"))
                self.rollback_stats['users_after'] = result.scalar()
                
                result = await session.execute(text("SELECT COUNT(*) FROM workspace_groups"))
                self.rollback_stats['groups_after'] = result.scalar()
                
                # Verify UUID columns are gone
                result = await session.execute(text("""
                    SELECT COUNT(*) 
                    FROM information_schema.columns 
                    WHERE table_name IN ('workspace_users', 'workspace_groups')
                    AND column_name LIKE '%uuid%'
                """))
                uuid_columns = result.scalar()
                
                if uuid_columns > 0:
                    return False, f"UUID columns still exist: {uuid_columns} found"
                
                # Compare counts
                result = await session.execute(text("""
                    SELECT 
                        (SELECT COUNT(*) FROM workspace_backup.workspace_users_backup) as backup_users,
                        (SELECT COUNT(*) FROM workspace_backup.workspace_groups_backup) as backup_groups
                """))
                backup_counts = result.fetchone()
                
                if self.rollback_stats['users_after'] != backup_counts.backup_users:
                    return False, f"User count mismatch: {self.rollback_stats['users_after']} vs {backup_counts.backup_users}"
                
                if self.rollback_stats['groups_after'] != backup_counts.backup_groups:
                    return False, f"Group count mismatch: {self.rollback_stats['groups_after']} vs {backup_counts.backup_groups}"
                
                return True, "Rollback verified successfully"
                
            except Exception as e:
                return False, f"Error verifying rollback: {str(e)}"
    
    def print_summary(self):
        """Print rollback summary"""
        duration = (self.rollback_stats['end_time'] - self.rollback_stats['start_time']).total_seconds() if self.rollback_stats['end_time'] else 0
        
        print("\n" + "="*50)
        print("ROLLBACK SUMMARY")
        print("="*50)
        print(f"Status: {'SUCCESS' if self.rollback_stats['success'] else 'FAILED'}")
        print(f"Duration: {duration:.2f} seconds")
        print(f"\nUsers:")
        print(f"  Before: {self.rollback_stats['users_before']}")
        print(f"  After: {self.rollback_stats['users_after']}")
        print(f"\nGroups:")
        print(f"  Before: {self.rollback_stats['groups_before']}")
        print(f"  After: {self.rollback_stats['groups_after']}")
        print("="*50 + "\n")
    
    async def run(self, skip_safety: bool = False, force: bool = False):
        """Run the complete rollback process"""
        self.rollback_stats['start_time'] = datetime.now()
        
        try:
            await self.setup()
            
            # Verify prerequisites
            can_rollback, message = await self.verify_prerequisites()
            if not can_rollback:
                logger.error(f"Cannot proceed with rollback: {message}")
                return False
            
            # Create safety backup unless skipped
            if not skip_safety:
                if not await self.create_safety_backup():
                    if not force:
                        logger.error("Failed to create safety backup. Use --force to proceed anyway.")
                        return False
            
            # Execute rollback
            if not await self.execute_rollback(force):
                logger.error("Rollback execution failed")
                return False
            
            # Verify rollback
            verified, message = await self.verify_rollback()
            if not verified:
                logger.error(f"Rollback verification failed: {message}")
                self.rollback_stats['success'] = False
            else:
                logger.info("Rollback completed and verified successfully")
                self.rollback_stats['success'] = True
            
            self.rollback_stats['end_time'] = datetime.now()
            self.print_summary()
            
            return self.rollback_stats['success']
            
        except Exception as e:
            logger.error(f"Rollback failed with error: {e}")
            return False
        finally:
            await self.teardown()


@click.command()
@click.option('--db-url', default=None, help='Database URL')
@click.option('--skip-safety', is_flag=True, help='Skip creating safety backup')
@click.option('--force', is_flag=True, help='Force rollback even with warnings')
def main(db_url: str, skip_safety: bool, force: bool):
    """Rollback workspace UUID migration"""
    if not db_url:
        db_url = settings.DATABASE_URL
    
    # Confirm before proceeding
    if not force:
        click.confirm(
            "⚠️  WARNING: This will rollback the UUID migration and restore string-based identifiers.\n"
            "Have you:\n"
            "1. Stopped all application instances?\n"
            "2. Verified the backup tables exist?\n"
            "3. Prepared to update application code?\n"
            "\nDo you want to proceed?", 
            abort=True
        )
    
    rollback = WorkspaceRollback(db_url)
    
    # Run rollback
    success = asyncio.run(rollback.run(skip_safety, force))
    
    if success:
        logger.info("\n✅ Rollback completed successfully!")
        logger.info("\nNext steps:")
        logger.info("1. Update application code to use string-based identifiers")
        logger.info("2. Clear all caches (Redis, application caches)")
        logger.info("3. Test application functionality")
        logger.info("4. Monitor for any issues")
        sys.exit(0)
    else:
        logger.error("\n❌ Rollback failed!")
        logger.error("Check the logs for details and consider restoring from backup")
        sys.exit(1)


if __name__ == "__main__":
    main()