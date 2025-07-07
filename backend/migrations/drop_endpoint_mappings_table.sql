-- Drop the endpoint mappings table as it's no longer needed
-- The dynamic provider handles endpoint selection automatically

DROP TABLE IF EXISTS data_source_endpoint_mappings CASCADE;