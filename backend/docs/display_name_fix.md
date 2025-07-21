# Display Name Fix Documentation

## Problem Description

After the UUID migration, the Workspace Management UI was showing UUIDs instead of human-readable display names for users and groups. This occurred because:

1. The `create_workspace_user` function was not passing the required `user_token` parameter when fetching user information
2. Existing records migrated with the UUID migration script had empty or UUID values in their display name fields

## Solution Overview

### 1. API Endpoint Fixes

**Fixed File**: `/backend/app/routers/workspaces.py`

#### User Permission Endpoint Fix
- **Function**: `create_workspace_user` (line 359)
- **Issue**: Missing `user_token` parameter in `get_user_info_by_uuid()` call
- **Fix**: Added token extraction and passing to the service call

```python
# Get user token from current_user
user_token = current_user.get("token")
if not user_token:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="User token not available"
    )

# Now passes token to both functions
user_uuid = await user_mapping_service.get_user_uuid_by_identifier(user_identifier, user_token)
user_info = await user_mapping_service.get_user_info_by_uuid(user_uuid, user_token)
```

#### Group Permission Endpoint
- **Function**: `create_workspace_group` (line 467)
- **Status**: Already correctly implemented with token passing

### 2. Display Name Update Script

**Script**: `/backend/update_display_names.py`

This script updates existing records that have missing or UUID-based display names.

#### Features:
- Queries all workspace_users and workspace_groups with null/empty/UUID display names
- Fetches current display names from the external authentication server
- Updates records with proper human-readable names
- Provides detailed statistics on the update process

#### Usage:
```bash
cd /home/lee/proejct/maxlab/backend

# Run the update script
python update_display_names.py --admin-token "YOUR_ADMIN_TOKEN"

# Dry run mode (future feature)
python update_display_names.py --admin-token "YOUR_ADMIN_TOKEN" --dry-run
```

### 3. Test Script

**Script**: `/backend/test_display_name_fixes.py`

This script helps verify that the fixes are working correctly.

#### Features:
- Shows current users/groups and their display names
- Tests adding new users/groups to verify immediate display name fetching
- Highlights whether display names are showing properly or as UUIDs

#### Usage:
```bash
cd /home/lee/proejct/maxlab/backend

# Test with a specific workspace
python test_display_name_fixes.py \
    --admin-token "YOUR_ADMIN_TOKEN" \
    --workspace-id "WORKSPACE_UUID" \
    --test-user-id "user@example.com" \
    --test-group-id "test-group"
```

## Implementation Steps

### Step 1: Deploy the API Fix
1. The fix for `create_workspace_user` has been applied
2. Restart the backend service to apply changes:
   ```bash
   # If using systemd
   sudo systemctl restart maxlab-backend
   
   # If using Docker
   docker-compose restart backend
   ```

### Step 2: Update Existing Records
1. Run the update script to fix existing records:
   ```bash
   python update_display_names.py --admin-token "YOUR_ADMIN_TOKEN"
   ```

2. The script will show progress and statistics:
   ```
   Display Name Update Summary:
   ==================================================
   Users checked: X
   Users updated: Y
   Users failed: Z
   Groups checked: A
   Groups updated: B
   Groups failed: C
   ==================================================
   ```

### Step 3: Verify the Fix
1. Run the test script to verify new additions work correctly:
   ```bash
   python test_display_name_fixes.py \
       --admin-token "YOUR_ADMIN_TOKEN" \
       --workspace-id "WORKSPACE_UUID"
   ```

2. Check the Workspace Management UI:
   - Navigate to Workspace Management (admin)
   - Select a workspace and view permissions
   - Verify that user and group names show properly (not UUIDs)

## Troubleshooting

### Common Issues

1. **"User token not available" error**
   - Ensure the user is properly authenticated
   - Check that the authentication middleware is passing tokens correctly

2. **Display names still showing as UUIDs after update**
   - Verify the external auth server is accessible
   - Check that the admin token has sufficient permissions
   - Review logs for any errors during the update process

3. **Update script fails to connect**
   - Verify `AUTH_SERVER_URL` in settings
   - Check network connectivity to the auth server
   - Ensure the admin token is valid and not expired

### Logging

Both scripts provide detailed logging. To increase verbosity:

```python
# In the scripts, change:
logging.basicConfig(level=logging.DEBUG, ...)
```

## Future Improvements

1. **Automatic Background Updates**
   - Implement a background task to periodically sync display names
   - Add webhook support for real-time updates when users/groups change

2. **Caching Enhancements**
   - Implement Redis caching for display names
   - Add cache invalidation on user/group updates

3. **UI Improvements**
   - Add a "Refresh Display Names" button in the admin UI
   - Show last sync timestamp for each user/group

## Related Files

- `/backend/app/services/user_mapping.py` - User UUID mapping service
- `/backend/app/services/group_mapping.py` - Group UUID mapping service
- `/backend/app/models/workspace.py` - Database models with UUID fields
- `/frontend/src/types/workspace.ts` - TypeScript types for workspace entities
- `/frontend/src/components/workspace/EditWorkspaceModal.tsx` - UI component showing permissions