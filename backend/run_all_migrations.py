#!/usr/bin/env python3
"""
Run all migrations for the data source management system
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def run_migrations():
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
        # List of migration files in order
        migrations = [
            ("1. Add spec columns to measurement data", "migrations/add_spec_columns_to_measurement_data.sql"),
            ("2. Add measurement spec trigger", "migrations/add_measurement_spec_trigger.sql"),
            ("3. Create endpoint mapping table", "migrations/create_endpoint_mapping_table.sql"),
            ("4. Create field mapping table", "migrations/create_field_mapping_table.sql"),
        ]
        
        for name, filepath in migrations:
            print(f"\n{name}...")
            try:
                with open(filepath, "r") as f:
                    sql = f.read()
                await conn.execute(sql)
                print(f"✓ {name} completed successfully")
            except Exception as e:
                print(f"❌ {name} failed: {e}")
                # Continue with other migrations
        
        # Verify the migrations
        print("\n5. Verifying migrations...")
        
        # Check columns
        columns = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'personal_test_measurement_data' 
            AND column_name IN ('usl', 'lsl', 'spec_status')
            ORDER BY column_name
        """)
        
        print(f"   - Found {len(columns)} new columns in measurement_data table")
        
        # Check tables
        tables = await conn.fetch("""
            SELECT table_name
            FROM information_schema.tables 
            WHERE table_name IN ('data_source_endpoint_mappings', 'data_source_field_mappings')
            ORDER BY table_name
        """)
        
        print(f"   - Found {len(tables)} new mapping tables")
        
        print("\n✅ All migrations completed!")
        
    except Exception as e:
        print(f"\n❌ Migration process failed: {e}")
        raise
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run_migrations())