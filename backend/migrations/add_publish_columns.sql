-- Add publish functionality columns to personal_test_process_flows table
ALTER TABLE personal_test_process_flows 
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS publish_token VARCHAR(255) UNIQUE;

-- Create index on publish_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_personal_test_process_flows_publish_token 
ON personal_test_process_flows(publish_token) 
WHERE publish_token IS NOT NULL;

-- Create index on is_published for filtering published flows
CREATE INDEX IF NOT EXISTS idx_personal_test_process_flows_is_published 
ON personal_test_process_flows(is_published) 
WHERE is_published = TRUE;