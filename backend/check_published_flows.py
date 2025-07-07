#!/usr/bin/env python3
"""
Check published flows
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

async def check_published_flows(conn):
    """Check published flows in both tables"""
    try:
        print("1. Checking main table (personal_test_process_flows):")
        main_result = await conn.fetch("""
            SELECT id, name, is_published, publish_token, published_at
            FROM personal_test_process_flows
            WHERE is_published = true
        """)
        
        if main_result:
            for row in main_result:
                print(f"   - {row['name']} (ID: {str(row['id'])[:8]}...)")
                print(f"     Token: {row['publish_token']}")
                print(f"     Published at: {row['published_at']}")
        else:
            print("   No published flows in main table")
        
        print("\n2. Checking version table (personal_test_process_flow_versions):")
        version_result = await conn.fetch("""
            SELECT v.id, v.flow_id, v.version_number, v.name, v.is_published, v.publish_token, v.published_at, f.name as flow_name
            FROM personal_test_process_flow_versions v
            JOIN personal_test_process_flows f ON v.flow_id = f.id
            WHERE v.is_published = true
        """)
        
        if version_result:
            for row in version_result:
                print(f"   - {row['flow_name']} - Version {row['version_number']}")
                print(f"     Version ID: {str(row['id'])[:8]}...")
                print(f"     Flow ID: {str(row['flow_id'])[:8]}...")
                print(f"     Token: {row['publish_token']}")
                print(f"     Published at: {row['published_at']}")
        else:
            print("   No published versions in version table")
        
        return True
        
    except Exception as e:
        print(f"❌ Error checking published flows: {e}")
        return False

async def main():
    print("🔍 Checking Published Flows")
    print("=" * 50)
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        await check_published_flows(conn)
        
        await conn.close()
            
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())