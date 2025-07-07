import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def check_flow_tables():
    """Check structure of process flow tables"""
    async with AsyncSessionLocal() as db:
        # Check personal_test_process_flows columns
        flows_query = text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'personal_test_process_flows'
            ORDER BY ordinal_position
        """)
        
        print("personal_test_process_flows table structure:")
        print("=" * 60)
        result = await db.execute(flows_query)
        for row in result:
            print(f"{row.column_name}: {row.data_type}")
        
        print("\n")
        
        # Check personal_test_process_flow_versions columns
        versions_query = text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'personal_test_process_flow_versions'
            ORDER BY ordinal_position
        """)
        
        print("personal_test_process_flow_versions table structure:")
        print("=" * 60)
        result = await db.execute(versions_query)
        for row in result:
            print(f"{row.column_name}: {row.data_type}")

if __name__ == "__main__":
    asyncio.run(check_flow_tables())