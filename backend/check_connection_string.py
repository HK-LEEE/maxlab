#!/usr/bin/env python3
"""
Check the current connection string in the database
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

async def check_connection_string():
    """Check the current connection string"""
    
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
            print("🔍 Checking connection string in database...")
            
            # Get workspace ID
            workspace_query = text("""
                SELECT id 
                FROM workspaces 
                WHERE slug = 'personaltest' OR name = 'personaltest'
                LIMIT 1
            """)
            
            ws_result = await session.execute(workspace_query)
            ws_row = ws_result.fetchone()
            
            if ws_row:
                workspace_id = str(ws_row.id)
                print(f"   Workspace ID: {workspace_id}")
                
                # Get data source config
                query = text("""
                    SELECT 
                        id,
                        source_type,
                        mssql_connection_string,
                        is_active
                    FROM data_source_configs
                    WHERE workspace_id = :workspace_id AND is_active = true
                    ORDER BY created_at DESC
                    LIMIT 1
                """)
                
                result = await session.execute(query, {"workspace_id": workspace_id})
                config = result.fetchone()
                
                if config:
                    print(f"   Data source ID: {config.id}")
                    print(f"   Source type: {config.source_type}")
                    print(f"   Is active: {config.is_active}")
                    print(f"   Encrypted connection string: {config.mssql_connection_string}")
                    
                    # Try to decrypt
                    try:
                        decrypted = decrypt_connection_string(config.mssql_connection_string)
                        print(f"   Decrypted connection string: {decrypted}")
                    except Exception as e:
                        print(f"   Decryption error: {e}")
                        
                else:
                    print("   No data source config found")
            else:
                print("   No workspace found")
                
    except Exception as e:
        print(f"❌ Error checking connection string: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_connection_string())