#!/usr/bin/env python3
"""
Update MSSQL connection string for existing data source
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
from app.core.security import encrypt_connection_string

async def update_mssql_connection():
    """Update MSSQL connection string for existing data source"""
    
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
            print("🔍 Updating MSSQL connection string...")
            
            # Find the active MSSQL data source
            find_query = text("""
                SELECT id, workspace_id, source_type, is_active
                FROM data_source_configs
                WHERE source_type = 'MSSQL' AND is_active = true
                ORDER BY created_at DESC
                LIMIT 1
            """)
            
            result = await session.execute(find_query)
            config = result.fetchone()
            
            if not config:
                print("❌ No active MSSQL data source found")
                return
            
            print(f"✅ Found MSSQL config:")
            print(f"   ID: {config.id}")
            print(f"   Workspace ID: {config.workspace_id}")
            print(f"   Source Type: {config.source_type}")
            print(f"   Is Active: {config.is_active}")
            
            # Create the connection string
            connection_string = (
                "DRIVER={FreeTDS};"
                "SERVER=172.28.32.1;"
                "DATABASE=AIDB;"
                "UID=mss;"
                "PWD=2300;"
                "TrustServerCertificate=yes;"
                "Connection Timeout=30;"
                "Command Timeout=60;"
                "TDS_Version=8.0;"
                "Port=1433"
            )
            
            # Encrypt the connection string
            encrypted_connection = encrypt_connection_string(connection_string)
            
            # Update the configuration
            update_query = text("""
                UPDATE data_source_configs
                SET 
                    mssql_connection_string = :mssql_connection_string,
                    updated_at = NOW()
                WHERE id = :config_id
            """)
            
            await session.execute(update_query, {
                "config_id": config.id,
                "mssql_connection_string": encrypted_connection
            })
            
            await session.commit()
            
            print(f"✅ Updated MSSQL connection string for config {config.id}")
            print(f"   Server: 172.28.32.1")
            print(f"   Database: AIDB")
            print(f"   User: mss")
            print(f"   Driver: FreeTDS")
            
            # Verify the update
            verify_query = text("""
                SELECT 
                    id,
                    LENGTH(mssql_connection_string) as connection_string_length,
                    is_active
                FROM data_source_configs
                WHERE id = :config_id
            """)
            
            verify_result = await session.execute(verify_query, {"config_id": config.id})
            verify_config = verify_result.fetchone()
            
            if verify_config and verify_config.connection_string_length:
                print(f"✅ Verification successful:")
                print(f"   Connection string length: {verify_config.connection_string_length}")
                print(f"   Is active: {verify_config.is_active}")
            else:
                print("❌ Verification failed - connection string not saved")
                
    except Exception as e:
        print(f"❌ Error updating MSSQL connection: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(update_mssql_connection())