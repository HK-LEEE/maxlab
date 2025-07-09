#!/usr/bin/env python3
"""
Check current data source configuration for workspace
"""

import asyncio
import asyncpg
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
import os
import sys

# Add the backend directory to Python path
sys.path.insert(0, '/home/lee/proejct/maxlab/backend')

from app.core.config import settings

async def check_data_source_config():
    """Check data source configuration for personal_test workspace"""
    print("🔍 Checking data source configuration...")
    
    # Create async engine
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # First check if workspaces table exists and find workspace
        print("\n📋 Checking workspaces...")
        try:
            workspace_query = text("""
                SELECT id, name, slug, created_at 
                FROM workspaces 
                WHERE slug = 'personal_test' 
                   OR name = 'personal_test'
                   OR slug = 'personaltest'
                ORDER BY created_at DESC
            """)
            
            result = await db.execute(workspace_query)
            workspaces = result.fetchall()
            
            if not workspaces:
                print("❌ No workspace found for 'personal_test'")
                return
            
            for ws in workspaces:
                print(f"  ✅ Found workspace: {ws.name} (ID: {ws.id}, Slug: {ws.slug})")
                
                # Check data source configuration for this workspace
                print(f"\n🔧 Checking data source configuration for workspace {ws.id}...")
                
                config_query = text("""
                    SELECT 
                        id,
                        source_type,
                        api_url,
                        mssql_connection_string,
                        api_key,
                        api_headers,
                        is_active,
                        custom_queries,
                        created_at
                    FROM data_source_configs
                    WHERE workspace_id = :workspace_id
                    ORDER BY created_at DESC
                """)
                
                config_result = await db.execute(config_query, {"workspace_id": str(ws.id)})
                configs = config_result.fetchall()
                
                if not configs:
                    print(f"  ❌ No data source configuration found for workspace {ws.id}")
                    continue
                
                for config in configs:
                    print(f"  📊 Data Source Config:")
                    print(f"    - ID: {config.id}")
                    print(f"    - Type: {config.source_type}")
                    print(f"    - Active: {config.is_active}")
                    print(f"    - API URL: {config.api_url[:50] + '...' if config.api_url and len(config.api_url) > 50 else config.api_url}")
                    print(f"    - MSSQL Connection: {config.mssql_connection_string[:50] + '...' if config.mssql_connection_string and len(config.mssql_connection_string) > 50 else config.mssql_connection_string}")
                    print(f"    - Created: {config.created_at}")
                    
                    if config.custom_queries:
                        print(f"    - Custom Queries: {len(config.custom_queries)} queries")
                        for query_name, query_sql in config.custom_queries.items():
                            print(f"      * {query_name}: {query_sql[:100] + '...' if len(query_sql) > 100 else query_sql}")
                    
                    # Test connection string decryption
                    if config.source_type == 'mssql' and config.mssql_connection_string:
                        print(f"\n🔐 Testing connection string decryption...")
                        try:
                            from app.core.security import decrypt_connection_string
                            decrypted = decrypt_connection_string(config.mssql_connection_string)
                            print(f"  ✅ Decryption successful: {decrypted[:50] + '...' if len(decrypted) > 50 else decrypted}")
                        except Exception as e:
                            print(f"  ❌ Decryption failed: {e}")
                    
                    print()
                
        except Exception as e:
            print(f"❌ Error checking workspace: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(check_data_source_config())