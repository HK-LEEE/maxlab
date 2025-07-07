import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def restore_workspace_uuid():
    """Restore workspace_id back to original UUID"""
    async with AsyncSessionLocal() as db:
        try:
            # Update the workspace_id back to UUID
            update_query = text("""
                UPDATE data_source_configs 
                SET workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
                WHERE workspace_id = 'personal_test'
            """)
            
            result = await db.execute(update_query)
            await db.commit()
            
            print(f"Updated {result.rowcount} data source configuration(s) back to UUID")
            
            # Verify the update
            verify_query = text("""
                SELECT id, workspace_id, source_type
                FROM data_source_configs
                WHERE workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
            """)
            
            result = await db.execute(verify_query)
            config = result.fetchone()
            
            if config:
                print("\nRestored configuration:")
                print(f"ID: {config.id}")
                print(f"Workspace ID: {config.workspace_id}")
                print(f"Source Type: {config.source_type}")
            
        except Exception as e:
            print(f"Error restoring workspace_id: {e}")
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(restore_workspace_uuid())