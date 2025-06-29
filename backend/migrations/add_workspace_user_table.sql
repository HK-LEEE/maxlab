-- Add WorkspaceUser table for user-based workspace permissions
CREATE TABLE IF NOT EXISTS workspace_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    user_display_name VARCHAR(255),
    permission_level VARCHAR(50) DEFAULT 'read' NOT NULL CHECK (permission_level IN ('read', 'write', 'admin')),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX idx_workspace_user_workspace ON workspace_users(workspace_id);
CREATE INDEX idx_workspace_user_user ON workspace_users(user_id);
CREATE INDEX idx_workspace_user_permission ON workspace_users(permission_level);
CREATE UNIQUE INDEX idx_workspace_user_unique ON workspace_users(workspace_id, user_id);

-- Add comment to table
COMMENT ON TABLE workspace_users IS '워크스페이스 사용자 권한 테이블';
COMMENT ON COLUMN workspace_users.workspace_id IS '워크스페이스 ID';
COMMENT ON COLUMN workspace_users.user_id IS '사용자 ID';
COMMENT ON COLUMN workspace_users.user_display_name IS '사용자 표시명';
COMMENT ON COLUMN workspace_users.permission_level IS '권한 레벨 (read/write/admin)';
COMMENT ON COLUMN workspace_users.created_by IS '생성자';
COMMENT ON COLUMN workspace_users.created_at IS '생성일시';