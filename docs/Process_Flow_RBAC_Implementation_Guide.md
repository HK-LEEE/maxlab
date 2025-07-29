# Process Flow Editor RBAC Implementation Guide

## Overview

The Process Flow Editor now includes Role-Based Access Control (RBAC) with scope-based permissions. This allows users to control who can view and edit their process flows within a workspace.

## Key Features

### 1. Scope Types

When saving a process flow, users can choose between two scope types:

- **Workspace Scope (`WORKSPACE`)**: 
  - All workspace members can view and edit the flow
  - Ideal for collaborative flows that multiple team members need to work on
  - Flows appear in everyone's flow list within the workspace

- **User Scope (`USER`)**: 
  - Only the creator can view and edit the flow
  - Ideal for personal flows or work-in-progress that isn't ready for sharing
  - Flows only appear in the creator's flow list

### 2. Admin Override

Users with `is_admin = true` can:
- View all flows regardless of scope
- Edit all flows regardless of scope
- Delete any flow in the workspace
- Change scope settings of any flow

### 3. Visual Indicators

Flows display visual badges to indicate their scope:
- 🔒 **Private**: User-scoped flow, only visible to creator
- 👥 **Workspace**: Workspace-scoped flow, visible to all members
- 🌐 **Published**: Flow is published for external viewing

## User Guide

### Creating a New Flow

1. Click "New Flow" or start with a blank canvas
2. Design your process flow
3. When saving for the first time, a scope selection dialog will appear:
   - Choose "Workspace용" to share with all workspace members
   - Choose "User용" to keep the flow private
4. Click "저장" to save with the selected scope

### Changing Flow Scope

To change an existing flow's scope:
1. Open the flow in the editor
2. Use "Save As New Version" to create a new version with different scope
3. Or contact an admin to change the scope directly

### Loading Flows

The Load Flow dialog shows:
- Flow name and creation date
- Scope indicator (Private/Workspace badge)
- Published status if applicable
- Current version number

### Filtering Flows

In the flow list, you can filter by:
- All flows (shows everything you have access to)
- Workspace flows (shows only workspace-scoped flows)
- My flows (shows only your user-scoped flows)

## Technical Implementation

### Database Schema

Added three new columns to `personal_test_process_flows`:
```sql
scope_type VARCHAR(20) NOT NULL DEFAULT 'USER'
visibility_scope VARCHAR(50) NOT NULL DEFAULT 'PRIVATE'
shared_with_workspace BOOLEAN NOT NULL DEFAULT FALSE
```

### Permission Logic

The `FlowPermissionChecker` class handles all permission checks:

```python
# User can access a flow if:
# 1. They are the creator (owner)
# 2. They are an admin
# 3. The flow is workspace-scoped and they are in the workspace
# 4. The flow is shared with workspace
```

### API Endpoints

All flow-related endpoints now support scope filtering:
```
GET /api/v1/personal-test/process-flow/flows?scope=workspace
GET /api/v1/personal-test/process-flow/flows?scope=user
GET /api/v1/personal-test/process-flow/flows?scope=all
```

### Frontend Components

- **ScopeSelectionDialog**: Modal for selecting scope when saving new flows
- **FlowScopeIndicator**: Visual badge component showing flow scope
- **LoadFlowDialog**: Enhanced with scope badges and filtering

## Migration Notes

### For Existing Flows

All existing flows have been automatically migrated to:
- `scope_type = 'USER'`
- `visibility_scope = 'PRIVATE'`
- `shared_with_workspace = false`

This ensures backward compatibility and maintains privacy for existing flows.

### Database Migration

Run the migration script to add scope columns:
```bash
cd backend
python run_scope_migration.py
```

## Security Considerations

1. **Permission Checks**: All API endpoints validate permissions before allowing access
2. **Frontend Validation**: The UI respects scope settings and hides inaccessible flows
3. **Audit Trail**: All flow operations are logged with user information
4. **Data Isolation**: User-scoped flows are completely isolated from other users

## Best Practices

1. **Default to Private**: Start with user scope for new flows until ready to share
2. **Use Workspace Scope for Collaboration**: Switch to workspace scope when multiple people need access
3. **Regular Review**: Periodically review flow scopes to ensure appropriate access
4. **Admin Oversight**: Admins should monitor workspace flows for sensitive content

## Troubleshooting

### Common Issues

1. **403 Forbidden Error**
   - Ensure you're authenticated
   - Check if you have permission to access the flow
   - Verify the flow exists and hasn't been deleted

2. **Flows Not Appearing**
   - Check the scope filter setting
   - Ensure you're in the correct workspace
   - Verify with an admin if the flow exists

3. **Cannot Change Scope**
   - Only flow creators and admins can change scope
   - Use "Save As New Version" as a workaround
   - Contact workspace admin for assistance

### Verification Script

Run the verification script to check implementation:
```bash
cd backend
python verify_scope_implementation.py
```

## Future Enhancements

Potential future improvements:
1. Group-based permissions (share with specific teams)
2. Read-only sharing options
3. Temporary access tokens for external users
4. Approval workflows for workspace flows
5. Scope change history and audit logs