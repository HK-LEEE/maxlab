#!/usr/bin/env python3
"""
Debug provider issue
"""
import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

async def main():
    print("🔍 Debugging Provider Issue")
    print("=" * 50)
    
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import text
    
    # Get database URL from .env
    db_url = 'postgresql+asyncpg://postgres:2300@localhost:5432/max_lab'
    
    # Create engine
    engine = create_async_engine(db_url, echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
    
    async with AsyncSessionLocal() as db_session:
        try:
            # Test direct PostgreSQL provider
            print("\n1. Testing PostgreSQL Provider directly...")
            from app.services.data_providers.postgresql_provider import PostgreSQLProvider
            
            pg_provider = PostgreSQLProvider(db_session)
            await pg_provider.connect()
            
            # Test get_equipment_status
            response = await pg_provider.get_equipment_status(limit=3)
            print(f"\nEquipment Status Response:")
            print(f"  Total: {response.total}")
            print(f"  Items: {len(response.items)}")
            if response.items:
                print(f"  First item: {response.items[0]}")
            
            await pg_provider.disconnect()
            
            print("\n✅ PostgreSQL Provider test successful!")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())