import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_migration():
    """Change workspace_id from UUID to VARCHAR"""
    async with AsyncSessionLocal() as db:
        try:
            # First check if workspace_id is already a string type
            check_query = text("""
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = 'data_source_configs' 
                AND column_name = 'workspace_id'
            """)
            result = await db.execute(check_query)
            row = result.fetchone()
            
            if row and row.data_type == 'uuid':
                logger.info("Changing workspace_id from UUID to VARCHAR...")
                
                # Change column type
                alter_query = text("""
                    ALTER TABLE data_source_configs 
                    ALTER COLUMN workspace_id TYPE VARCHAR(255) USING workspace_id::text
                """)
                await db.execute(alter_query)
                await db.commit()
                
                logger.info("Successfully changed workspace_id to VARCHAR")
            else:
                logger.info("workspace_id is already VARCHAR or table doesn't exist")
                
        except Exception as e:
            logger.error(f"Error during migration: {e}")
            await db.rollback()
            raise

if __name__ == "__main__":
    asyncio.run(run_migration())