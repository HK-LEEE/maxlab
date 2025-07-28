-- =====================================================================================
-- TOTAL MONITORING SYSTEM - COMPREHENSIVE DATABASE SCHEMA
-- =====================================================================================
-- Multi-tenant architecture with UUID-based group isolation
-- Enhanced security, performance, and scalability
-- Compatible migration from personal_test tables
-- =====================================================================================

-- Enable UUID extension for PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================================
-- CORE ENUMS AND TYPES
-- =====================================================================================

-- Database connection types
CREATE TYPE database_type_enum AS ENUM (
    'POSTGRESQL', 'MSSQL', 'MYSQL', 'ORACLE', 'SQLITE', 'MONGODB', 'API_ENDPOINT'
);

-- Equipment status types  
CREATE TYPE equipment_status_enum AS ENUM (
    'ACTIVE', 'PAUSE', 'STOP', 'MAINTENANCE', 'ERROR', 'UNKNOWN'
);

-- Node types for process flows
CREATE TYPE node_type_enum AS ENUM (
    'EQUIPMENT', 'INSTRUMENT', 'CONNECTOR', 'DATA_SOURCE', 'VIRTUAL'
);

-- Permission levels for access control
CREATE TYPE permission_level_enum AS ENUM (
    'read', 'write', 'admin', 'super_admin'
);

-- Audit action types
CREATE TYPE audit_action_enum AS ENUM (
    'CREATE', 'READ', 'UPDATE', 'DELETE', 'PUBLISH', 'UNPUBLISH', 'EXPORT', 'IMPORT'
);

-- Data quality levels
CREATE TYPE data_quality_enum AS ENUM (
    'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN'
);

-- =====================================================================================
-- SECURITY AND AUDIT INFRASTRUCTURE
-- =====================================================================================

-- Audit log table for all Total Monitoring operations
CREATE TABLE IF NOT EXISTS public.total_monitoring_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action audit_action_enum NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID NOT NULL,
    user_email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_audit_workspace (workspace_id),
    INDEX idx_audit_group (groupid),
    INDEX idx_audit_table_record (table_name, record_id),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_timestamp (created_at)
);

-- Partition audit log by month for performance
SELECT partman.create_parent(
    p_parent_table => 'public.total_monitoring_audit_log',
    p_control => 'created_at',
    p_type => 'monthly',
    p_interval => interval '1 month'
);

-- Encryption key management table
CREATE TABLE IF NOT EXISTS public.total_monitoring_encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL,
    key_name VARCHAR(100) NOT NULL,
    encrypted_key TEXT NOT NULL, -- AES-256 encrypted
    key_salt VARCHAR(100) NOT NULL,
    key_version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(workspace_id, groupid, key_name, key_version),
    INDEX idx_encryption_keys_workspace_group (workspace_id, groupid),
    INDEX idx_encryption_keys_active (is_active)
);

-- =====================================================================================
-- ENHANCED DATABASE CONNECTIONS 
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_database_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    
    -- Connection Details
    connection_name VARCHAR(255) NOT NULL,
    connection_display_name VARCHAR(255),
    description TEXT,
    database_type database_type_enum NOT NULL,
    
    -- Security (all connection strings encrypted)
    connection_string_encrypted TEXT NOT NULL,
    encryption_key_id UUID REFERENCES total_monitoring_encryption_keys(id),
    
    -- Connection Pool Settings
    max_connections INTEGER DEFAULT 10,
    connection_timeout INTEGER DEFAULT 30, -- seconds
    idle_timeout INTEGER DEFAULT 300, -- seconds
    
    -- Health Check
    is_active BOOLEAN DEFAULT true,
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_check_interval INTEGER DEFAULT 300, -- seconds
    health_status VARCHAR(50) DEFAULT 'UNKNOWN',
    
    -- Performance Settings
    query_timeout INTEGER DEFAULT 60, -- seconds
    retry_attempts INTEGER DEFAULT 3,
    retry_delay INTEGER DEFAULT 5, -- seconds
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workspace_id, groupid, connection_name),
    CHECK (max_connections > 0),
    CHECK (connection_timeout > 0),
    CHECK (query_timeout > 0)
);

-- Database connection performance indexes
CREATE INDEX idx_tm_db_conn_workspace_group ON total_monitoring_database_connections(workspace_id, groupid);
CREATE INDEX idx_tm_db_conn_active ON total_monitoring_database_connections(is_active);
CREATE INDEX idx_tm_db_conn_health ON total_monitoring_database_connections(health_status, last_health_check);
CREATE INDEX idx_tm_db_conn_type ON total_monitoring_database_connections(database_type);

-- =====================================================================================
-- ENHANCED PROCESS FLOWS WITH VERSIONING
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_process_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    
    -- Flow Identity
    flow_name VARCHAR(255) NOT NULL,
    flow_display_name VARCHAR(255),
    description TEXT,
    category VARCHAR(100),
    
    -- Flow Data
    flow_data JSONB NOT NULL,
    node_count INTEGER DEFAULT 0,
    edge_count INTEGER DEFAULT 0,
    
    -- Database Integration
    primary_database_connection_id UUID REFERENCES total_monitoring_database_connections(id),
    secondary_connections UUID[] DEFAULT '{}', -- Array of connection IDs
    
    -- Auto-save and Backup
    auto_save_enabled BOOLEAN DEFAULT true,
    auto_save_interval INTEGER DEFAULT 300, -- seconds
    auto_save_data JSONB,
    backup_timestamp TIMESTAMP WITH TIME ZONE,
    
    -- Version Management
    current_version INTEGER DEFAULT 1,
    is_template BOOLEAN DEFAULT false,
    template_category VARCHAR(100),
    
    -- Publishing
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    publish_token VARCHAR(255) UNIQUE,
    public_access_level permission_level_enum DEFAULT 'read',
    
    -- Performance Metrics
    execution_count INTEGER DEFAULT 0,
    avg_execution_time INTEGER, -- milliseconds
    last_execution_at TIMESTAMP WITH TIME ZONE,
    
    -- Status and Quality
    status VARCHAR(50) DEFAULT 'DRAFT',
    data_quality data_quality_enum DEFAULT 'UNKNOWN',
    validation_errors JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workspace_id, groupid, flow_name),
    CHECK (node_count >= 0),
    CHECK (edge_count >= 0),
    CHECK (current_version > 0)
);

-- Process flows performance indexes
CREATE INDEX idx_tm_flows_workspace_group ON total_monitoring_process_flows(workspace_id, groupid);
CREATE INDEX idx_tm_flows_published ON total_monitoring_process_flows(is_published);
CREATE INDEX idx_tm_flows_token ON total_monitoring_process_flows(publish_token) WHERE publish_token IS NOT NULL;
CREATE INDEX idx_tm_flows_category ON total_monitoring_process_flows(category);
CREATE INDEX idx_tm_flows_template ON total_monitoring_process_flows(is_template);
CREATE INDEX idx_tm_flows_status ON total_monitoring_process_flows(status);
CREATE INDEX idx_tm_flows_updated ON total_monitoring_process_flows(updated_at DESC);

-- =====================================================================================
-- PROCESS FLOW VERSIONS WITH ENHANCED TRACKING
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_process_flow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL,
    flow_id UUID NOT NULL REFERENCES total_monitoring_process_flows(id) ON DELETE CASCADE,
    
    -- Version Details
    version_number INTEGER NOT NULL,
    version_name VARCHAR(255),
    version_description TEXT,
    changelog TEXT,
    
    -- Version Data
    flow_data JSONB NOT NULL,
    data_hash VARCHAR(64), -- SHA-256 hash for integrity
    
    -- Version Status
    is_published BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    publish_token VARCHAR(255) UNIQUE,
    
    -- Performance Tracking
    execution_count INTEGER DEFAULT 0,
    avg_execution_time INTEGER, -- milliseconds
    error_count INTEGER DEFAULT 0,
    last_error_at TIMESTAMP WITH TIME ZONE,
    
    -- Comparison Metrics
    nodes_added INTEGER DEFAULT 0,
    nodes_removed INTEGER DEFAULT 0,
    nodes_modified INTEGER DEFAULT 0,
    edges_added INTEGER DEFAULT 0,
    edges_removed INTEGER DEFAULT 0,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(flow_id, version_number),
    CHECK (version_number > 0)
);

-- Version management indexes
CREATE INDEX idx_tm_flow_versions_flow ON total_monitoring_process_flow_versions(flow_id);
CREATE INDEX idx_tm_flow_versions_published ON total_monitoring_process_flow_versions(is_published);
CREATE INDEX idx_tm_flow_versions_workspace_group ON total_monitoring_process_flow_versions(workspace_id, groupid);

-- =====================================================================================
-- ENHANCED EQUIPMENT NODES WITH ADVANCED FEATURES
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_equipment_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    flow_id UUID NOT NULL REFERENCES total_monitoring_process_flows(id) ON DELETE CASCADE,
    
    -- Node Identity
    node_id VARCHAR(255) NOT NULL, -- ReactFlow node ID
    equipment_code VARCHAR(100) NOT NULL,
    equipment_name VARCHAR(255) NOT NULL,
    equipment_display_name VARCHAR(255),
    equipment_type VARCHAR(100),
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    
    -- Node Positioning and Display
    node_position_x FLOAT DEFAULT 0,
    node_position_y FLOAT DEFAULT 0,
    node_width FLOAT DEFAULT 200,
    node_height FLOAT DEFAULT 220,
    node_color VARCHAR(7), -- Hex color code
    node_icon VARCHAR(100),
    
    -- Equipment Status and Health
    equipment_status equipment_status_enum DEFAULT 'STOP',
    health_score INTEGER DEFAULT 0, -- 0-100
    last_maintenance TIMESTAMP WITH TIME ZONE,
    next_maintenance TIMESTAMP WITH TIME ZONE,
    maintenance_interval INTEGER, -- days
    
    -- Data Mapping and Queries
    measurement_mappings JSONB DEFAULT '[]'::jsonb,
    data_query TEXT,
    data_refresh_interval INTEGER DEFAULT 60, -- seconds
    last_data_refresh TIMESTAMP WITH TIME ZONE,
    
    -- Performance and Metrics
    total_runtime INTEGER DEFAULT 0, -- hours
    efficiency_rating DECIMAL(5,2), -- percentage
    energy_consumption DECIMAL(10,2),
    production_count INTEGER DEFAULT 0,
    
    -- Alerts and Notifications
    alert_rules JSONB DEFAULT '[]'::jsonb,
    alert_enabled BOOLEAN DEFAULT true,
    last_alert_at TIMESTAMP WITH TIME ZONE,
    alert_count INTEGER DEFAULT 0,
    
    -- Connection Settings
    database_connection_id UUID REFERENCES total_monitoring_database_connections(id),
    connection_settings JSONB DEFAULT '{}'::jsonb,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    specifications JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workspace_id, groupid, flow_id, node_id),
    UNIQUE(workspace_id, groupid, equipment_code),
    CHECK (health_score >= 0 AND health_score <= 100),
    CHECK (efficiency_rating >= 0 AND efficiency_rating <= 100)
);

-- Equipment nodes performance indexes
CREATE INDEX idx_tm_equipment_workspace_group ON total_monitoring_equipment_nodes(workspace_id, groupid);
CREATE INDEX idx_tm_equipment_flow ON total_monitoring_equipment_nodes(flow_id);
CREATE INDEX idx_tm_equipment_status ON total_monitoring_equipment_nodes(equipment_status);
CREATE INDEX idx_tm_equipment_code ON total_monitoring_equipment_nodes(equipment_code);
CREATE INDEX idx_tm_equipment_health ON total_monitoring_equipment_nodes(health_score);
CREATE INDEX idx_tm_equipment_maintenance ON total_monitoring_equipment_nodes(next_maintenance);

-- =====================================================================================
-- ENHANCED INSTRUMENT NODES WITH MEASUREMENT CAPABILITIES
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_instrument_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    flow_id UUID NOT NULL REFERENCES total_monitoring_process_flows(id) ON DELETE CASCADE,
    
    -- Node Identity
    node_id VARCHAR(255) NOT NULL, -- ReactFlow node ID
    instrument_code VARCHAR(100),
    instrument_name VARCHAR(255) NOT NULL,
    instrument_display_name VARCHAR(255),
    instrument_type VARCHAR(100),
    measurement_units VARCHAR(50),
    
    -- Node Positioning and Display
    node_position_x FLOAT DEFAULT 0,
    node_position_y FLOAT DEFAULT 0,
    node_width FLOAT DEFAULT 200,
    node_height FLOAT DEFAULT 220,
    node_color VARCHAR(7), -- Hex color code
    node_icon VARCHAR(100),
    
    -- Measurement Configuration
    measurement_mappings JSONB DEFAULT '[]'::jsonb,
    measurement_range_min DECIMAL(20,6),
    measurement_range_max DECIMAL(20,6),
    decimal_places INTEGER DEFAULT 3,
    
    -- Data Source Configuration
    data_query TEXT,
    data_refresh_interval INTEGER DEFAULT 30, -- seconds
    last_data_refresh TIMESTAMP WITH TIME ZONE,
    cache_enabled BOOLEAN DEFAULT true,
    cache_ttl INTEGER DEFAULT 300, -- seconds
    
    -- Quality Control
    data_quality_rules JSONB DEFAULT '[]'::jsonb,
    validation_enabled BOOLEAN DEFAULT true,
    outlier_detection BOOLEAN DEFAULT false,
    
    -- Alerts and Thresholds
    alert_thresholds JSONB DEFAULT '{}'::jsonb, -- USL, LSL, target, etc.
    alert_enabled BOOLEAN DEFAULT true,
    spec_limits JSONB DEFAULT '{}'::jsonb,
    
    -- Historical Data Settings
    history_retention_days INTEGER DEFAULT 365,
    aggregation_enabled BOOLEAN DEFAULT false,
    aggregation_intervals INTEGER[] DEFAULT '{300,3600,86400}', -- 5min, 1hr, 1day
    
    -- Connection Settings
    database_connection_id UUID REFERENCES total_monitoring_database_connections(id),
    connection_settings JSONB DEFAULT '{}'::jsonb,
    
    -- Performance Metrics
    total_measurements INTEGER DEFAULT 0,
    avg_response_time INTEGER, -- milliseconds
    error_rate DECIMAL(5,2) DEFAULT 0, -- percentage
    last_error_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    calibration_info JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workspace_id, groupid, flow_id, node_id),
    CHECK (measurement_range_min < measurement_range_max),
    CHECK (decimal_places >= 0 AND decimal_places <= 10),
    CHECK (error_rate >= 0 AND error_rate <= 100)
);

-- Instrument nodes performance indexes
CREATE INDEX idx_tm_instrument_workspace_group ON total_monitoring_instrument_nodes(workspace_id, groupid);
CREATE INDEX idx_tm_instrument_flow ON total_monitoring_instrument_nodes(flow_id);
CREATE INDEX idx_tm_instrument_type ON total_monitoring_instrument_nodes(instrument_type);
CREATE INDEX idx_tm_instrument_code ON total_monitoring_instrument_nodes(instrument_code);

-- =====================================================================================
-- REAL-TIME MEASUREMENT DATA WITH PARTITIONING
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_measurement_data (
    id UUID DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    groupid UUID NOT NULL,
    
    -- Data Source
    instrument_node_id UUID REFERENCES total_monitoring_instrument_nodes(id) ON DELETE CASCADE,
    equipment_node_id UUID REFERENCES total_monitoring_equipment_nodes(id) ON DELETE CASCADE,
    
    -- Measurement Details
    measurement_code VARCHAR(100) NOT NULL,
    measurement_name VARCHAR(255),
    measurement_value DECIMAL(20,6) NOT NULL,
    measurement_units VARCHAR(50),
    
    -- Data Quality
    data_quality data_quality_enum DEFAULT 'GOOD',
    quality_score INTEGER DEFAULT 100, -- 0-100
    validation_flags JSONB DEFAULT '[]'::jsonb,
    
    -- Temporal Data
    measured_at TIMESTAMP WITH TIME ZONE NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Statistical Aggregation (for pre-computed values)
    is_aggregated BOOLEAN DEFAULT false,
    aggregation_period INTEGER, -- seconds
    sample_count INTEGER,
    min_value DECIMAL(20,6),
    max_value DECIMAL(20,6),
    avg_value DECIMAL(20,6),
    std_dev DECIMAL(20,6),
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Primary key includes timestamp for partitioning
    PRIMARY KEY (id, measured_at),
    
    -- Constraints
    CHECK (quality_score >= 0 AND quality_score <= 100),
    CHECK (NOT is_aggregated OR sample_count > 0)
) PARTITION BY RANGE (measured_at);

-- Create initial partitions (monthly)
CREATE TABLE total_monitoring_measurement_data_2025_01 PARTITION OF total_monitoring_measurement_data
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE total_monitoring_measurement_data_2025_02 PARTITION OF total_monitoring_measurement_data
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
-- Additional partitions would be created by partition manager

-- Measurement data indexes
CREATE INDEX idx_tm_measurement_workspace_group ON total_monitoring_measurement_data(workspace_id, groupid);
CREATE INDEX idx_tm_measurement_instrument ON total_monitoring_measurement_data(instrument_node_id, measured_at DESC);
CREATE INDEX idx_tm_measurement_equipment ON total_monitoring_measurement_data(equipment_node_id, measured_at DESC);
CREATE INDEX idx_tm_measurement_code_time ON total_monitoring_measurement_data(measurement_code, measured_at DESC);
CREATE INDEX idx_tm_measurement_quality ON total_monitoring_measurement_data(data_quality);

-- =====================================================================================
-- ENHANCED PUBLISHED FLOWS WITH ACCESS CONTROL
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_published_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    flow_id UUID NOT NULL REFERENCES total_monitoring_process_flows(id) ON DELETE CASCADE,
    flow_version_id UUID REFERENCES total_monitoring_process_flow_versions(id),
    
    -- Publishing Details
    publish_token VARCHAR(255) UNIQUE NOT NULL,
    published_name VARCHAR(255) NOT NULL,
    published_description TEXT,
    
    -- Snapshot Data
    published_data JSONB NOT NULL,
    data_hash VARCHAR(64), -- SHA-256 hash for integrity
    
    -- Access Control
    is_active BOOLEAN DEFAULT true,
    access_level permission_level_enum DEFAULT 'read',
    allowed_domains TEXT[], -- Whitelist of domains
    ip_whitelist INET[], -- IP address whitelist
    requires_authentication BOOLEAN DEFAULT false,
    
    -- Usage Analytics
    view_count INTEGER DEFAULT 0,
    unique_viewers INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMP WITH TIME ZONE,
    total_view_time INTEGER DEFAULT 0, -- seconds
    
    -- Performance Settings
    cache_enabled BOOLEAN DEFAULT true,
    cache_ttl INTEGER DEFAULT 3600, -- seconds
    max_concurrent_viewers INTEGER DEFAULT 100,
    
    -- Expiration and Lifecycle
    expires_at TIMESTAMP WITH TIME ZONE,
    auto_refresh BOOLEAN DEFAULT false,
    refresh_interval INTEGER, -- seconds
    last_refreshed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workspace_id, groupid, published_name),
    CHECK (view_count >= 0),
    CHECK (unique_viewers >= 0),
    CHECK (max_concurrent_viewers > 0)
);

-- Published flows performance indexes
CREATE INDEX idx_tm_published_workspace_group ON total_monitoring_published_flows(workspace_id, groupid);
CREATE INDEX idx_tm_published_token ON total_monitoring_published_flows(publish_token);
CREATE INDEX idx_tm_published_active ON total_monitoring_published_flows(is_active);
CREATE INDEX idx_tm_published_expires ON total_monitoring_published_flows(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================================================
-- ADVANCED QUERY TEMPLATES AND DATA MAPPING
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_query_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL, -- Group isolation key
    
    -- Template Identity
    template_name VARCHAR(255) NOT NULL,
    template_display_name VARCHAR(255),
    template_description TEXT,
    template_category VARCHAR(100),
    
    -- Query Definition
    query_template TEXT NOT NULL,
    query_language VARCHAR(50) DEFAULT 'SQL', -- SQL, GraphQL, etc.
    parameter_schema JSONB DEFAULT '{}'::jsonb,
    result_schema JSONB DEFAULT '{}'::jsonb,
    
    -- Template Configuration
    is_system_template BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    complexity_score INTEGER DEFAULT 1, -- 1-10
    estimated_execution_time INTEGER, -- milliseconds
    
    -- Database Compatibility
    compatible_databases database_type_enum[] DEFAULT '{POSTGRESQL}',
    required_permissions TEXT[],
    
    -- Usage and Performance
    usage_count INTEGER DEFAULT 0,
    avg_execution_time INTEGER, -- milliseconds
    success_rate DECIMAL(5,2) DEFAULT 100, -- percentage
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Version Control
    template_version INTEGER DEFAULT 1,
    parent_template_id UUID REFERENCES total_monitoring_query_templates(id),
    
    -- Validation and Testing
    test_data JSONB DEFAULT '{}'::jsonb,
    validation_rules JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workspace_id, groupid, template_name, template_version),
    CHECK (complexity_score >= 1 AND complexity_score <= 10),
    CHECK (success_rate >= 0 AND success_rate <= 100)
);

-- Query templates performance indexes
CREATE INDEX idx_tm_query_templates_workspace_group ON total_monitoring_query_templates(workspace_id, groupid);
CREATE INDEX idx_tm_query_templates_category ON total_monitoring_query_templates(template_category);
CREATE INDEX idx_tm_query_templates_system ON total_monitoring_query_templates(is_system_template);
CREATE INDEX idx_tm_query_templates_verified ON total_monitoring_query_templates(is_verified);

-- =====================================================================================
-- WORKSPACE FEATURES WITH DYNAMIC LOADING
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_workspace_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- Feature Identity
    feature_name VARCHAR(100) NOT NULL,
    feature_slug VARCHAR(100) NOT NULL,
    feature_display_name VARCHAR(255) NOT NULL,
    feature_description TEXT,
    feature_category VARCHAR(100),
    
    -- Visual Configuration
    icon VARCHAR(100),
    color VARCHAR(20),
    banner_image VARCHAR(500),
    
    -- Routing and Components
    route_path VARCHAR(255) NOT NULL,
    component_path VARCHAR(500),
    lazy_load BOOLEAN DEFAULT true,
    
    -- Implementation Status
    is_implemented BOOLEAN DEFAULT false,
    implementation_progress INTEGER DEFAULT 0, -- 0-100
    beta_feature BOOLEAN DEFAULT false,
    
    -- Access Control
    is_active BOOLEAN DEFAULT true,
    requires_license BOOLEAN DEFAULT false,
    minimum_permission permission_level_enum DEFAULT 'read',
    
    -- UI Configuration
    sort_order INTEGER DEFAULT 0,
    show_in_sidebar BOOLEAN DEFAULT true,
    show_in_dashboard BOOLEAN DEFAULT true,
    
    -- Feature Flags and A/B Testing
    feature_flags JSONB DEFAULT '{}'::jsonb,
    ab_test_variant VARCHAR(50),
    
    -- Usage Analytics
    usage_count INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    avg_session_time INTEGER DEFAULT 0, -- seconds
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Dependencies and Requirements
    dependencies VARCHAR(100)[], -- Other feature slugs
    system_requirements JSONB DEFAULT '{}'::jsonb,
    
    -- Permissions and Role-Based Access
    permissions JSONB DEFAULT '{"read": [], "write": [], "admin": []}'::jsonb,
    role_restrictions JSONB DEFAULT '{}'::jsonb,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workspace_id, feature_slug),
    CHECK (implementation_progress >= 0 AND implementation_progress <= 100)
);

-- Workspace features performance indexes
CREATE INDEX idx_tm_features_workspace ON total_monitoring_workspace_features(workspace_id);
CREATE INDEX idx_tm_features_active ON total_monitoring_workspace_features(is_active);
CREATE INDEX idx_tm_features_implemented ON total_monitoring_workspace_features(is_implemented);
CREATE INDEX idx_tm_features_category ON total_monitoring_workspace_features(feature_category);
CREATE INDEX idx_tm_features_sort ON total_monitoring_workspace_features(sort_order);

-- =====================================================================================
-- ADVANCED ALERT AND NOTIFICATION SYSTEM
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL,
    
    -- Alert Source
    source_type VARCHAR(50) NOT NULL, -- 'EQUIPMENT', 'INSTRUMENT', 'SYSTEM', 'CUSTOM'
    source_id UUID, -- Reference to equipment/instrument node
    
    -- Alert Definition
    alert_name VARCHAR(255) NOT NULL,
    alert_description TEXT,
    alert_type VARCHAR(50) NOT NULL, -- 'THRESHOLD', 'STATUS', 'PATTERN', 'ANOMALY'
    severity VARCHAR(20) DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    
    -- Trigger Conditions
    trigger_conditions JSONB NOT NULL,
    evaluation_interval INTEGER DEFAULT 60, -- seconds
    
    -- Alert State
    is_active BOOLEAN DEFAULT true,
    is_triggered BOOLEAN DEFAULT false,
    trigger_count INTEGER DEFAULT 0,
    first_triggered_at TIMESTAMP WITH TIME ZONE,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    
    -- Notification Settings
    notification_channels JSONB DEFAULT '[]'::jsonb, -- email, slack, webhook, etc.
    notification_template TEXT,
    cooldown_period INTEGER DEFAULT 300, -- seconds
    
    -- Escalation Rules
    escalation_rules JSONB DEFAULT '[]'::jsonb,
    escalation_level INTEGER DEFAULT 0,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (trigger_count >= 0),
    CHECK (escalation_level >= 0)
);

-- Alerts performance indexes
CREATE INDEX idx_tm_alerts_workspace_group ON total_monitoring_alerts(workspace_id, groupid);
CREATE INDEX idx_tm_alerts_source ON total_monitoring_alerts(source_type, source_id);
CREATE INDEX idx_tm_alerts_active ON total_monitoring_alerts(is_active);
CREATE INDEX idx_tm_alerts_triggered ON total_monitoring_alerts(is_triggered);
CREATE INDEX idx_tm_alerts_severity ON total_monitoring_alerts(severity);

-- =====================================================================================
-- DATA EXPORT AND REPORTING SYSTEM
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.total_monitoring_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    groupid UUID NOT NULL,
    
    -- Report Definition
    report_name VARCHAR(255) NOT NULL,
    report_description TEXT,
    report_type VARCHAR(50) NOT NULL, -- 'SCHEDULED', 'ON_DEMAND', 'TRIGGERED'
    
    -- Data Sources
    data_sources JSONB NOT NULL, -- Flow IDs, node IDs, etc.
    query_template_id UUID REFERENCES total_monitoring_query_templates(id),
    
    -- Report Configuration
    output_format VARCHAR(20) DEFAULT 'PDF', -- 'PDF', 'CSV', 'XLSX', 'JSON'
    template_path VARCHAR(500),
    
    -- Scheduling
    schedule_enabled BOOLEAN DEFAULT false,
    schedule_cron VARCHAR(100),
    next_run_at TIMESTAMP WITH TIME ZONE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery Settings
    delivery_channels JSONB DEFAULT '[]'::jsonb, -- email, ftp, s3, etc.
    retention_days INTEGER DEFAULT 30,
    
    -- Status and Metrics
    is_active BOOLEAN DEFAULT true,
    execution_count INTEGER DEFAULT 0,
    avg_execution_time INTEGER, -- milliseconds
    success_rate DECIMAL(5,2) DEFAULT 100,
    last_error TEXT,
    
    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit Fields
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(workspace_id, groupid, report_name),
    CHECK (execution_count >= 0),
    CHECK (success_rate >= 0 AND success_rate <= 100)
);

-- Reports performance indexes
CREATE INDEX idx_tm_reports_workspace_group ON total_monitoring_reports(workspace_id, groupid);
CREATE INDEX idx_tm_reports_schedule ON total_monitoring_reports(schedule_enabled, next_run_at);
CREATE INDEX idx_tm_reports_active ON total_monitoring_reports(is_active);

-- =====================================================================================
-- ENHANCED SECURITY FUNCTIONS
-- =====================================================================================

-- Function to check group access permissions
CREATE OR REPLACE FUNCTION check_group_access(
    p_workspace_id UUID,
    p_user_id UUID,
    p_groupid UUID,
    p_required_permission permission_level_enum DEFAULT 'read'
) RETURNS BOOLEAN AS $$
DECLARE
    user_permission permission_level_enum;
    is_admin BOOLEAN;
BEGIN
    -- Check if user is super admin (can access all groups)
    SELECT EXISTS(
        SELECT 1 FROM workspace_users 
        WHERE workspace_id = p_workspace_id 
        AND user_id_uuid = p_user_id 
        AND permission_level = 'super_admin'
    ) INTO is_admin;
    
    IF is_admin THEN
        RETURN TRUE;
    END IF;
    
    -- Check user's permission level for the specific group
    SELECT permission_level INTO user_permission
    FROM workspace_users wu
    JOIN workspace_groups wg ON wu.workspace_id = wg.workspace_id
    WHERE wu.workspace_id = p_workspace_id
    AND wu.user_id_uuid = p_user_id
    AND wg.group_id_uuid = p_groupid;
    
    -- Permission hierarchy: super_admin > admin > write > read
    RETURN CASE 
        WHEN user_permission = 'super_admin' THEN TRUE
        WHEN user_permission = 'admin' AND p_required_permission IN ('admin', 'write', 'read') THEN TRUE
        WHEN user_permission = 'write' AND p_required_permission IN ('write', 'read') THEN TRUE
        WHEN user_permission = 'read' AND p_required_permission = 'read' THEN TRUE
        ELSE FALSE
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row Level Security Policies for all Total Monitoring tables
ALTER TABLE total_monitoring_database_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_process_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_process_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_equipment_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_instrument_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_measurement_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_published_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_query_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE total_monitoring_reports ENABLE ROW LEVEL SECURITY;

-- Example RLS policy for database connections
CREATE POLICY total_monitoring_db_connections_access ON total_monitoring_database_connections
    USING (check_group_access(workspace_id, current_setting('app.current_user_id')::UUID, groupid, 'read'));

-- =====================================================================================
-- AUDIT TRIGGER FUNCTIONS
-- =====================================================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION total_monitoring_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO total_monitoring_audit_log (
        workspace_id, groupid, table_name, record_id, action,
        old_values, new_values, user_id, user_email, ip_address,
        user_agent, session_id
    ) VALUES (
        COALESCE(NEW.workspace_id, OLD.workspace_id),
        COALESCE(NEW.groupid, OLD.groupid),
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP::audit_action_enum,
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        current_setting('app.current_user_id', true)::UUID,
        current_setting('app.current_user_email', true),
        current_setting('app.current_ip_address', true)::INET,
        current_setting('app.current_user_agent', true),
        current_setting('app.current_session_id', true)
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to all tables
CREATE TRIGGER audit_total_monitoring_database_connections
    AFTER INSERT OR UPDATE OR DELETE ON total_monitoring_database_connections
    FOR EACH ROW EXECUTE FUNCTION total_monitoring_audit_trigger();

CREATE TRIGGER audit_total_monitoring_process_flows
    AFTER INSERT OR UPDATE OR DELETE ON total_monitoring_process_flows
    FOR EACH ROW EXECUTE FUNCTION total_monitoring_audit_trigger();

-- (Additional triggers for other tables would follow similar pattern)

-- =====================================================================================
-- PERFORMANCE OPTIMIZATION VIEWS
-- =====================================================================================

-- Materialized view for equipment status summary
CREATE MATERIALIZED VIEW total_monitoring_equipment_status_summary AS
SELECT 
    workspace_id,
    groupid,
    equipment_status,
    COUNT(*) as equipment_count,
    AVG(health_score) as avg_health_score,
    COUNT(CASE WHEN alert_enabled THEN 1 END) as alert_enabled_count
FROM total_monitoring_equipment_nodes
WHERE is_active = true
GROUP BY workspace_id, groupid, equipment_status;

-- Refresh materialized views periodically
CREATE INDEX idx_equipment_status_summary ON total_monitoring_equipment_status_summary(workspace_id, groupid);

-- =====================================================================================
-- TABLE COMMENTS FOR DOCUMENTATION
-- =====================================================================================

COMMENT ON TABLE total_monitoring_database_connections IS 'Enhanced database connections with encryption, health monitoring, and connection pooling';
COMMENT ON TABLE total_monitoring_process_flows IS 'Process flow definitions with versioning, auto-save, performance tracking, and multi-database support';
COMMENT ON TABLE total_monitoring_equipment_nodes IS 'Equipment node configurations with advanced status tracking, maintenance scheduling, and performance metrics';
COMMENT ON TABLE total_monitoring_instrument_nodes IS 'Instrument node configurations with measurement capabilities, quality control, and alert thresholds';
COMMENT ON TABLE total_monitoring_measurement_data IS 'Real-time measurement data with partitioning, quality scoring, and aggregation support';
COMMENT ON TABLE total_monitoring_published_flows IS 'Published flows with access control, analytics, caching, and expiration management';
COMMENT ON TABLE total_monitoring_query_templates IS 'Advanced query templates with versioning, performance tracking, and database compatibility';
COMMENT ON TABLE total_monitoring_workspace_features IS 'Dynamic workspace features with implementation tracking, access control, and usage analytics';
COMMENT ON TABLE total_monitoring_alerts IS 'Advanced alert system with escalation rules, notification channels, and cooldown periods';
COMMENT ON TABLE total_monitoring_reports IS 'Automated reporting system with scheduling, multiple output formats, and delivery channels';
COMMENT ON TABLE total_monitoring_audit_log IS 'Comprehensive audit trail for all Total Monitoring operations with user tracking and IP logging';

-- Column comments for key fields
COMMENT ON COLUMN total_monitoring_database_connections.groupid IS 'UUID for group-based data isolation - admins see all, users see only their group';
COMMENT ON COLUMN total_monitoring_database_connections.connection_string_encrypted IS 'AES-256 encrypted connection string for maximum security';
COMMENT ON COLUMN total_monitoring_process_flows.auto_save_data IS 'Automatic backup data for recovery on unexpected exits';
COMMENT ON COLUMN total_monitoring_measurement_data.measured_at IS 'Timestamp when measurement was actually taken (vs recorded_at when stored)';
COMMENT ON COLUMN total_monitoring_measurement_data.quality_score IS 'Data quality score 0-100 based on validation rules and sensor health';

-- =====================================================================================
-- MIGRATION HELPER FUNCTIONS (for migrating from personal_test tables)
-- =====================================================================================

-- Function to migrate personal_test_process_flows to total_monitoring_process_flows
CREATE OR REPLACE FUNCTION migrate_personal_test_flows(
    p_default_groupid UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID
) RETURNS INTEGER AS $$
DECLARE
    migrated_count INTEGER := 0;
    flow_record RECORD;
BEGIN
    FOR flow_record IN 
        SELECT * FROM personal_test_process_flows
    LOOP
        INSERT INTO total_monitoring_process_flows (
            workspace_id, groupid, flow_name, flow_display_name,
            flow_data, created_by, created_at, updated_at
        ) VALUES (
            flow_record.workspace_id,
            p_default_groupid,
            flow_record.name,
            flow_record.name,
            flow_record.flow_data,
            COALESCE(flow_record.created_by::UUID, gen_random_uuid()),
            flow_record.created_at,
            flow_record.updated_at
        ) ON CONFLICT (workspace_id, groupid, flow_name) DO NOTHING;
        
        migrated_count := migrated_count + 1;
    END LOOP;
    
    RETURN migrated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to migrate equipment status data
CREATE OR REPLACE FUNCTION migrate_personal_test_equipment(
    p_default_groupid UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID,
    p_default_workspace_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID
) RETURNS INTEGER AS $$
DECLARE
    migrated_count INTEGER := 0;
    equipment_record RECORD;
BEGIN
    FOR equipment_record IN 
        SELECT * FROM personal_test_equipment_status
    LOOP
        -- Note: This requires manual mapping to specific flows
        -- Implementation would depend on business logic for associating equipment with flows
        migrated_count := migrated_count + 1;
    END LOOP;
    
    RETURN migrated_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- END OF TOTAL MONITORING SCHEMA
-- =====================================================================================

-- Create initial system data
INSERT INTO total_monitoring_workspace_features (
    workspace_id, feature_name, feature_slug, feature_display_name,
    feature_description, route_path, icon, color, sort_order, created_by
) VALUES 
    ('00000000-0000-0000-0000-000000000000', 'Database Setup', 'database-setup', 'Database Connections', 
     'Configure and manage database connections', '/total-monitoring/database-setup', 'Database', '#3B82F6', 1, 
     '00000000-0000-0000-0000-000000000000'),
    ('00000000-0000-0000-0000-000000000000', 'Process Flow Editor', 'flow-editor', 'Process Flow Editor', 
     'Create and edit process flows', '/total-monitoring/flow-editor', 'GitBranch', '#10B981', 2, 
     '00000000-0000-0000-0000-000000000000'),
    ('00000000-0000-0000-0000-000000000000', 'Monitoring Dashboard', 'monitoring', 'Real-time Monitoring', 
     'Monitor equipment and process flows in real-time', '/total-monitoring/monitor', 'Monitor', '#F59E0B', 3, 
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT DO NOTHING;

COMMIT;