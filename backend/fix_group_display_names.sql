-- Fix group display names that are showing as UUIDs
-- This script updates workspace_groups where display_name equals the UUID

-- First, let's check what we have
SELECT 
    id,
    workspace_id,
    group_name,
    group_id_uuid,
    group_display_name,
    permission_level
FROM workspace_groups
WHERE group_display_name = group_id_uuid::text
   OR group_display_name = group_name;

-- Update known groups based on common patterns
-- You can customize these based on your actual group names

-- Example: If group UUID is known to be 'production' group
UPDATE workspace_groups
SET group_display_name = 'Production Team',
    group_info_updated_at = NOW()
WHERE group_id_uuid = '58ba91a5-0cba-563c-b2c3-8de00eb4b3b6'::uuid
  AND (group_display_name = '58ba91a5-0cba-563c-b2c3-8de00eb4b3b6' 
       OR group_display_name IS NULL);

-- Example: Update development team group
UPDATE workspace_groups
SET group_display_name = 'Development Team',
    group_info_updated_at = NOW()
WHERE group_id_uuid = '3ab3b962-06b7-5e15-a490-52affa32e6dc'::uuid
  AND (group_display_name = '3ab3b962-06b7-5e15-a490-52affa32e6dc' 
       OR group_display_name IS NULL);

-- Generic update for any remaining groups
-- This sets a temporary readable name based on permission level
UPDATE workspace_groups
SET group_display_name = 
    CASE 
        WHEN permission_level = 'admin' THEN 'Admin Group'
        WHEN permission_level = 'write' THEN 'Editor Group'
        WHEN permission_level = 'read' THEN 'Viewer Group'
        ELSE 'Unknown Group'
    END || ' (' || SUBSTRING(group_id_uuid::text, 1, 8) || ')',
    group_info_updated_at = NOW()
WHERE group_display_name = group_id_uuid::text
   OR group_display_name = group_name;

-- Verify the updates
SELECT 
    id,
    workspace_id,
    group_name,
    group_id_uuid,
    group_display_name,
    permission_level,
    group_info_updated_at
FROM workspace_groups
ORDER BY workspace_id, group_display_name;