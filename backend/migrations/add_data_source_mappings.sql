-- Data source specific equipment and measurement mappings
CREATE TABLE IF NOT EXISTS data_source_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    data_source_id UUID NOT NULL,
    mapping_type VARCHAR(50) NOT NULL, -- 'equipment' or 'measurement'
    
    -- Source mapping (from external system)
    source_code VARCHAR(100) NOT NULL,
    source_name VARCHAR(255),
    source_type VARCHAR(100),
    
    -- Target mapping (to our system)
    target_code VARCHAR(100) NOT NULL,
    target_name VARCHAR(255),
    target_type VARCHAR(100),
    
    -- Transformation rules (JSON)
    transform_rules JSONB,
    
    -- Metadata
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
    UNIQUE(data_source_id, mapping_type, source_code)
);

-- Index for performance
CREATE INDEX idx_data_source_mappings_lookup 
ON data_source_mappings(workspace_id, data_source_id, mapping_type, is_active);

-- Example mappings:
-- Equipment mapping: External system's "MACH001" -> Our system's "EQ001"
-- Measurement mapping: External "TEMP_01" -> Our "TEMPERATURE"

-- View for easy lookup of active mappings
CREATE OR REPLACE VIEW v_active_data_mappings AS
SELECT 
    m.*,
    d.source_type as data_source_type,
    d.config_name as data_source_name
FROM data_source_mappings m
JOIN data_source_configs d ON m.data_source_id = d.id
WHERE m.is_active = true AND d.is_active = true;