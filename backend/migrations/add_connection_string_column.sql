-- Add a generic connection_string column for all data source types
-- This allows PostgreSQL to have its own connection string

ALTER TABLE data_source_configs 
ADD COLUMN IF NOT EXISTS connection_string VARCHAR(500);

-- Migrate existing data
UPDATE data_source_configs 
SET connection_string = COALESCE(api_url, mssql_connection_string)
WHERE connection_string IS NULL;