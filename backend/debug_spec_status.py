#!/usr/bin/env python3
"""
Debug script to check what's happening with spec_status
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.services.data_providers.dynamic import DynamicProvider

async def debug_spec_status():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Create dynamic provider
        provider = DynamicProvider(session, "21ee03db-90c4-4592-b00f-c44801e0b164", "2881a01f-1eed-4343-b0d1-5d8d22f6744a")
        
        try:
            await provider.connect()
            
            # Get measurement data
            measurements = await provider.get_measurement_data(limit=3)
            
            print(f"Got {len(measurements)} measurements")
            for i, measurement in enumerate(measurements):
                print(f"Measurement {i+1}:")
                print(f"  Type: {type(measurement)}")
                print(f"  spec_status: {measurement.get('spec_status')} (type: {type(measurement.get('spec_status'))})")
                print(f"  Keys: {list(measurement.keys())}")
                print()
                
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await provider.disconnect()

if __name__ == "__main__":
    asyncio.run(debug_spec_status())