#!/usr/bin/env python3
"""
Test database connection with detailed error reporting
"""
import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from dotenv import load_dotenv

async def test_db_connection():
    # Load environment variables
    load_dotenv('.env.development')
    
    database_url = os.getenv('DATABASE_URL', 'postgresql+asyncpg://postgres:2300@172.28.32.1:5432/max_lab')
    
    print(f"🔗 Testing database connection...")
    print(f"📄 Database URL: {database_url}")
    
    try:
        # Create engine
        engine = create_async_engine(database_url, echo=True)
        
        print("✅ Engine created successfully")
        
        # Test connection
        from sqlalchemy import text
        async with engine.begin() as conn:
            result = await conn.execute(text("SELECT version();"))
            version = result.fetchone()
            print(f"✅ Database connection successful!")
            print(f"📊 PostgreSQL version: {version[0]}")
            
        # Test basic query
        async with engine.begin() as conn:
            result = await conn.execute(text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"))
            count = result.fetchone()
            print(f"📋 Public tables count: {count[0]}")
            
        await engine.dispose()
        print("✅ All tests passed!")
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print(f"❌ Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_db_connection())