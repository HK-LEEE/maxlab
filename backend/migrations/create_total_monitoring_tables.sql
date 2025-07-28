-- Total Monitoring System Database Schema
-- All tables include groupid UUID for multi-tenant isolation
-- Admins can access all data, users only access their group data

-- Database Connections with Encryption
CREATE TABLE IF NOT EXISTS public.total_monitoring_database_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    connection_name VARCHAR(255) NOT NULL,
    database_type VARCHAR(50) NOT NULL CHECK (database_type IN ('POSTGRESQL', 'MSSQL', 'MYSQL', 'ORACLE')),
    connection_string_encrypted TEXT NOT NULL, -- Encrypted connection string
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, groupid, connection_name)
);

CREATE INDEX idx_total_monitoring_db_conn_workspace ON total_monitoring_database_connections(workspace_id);
CREATE INDEX idx_total_monitoring_db_conn_group ON total_monitoring_database_connections(groupid);
CREATE INDEX idx_total_monitoring_db_conn_active ON total_monitoring_database_connections(is_active);

-- Process Flow Templates with Group Isolation  
CREATE TABLE IF NOT EXISTS public.total_monitoring_process_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    flow_name VARCHAR(255) NOT NULL,
    flow_data JSONB NOT NULL,
    database_connection_id UUID REFERENCES total_monitoring_database_connections(id),
    auto_save_data JSONB, -- For backup/recovery
    backup_timestamp TIMESTAMP WITH TIME ZONE,
    version_number INTEGER DEFAULT 1,
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    publish_token VARCHAR(255),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, groupid, flow_name)
);

CREATE INDEX idx_total_monitoring_flows_workspace ON total_monitoring_process_flows(workspace_id);
CREATE INDEX idx_total_monitoring_flows_group ON total_monitoring_process_flows(groupid);
CREATE INDEX idx_total_monitoring_flows_published ON total_monitoring_process_flows(is_published);
CREATE INDEX idx_total_monitoring_flows_token ON total_monitoring_process_flows(publish_token);

-- Equipment Node Configurations with Group Isolation
CREATE TABLE IF NOT EXISTS public.total_monitoring_equipment_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    flow_id UUID NOT NULL REFERENCES total_monitoring_process_flows(id) ON DELETE CASCADE,
    node_id VARCHAR(255) NOT NULL, -- ReactFlow node ID
    equipment_code VARCHAR(100) NOT NULL,
    equipment_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    equipment_status VARCHAR(50) DEFAULT 'STOP' CHECK (equipment_status IN ('ACTIVE', 'PAUSE', 'STOP')),
    node_position_x FLOAT DEFAULT 0,
    node_position_y FLOAT DEFAULT 0,
    node_width FLOAT DEFAULT 200,
    node_height FLOAT DEFAULT 220,
    measurement_mappings JSONB DEFAULT '[]', -- Array of mapped measurement codes
    data_query TEXT, -- SQL query for data mapping
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, groupid, flow_id, node_id)
);

CREATE INDEX idx_total_monitoring_equipment_workspace ON total_monitoring_equipment_nodes(workspace_id);
CREATE INDEX idx_total_monitoring_equipment_group ON total_monitoring_equipment_nodes(groupid);
CREATE INDEX idx_total_monitoring_equipment_flow ON total_monitoring_equipment_nodes(flow_id);

-- Instrument Node Configurations with Group Isolation
CREATE TABLE IF NOT EXISTS public.total_monitoring_instrument_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    flow_id UUID NOT NULL REFERENCES total_monitoring_process_flows(id) ON DELETE CASCADE,
    node_id VARCHAR(255) NOT NULL, -- ReactFlow node ID
    instrument_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    node_position_x FLOAT DEFAULT 0,
    node_position_y FLOAT DEFAULT 0,
    node_width FLOAT DEFAULT 200,
    node_height FLOAT DEFAULT 220,
    measurement_mappings JSONB DEFAULT '[]', -- Array of measurement configurations
    data_query TEXT, -- SQL query for data mapping
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, groupid, flow_id, node_id)
);

CREATE INDEX idx_total_monitoring_instrument_workspace ON total_monitoring_instrument_nodes(workspace_id);
CREATE INDEX idx_total_monitoring_instrument_group ON total_monitoring_instrument_nodes(groupid);
CREATE INDEX idx_total_monitoring_instrument_flow ON total_monitoring_instrument_nodes(flow_id);

-- Flow Publishing Tokens with Group Isolation
CREATE TABLE IF NOT EXISTS public.total_monitoring_published_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    flow_id UUID NOT NULL REFERENCES total_monitoring_process_flows(id) ON DELETE CASCADE,
    publish_token VARCHAR(255) UNIQUE NOT NULL,
    published_name VARCHAR(255) NOT NULL,
    published_data JSONB NOT NULL, -- Snapshot of flow data at publish time
    is_active BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
    UNIQUE(workspace_id, groupid, published_name)
);

CREATE INDEX idx_total_monitoring_published_workspace ON total_monitoring_published_flows(workspace_id);
CREATE INDEX idx_total_monitoring_published_group ON total_monitoring_published_flows(groupid);
CREATE INDEX idx_total_monitoring_published_token ON total_monitoring_published_flows(publish_token);
CREATE INDEX idx_total_monitoring_published_active ON total_monitoring_published_flows(is_active);

-- Data Query Templates with Group Isolation
CREATE TABLE IF NOT EXISTS public.total_monitoring_query_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    template_name VARCHAR(255) NOT NULL,
    template_description TEXT,
    query_template TEXT NOT NULL,
    parameter_schema JSONB DEFAULT '{}', -- JSON schema for query parameters
    result_schema JSONB DEFAULT '{}', -- Expected result structure
    is_system_template BOOLEAN DEFAULT false, -- System vs user templates
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, groupid, template_name)
);

CREATE INDEX idx_total_monitoring_query_templates_workspace ON total_monitoring_query_templates(workspace_id);
CREATE INDEX idx_total_monitoring_query_templates_group ON total_monitoring_query_templates(groupid);
CREATE INDEX idx_total_monitoring_query_templates_system ON total_monitoring_query_templates(is_system_template);

-- Workspace Features Dynamic Loading
CREATE TABLE IF NOT EXISTS public.total_monitoring_workspace_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL, -- 'Database Setup', 'Process Flow Editor', etc.
    feature_slug VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    color VARCHAR(20),
    route_path VARCHAR(255) NOT NULL,
    component_path VARCHAR(500), -- Path to React component
    is_implemented BOOLEAN DEFAULT false, -- Whether component exists
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    permissions JSONB DEFAULT '{"read": [], "write": [], "admin": []}',
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, feature_slug)
);

CREATE INDEX idx_total_monitoring_features_workspace ON total_monitoring_workspace_features(workspace_id);
CREATE INDEX idx_total_monitoring_features_active ON total_monitoring_workspace_features(is_active);
CREATE INDEX idx_total_monitoring_features_implemented ON total_monitoring_workspace_features(is_implemented);

-- Comments for documentation
COMMENT ON TABLE total_monitoring_database_connections IS 'Database connections with encrypted strings and group isolation';
COMMENT ON TABLE total_monitoring_process_flows IS 'Process flow definitions with auto-save and group isolation';
COMMENT ON TABLE total_monitoring_equipment_nodes IS 'Equipment node configurations with status and measurements';
COMMENT ON TABLE total_monitoring_instrument_nodes IS 'Instrument node configurations for measurement display only';
COMMENT ON TABLE total_monitoring_published_flows IS 'Published flows for public access without authentication';
COMMENT ON TABLE total_monitoring_query_templates IS 'Reusable query templates for data mapping';
COMMENT ON TABLE total_monitoring_workspace_features IS 'Dynamic feature loading configuration';

COMMENT ON COLUMN total_monitoring_database_connections.groupid IS 'UUID for group-based data isolation - admins see all, users see only their group';
COMMENT ON COLUMN total_monitoring_database_connections.connection_string_encrypted IS 'AES encrypted connection string for security';
COMMENT ON COLUMN total_monitoring_process_flows.auto_save_data IS 'Automatic backup data for recovery on force exit';
COMMENT ON COLUMN total_monitoring_workspace_features.is_implemented IS 'False shows "Under Development" message';