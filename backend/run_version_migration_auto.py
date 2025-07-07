#!/usr/bin/env python3
"""
Automated version management migration runner
"""
import asyncio
import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from urllib.parse import urlparse, urlunparse
import subprocess

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
    
    # Convert asyncpg URL to psycopg2 for synchronous connection
    if 'asyncpg' in db_url:
        db_url = db_url.replace('postgresql+asyncpg', 'postgresql')
    
    return db_url

async def check_migration_status(engine):
    """Check if migration has already been applied"""
    try:
        with engine.connect() as conn:
            # Check if version table exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'personal_test_process_flow_versions'
                );
            """))
            version_table_exists = result.scalar()
            
            # Check if current_version column exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'personal_test_process_flows' 
                    AND column_name = 'current_version'
                );
            """))
            current_version_exists = result.scalar()
            
            return {
                'version_table': version_table_exists,
                'current_version_column': current_version_exists
            }
    except Exception as e:
        print(f"❌ Error checking migration status: {e}")
        return None

async def run_migration(engine):
    """Execute the migration SQL"""
    migration_file = Path('migrations/add_version_management.sql')
    
    if not migration_file.exists():
        print(f"❌ Migration file not found: {migration_file}")
        return False
    
    try:
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
        
        with engine.connect() as conn:
            # Execute migration in a transaction
            trans = conn.begin()
            try:
                # Split and execute statements one by one
                statements = migration_sql.split(';')
                for statement in statements:
                    if statement.strip():
                        conn.execute(text(statement))
                trans.commit()
                print("✅ Migration completed successfully!")
                return True
            except Exception as e:
                trans.rollback()
                print(f"❌ Migration failed: {e}")
                return False
                
    except Exception as e:
        print(f"❌ Error reading migration file: {e}")
        return False

async def verify_migration(engine):
    """Verify the migration was successful"""
    status = await check_migration_status(engine)
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
        db_url = get_database_url()
        engine = create_engine(db_url)
        
        print("🔍 Checking migration status...")
        status = await check_migration_status(engine)
        
        if status is None:
            print("❌ Could not connect to database")
            return
        
        if status['version_table'] and status['current_version_column']:
            print("✅ Migration already applied!")
            return
        
        print("\n📋 Migration will add:")
        if not status['version_table']:
            print("  - Version management table")
        if not status['current_version_column']:
            print("  - Current version tracking")
        
        print("\n🚀 Running migration automatically...")
        
        success = await run_migration(engine)
        
        if success:
            await verify_migration(engine)
        else:
            print("\n❌ Migration failed. Please check the error messages above.")
            
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())