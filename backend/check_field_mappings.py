import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def check_field_mappings():
    """Check field mappings for personal_test data source"""
    async with AsyncSessionLocal() as db:
        # Get the data source ID
        ds_query = text("""
            SELECT id 
            FROM data_source_configs
            WHERE workspace_id = 'personal_test'
        """)
        
        result = await db.execute(ds_query)
        ds_row = result.fetchone()
        
        if not ds_row:
            print("No data source found for personal_test")
            return
            
        data_source_id = ds_row.id
        print(f"Data Source ID: {data_source_id}")
        print("=" * 80)
        
        # Check field mappings
        mappings_query = text("""
            SELECT 
                data_type,
                source_field,
                target_field,
                is_required,
                is_active
            FROM data_source_field_mappings
            WHERE data_source_id = :data_source_id
            ORDER BY data_type, target_field
        """)
        
        result = await db.execute(mappings_query, {"data_source_id": data_source_id})
        mappings = result.fetchall()
        
        if mappings:
            print("\nField Mappings:")
            print("-" * 80)
            current_type = None
            for mapping in mappings:
                if current_type != mapping.data_type:
                    current_type = mapping.data_type
                    print(f"\n{current_type}:")
                print(f"  {mapping.source_field} → {mapping.target_field} (Required: {mapping.is_required}, Active: {mapping.is_active})")
        else:
            print("\nNo field mappings found for this data source")
            print("This means data will be mapped using default field names")

if __name__ == "__main__":
    asyncio.run(check_field_mappings())