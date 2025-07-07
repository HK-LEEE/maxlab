import asyncio
import asyncpg

async def update_view():
    # PostgreSQL 연결
    conn = await asyncpg.connect(
        host='localhost',
        port=5432,
        user='postgres',
        password='2300',
        database='max_lab'
    )
    
    try:
        # Drop and recreate view to change column type
        await conn.execute("DROP VIEW IF EXISTS v_measurement_data_with_spec")
        
        await conn.execute("""
            CREATE VIEW v_measurement_data_with_spec AS
            SELECT 
                m.id,
                m.equipment_type,
                m.equipment_code,
                m.measurement_code,
                m.measurement_desc,
                m.measurement_value,
                m.timestamp,
                s.usl,
                s.lsl,
                s.target,
                CASE 
                    WHEN s.usl IS NOT NULL AND m.measurement_value > s.usl THEN 'ABOVE_SPEC'
                    WHEN s.lsl IS NOT NULL AND m.measurement_value < s.lsl THEN 'BELOW_SPEC'
                    WHEN s.usl IS NOT NULL OR s.lsl IS NOT NULL THEN 'IN_SPEC'
                    ELSE NULL
                END as spec_status
            FROM personal_test_measurement_data m
            LEFT JOIN measurement_specs s ON m.measurement_code = s.measurement_code
        """)
        
        print("View updated successfully!")
        
        # Also add connection_string column to data_source_configs if needed
        await conn.execute("""
            ALTER TABLE data_source_configs
            ADD COLUMN IF NOT EXISTS connection_string VARCHAR(500)
        """)
        
        # Update existing rows to populate connection_string
        await conn.execute("""
            UPDATE data_source_configs
            SET connection_string = COALESCE(api_url, mssql_connection_string)
            WHERE connection_string IS NULL
        """)
        
        print("Added connection_string column successfully!")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(update_view())