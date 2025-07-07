#!/usr/bin/env python3
"""
Simple test for Dynamic Provider
"""
import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

async def main():
    print("🧪 Testing Dynamic Provider")
    print("=" * 50)
    
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import text
    
    # Get database URL
    db_url = os.environ.get('DATABASE_URL', 'postgresql+asyncpg://postgres:2300@localhost:5432/max_lab')
    
    # Create engine
    engine = create_async_engine(db_url, echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
    
    async with AsyncSessionLocal() as db_session:
        try:
            # Test 1: Check data source config
            print("\n1. Checking data source configuration...")
            query = text("""
                SELECT source_type, config_name, is_active
                FROM data_source_configs
                WHERE workspace_id = :workspace_id
                ORDER BY created_at DESC
            """)
            
            result = await db_session.execute(query, {"workspace_id": workspace_id})
            configs = result.fetchall()
            
            print(f"Found {len(configs)} data source configurations:")
            for config in configs:
                print(f"  - {config.config_name}: {config.source_type} (active: {config.is_active})")
            
            # Test 2: Check equipment status table
            print("\n2. Checking equipment status table...")
            query = text("""
                SELECT COUNT(*) as count
                FROM personal_test_equipment_status
            """)
            
            result = await db_session.execute(query)
            count = result.scalar()
            print(f"Equipment status records: {count}")
            
            # Test 3: Import and test provider
            print("\n3. Testing DynamicProvider...")
            
            # Direct module loading to avoid __init__.py
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                "dynamic_provider", 
                backend_path / "app" / "services" / "data_providers" / "dynamic.py"
            )
            dynamic_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(dynamic_module)
            
            provider = dynamic_module.DynamicProvider(db_session, workspace_id)
            
            # Load config
            config = await provider._load_config()
            print(f"Provider config: {config}")
            
            # Get provider type
            internal_provider = await provider._get_provider()
            print(f"Using provider: {type(internal_provider).__name__}")
            
            # Test equipment status
            print("\n4. Getting equipment status...")
            await provider.connect()
            equipment_data = await provider.get_equipment_status(limit=3)
            print(f"Equipment retrieved: {len(equipment_data)} items")
            
            if equipment_data:
                print("\nFirst equipment:")
                for key, value in equipment_data[0].items():
                    print(f"  {key}: {value}")
            
            await provider.disconnect()
            
            print("\n✅ All tests passed!")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())