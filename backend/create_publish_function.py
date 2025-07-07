#!/usr/bin/env python3
"""
Create publish_flow_version function
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

async def create_publish_function(conn):
    """Create the publish_flow_version function"""
    try:
        # Drop existing function if any
        await conn.execute("DROP FUNCTION IF EXISTS publish_flow_version(UUID, INTEGER, VARCHAR)")
        
        # Create the function
        await conn.execute("""
            CREATE FUNCTION publish_flow_version(p_flow_id UUID, p_version_number INTEGER, p_token VARCHAR)
            RETURNS VOID AS $func$
            BEGIN
                -- Unpublish all versions of this flow
                UPDATE personal_test_process_flow_versions
                SET is_published = FALSE,
                    publish_token = NULL,
                    published_at = NULL
                WHERE flow_id = p_flow_id;
                
                -- Publish the specified version
                UPDATE personal_test_process_flow_versions
                SET is_published = TRUE,
                    publish_token = p_token,
                    published_at = CURRENT_TIMESTAMP
                WHERE flow_id = p_flow_id AND version_number = p_version_number;
                
                -- Update main flow table
                UPDATE personal_test_process_flows
                SET is_published = TRUE,
                    publish_token = p_token,
                    published_at = CURRENT_TIMESTAMP,
                    current_version = p_version_number
                WHERE id = p_flow_id;
            END;
            $func$ LANGUAGE plpgsql
        """)
        
        print("✅ publish_flow_version function created successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to create function: {e}")
        return False

async def main():
    print("🚀 Creating publish_flow_version function")
    print("=" * 50)
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        print("🔍 Connected to database")
        print(f"   Host: {db_params['host']}")
        print(f"   Database: {db_params['database']}")
        print()
        
        success = await create_publish_function(conn)
        
        if success:
            # Test if function exists
            result = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_proc 
                    WHERE proname = 'publish_flow_version'
                )
            """)
            print(f"\n📊 Function exists: {'✅' if result else '❌'}")
        
        await conn.close()
            
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())