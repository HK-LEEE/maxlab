-- Backup script for workspace tables before UUID migration
-- Execute this script before running any migration to ensure data safety
-- Date: Generated at migration time

-- Create backup schema if not exists
CREATE SCHEMA IF NOT EXISTS workspace_backup;

-- Backup workspace_users table
CREATE TABLE workspace_backup.workspace_users_backup AS 
SELECT * FROM public.workspace_users;

-- Backup workspace_groups table
CREATE TABLE workspace_backup.workspace_groups_backup AS 
SELECT * FROM public.workspace_groups;

-- Create backup metadata table
CREATE TABLE IF NOT EXISTS workspace_backup.migration_metadata (
    id SERIAL PRIMARY KEY,
    backup_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    table_name VARCHAR(255) NOT NULL,
    record_count INTEGER NOT NULL,
    migration_version VARCHAR(50),
    notes TEXT
);

-- Record backup metadata
INSERT INTO workspace_backup.migration_metadata (table_name, record_count, migration_version, notes)
SELECT 'workspace_users', COUNT(*), 'pre-uuid-migration', 'Backup before UUID migration'
FROM public.workspace_users;

INSERT INTO workspace_backup.migration_metadata (table_name, record_count, migration_version, notes)
SELECT 'workspace_groups', COUNT(*), 'pre-uuid-migration', 'Backup before UUID migration'
FROM public.workspace_groups;

-- Verify backup
DO $$
DECLARE
    users_original INTEGER;
    users_backup INTEGER;
    groups_original INTEGER;
    groups_backup INTEGER;
BEGIN
    SELECT COUNT(*) INTO users_original FROM public.workspace_users;
    SELECT COUNT(*) INTO users_backup FROM workspace_backup.workspace_users_backup;
    
    SELECT COUNT(*) INTO groups_original FROM public.workspace_groups;
    SELECT COUNT(*) INTO groups_backup FROM workspace_backup.workspace_groups_backup;
    
    IF users_original != users_backup THEN
        RAISE EXCEPTION 'Backup verification failed for workspace_users: original=%, backup=%', 
                        users_original, users_backup;
    END IF;
    
    IF groups_original != groups_backup THEN
        RAISE EXCEPTION 'Backup verification failed for workspace_groups: original=%, backup=%', 
                        groups_original, groups_backup;
    END IF;
    
    RAISE NOTICE 'Backup completed successfully. Users: %, Groups: %', users_backup, groups_backup;
END $$;