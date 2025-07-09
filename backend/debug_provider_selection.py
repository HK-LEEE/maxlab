#!/usr/bin/env python3
"""
Debug script to check which provider is being selected
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.services.data_providers.dynamic import DynamicProvider

async def debug_provider_selection():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Create dynamic provider
        provider = DynamicProvider(session, "21ee03db-90c4-4592-b00f-c44801e0b164", "2881a01f-1eed-4343-b0d1-5d8d22f6744a")
        
        try:
            # Load config
            config = await provider._load_config()
            print(f"Config loaded: {config}")
            
            # Get the actual provider
            actual_provider = await provider._get_provider()
            print(f"Actual provider type: {type(actual_provider)}")
            print(f"Actual provider class: {actual_provider.__class__.__name__}")
            
            # Check provider attributes
            if hasattr(actual_provider, 'connection_string'):
                print(f"Connection string exists: {hasattr(actual_provider, 'connection_string')}")
            if hasattr(actual_provider, 'base_url'):
                print(f"Base URL exists: {hasattr(actual_provider, 'base_url')}")
            
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(debug_provider_selection())