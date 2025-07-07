#!/usr/bin/env python3
"""
Run migration to add USL/LSL/spec_status columns to measurement_data table
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def run_migration():
    # Get database connection string
    database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/platform_integration")
    
    # Parse the connection string
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "")
    
    # Extract connection parameters
    try:
        user_pass, host_db = database_url.split("@")
        user, password = user_pass.split(":")
        host_port, database = host_db.split("/")
        host, port = host_port.split(":")
    except:
        print("Failed to parse database URL, using defaults")
        host = "localhost"
        port = 5432
        user = "postgres"
        password = "postgres"
        database = "platform_integration"
    
    print(f"Connecting to database {database} at {host}:{port}")
    
    # Connect to the database
    conn = await asyncpg.connect(
        host=host,
        port=int(port),
        user=user,
        password=password,
        database=database
    )
    
    try:
        # Read and execute the migration scripts
        print("\n1. Adding USL/LSL/spec_status columns...")
        with open("migrations/add_spec_columns_to_measurement_data.sql", "r") as f:
            add_columns_sql = f.read()
        
        await conn.execute(add_columns_sql)
        print("✓ Columns added successfully")
        
        print("\n2. Creating spec status calculation function and triggers...")
        with open("migrations/add_measurement_spec_trigger.sql", "r") as f:
            trigger_sql = f.read()
        
        await conn.execute(trigger_sql)
        print("✓ Function and triggers created successfully")
        
        # Verify the columns were added
        print("\n3. Verifying column additions...")
        columns = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'personal_test_measurement_data' 
            AND column_name IN ('usl', 'lsl', 'spec_status')
            ORDER BY column_name
        """)
        
        print("Found columns:")
        for col in columns:
            print(f"  - {col['column_name']}: {col['data_type']}")
        
        # Check if any measurements have spec limits
        print("\n4. Checking for existing spec definitions...")
        spec_count = await conn.fetchval("""
            SELECT COUNT(*) 
            FROM personal_test_measurement_specs
        """)
        print(f"Found {spec_count} spec definitions")
        
        # Update a few sample records to test
        if spec_count > 0:
            print("\n5. Testing spec status calculation on new inserts...")
            # This will trigger the automatic calculation
            test_result = await conn.fetchrow("""
                INSERT INTO personal_test_measurement_data 
                (equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value)
                VALUES ('A1', 'A001', 'M001', 'Test Measurement', 50.0)
                RETURNING id, usl, lsl, spec_status
            """)
            
            if test_result:
                print(f"Test insert successful:")
                print(f"  ID: {test_result['id']}")
                print(f"  USL: {test_result['usl']}")
                print(f"  LSL: {test_result['lsl']}")
                print(f"  Spec Status: {test_result['spec_status']}")
                
                # Clean up test record
                await conn.execute("DELETE FROM personal_test_measurement_data WHERE id = $1", test_result['id'])
        
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run_migration())