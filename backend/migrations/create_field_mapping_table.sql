-- Create table for field name mappings between external and internal systems
CREATE TABLE IF NOT EXISTS data_source_field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_source_id UUID NOT NULL REFERENCES data_source_configs(id) ON DELETE CASCADE,
    data_type VARCHAR(50) NOT NULL, -- equipment_status, measurement_data, measurement_specs
    
    -- Field mapping
    source_field VARCHAR(255) NOT NULL, -- External field name
    target_field VARCHAR(255) NOT NULL, -- Internal field name
    
    -- Data transformation
    data_type_conversion VARCHAR(50), -- int, float, string, datetime
    transform_function TEXT, -- Optional SQL/JS function for transformation
    default_value TEXT, -- Default value if source field is null
    
    -- Metadata
    is_required BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_field_mapping UNIQUE (data_source_id, data_type, target_field)
);

-- Create index for faster lookups
CREATE INDEX idx_field_mappings_source ON data_source_field_mappings(data_source_id, data_type);

-- Insert default field mappings for standard fields
INSERT INTO data_source_field_mappings (
    data_source_id,
    data_type,
    source_field,
    target_field,
    is_required
) VALUES 
-- Equipment Status mappings
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'equipment_status',
    'equipment_type',
    'equipment_type',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'equipment_status',
    'equipment_code',
    'equipment_code',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'equipment_status',
    'equipment_name',
    'equipment_name',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'equipment_status',
    'status',
    'status',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'equipment_status',
    'last_run_time',
    'last_run_time',
    false
),
-- Measurement Data mappings
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'equipment_type',
    'equipment_type',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'equipment_code',
    'equipment_code',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'measurement_code',
    'measurement_code',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'measurement_desc',
    'measurement_desc',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'measurement_value',
    'measurement_value',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'timestamp',
    'timestamp',
    true
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'usl',
    'usl',
    false
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'lsl',
    'lsl',
    false
),
(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'measurement_data',
    'spec_status',
    'spec_status',
    false
)
ON CONFLICT (data_source_id, data_type, target_field) DO NOTHING;