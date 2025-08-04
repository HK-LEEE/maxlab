"""
Create user_sessions table migration script
Standalone script to create the user_sessions table for session management
"""

import asyncio
import logging
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from app.core.config import settings
from app.models.session import UserSession
from app.core.database import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def create_user_sessions_table():
    """Create user_sessions table"""
    try:
        # Create async engine
        engine = create_async_engine(
            settings.DATABASE_URL,
            echo=True  # Show SQL statements
        )
        
        logger.info("Creating user_sessions table...")
        
        # Create the table using SQLAlchemy metadata
        async with engine.begin() as conn:
            # Check if table already exists
            result = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'user_sessions'
                );
            """))
            table_exists = result.scalar()
            
            if table_exists:
                logger.info("user_sessions table already exists")
                return
            
            # Create only the user_sessions table
            await conn.run_sync(UserSession.metadata.create_all)
            logger.info("✅ user_sessions table created successfully")
        
        await engine.dispose()
        
    except Exception as e:
        logger.error(f"❌ Failed to create user_sessions table: {e}")
        raise


async def verify_table_creation():
    """Verify that the table was created correctly"""
    try:
        engine = create_async_engine(settings.DATABASE_URL)
        
        async with engine.begin() as conn:
            # Check table structure
            result = await conn.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'user_sessions'
                ORDER BY ordinal_position;
            """))
            
            columns = result.fetchall()
            if columns:
                logger.info("📋 user_sessions table structure:")
                for column in columns:
                    logger.info(f"  - {column.column_name}: {column.data_type} ({'NULL' if column.is_nullable == 'YES' else 'NOT NULL'})")
            else:
                logger.error("❌ user_sessions table not found")
            
            # Check indexes
            result = await conn.execute(text("""
                SELECT indexname, indexdef
                FROM pg_indexes 
                WHERE tablename = 'user_sessions'
                ORDER BY indexname;
            """))
            
            indexes = result.fetchall()
            if indexes:
                logger.info("📊 user_sessions table indexes:")
                for index in indexes:
                    logger.info(f"  - {index.indexname}")
            
        await engine.dispose()
        
    except Exception as e:
        logger.error(f"❌ Failed to verify table creation: {e}")


if __name__ == "__main__":
    logger.info("🚀 Starting user_sessions table creation...")
    asyncio.run(create_user_sessions_table())
    logger.info("🔍 Verifying table creation...")
    asyncio.run(verify_table_creation())
    logger.info("✅ Migration completed successfully!")