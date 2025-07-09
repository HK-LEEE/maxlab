#!/usr/bin/env python3
"""
Test MSSQL connection directly
"""

import asyncio
import sys
import os

# Add the backend directory to Python path
sys.path.insert(0, '/home/lee/proejct/maxlab/backend')

from app.core.security import decrypt_connection_string
from app.services.data_providers.dynamic import DynamicProvider
from app.core.config import settings
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

async def test_mssql_connection():
    """Test MSSQL connection directly"""
    print("🔧 Testing MSSQL connection...")
    
    # Create async engine
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # Create dynamic provider
        provider = DynamicProvider(db, 'personal_test')
        
        try:
            # Load config
            print("📋 Loading configuration...")
            config = await provider._load_config()
            print(f"✅ Config loaded: {config.get('source_type')}")
            
            # Test connection
            print("🔌 Testing connection...")
            connection_test = await provider.test_connection()
            print(f"Connection test result: {connection_test}")
            
            if connection_test.get('success'):
                print("✅ Connection successful!")
                
                # Test getting equipment status
                print("\n🎯 Testing equipment status query...")
                await provider.connect()
                
                equipment_data = await provider.get_equipment_status(limit=5)
                print(f"Equipment data: {equipment_data}")
                
                # Test getting measurement data
                print("\n📊 Testing measurement data query...")
                measurement_data = await provider.get_measurement_data(limit=5)
                print(f"Measurement data: {measurement_data}")
                
                await provider.disconnect()
                
            else:
                print(f"❌ Connection failed: {connection_test.get('message')}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_mssql_connection())