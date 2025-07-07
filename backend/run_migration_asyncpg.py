#!/usr/bin/env python3
"""
Version management migration runner using asyncpg
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

async def check_migration_status(conn):
    """Check if migration has already been applied"""
    try:
        # Check if version table exists
        version_table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'personal_test_process_flow_versions'
            );
        """)
        
        # Check if current_version column exists
        current_version_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'personal_test_process_flows' 
                AND column_name = 'current_version'
            );
        """)
        
        return {
            'version_table': version_table_exists,
            'current_version_column': current_version_exists
        }
    except Exception as e:
        print(f"❌ Error checking migration status: {e}")
        return None

async def run_migration(conn):
    """Execute the migration SQL"""
    migration_file = Path('migrations/add_version_management.sql')
    
    if not migration_file.exists():
        print(f"❌ Migration file not found: {migration_file}")
        return False
    
    try:
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
        
        # Execute migration in a transaction
        async with conn.transaction():
            # Split and execute statements one by one
            statements = migration_sql.split(';')
            for statement in statements:
                if statement.strip():
                    await conn.execute(statement)
        
        print("✅ Migration completed successfully!")
        return True
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

async def verify_migration(conn):
    """Verify the migration was successful"""
    status = await check_migration_status(conn)
    if status:
        print("\n📊 Migration Verification:")
        print(f"  - Version table exists: {'✅' if status['version_table'] else '❌'}")
        print(f"  - Current version column exists: {'✅' if status['current_version_column'] else '❌'}")
        
        if status['version_table'] and status['current_version_column']:
            print("\n✅ Version management is now available!")
            return True
    return False

async def main():
    print("🚀 Process Flow Version Management Migration Tool")
    print("=" * 50)
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        print("🔍 Checking migration status...")
        status = await check_migration_status(conn)
        
        if status is None:
            print("❌ Could not connect to database")
            await conn.close()
            return
        
        if status['version_table'] and status['current_version_column']:
            print("✅ Migration already applied!")
            await conn.close()
            return
        
        print("\n📋 Migration will add:")
        if not status['version_table']:
            print("  - Version management table")
        if not status['current_version_column']:
            print("  - Current version tracking")
        
        print("\n🚀 Running migration automatically...")
        
        success = await run_migration(conn)
        
        if success:
            await verify_migration(conn)
        else:
            print("\n❌ Migration failed. Please check the error messages above.")
        
        await conn.close()
            
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())