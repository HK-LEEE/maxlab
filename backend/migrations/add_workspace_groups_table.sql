-- Add WorkspaceGroup table for group-based workspace permissions
CREATE TABLE IF NOT EXISTS workspace_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    group_name VARCHAR(255) NOT NULL,
    group_display_name VARCHAR(255),
    permission_level VARCHAR(50) DEFAULT 'read' NOT NULL CHECK (permission_level IN ('read', 'write', 'admin')),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX idx_workspace_group_workspace ON workspace_groups(workspace_id);
CREATE INDEX idx_workspace_group_name ON workspace_groups(group_name);
CREATE INDEX idx_workspace_group_permission ON workspace_groups(permission_level);
CREATE UNIQUE INDEX idx_workspace_group_unique ON workspace_groups(workspace_id, group_name);

-- Add comments to table
COMMENT ON TABLE workspace_groups IS '워크스페이스 그룹 권한 테이블';
COMMENT ON COLUMN workspace_groups.workspace_id IS '워크스페이스 ID';
COMMENT ON COLUMN workspace_groups.group_name IS '그룹명';
COMMENT ON COLUMN workspace_groups.group_display_name IS '그룹 표시명';
COMMENT ON COLUMN workspace_groups.permission_level IS '권한 레벨 (read/write/admin)';
COMMENT ON COLUMN workspace_groups.created_by IS '생성자';
COMMENT ON COLUMN workspace_groups.created_at IS '생성일시';