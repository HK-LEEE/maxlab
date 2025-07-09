#!/usr/bin/env python3
"""
Migration script to assign data sources to existing ProcessFlows
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings

async def migrate_flow_data_sources():
    """
    Assign existing data sources to flows that don't have data_source_id set
    """
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Find available data sources for the workspace
        result = await session.execute(text('''
            SELECT id, source_type, is_active
            FROM data_source_configs 
            WHERE workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
            AND is_active = true
            ORDER BY created_at ASC
        '''))
        data_sources = result.fetchall()
        
        if not data_sources:
            print("No active data sources found for workspace.")
            return
        
        print(f"Found {len(data_sources)} active data sources:")
        for ds in data_sources:
            print(f"  {ds.id}: {ds.source_type}")
        
        # Get the first available data source (MSSQL in this case)
        default_data_source_id = str(data_sources[0].id)
        print(f"\nUsing {data_sources[0].source_type} ({default_data_source_id}) as default data source")
        
        # Find flows without data_source_id
        result = await session.execute(text('''
            SELECT id, name, created_at
            FROM personal_test_process_flows 
            WHERE data_source_id IS NULL
            ORDER BY created_at DESC
        '''))
        flows_without_ds = result.fetchall()
        
        if not flows_without_ds:
            print("All flows already have data_source_id assigned.")
            return
        
        print(f"\nFound {len(flows_without_ds)} flows without data_source_id:")
        for flow in flows_without_ds:
            print(f"  {flow.name} (created: {flow.created_at})")
        
        # Update flows to assign default data source
        update_result = await session.execute(text('''
            UPDATE personal_test_process_flows 
            SET data_source_id = :data_source_id
            WHERE data_source_id IS NULL
        '''), {'data_source_id': default_data_source_id})
        
        await session.commit()
        
        print(f"\nSuccessfully assigned data_source_id to {update_result.rowcount} flows.")
        
        # Verify the update
        result = await session.execute(text('''
            SELECT id, name, data_source_id
            FROM personal_test_process_flows 
            WHERE data_source_id = :data_source_id
            ORDER BY created_at DESC
        '''), {'data_source_id': default_data_source_id})
        updated_flows = result.fetchall()
        
        print(f"\nVerification - Flows now assigned to {data_sources[0].source_type}:")
        for flow in updated_flows:
            print(f"  {flow.name}: {flow.data_source_id}")

if __name__ == "__main__":
    asyncio.run(migrate_flow_data_sources())