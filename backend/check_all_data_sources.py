import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def check_all_data_sources():
    """Check all data source configurations"""
    async with AsyncSessionLocal() as db:
        # Check all data source configurations
        query = text("""
            SELECT 
                id,
                workspace_id,
                source_type,
                is_active,
                custom_queries::text as custom_queries_text,
                created_at
            FROM data_source_configs
            ORDER BY created_at DESC
        """)
        
        result = await db.execute(query)
        configs = result.fetchall()
        
        print("All Data Source Configurations:")
        print("=" * 80)
        
        if configs:
            for config in configs:
                print(f"ID: {config.id}")
                print(f"Workspace ID: {config.workspace_id}")
                print(f"Source Type: {config.source_type}")
                print(f"Is Active: {config.is_active}")
                print(f"Created At: {config.created_at}")
                print(f"Custom Queries: {config.custom_queries_text[:100] if config.custom_queries_text else 'None'}...")
                print("-" * 80)
        else:
            print("No data source configurations found in the database")

if __name__ == "__main__":
    asyncio.run(check_all_data_sources())