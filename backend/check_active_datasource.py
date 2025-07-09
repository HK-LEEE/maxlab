#!/usr/bin/env python3
"""
Check active data source configuration
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
from app.services.data_providers.dynamic import DynamicProvider

async def check_active_datasource():
    """Check active data source configuration"""
    
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
            print("🔍 Checking active data source configuration...")
            
            # First, check workspaces
            workspace_query = text("""
                SELECT id, name, slug 
                FROM workspaces 
                ORDER BY created_at DESC
            """)
            
            ws_result = await session.execute(workspace_query)
            workspaces = ws_result.fetchall()
            
            print(f"\n📋 Found {len(workspaces)} workspaces:")
            for ws in workspaces:
                print(f"   - {ws.name} ({ws.slug}) - ID: {ws.id}")
            
            # Check all data source configs
            datasource_query = text("""
                SELECT 
                    dsc.id,
                    dsc.workspace_id,
                    w.name as workspace_name,
                    w.slug as workspace_slug,
                    dsc.source_type,
                    dsc.is_active,
                    dsc.created_at
                FROM data_source_configs dsc
                LEFT JOIN workspaces w ON dsc.workspace_id::text = w.id::text
                ORDER BY dsc.created_at DESC
            """)
            
            ds_result = await session.execute(datasource_query)
            datasources = ds_result.fetchall()
            
            print(f"\n📊 Found {len(datasources)} data source configurations:")
            for ds in datasources:
                active_status = "✅ ACTIVE" if ds.is_active else "❌ INACTIVE"
                print(f"   - {ds.source_type} ({active_status})")
                print(f"     Workspace: {ds.workspace_name} ({ds.workspace_slug})")
                print(f"     ID: {ds.id}")
                print(f"     Created: {ds.created_at}")
                print()
            
            # Test dynamic provider for personal_test workspace
            print("🧪 Testing Dynamic Provider for 'personal_test' workspace...")
            try:
                provider = DynamicProvider(session, "personal_test")
                config = await provider._load_config()
                
                print(f"✅ Configuration loaded:")
                print(f"   Source Type: {config.get('source_type')}")
                print(f"   Is Active: {config.get('is_active')}")
                print(f"   Has Connection String: {bool(config.get('connection_string'))}")
                print(f"   Has Custom Queries: {bool(config.get('custom_queries'))}")
                
                if config.get('source_type') == 'mssql':
                    print(f"   MSSQL Connection String (masked): {config.get('connection_string', 'N/A')[:50]}...")
                    
            except Exception as e:
                print(f"❌ Error testing dynamic provider: {e}")
            
            # Check active data sources specifically
            active_query = text("""
                SELECT 
                    dsc.id,
                    dsc.workspace_id,
                    w.name as workspace_name,
                    w.slug as workspace_slug,
                    dsc.source_type,
                    dsc.is_active
                FROM data_source_configs dsc
                LEFT JOIN workspaces w ON dsc.workspace_id::text = w.id::text
                WHERE dsc.is_active = true
                ORDER BY dsc.created_at DESC
            """)
            
            active_result = await session.execute(active_query)
            active_datasources = active_result.fetchall()
            
            print(f"\n🟢 Active data sources ({len(active_datasources)}):")
            for ds in active_datasources:
                print(f"   - {ds.source_type} in {ds.workspace_name} ({ds.workspace_slug})")
                print(f"     ID: {ds.id}")
                print()
            
            if not active_datasources:
                print("   ⚠️  No active data sources found!")
                
    except Exception as e:
        print(f"❌ Error checking data source configuration: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_active_datasource())