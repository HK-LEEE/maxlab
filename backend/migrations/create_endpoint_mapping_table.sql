-- Create table for mapping data source endpoints/tables
CREATE TABLE IF NOT EXISTS data_source_endpoint_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_source_id UUID NOT NULL REFERENCES data_source_configs(id) ON DELETE CASCADE,
    data_type VARCHAR(50) NOT NULL, -- equipment_status, measurement_data, measurement_specs
    
    -- For SQL data sources (PostgreSQL, MSSQL)
    table_name VARCHAR(255),
    query_template TEXT,
    
    -- For API data sources
    endpoint_path VARCHAR(500),
    http_method VARCHAR(10) DEFAULT 'GET',
    request_headers JSONB,
    request_body_template TEXT,
    response_path VARCHAR(500), -- JSONPath to extract data array
    
    -- Common fields
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_source_type UNIQUE (data_source_id, data_type)
);

-- Create index for faster lookups
CREATE INDEX idx_endpoint_mappings_source_type ON data_source_endpoint_mappings(data_source_id, data_type);

-- Insert default mappings for PostgreSQL (default behavior)
INSERT INTO data_source_endpoint_mappings (
    data_source_id,
    data_type,
    table_name,
    query_template
) VALUES 
(
    '00000000-0000-0000-0000-000000000000'::UUID, -- Default PostgreSQL source
    'equipment_status',
    'personal_test_equipment_status',
    'SELECT equipment_type, equipment_code, equipment_name, status, last_run_time FROM personal_test_equipment_status WHERE 1=1'
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'personal_test_measurement_data',
    'SELECT id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, timestamp, usl, lsl, spec_status FROM personal_test_measurement_data WHERE 1=1'
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_specs',
    'personal_test_measurement_specs',
    'SELECT equipment_code, measurement_code, usl, lsl, target FROM personal_test_measurement_specs WHERE 1=1'
)
ON CONFLICT (data_source_id, data_type) DO NOTHING;