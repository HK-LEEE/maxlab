# Workspace Permission Filtering Fix

## Problem Description

The workspace list endpoint (`/api/v1/workspaces/`) was returning all workspaces to all users, regardless of their permissions. The permission check was only happening when accessing individual workspaces, not when listing them.

## Root Cause

The OAuth server (localhost:8000) was returning `is_admin: true` for all authenticated users, which caused the permission filtering logic to be bypassed. The filtering logic itself was correct, but it wasn't being applied because every user was considered an admin.

## Solution Implemented

### 1. Admin Override System

Created a new admin override configuration system that allows MaxLab to manage its own admin privileges independently of the OAuth server:

- **File**: `app/core/admin_override.py`
- **Purpose**: Define which users should have admin privileges in MaxLab
- **Configuration Methods**:
  - Environment variables
  - JSON configuration file

### 2. Updated Security Module

Modified `app/core/security.py` to:
- Default all users to non-admin status
- Use the admin override system to determine admin privileges
- Store the OAuth server's `is_admin` value separately as `oauth_is_admin`

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Comma-separated list of admin email addresses
MAXLAB_ADMIN_EMAILS=admin@example.com,superuser@company.com

# Comma-separated list of admin user UUIDs
MAXLAB_ADMIN_UUIDS=58ba91a5-0cba-563c-b2c3-8de00eb4b3b6

# Whether to trust OAuth server's is_admin field (default: false)
MAXLAB_TRUST_OAUTH_ADMIN=false

# Path to admin config file (optional)
MAXLAB_ADMIN_CONFIG_FILE=admin_config.json
```

### JSON Configuration File

Create `admin_config.json` in the backend directory:

```json
{
  "admin_emails": [
    "admin@example.com",
    "superuser@company.com"
  ],
  "admin_uuids": [
    "58ba91a5-0cba-563c-b2c3-8de00eb4b3b6"
  ]
}
```

## Testing the Fix

### 1. Debug Endpoints

Two debug endpoints have been added (only available when DEBUG=true):

- `GET /api/v1/debug/user-info` - Shows current user information
- `GET /api/v1/debug/workspace-permissions` - Shows permission filtering results

### 2. Test Script

Use `test_debug_endpoints.py` to test the fix:

```bash
cd backend
python test_debug_endpoints.py
```

### 3. Expected Behavior

- **Admin users**: Should see all workspaces
- **Non-admin users**: Should only see workspaces where they have explicit permissions (user or group-based)

## How Permission Filtering Works

1. **System Admin Check**: If user is a system admin (as defined by MaxLab), they see all workspaces
2. **Owner Check**: Users see workspaces they own
3. **User Permission Check**: Users see workspaces where they have explicit user permissions
4. **Group Permission Check**: Users see workspaces where their groups have permissions

The filtering uses SQL EXISTS clauses for optimal performance.

## Migration Notes

1. Update your `.env` file with the admin configuration
2. Restart the backend server
3. Test with both admin and non-admin users to verify filtering works correctly

## Security Considerations

- The OAuth server's `is_admin` field is now ignored by default for security
- MaxLab maintains its own admin list, giving you full control over admin privileges
- Admin status is checked on every request (no caching) to ensure immediate revocation when needed

## Troubleshooting

1. **All users still see all workspaces**: Check that `MAXLAB_TRUST_OAUTH_ADMIN=false`
2. **No admin users**: Add admin emails/UUIDs to the configuration
3. **Permission denied errors**: Verify the user/group has appropriate workspace permissions

## Future Improvements

1. Admin management UI for adding/removing admins
2. Audit logging for admin actions
3. Role-based access control (RBAC) beyond simple admin/user roles
4. Workspace permission management UI