#!/usr/bin/env python3
"""
Test equipment endpoint directly to see what's happening
"""
import asyncio
import sys
from pathlib import Path
import json

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.services.data_providers.dynamic import DynamicProvider

async def test_equipment_endpoint():
    """Test equipment endpoint directly"""
    
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
            print("🧪 Testing equipment endpoint directly...")
            
            # Test with different workspace IDs
            workspace_ids = [
                "personal_test",
                "personaltest", 
                "21ee03db-90c4-4592-b00f-c44801e0b164"
            ]
            
            for workspace_id in workspace_ids:
                print(f"\n🔍 Testing workspace: {workspace_id}")
                
                try:
                    # Create dynamic provider
                    provider = DynamicProvider(session, workspace_id)
                    
                    # Load config
                    config = await provider._load_config()
                    print(f"   Config loaded: {config}")
                    
                    # Test connection
                    connection_result = await provider.test_connection()
                    print(f"   Connection test: {connection_result['success']}")
                    if not connection_result['success']:
                        print(f"   Error: {connection_result['message']}")
                        continue
                    
                    # Try to get equipment status
                    try:
                        equipment_response = await provider.get_equipment_status(limit=5)
                        print(f"   Equipment response type: {type(equipment_response)}")
                        if hasattr(equipment_response, 'equipment'):
                            print(f"   Equipment count: {len(equipment_response.equipment)}")
                            if equipment_response.equipment:
                                sample = equipment_response.equipment[0]
                                print(f"   Sample equipment: {sample}")
                        else:
                            print(f"   Equipment response: {equipment_response}")
                            
                    except Exception as e:
                        print(f"   Equipment status error: {e}")
                        
                    # Disconnect
                    await provider.disconnect()
                    
                except Exception as e:
                    print(f"   Provider error: {e}")
                    
    except Exception as e:
        print(f"❌ Error testing equipment endpoint: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_equipment_endpoint())