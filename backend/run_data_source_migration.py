#!/usr/bin/env python3
"""
Run data source configuration migration
"""
import asyncio
import asyncpg
import os
from pathlib import Path
from urllib.parse import urlparse

# Get the database URL from environment or .env file
def get_database_url():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        env_path = Path('.env')
        if env_path.exists():
            with open(env_path, 'r') as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        key, _, value = line.partition('=')
                        if key.strip() == 'DATABASE_URL':
                            db_url = value.strip()
                            break
    
    if not db_url:
        raise ValueError("DATABASE_URL not found in environment or .env file")
    
    # Parse the URL to get connection parameters
    parsed = urlparse(db_url)
    return {
        'host': parsed.hostname,
        'port': parsed.port or 5432,
        'user': parsed.username,
        'password': parsed.password,
        'database': parsed.path.lstrip('/')
    }

async def run_migration(conn):
    """Run the migration"""
    migration_path = Path('migrations/add_data_source_configs.sql')
    
    if not migration_path.exists():
        raise FileNotFoundError(f"Migration file not found: {migration_path}")
    
    print(f"Running migration: {migration_path}")
    
    try:
        # Read the migration file
        with open(migration_path, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # Execute the migration
        await conn.execute(sql_content)
        print("✅ Migration completed successfully!")
        
        # Verify tables were created
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('data_source_configs', 'api_endpoint_mappings', 'measurement_specs')
            ORDER BY table_name
        """)
        
        print("\nCreated tables:")
        for table in tables:
            print(f"  - {table['table_name']}")
            
        # Verify view was created
        views = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = 'public' 
            AND table_name = 'v_measurement_data_with_spec'
        """)
        
        if views:
            print("\nCreated views:")
            for view in views:
                print(f"  - {view['table_name']}")
                
        # Check sample spec data
        spec_count = await conn.fetchval("SELECT COUNT(*) FROM measurement_specs")
        print(f"\nInserted {spec_count} measurement specs")
        
        return True
        
    except asyncpg.PostgresError as e:
        print(f"❌ Migration failed: {e}")
        # Check if it's because tables already exist
        if "already exists" in str(e):
            print("ℹ️  Tables already exist. Migration may have been run before.")
        return False

async def main():
    print("🔧 Running Data Source Configuration Migration")
    print("=" * 50)
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        await run_migration(conn)
        
        await conn.close()
            
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())