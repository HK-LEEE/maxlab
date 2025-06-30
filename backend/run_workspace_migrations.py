#!/usr/bin/env python3
"""
Script to run workspace-related database migrations
"""
import asyncio
import os
import sys
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv()

# Import settings
from app.core.config import settings

async def run_migrations():
    """Run workspace migrations"""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    
    migrations_dir = backend_dir / "migrations"
    
    async with engine.begin() as conn:
        print("🚀 Running workspace migrations...")
        
        # Check which tables already exist
        check_query = text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('workspaces', 'workspace_users', 'workspace_groups', 'mvp_modules', 'mvp_module_logs')
            ORDER BY table_name;
        """)
        
        result = await conn.execute(check_query)
        existing_tables = [row[0] for row in result]
        print(f"Existing tables: {existing_tables}")
        
        # Run workspace_users migration if needed
        if 'workspace_users' not in existing_tables:
            migration_file = migrations_dir / "add_workspace_user_table.sql"
            if migration_file.exists():
                print(f"\n📄 Running migration: {migration_file.name}")
                with open(migration_file, 'r') as f:
                    migration_sql = f.read()
                await conn.execute(text(migration_sql))
                print("✅ workspace_users table created")
            else:
                print(f"❌ Migration file not found: {migration_file}")
        else:
            print("✓ workspace_users table already exists")
        
        # Run workspace_groups migration if needed  
        if 'workspace_groups' not in existing_tables:
            migration_file = migrations_dir / "add_workspace_groups_table.sql"
            if migration_file.exists():
                print(f"\n📄 Running migration: {migration_file.name}")
                with open(migration_file, 'r') as f:
                    migration_sql = f.read()
                await conn.execute(text(migration_sql))
                print("✅ workspace_groups table created")
            else:
                print(f"❌ Migration file not found: {migration_file}")
        else:
            print("✓ workspace_groups table already exists")
        
        # Verify all tables exist now
        print("\n🔍 Verifying all workspace tables...")
        result = await conn.execute(check_query)
        final_tables = [row[0] for row in result]
        
        expected_tables = ['workspaces', 'workspace_users', 'workspace_groups', 'mvp_modules', 'mvp_module_logs']
        missing_tables = [t for t in expected_tables if t not in final_tables]
        
        if missing_tables:
            print(f"⚠️  Missing tables: {missing_tables}")
            print("\nYou may need to run the application with ENVIRONMENT=development to create all tables")
        else:
            print("✅ All workspace tables exist!")
        
        # Show table statistics
        print("\n📊 Table statistics:")
        for table in final_tables:
            count_query = text(f"SELECT COUNT(*) FROM {table};")
            result = await conn.execute(count_query)
            count = result.scalar()
            print(f"  - {table}: {count} records")
    
    await engine.dispose()
    print("\n✨ Migration check complete!")

if __name__ == "__main__":
    print("MAX Lab Workspace Migration Runner")
    print("==================================")
    print(f"Database URL: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'local'}")
    print(f"Environment: {settings.ENVIRONMENT}")
    
    try:
        asyncio.run(run_migrations())
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nTroubleshooting:")
        print("1. Make sure PostgreSQL is running")
        print("2. Check your .env file has the correct DATABASE_URL")
        print("3. Ensure the database exists")
        sys.exit(1)