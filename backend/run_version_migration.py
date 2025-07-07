#!/usr/bin/env python3
"""
Run the version management migration for the Process Flow Editor
"""
import asyncio
import os
import sys
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv()

async def run_migration():
    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL not found in environment")
        print("Please make sure your .env file contains DATABASE_URL")
        return False
    
    print(f"🔗 Connecting to database...")
    
    # Create engine
    engine = create_async_engine(database_url, echo=False)
    
    # Read migration file
    migration_file = Path(__file__).parent / "migrations" / "add_version_management.sql"
    if not migration_file.exists():
        print(f"❌ Migration file not found: {migration_file}")
        return False
    
    with open(migration_file, "r") as f:
        migration_sql = f.read()
    
    print(f"📄 Running migration from: {migration_file}")
    
    # Execute migration
    async with engine.begin() as conn:
        # Split by semicolon and execute each statement
        statements = [s.strip() for s in migration_sql.split(';') if s.strip()]
        total = len(statements)
        
        for i, statement in enumerate(statements, 1):
            try:
                # Skip comments
                if statement.strip().startswith('--'):
                    continue
                    
                print(f"⏳ Executing statement {i}/{total}...")
                await conn.execute(text(statement))
                
                # Show what was executed (first 60 chars)
                stmt_preview = statement.replace('\n', ' ')[:60] + "..."
                print(f"✅ {stmt_preview}")
                
            except Exception as e:
                print(f"❌ Error executing statement {i}: {e}")
                print(f"   Statement: {statement[:100]}...")
                # Continue with other statements
    
    await engine.dispose()
    print("\n✨ Migration completed successfully!")
    print("You can now use the version management features in the Process Flow Editor.")
    return True

async def check_migration_status():
    """Check if migration has already been run"""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return False
    
    engine = create_async_engine(database_url, echo=False)
    
    async with engine.begin() as conn:
        # Check if version table exists
        check_query = """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'personal_test_process_flow_versions'
            )
        """
        result = await conn.execute(text(check_query))
        exists = result.scalar()
        
        if exists:
            # Check if current_version column exists
            column_query = """
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'personal_test_process_flows' 
                    AND column_name = 'current_version'
                )
            """
            result = await conn.execute(text(column_query))
            column_exists = result.scalar()
            
            await engine.dispose()
            return column_exists
    
    await engine.dispose()
    return False

async def main():
    print("🚀 Process Flow Version Management Migration Tool")
    print("=" * 50)
    
    # Check if migration is already done
    print("🔍 Checking migration status...")
    already_done = await check_migration_status()
    
    if already_done:
        print("✅ Migration has already been applied!")
        return
    
    # Ask for confirmation
    print("\nThis will add version management tables to your database.")
    response = input("Do you want to continue? (yes/no): ")
    
    if response.lower() not in ['yes', 'y']:
        print("❌ Migration cancelled.")
        return
    
    # Run migration
    success = await run_migration()
    
    if not success:
        print("\n❌ Migration failed. Please check the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())