import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def update_workspace_id():
    """Update workspace_id from UUID to personal_test"""
    async with AsyncSessionLocal() as db:
        try:
            # Update the workspace_id
            update_query = text("""
                UPDATE data_source_configs 
                SET workspace_id = 'personal_test'
                WHERE id = '83c84ef5-c316-40bb-8cf6-8b574320b7e5'
            """)
            
            result = await db.execute(update_query)
            await db.commit()
            
            print(f"Updated {result.rowcount} data source configuration(s)")
            
            # Verify the update
            verify_query = text("""
                SELECT id, workspace_id, source_type, custom_queries::text as custom_queries
                FROM data_source_configs
                WHERE workspace_id = 'personal_test'
            """)
            
            result = await db.execute(verify_query)
            config = result.fetchone()
            
            if config:
                print("\nUpdated configuration:")
                print(f"ID: {config.id}")
                print(f"Workspace ID: {config.workspace_id}")
                print(f"Source Type: {config.source_type}")
                print(f"Custom Queries: {config.custom_queries[:200] if config.custom_queries else 'None'}...")
            
        except Exception as e:
            print(f"Error updating workspace_id: {e}")
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(update_workspace_id())