#!/usr/bin/env python3
"""
Debug script to check raw data from MSSQL
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.services.data_providers.mssql import MSSQLProvider

async def debug_raw_data():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Create MSSQL provider directly
        provider = MSSQLProvider(
            "DRIVER={FreeTDS};SERVER=172.28.32.1;DATABASE=AIDB;UID=mss;PWD=2300;TrustServerCertificate=yes;Connection Timeout=30;Command Timeout=60;TDS_Version=8.0;Port=1433",
            "21ee03db-90c4-4592-b00f-c44801e0b164"
        )
        
        try:
            await provider.connect()
            
            # Get measurement data directly
            measurements = await provider.get_measurement_data(limit=3)
            
            print(f"Got {len(measurements)} measurements")
            for i, measurement in enumerate(measurements):
                print(f"Measurement {i+1}:")
                print(f"  Type: {type(measurement)}")
                print(f"  spec_status: {measurement.spec_status} (type: {type(measurement.spec_status)})")
                if hasattr(measurement, 'dict'):
                    print(f"  Dict: {measurement.dict()}")
                print()
                
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await provider.disconnect()

if __name__ == "__main__":
    asyncio.run(debug_raw_data())