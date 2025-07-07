-- Simple migration to add current_version column only
-- This allows the system to work without full version management

-- Add current_version column if it doesn't exist
ALTER TABLE personal_test_process_flows 
ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;