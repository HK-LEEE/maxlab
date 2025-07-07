#!/usr/bin/env python3
"""
Check source_type constraint
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

async def main():
    print("🔍 Checking source_type constraint")
    print("=" * 50)
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        # Get check constraint definition
        constraint_info = await conn.fetchrow("""
            SELECT 
                conname as constraint_name,
                pg_get_constraintdef(oid) as constraint_definition
            FROM pg_constraint
            WHERE conrelid = 'data_source_configs'::regclass
            AND contype = 'c'
            AND conname LIKE '%source_type%'
        """)
        
        if constraint_info:
            print(f"Constraint name: {constraint_info['constraint_name']}")
            print(f"Constraint definition: {constraint_info['constraint_definition']}")
        
        # Also check existing values
        existing = await conn.fetch("""
            SELECT DISTINCT source_type 
            FROM data_source_configs
            ORDER BY source_type
        """)
        
        if existing:
            print("\nExisting source_type values:")
            for row in existing:
                print(f"  - {row['source_type']}")
        
        await conn.close()
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())