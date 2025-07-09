#!/usr/bin/env python3
"""
Debug connection string decryption
"""
import asyncio
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings
from app.core.security import decrypt_connection_string

async def debug_connection_string():
    """Debug connection string decryption"""
    
    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False
    )
    
    # Create async session
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    try:
        async with async_session() as session:
            print("🔍 Debugging connection string decryption...")
            
            # Get the MSSQL data source config
            query = text("""
                SELECT 
                    id,
                    workspace_id,
                    source_type,
                    mssql_connection_string,
                    is_active,
                    LENGTH(mssql_connection_string) as connection_string_length
                FROM data_source_configs
                WHERE source_type = 'MSSQL' AND is_active = true
                ORDER BY created_at DESC
                LIMIT 1
            """)
            
            result = await session.execute(query)
            config = result.fetchone()
            
            if not config:
                print("❌ No active MSSQL data source found")
                return
            
            print(f"✅ Found MSSQL config:")
            print(f"   ID: {config.id}")
            print(f"   Workspace ID: {config.workspace_id}")
            print(f"   Source Type: {config.source_type}")
            print(f"   Is Active: {config.is_active}")
            print(f"   Connection String Length: {config.connection_string_length}")
            
            # Check if connection string exists
            if not config.mssql_connection_string:
                print("❌ No mssql_connection_string in database")
                return
                
            print(f"✅ Raw connection string (first 100 chars): {config.mssql_connection_string[:100]}...")
            
            # Try to decrypt
            try:
                decrypted = decrypt_connection_string(config.mssql_connection_string)
                print(f"✅ Decryption successful!")
                print(f"   Decrypted (first 100 chars): {decrypted[:100]}...")
                
                # Check if it contains expected components
                if "DRIVER=" in decrypted:
                    print("✅ Contains DRIVER component")
                if "SERVER=" in decrypted:
                    print("✅ Contains SERVER component")
                if "DATABASE=" in decrypted:
                    print("✅ Contains DATABASE component")
                if "UID=" in decrypted:
                    print("✅ Contains UID component")
                    
            except Exception as e:
                print(f"❌ Decryption failed: {e}")
                
    except Exception as e:
        print(f"❌ Error debugging connection string: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(debug_connection_string())