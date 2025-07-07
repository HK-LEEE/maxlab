#!/usr/bin/env python3
"""
Simple version management migration runner
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

async def run_simple_migration(conn):
    """Execute migration step by step"""
    try:
        print("1. Adding current_version column...")
        await conn.execute("""
            ALTER TABLE personal_test_process_flows 
            ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1
        """)
        print("   ✅ Done")
        
        print("2. Creating version table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS personal_test_process_flow_versions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                flow_id UUID NOT NULL REFERENCES personal_test_process_flows(id) ON DELETE CASCADE,
                version_number INTEGER NOT NULL,
                flow_data JSONB NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_by VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                is_published BOOLEAN DEFAULT FALSE,
                published_at TIMESTAMP WITH TIME ZONE,
                publish_token VARCHAR(255) UNIQUE,
                UNIQUE(flow_id, version_number)
            )
        """)
        print("   ✅ Done")
        
        print("3. Creating indexes...")
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_id 
            ON personal_test_process_flow_versions(flow_id)
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_flow_versions_created_at 
            ON personal_test_process_flow_versions(created_at)
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_flow_versions_published 
            ON personal_test_process_flow_versions(is_published) 
            WHERE is_published = true
        """)
        print("   ✅ Done")
        
        print("4. Creating version number function...")
        # First drop if exists
        await conn.execute("DROP FUNCTION IF EXISTS get_next_version_number(UUID)")
        
        # Then create
        await conn.execute("""
            CREATE FUNCTION get_next_version_number(p_flow_id UUID) 
            RETURNS INTEGER AS $func$
            BEGIN
                RETURN COALESCE(
                    (SELECT MAX(version_number) + 1 
                     FROM personal_test_process_flow_versions 
                     WHERE flow_id = p_flow_id), 
                    1
                );
            END;
            $func$ LANGUAGE plpgsql
        """)
        print("   ✅ Done")
        
        print("5. Creating published flows view...")
        await conn.execute("DROP VIEW IF EXISTS published_process_flows")
        await conn.execute("""
            CREATE VIEW published_process_flows AS
            SELECT 
                f.id,
                f.name,
                f.workspace_id,
                f.is_published,
                f.published_at,
                f.publish_token,
                COALESCE(v.flow_data, f.flow_data) as flow_data,
                v.version_number as published_version,
                v.name as version_name
            FROM personal_test_process_flows f
            LEFT JOIN personal_test_process_flow_versions v 
                ON f.id = v.flow_id AND v.is_published = true
            WHERE f.is_published = true
        """)
        print("   ✅ Done")
        
        print("\n✅ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        return False

async def main():
    print("🚀 Process Flow Version Management Migration Tool")
    print("=" * 50)
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        print("🔍 Connected to database")
        print(f"   Host: {db_params['host']}")
        print(f"   Database: {db_params['database']}")
        print()
        
        success = await run_simple_migration(conn)
        
        if success:
            # Verify
            version_table_exists = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'personal_test_process_flow_versions'
                );
            """)
            
            current_version_exists = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'personal_test_process_flows' 
                    AND column_name = 'current_version'
                );
            """)
            
            print("\n📊 Verification:")
            print(f"   Version table: {'✅' if version_table_exists else '❌'}")
            print(f"   Current version column: {'✅' if current_version_exists else '❌'}")
        
        await conn.close()
            
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())