import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def check_workspace_structure():
    """Check workspace table structure and find personal_test workspace"""
    async with AsyncSessionLocal() as db:
        # Check if workspaces table exists and its structure
        check_table_query = text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'workspaces'
            ORDER BY ordinal_position
        """)
        
        result = await db.execute(check_table_query)
        columns = result.fetchall()
        
        if columns:
            print("Workspaces table structure:")
            print("=" * 60)
            for col in columns:
                print(f"{col.column_name}: {col.data_type}")
            print()
        
        # Find personal_test workspace
        find_workspace_query = text("""
            SELECT * FROM workspaces 
            WHERE slug = 'personal_test' OR name LIKE '%personal%test%'
            LIMIT 5
        """)
        
        try:
            result = await db.execute(find_workspace_query)
            workspaces = result.fetchall()
            
            if workspaces:
                print("\nPersonal Test Workspace(s):")
                print("=" * 60)
                for ws in workspaces:
                    print(f"ID: {ws.id}")
                    print(f"Slug: {ws.slug}")
                    print(f"Name: {ws.name}")
                    print("-" * 60)
            else:
                print("\nNo personal_test workspace found")
                
                # Check all workspaces
                all_ws_query = text("SELECT id, slug, name FROM workspaces LIMIT 10")
                result = await db.execute(all_ws_query)
                all_ws = result.fetchall()
                
                if all_ws:
                    print("\nAll workspaces (first 10):")
                    print("=" * 60)
                    for ws in all_ws:
                        print(f"ID: {ws.id}, Slug: {ws.slug}, Name: {ws.name}")
                
        except Exception as e:
            print(f"Error querying workspaces: {e}")
            print("\nTrying alternative query...")
            
            # If workspaces table doesn't exist, check for UUID
            uuid_check_query = text("""
                SELECT '21ee03db-90c4-4592-b00f-c44801e0b164'::uuid as test_uuid
            """)
            result = await db.execute(uuid_check_query)
            print(f"UUID is valid: {result.scalar()}")

if __name__ == "__main__":
    asyncio.run(check_workspace_structure())