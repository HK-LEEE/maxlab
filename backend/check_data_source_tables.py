#!/usr/bin/env python3
"""
Check data source configuration tables
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
    print("🔍 Checking data source configuration tables")
    print("=" * 50)
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        # Check data_source_configs table
        table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'data_source_configs'
            )
        """)
        
        print(f"data_source_configs table exists: {'✅' if table_exists else '❌'}")
        
        if table_exists:
            # Get table columns
            columns = await conn.fetch("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'data_source_configs'
                ORDER BY ordinal_position
            """)
            
            print("\nTable columns:")
            for col in columns:
                print(f"  - {col['column_name']} ({col['data_type']}) {'NULL' if col['is_nullable'] == 'YES' else 'NOT NULL'}")
            
            # Get row count
            count = await conn.fetchval("SELECT COUNT(*) FROM data_source_configs")
            print(f"\nRow count: {count}")
        
        # Check api_endpoint_mappings table
        api_table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'api_endpoint_mappings'
            )
        """)
        
        print(f"\napi_endpoint_mappings table exists: {'✅' if api_table_exists else '❌'}")
        
        await conn.close()
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())