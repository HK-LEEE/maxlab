-- Change workspace_id from UUID to VARCHAR in data_source_configs table
ALTER TABLE data_source_configs 
ALTER COLUMN workspace_id TYPE VARCHAR(255) USING workspace_id::text;

-- Update any existing UUID values to workspace slugs if needed
-- For now, we'll just ensure 'personal_test' workspace exists