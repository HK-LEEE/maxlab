#!/usr/bin/env python3
"""
Add default PostgreSQL data source configuration
"""
import asyncio
import asyncpg
import os
import uuid
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
    print("🔧 Adding default PostgreSQL data source configuration")
    print("=" * 50)
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        # Check if default config already exists
        exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM data_source_configs 
                WHERE workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
                AND source_type = 'postgresql'
            )
        """)
        
        if exists:
            print("✅ Default PostgreSQL configuration already exists")
        else:
            # Insert default PostgreSQL configuration
            await conn.execute("""
                INSERT INTO data_source_configs (
                    id, workspace_id, config_name, source_type,
                    is_active, created_by, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """, 
                str(uuid.uuid4()),
                '21ee03db-90c4-4592-b00f-c44801e0b164',
                'Default PostgreSQL',
                'POSTGRESQL',
                True,
                'system'
            )
            print("✅ Default PostgreSQL configuration added")
        
        await conn.close()
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())