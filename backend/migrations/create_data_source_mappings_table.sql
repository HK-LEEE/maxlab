-- Create data_source_mappings table for equipment and measurement code mappings
CREATE TABLE IF NOT EXISTS data_source_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    data_source_id UUID NOT NULL,
    mapping_type VARCHAR(50) NOT NULL,  -- 'equipment' or 'measurement'
    source_code VARCHAR(255) NOT NULL,
    source_name VARCHAR(255),
    source_type VARCHAR(100),
    target_code VARCHAR(255) NOT NULL,
    target_name VARCHAR(255),
    target_type VARCHAR(100),
    transform_rules JSONB,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_mapping UNIQUE (workspace_id, data_source_id, mapping_type, source_code)
);