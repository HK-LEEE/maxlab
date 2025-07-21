-- Rollback script for workspace UUID migration
-- This script reverts the changes made by the UUID migration
-- IMPORTANT: Only run this if the migration needs to be rolled back

BEGIN;

-- 1. Verify backup tables exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'workspace_backup' 
        AND table_name IN ('workspace_users_backup', 'workspace_groups_backup')
    ) THEN
        RAISE EXCEPTION 'Backup tables not found. Cannot rollback without backup data.';
    END IF;
END $$;

-- 2. Create temporary tables with current state for comparison
CREATE TEMP TABLE temp_current_users AS SELECT * FROM workspace_users;
CREATE TEMP TABLE temp_current_groups AS SELECT * FROM workspace_groups;

-- 3. Log rollback attempt
INSERT INTO workspace_backup.migration_metadata (table_name, record_count, migration_version, notes)
VALUES 
    ('rollback_attempt', 0, 'uuid-rollback', 'Starting rollback at ' || NOW()),
    ('workspace_users_current', (SELECT COUNT(*) FROM workspace_users), 'uuid-rollback', 'Current user count before rollback'),
    ('workspace_groups_current', (SELECT COUNT(*) FROM workspace_groups), 'uuid-rollback', 'Current group count before rollback');

-- 4. Restore workspace_users table
-- Drop new columns and constraints
ALTER TABLE workspace_users 
    DROP COLUMN IF EXISTS user_id_uuid,
    DROP COLUMN IF EXISTS user_email,
    DROP COLUMN IF EXISTS user_info_updated_at;

-- Restore data from backup
TRUNCATE TABLE workspace_users;
INSERT INTO workspace_users 
SELECT 
    id,
    workspace_id,
    user_id,
    user_display_name,
    permission_level,
    created_by,
    created_at,
    updated_at
FROM workspace_backup.workspace_users_backup;

-- 5. Restore workspace_groups table
-- Drop new columns
ALTER TABLE workspace_groups 
    DROP COLUMN IF EXISTS group_id_uuid,
    DROP COLUMN IF EXISTS group_info_updated_at;

-- Restore data from backup
TRUNCATE TABLE workspace_groups;
INSERT INTO workspace_groups 
SELECT 
    id,
    workspace_id,
    group_name,
    group_display_name,
    permission_level,
    created_by,
    created_at,
    updated_at
FROM workspace_backup.workspace_groups_backup;

-- 6. Restore original indexes
-- Drop UUID-based indexes
DROP INDEX IF EXISTS idx_workspace_user_user_uuid;
DROP INDEX IF EXISTS idx_workspace_user_unique_uuid;
DROP INDEX IF EXISTS idx_workspace_user_updated;
DROP INDEX IF EXISTS idx_workspace_group_uuid;
DROP INDEX IF EXISTS idx_workspace_group_unique_uuid;
DROP INDEX IF EXISTS idx_workspace_group_updated;

-- Recreate original indexes
CREATE INDEX IF NOT EXISTS idx_workspace_user_user_legacy ON workspace_users(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_user_unique_legacy ON workspace_users(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_group_name_legacy ON workspace_groups(group_name);
CREATE INDEX IF NOT EXISTS idx_workspace_group_unique_legacy ON workspace_groups(workspace_id, group_name);

-- 7. Verify rollback
DO $$
DECLARE
    users_backup INTEGER;
    users_restored INTEGER;
    groups_backup INTEGER;
    groups_restored INTEGER;
BEGIN
    SELECT COUNT(*) INTO users_backup FROM workspace_backup.workspace_users_backup;
    SELECT COUNT(*) INTO users_restored FROM workspace_users;
    
    SELECT COUNT(*) INTO groups_backup FROM workspace_backup.workspace_groups_backup;
    SELECT COUNT(*) INTO groups_restored FROM workspace_groups;
    
    IF users_backup != users_restored THEN
        RAISE EXCEPTION 'User count mismatch after rollback: backup=%, restored=%', 
                        users_backup, users_restored;
    END IF;
    
    IF groups_backup != groups_restored THEN
        RAISE EXCEPTION 'Group count mismatch after rollback: backup=%, restored=%', 
                        groups_backup, groups_restored;
    END IF;
    
    -- Log successful rollback
    INSERT INTO workspace_backup.migration_metadata (table_name, record_count, migration_version, notes)
    VALUES ('rollback_complete', 0, 'uuid-rollback', 
            'Rollback completed successfully. Users: ' || users_restored || ', Groups: ' || groups_restored);
    
    RAISE NOTICE 'Rollback completed successfully. Users: %, Groups: %', 
                 users_restored, groups_restored;
END $$;

-- 8. Keep backup tables for safety (do not drop automatically)
-- The backup tables should be manually dropped after verifying the rollback

COMMIT;

-- Post-rollback instructions:
-- 1. Update application code to use string-based identifiers
-- 2. Clear any caches that might contain UUID mappings
-- 3. Verify application functionality
-- 4. Once confirmed, manually drop backup tables:
--    DROP TABLE workspace_backup.workspace_users_backup;
--    DROP TABLE workspace_backup.workspace_groups_backup;