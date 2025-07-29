#!/usr/bin/env python3
"""
Process Flow Scope Columns Migration Runner
RBAC 기능을 위한 scope_type, visibility_scope, shared_with_workspace 컬럼 추가
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

async def check_existing_columns(conn):
    """Check if scope columns already exist"""
    print("🔍 Checking existing columns...")
    
    scope_columns = ['scope_type', 'visibility_scope', 'shared_with_workspace']
    existing_columns = []
    
    for col in scope_columns:
        exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'personal_test_process_flows' 
                AND column_name = $1
            );
        """, col)
        if exists:
            existing_columns.append(col)
        print(f"   {col}: {'✅ EXISTS' if exists else '❌ MISSING'}")
    
    return existing_columns

async def run_scope_migration(conn):
    """Execute scope columns migration step by step"""
    try:
        # Check existing columns first
        existing_columns = await check_existing_columns(conn)
        
        if len(existing_columns) == 3:
            print("\n✅ All scope columns already exist! No migration needed.")
            return True
        
        print("\n🚀 Starting scope columns migration...")
        
        # 1. Add scope_type column
        if 'scope_type' not in existing_columns:
            print("1. Adding scope_type column...")
            await conn.execute("""
                ALTER TABLE personal_test_process_flows 
                ADD COLUMN scope_type VARCHAR(20) NOT NULL DEFAULT 'USER'
            """)
            print("   ✅ Done")
        else:
            print("1. scope_type column already exists, skipping...")
        
        # 2. Add visibility_scope column
        if 'visibility_scope' not in existing_columns:
            print("2. Adding visibility_scope column...")
            await conn.execute("""
                ALTER TABLE personal_test_process_flows 
                ADD COLUMN visibility_scope VARCHAR(50) NOT NULL DEFAULT 'PRIVATE'
            """)
            print("   ✅ Done")
        else:
            print("2. visibility_scope column already exists, skipping...")
        
        # 3. Add shared_with_workspace column
        if 'shared_with_workspace' not in existing_columns:
            print("3. Adding shared_with_workspace column...")
            await conn.execute("""
                ALTER TABLE personal_test_process_flows 
                ADD COLUMN shared_with_workspace BOOLEAN NOT NULL DEFAULT FALSE
            """)
            print("   ✅ Done")
        else:
            print("3. shared_with_workspace column already exists, skipping...")
        
        # 4. Add constraints
        print("4. Adding constraints...")
        try:
            await conn.execute("""
                ALTER TABLE personal_test_process_flows 
                ADD CONSTRAINT check_scope_type 
                CHECK (scope_type IN ('WORKSPACE', 'USER'))
            """)
        except Exception as e:
            if "already exists" in str(e):
                print("   check_scope_type constraint already exists, skipping...")
            else:
                raise e
        
        try:
            await conn.execute("""
                ALTER TABLE personal_test_process_flows 
                ADD CONSTRAINT check_visibility_scope 
                CHECK (visibility_scope IN ('WORKSPACE', 'PRIVATE'))
            """)
        except Exception as e:
            if "already exists" in str(e):
                print("   check_visibility_scope constraint already exists, skipping...")
            else:
                raise e
        
        print("   ✅ Done")
        
        # 5. Create performance indexes
        print("5. Creating performance indexes...")
        
        indexes = [
            ("idx_flows_scope_workspace", "personal_test_process_flows(workspace_id, scope_type)"),
            ("idx_flows_scope_user", "personal_test_process_flows(created_by, scope_type)"),
            ("idx_flows_shared", "personal_test_process_flows(workspace_id, shared_with_workspace) WHERE shared_with_workspace = TRUE"),
            ("idx_flows_scope_access", "personal_test_process_flows(workspace_id, scope_type, created_by, shared_with_workspace)")
        ]
        
        for index_name, index_def in indexes:
            try:
                await conn.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {index_def}")
            except Exception as e:
                print(f"   Warning: Failed to create index {index_name}: {e}")
        
        print("   ✅ Done")
        
        # 6. Update existing data
        print("6. Migrating existing data to USER/PRIVATE scope...")
        result = await conn.execute("""
            UPDATE personal_test_process_flows 
            SET 
                scope_type = 'USER',
                visibility_scope = 'PRIVATE',
                shared_with_workspace = FALSE
            WHERE scope_type IS NULL OR scope_type = ''
        """)
        print(f"   ✅ Updated {result.split()[-1] if result else '0'} rows")
        
        # 7. Add scope columns to versions table if it exists
        print("7. Checking versions table...")
        versions_table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'personal_test_process_flow_versions'
            );
        """)
        
        if versions_table_exists:
            print("   Adding scope columns to versions table...")
            try:
                await conn.execute("""
                    ALTER TABLE personal_test_process_flow_versions 
                    ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) NOT NULL DEFAULT 'USER',
                    ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
                    ADD COLUMN IF NOT EXISTS shared_with_workspace BOOLEAN NOT NULL DEFAULT FALSE
                """)
                
                # Add constraints to versions table
                try:
                    await conn.execute("""
                        ALTER TABLE personal_test_process_flow_versions 
                        ADD CONSTRAINT check_version_scope_type 
                        CHECK (scope_type IN ('WORKSPACE', 'USER'))
                    """)
                except:
                    pass  # Constraint might already exist
                
                try:
                    await conn.execute("""
                        ALTER TABLE personal_test_process_flow_versions 
                        ADD CONSTRAINT check_version_visibility_scope 
                        CHECK (visibility_scope IN ('WORKSPACE', 'PRIVATE'))
                    """)
                except:
                    pass  # Constraint might already exist
                
                # Update existing version data
                await conn.execute("""
                    UPDATE personal_test_process_flow_versions 
                    SET 
                        scope_type = 'USER',
                        visibility_scope = 'PRIVATE',
                        shared_with_workspace = FALSE
                    WHERE scope_type IS NULL OR scope_type = ''
                """)
                
                print("   ✅ Done")
            except Exception as e:
                print(f"   Warning: Versions table update failed: {e}")
        else:
            print("   Versions table doesn't exist, skipping...")
        
        # 8. Create sync function for scope consistency
        print("8. Creating scope sync function...")
        await conn.execute("DROP FUNCTION IF EXISTS sync_flow_scope()")
        await conn.execute("""
            CREATE OR REPLACE FUNCTION sync_flow_scope()
            RETURNS TRIGGER AS $$
            BEGIN
                -- When main flow scope changes, update all versions to match
                IF TG_OP = 'UPDATE' AND (
                    OLD.scope_type != NEW.scope_type OR 
                    OLD.visibility_scope != NEW.visibility_scope OR 
                    OLD.shared_with_workspace != NEW.shared_with_workspace
                ) THEN
                    UPDATE personal_test_process_flow_versions 
                    SET 
                        scope_type = NEW.scope_type,
                        visibility_scope = NEW.visibility_scope,
                        shared_with_workspace = NEW.shared_with_workspace
                    WHERE flow_id = NEW.id;
                END IF;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        """)
        
        # Create trigger
        await conn.execute("DROP TRIGGER IF EXISTS trigger_sync_flow_scope ON personal_test_process_flows")
        if versions_table_exists:
            await conn.execute("""
                CREATE TRIGGER trigger_sync_flow_scope
                    AFTER UPDATE ON personal_test_process_flows
                    FOR EACH ROW
                    EXECUTE FUNCTION sync_flow_scope()
            """)
        
        print("   ✅ Done")
        
        print("\n✅ Scope columns migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    print("🚀 Process Flow Scope Columns Migration Tool")
    print("=" * 50)
    print("This will add RBAC scope columns to process flows tables")
    print()
    
    try:
        db_params = get_database_url()
        
        # Connect to database
        conn = await asyncpg.connect(**db_params)
        
        print("🔍 Connected to database")
        print(f"   Host: {db_params['host']}")
        print(f"   Database: {db_params['database']}")
        print()
        
        success = await run_scope_migration(conn)
        
        if success:
            # Verify the migration
            print("\n📊 Verification:")
            scope_columns = ['scope_type', 'visibility_scope', 'shared_with_workspace']
            
            for col in scope_columns:
                exists = await conn.fetchval("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_name = 'personal_test_process_flows' 
                        AND column_name = $1
                    );
                """, col)
                print(f"   {col}: {'✅' if exists else '❌'}")
            
            # Check data
            count = await conn.fetchval("""
                SELECT COUNT(*) FROM personal_test_process_flows 
                WHERE scope_type = 'USER' AND visibility_scope = 'PRIVATE'
            """)
            print(f"   Migrated rows: {count}")
        
        await conn.close()
            
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())