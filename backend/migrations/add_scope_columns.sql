-- Add scope-related columns to personal_test_process_flows table for RBAC implementation
-- This enables Workspace-scoped vs User-scoped flow storage

-- Add scope-related columns
ALTER TABLE personal_test_process_flows 
ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) NOT NULL DEFAULT 'USER',
ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN IF NOT EXISTS shared_with_workspace BOOLEAN NOT NULL DEFAULT FALSE;

-- Add scope type constraint
ALTER TABLE personal_test_process_flows 
ADD CONSTRAINT IF NOT EXISTS check_scope_type 
CHECK (scope_type IN ('WORKSPACE', 'USER'));

-- Add visibility scope constraint
ALTER TABLE personal_test_process_flows 
ADD CONSTRAINT IF NOT EXISTS check_visibility_scope 
CHECK (visibility_scope IN ('WORKSPACE', 'PRIVATE'));

-- Create performance optimization indexes
CREATE INDEX IF NOT EXISTS idx_flows_scope_workspace 
ON personal_test_process_flows(workspace_id, scope_type);

CREATE INDEX IF NOT EXISTS idx_flows_scope_user 
ON personal_test_process_flows(created_by, scope_type);

CREATE INDEX IF NOT EXISTS idx_flows_shared 
ON personal_test_process_flows(workspace_id, shared_with_workspace) 
WHERE shared_with_workspace = TRUE;

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_flows_scope_access 
ON personal_test_process_flows(workspace_id, scope_type, created_by, shared_with_workspace);

-- Migrate existing data: Set all existing flows to USER/PRIVATE scope
UPDATE personal_test_process_flows 
SET 
    scope_type = 'USER',
    visibility_scope = 'PRIVATE',
    shared_with_workspace = FALSE
WHERE scope_type IS NULL OR scope_type = '';

-- Add the same columns to versions table for consistency
ALTER TABLE personal_test_process_flow_versions 
ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) NOT NULL DEFAULT 'USER',
ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN IF NOT EXISTS shared_with_workspace BOOLEAN NOT NULL DEFAULT FALSE;

-- Add constraints to versions table
ALTER TABLE personal_test_process_flow_versions 
ADD CONSTRAINT IF NOT EXISTS check_version_scope_type 
CHECK (scope_type IN ('WORKSPACE', 'USER'));

ALTER TABLE personal_test_process_flow_versions 
ADD CONSTRAINT IF NOT EXISTS check_version_visibility_scope 
CHECK (visibility_scope IN ('WORKSPACE', 'PRIVATE'));

-- Create index on versions table
CREATE INDEX IF NOT EXISTS idx_flow_versions_scope 
ON personal_test_process_flow_versions(flow_id, scope_type);

-- Update existing version data
UPDATE personal_test_process_flow_versions 
SET 
    scope_type = 'USER',
    visibility_scope = 'PRIVATE',
    shared_with_workspace = FALSE
WHERE scope_type IS NULL OR scope_type = '';

-- Create function to ensure scope consistency between main and version tables
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
$$ LANGUAGE plpgsql;

-- Create trigger to automatically sync scope changes
DROP TRIGGER IF EXISTS trigger_sync_flow_scope ON personal_test_process_flows;
CREATE TRIGGER trigger_sync_flow_scope
    AFTER UPDATE ON personal_test_process_flows
    FOR EACH ROW
    EXECUTE FUNCTION sync_flow_scope();