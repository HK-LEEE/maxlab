#!/usr/bin/env python3
"""
Test Dynamic Provider Integration
"""
import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Direct import to avoid __init__.py issues
import app.services.data_providers.dynamic as dp

async def main():
    print("🧪 Testing Dynamic Provider Integration")
    print("=" * 50)
    
    # Get database URL
    db_url = os.environ.get('DATABASE_URL', 'postgresql+asyncpg://postgres:password@localhost:5432/platform_integration')
    
    # Create engine
    engine = create_async_engine(db_url, echo=True)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
    
    async with AsyncSessionLocal() as db_session:
        try:
            print(f"\n1. Creating DynamicProvider for workspace: {workspace_id}")
            provider = dp.DynamicProvider(db_session, workspace_id)
            
            print("\n2. Testing connection...")
            test_result = await provider.test_connection()
            print(f"Test result: {test_result}")
            
            print("\n3. Getting equipment status...")
            await provider.connect()
            equipment_data = await provider.get_equipment_status(limit=5)
            print(f"Equipment count: {len(equipment_data)}")
            
            if equipment_data:
                print("\nFirst equipment:")
                print(equipment_data[0])
            
            await provider.disconnect()
            
            print("\n✅ Provider integration test successful!")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())