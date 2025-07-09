#!/usr/bin/env python3
"""
Set plain connection string for testing
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

async def set_plain_connection_string():
    """Set plain connection string for testing"""
    
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
            print("🔧 Setting plain connection string for testing...")
            
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
                
                # Create the correct connection string
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
                
                print(f"   Connection string: {connection_string}")
                
                # Store as plain text temporarily
                update_query = text("""
                    UPDATE data_source_configs
                    SET mssql_connection_string = :connection_string
                    WHERE workspace_id = :workspace_id AND is_active = true
                """)
                
                result = await session.execute(update_query, {
                    "connection_string": connection_string,
                    "workspace_id": workspace_id
                })
                
                await session.commit()
                
                print(f"   Updated {result.rowcount} row(s)")
                
            else:
                print("   No workspace found")
                
    except Exception as e:
        print(f"❌ Error setting connection string: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(set_plain_connection_string())