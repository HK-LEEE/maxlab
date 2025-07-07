import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def check_data_source():
    """Check data source configuration for personal_test workspace"""
    async with AsyncSessionLocal() as db:
        # Check data source configuration
        query = text("""
            SELECT 
                id,
                workspace_id,
                source_type,
                is_active,
                custom_queries
            FROM data_source_configs
            WHERE workspace_id = 'personal_test'
        """)
        
        result = await db.execute(query)
        configs = result.fetchall()
        
        print("Data Source Configurations for personal_test workspace:")
        print("=" * 60)
        
        for config in configs:
            print(f"ID: {config.id}")
            print(f"Workspace ID: {config.workspace_id}")
            print(f"Source Type: {config.source_type}")
            print(f"Is Active: {config.is_active}")
            print(f"Custom Queries: {config.custom_queries}")
            print("-" * 60)
        
        if not configs:
            print("No data source configuration found for personal_test workspace")
            print("The system will use the default PostgreSQL connection")

if __name__ == "__main__":
    asyncio.run(check_data_source())