# Workspace UUID Migration Guide

## Overview

This guide provides comprehensive instructions for migrating the workspace permission system from string-based identifiers (group_name, user_id) to UUID-based identifiers (group_id_uuid, user_id_uuid).

## Migration Components

### 1. Database Changes

#### Current State (Transitional)
- **workspace_groups**: Contains both `group_name` (string) and `group_id_uuid` (UUID)
- **workspace_users**: Contains both `user_id` (string) and `user_id_uuid` (UUID)

#### Target State
- All group and user references use UUID exclusively
- Display names maintained separately for UI purposes
- Legacy string fields removed after successful migration

### 2. Implementation Files

#### Backup Scripts
- `migrations/001_backup_workspace_tables.sql` - Creates backup tables before migration
- `migrations/002_rollback_workspace_uuid.sql` - SQL script for emergency rollback

#### Migration Scripts
- `migrate_workspace_uuids.py` - Main migration script that populates UUID fields
- `run_workspace_uuid_migration.py` - Existing migration runner (enhanced)

#### Monitoring
- `monitoring/migration_monitor.py` - Real-time migration status monitoring
- `rollback_workspace_migration.py` - Automated rollback procedure

#### Application Code Updates
- `app/schemas/workspace.py` - Updated Pydantic schemas with UUID fields
- `app/crud/workspace.py` - CRUD operations supporting UUID-based queries
- `app/routers/workspaces.py` - API endpoints accepting UUIDs
- `app/models/workspace.py` - SQLAlchemy models with transitional UUID support

#### Frontend Updates
- `frontend/src/types/workspace.ts` - TypeScript types with UUID fields
- `frontend/src/components/workspace/EditWorkspaceModal.tsx` - UI components using UUIDs

## Migration Process

### Phase 1: Preparation

1. **Backup Current Data**
   ```bash
   # Run backup script
   psql -U $DB_USER -d $DB_NAME -f migrations/001_backup_workspace_tables.sql
   ```

2. **Verify Backup**
   ```sql
   SELECT COUNT(*) FROM workspace_backup.workspace_users_backup;
   SELECT COUNT(*) FROM workspace_backup.workspace_groups_backup;
   ```

### Phase 2: Migration Execution

1. **Dry Run**
   ```bash
   # Test migration without making changes
   python migrate_workspace_uuids.py --admin-token $ADMIN_TOKEN --dry-run
   ```

2. **Execute Migration**
   ```bash
   # Run actual migration
   python migrate_workspace_uuids.py --admin-token $ADMIN_TOKEN
   ```

3. **Monitor Progress**
   ```bash
   # In another terminal, monitor migration status
   python monitoring/migration_monitor.py
   ```

### Phase 3: Validation

1. **Check Migration Status**
   ```bash
   # Run monitoring tool in single-check mode
   python monitoring/migration_monitor.py --once
   ```

2. **Verify Data Integrity**
   - All records should have populated UUID fields
   - No duplicate UUIDs within same workspace
   - Foreign key relationships maintained

### Phase 4: Application Update

1. **Deploy Updated Backend**
   - New code uses UUID fields primarily
   - Falls back to string fields for compatibility
   - Handles both UUID and string inputs

2. **Deploy Updated Frontend**
   - UI components send UUIDs instead of names
   - Display names shown to users
   - Group/user selectors use UUIDs as values

### Phase 5: Cleanup (Future)

After confirming stable operation:

1. **Remove Legacy Fields**
   ```sql
   -- Remove string-based fields
   ALTER TABLE workspace_groups DROP COLUMN group_name;
   ALTER TABLE workspace_users DROP COLUMN user_id;
   
   -- Rename UUID fields
   ALTER TABLE workspace_groups RENAME COLUMN group_id_uuid TO group_id;
   ALTER TABLE workspace_users RENAME COLUMN user_id_uuid TO user_id;
   ```

2. **Update Indexes**
   ```sql
   -- Drop legacy indexes
   DROP INDEX idx_workspace_group_name_legacy;
   DROP INDEX idx_workspace_user_user_legacy;
   ```

## Rollback Procedure

If issues arise, rollback to string-based system:

1. **Stop Application**
   ```bash
   # Stop all application instances
   systemctl stop maxlab-backend
   ```

2. **Execute Rollback**
   ```bash
   # Run rollback script
   python rollback_workspace_migration.py
   
   # Or use SQL directly
   psql -U $DB_USER -d $DB_NAME -f migrations/002_rollback_workspace_uuid.sql
   ```

3. **Deploy Previous Code Version**
   ```bash
   # Revert to pre-migration code
   git checkout pre-uuid-migration
   ```

## Monitoring Commands

### Check Migration Progress
```bash
# Continuous monitoring
python monitoring/migration_monitor.py

# Single status check
python monitoring/migration_monitor.py --once

# Custom interval (seconds)
python monitoring/migration_monitor.py --interval 10
```

### Health Metrics
- Migration completion percentage
- Duplicate UUID detection
- Orphaned permission detection
- Index usage statistics

## API Changes

### Group Management

**Before (String-based)**
```json
POST /api/v1/workspaces/{workspace_id}/groups/
{
  "group_name": "engineering",
  "permission_level": "write"
}
```

**After (UUID-based)**
```json
POST /api/v1/workspaces/{workspace_id}/groups/
{
  "group_id": "123e4567-e89b-12d3-a456-426614174000",
  "permission_level": "write"
}
```

### User Management

**Before (String-based)**
```json
POST /api/v1/workspaces/{workspace_id}/users/
{
  "user_id": "user@example.com",
  "permission_level": "read"
}
```

**After (UUID-based)**
```json
POST /api/v1/workspaces/{workspace_id}/users/
{
  "user_id": "456e7890-e89b-12d3-a456-426614174111",
  "permission_level": "read"
}
```

## Troubleshooting

### Common Issues

1. **UUID Mapping Failures**
   - Check external auth server connectivity
   - Verify admin token validity
   - Enable deterministic UUID generation if needed

2. **Duplicate UUIDs**
   - Run deduplication query
   - Check for timing issues in concurrent updates

3. **Performance Degradation**
   - Ensure UUID indexes are created
   - Analyze query plans
   - Consider partitioning for large datasets

### Debug Queries

```sql
-- Check unmapped groups
SELECT * FROM workspace_groups WHERE group_id_uuid IS NULL;

-- Find duplicate UUIDs
SELECT workspace_id, group_id_uuid, COUNT(*) 
FROM workspace_groups 
WHERE group_id_uuid IS NOT NULL
GROUP BY workspace_id, group_id_uuid 
HAVING COUNT(*) > 1;

-- Verify index usage
SELECT * FROM pg_stat_user_indexes 
WHERE tablename IN ('workspace_groups', 'workspace_users');
```

## Best Practices

1. **Always Backup First**: Never skip the backup step
2. **Test in Staging**: Run full migration in staging environment
3. **Monitor Actively**: Keep monitoring dashboard open during migration
4. **Gradual Rollout**: Consider migrating in batches for large datasets
5. **Communication**: Notify users about potential brief disruptions
6. **Documentation**: Keep detailed logs of migration process

## Support

For issues or questions:
1. Check migration logs in the backend directory
2. Review monitoring dashboard output
3. Consult the rollback procedure if needed
4. Contact the development team with specific error messages