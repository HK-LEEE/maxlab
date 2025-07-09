#!/usr/bin/env python3
"""
Test equipment type measurements API
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

async def test_equipment_type_measurements():
    """Test equipment type measurements API"""
    
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
            print("🧪 Testing equipment type measurements API...")
            
            workspace_id = "personaltest"
            
            # Create dynamic provider
            provider = DynamicProvider(session, workspace_id)
            
            # Test connection
            connection_result = await provider.test_connection()
            print(f"   Connection test: {connection_result['success']}")
            
            if connection_result['success']:
                # Get equipment statuses to see available types
                equipment_response = await provider.get_equipment_status(limit=20)
                equipment_types = set()
                for item in equipment_response['items']:
                    equipment_types.add(item['equipment_type'])
                
                print(f"   Available equipment types: {sorted(equipment_types)}")
                
                # Test measurements by equipment type
                for equipment_type in sorted(equipment_types):
                    print(f"\n📊 Testing measurements for equipment type: {equipment_type}")
                    
                    try:
                        measurements = await provider.get_measurement_data(
                            equipment_type=equipment_type,
                            limit=10
                        )
                        
                        print(f"   Measurement count: {len(measurements)}")
                        
                        # Show unique measurement codes and descriptions
                        measurement_codes = set()
                        for measurement in measurements:
                            measurement_codes.add((
                                measurement.get('measurement_code', ''),
                                measurement.get('measurement_desc', '')
                            ))
                        
                        print(f"   Unique measurement codes: {len(measurement_codes)}")
                        for code, desc in sorted(measurement_codes):
                            print(f"     - {code}: {desc}")
                            
                    except Exception as e:
                        print(f"   Error getting measurements: {e}")
                    
            # Disconnect
            await provider.disconnect()
                
    except Exception as e:
        print(f"❌ Error testing equipment type measurements: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_equipment_type_measurements())