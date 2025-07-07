-- Create process flow versions table
CREATE TABLE IF NOT EXISTS personal_test_process_flow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES personal_test_process_flows(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    flow_data JSONB NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_published BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    publish_token VARCHAR(255) UNIQUE,
    UNIQUE(flow_id, version_number)
);

-- Add index for performance
CREATE INDEX idx_flow_versions_flow_id ON personal_test_process_flow_versions(flow_id);
CREATE INDEX idx_flow_versions_published ON personal_test_process_flow_versions(is_published);

-- Add current_version column to process flows table
ALTER TABLE personal_test_process_flows 
ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;

-- Migrate existing data to version 1
INSERT INTO personal_test_process_flow_versions (
    flow_id,
    version_number,
    flow_data,
    name,
    created_by,
    created_at,
    is_published,
    published_at,
    publish_token
)
SELECT 
    id as flow_id,
    1 as version_number,
    flow_data,
    name || ' - Version 1' as name,
    created_by,
    created_at,
    is_published,
    published_at,
    publish_token
FROM personal_test_process_flows
WHERE NOT EXISTS (
    SELECT 1 FROM personal_test_process_flow_versions 
    WHERE flow_id = personal_test_process_flows.id AND version_number = 1
);

-- Create function to get next version number
CREATE OR REPLACE FUNCTION get_next_version_number(p_flow_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT MAX(version_number) + 1 
         FROM personal_test_process_flow_versions 
         WHERE flow_id = p_flow_id), 
        1
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to publish a specific version
CREATE OR REPLACE FUNCTION publish_flow_version(p_flow_id UUID, p_version_number INTEGER, p_token VARCHAR)
RETURNS VOID AS $$
BEGIN
    -- Unpublish all versions of this flow
    UPDATE personal_test_process_flow_versions
    SET is_published = FALSE,
        publish_token = NULL,
        published_at = NULL
    WHERE flow_id = p_flow_id;
    
    -- Publish the specified version
    UPDATE personal_test_process_flow_versions
    SET is_published = TRUE,
        publish_token = p_token,
        published_at = CURRENT_TIMESTAMP
    WHERE flow_id = p_flow_id AND version_number = p_version_number;
    
    -- Update main flow table
    UPDATE personal_test_process_flows
    SET is_published = TRUE,
        publish_token = p_token,
        published_at = CURRENT_TIMESTAMP,
        current_version = p_version_number
    WHERE id = p_flow_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for current published versions
CREATE OR REPLACE VIEW personal_test_published_flows AS
SELECT 
    f.id as flow_id,
    f.workspace_id,
    v.id as version_id,
    v.version_number,
    v.name,
    v.flow_data,
    v.publish_token,
    v.published_at,
    v.created_by,
    v.created_at
FROM personal_test_process_flows f
JOIN personal_test_process_flow_versions v ON f.id = v.flow_id
WHERE v.is_published = TRUE;