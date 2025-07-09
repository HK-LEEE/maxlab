#!/usr/bin/env python3
"""
Test measurements API endpoint
"""
import asyncio
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.services.data_providers.dynamic import DynamicProvider

async def test_measurements_api():
    """Test measurements API endpoint"""
    
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
            print("🧪 Testing measurements API endpoint...")
            
            # Test with different workspace IDs
            workspace_ids = ["personaltest", "personal_test"]
            
            for workspace_id in workspace_ids:
                print(f"\n🔍 Testing workspace: {workspace_id}")
                
                try:
                    # Create dynamic provider
                    provider = DynamicProvider(session, workspace_id)
                    
                    # Load config
                    config = await provider._load_config()
                    print(f"   Config loaded: {config.get('source_type')}")
                    
                    # Test connection
                    connection_result = await provider.test_connection()
                    print(f"   Connection test: {connection_result['success']}")
                    
                    if not connection_result['success']:
                        print(f"   Connection error: {connection_result['message']}")
                        continue
                    
                    # Try to get measurement data
                    try:
                        measurements = await provider.get_measurement_data(limit=10)
                        print(f"   Measurement data count: {len(measurements)}")
                        
                        if measurements:
                            sample = measurements[0]
                            print(f"   Sample measurement: {sample}")
                            
                            # Test specific equipment code
                            if hasattr(sample, 'equipment_code') and sample.equipment_code:
                                equipment_measurements = await provider.get_measurement_data(
                                    equipment_code=sample.equipment_code, 
                                    limit=5
                                )
                                print(f"   Equipment-specific measurements: {len(equipment_measurements)}")
                                
                    except Exception as e:
                        print(f"   Measurement data error: {e}")
                        
                    # Disconnect
                    await provider.disconnect()
                    
                except Exception as e:
                    print(f"   Provider error: {e}")
                    
    except Exception as e:
        print(f"❌ Error testing measurements API: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_measurements_api())