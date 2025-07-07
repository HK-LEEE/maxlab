# Running Database Migrations

To enable the version management feature, you need to run the database migration:

## Option 1: Using psql (PostgreSQL)
```bash
psql -U postgres -d platform_integration < migrations/add_version_management.sql
```

## Option 2: Using a PostgreSQL client
1. Connect to your database
2. Run the SQL from `migrations/add_version_management.sql`

## Option 3: Using Python script
Create and run this script:

```python
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

async def run_migration():
    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not found in environment")
        return
    
    # Create engine
    engine = create_async_engine(database_url)
    
    # Read migration file
    with open("migrations/add_version_management.sql", "r") as f:
        migration_sql = f.read()
    
    # Execute migration
    async with engine.begin() as conn:
        # Split by semicolon and execute each statement
        statements = [s.strip() for s in migration_sql.split(';') if s.strip()]
        for statement in statements:
            try:
                await conn.execute(text(statement))
                print(f"Executed: {statement[:50]}...")
            except Exception as e:
                print(f"Error executing statement: {e}")
    
    await engine.dispose()
    print("Migration completed!")

if __name__ == "__main__":
    asyncio.run(run_migration())
```

Save this as `run_version_migration.py` and run:
```bash
python run_version_migration.py
```

## After running the migration

The migration will:
1. Create the `personal_test_process_flow_versions` table
2. Add indexes for performance
3. Add `current_version` column to the main flows table
4. Migrate existing flows to version 1
5. Create helper functions for version management
6. Create a view for published flows

Once the migration is complete, the version management feature will work properly.