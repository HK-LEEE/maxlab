#!/usr/bin/env python3
"""
Test status normalization functionality
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
from app.services.status_normalizer import StatusNormalizer

async def test_status_normalization():
    """Test status normalization functionality"""
    
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
            print("🧪 Testing status normalization...")
            
            # Test StatusNormalizer directly
            normalizer = StatusNormalizer(session)
            
            # Test default mappings
            test_statuses = [
                "Running", "Run", "ACTIVE", "ONLINE", "STARTED",
                "Stopped", "Stop", "OFFLINE", "DOWN", "SHUTDOWN",
                "Idle", "Pause", "STANDBY", "WAITING", "HOLD",
                "Unknown", "CustomStatus", "ErrorState"
            ]
            
            print("\n📋 Testing default status normalization:")
            for status in test_statuses:
                normalized = await normalizer.normalize_status(status)
                print(f"   {status:12} -> {normalized}")
            
            # Test with workspace-specific mappings
            workspace_id = "21ee03db-90c4-4592-b00f-c44801e0b164"
            
            print(f"\n📋 Testing workspace-specific normalization (workspace: {workspace_id}):")
            for status in test_statuses:
                normalized = await normalizer.normalize_status(status, workspace_id)
                print(f"   {status:12} -> {normalized}")
            
            # Test with actual data provider
            print(f"\n🔍 Testing with DynamicProvider...")
            provider = DynamicProvider(session, "personaltest")
            
            # Load config
            config = await provider._load_config()
            print(f"   Config loaded: {config.get('source_type')}")
            
            # Test connection
            connection_result = await provider.test_connection()
            print(f"   Connection test: {connection_result['success']}")
            
            if connection_result['success']:
                # Get equipment status
                equipment_response = await provider.get_equipment_status(limit=5)
                print(f"   Equipment count: {len(equipment_response['items'])}")
                
                # Show status values
                for item in equipment_response['items'][:3]:  # Show first 3
                    print(f"   Equipment: {item['equipment_code']} - Status: {item['status']}")
            
            # Disconnect
            await provider.disconnect()
                
    except Exception as e:
        print(f"❌ Error testing status normalization: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_status_normalization())