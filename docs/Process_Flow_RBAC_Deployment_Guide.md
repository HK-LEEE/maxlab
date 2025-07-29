# Process Flow RBAC Deployment Guide

## Prerequisites

1. PostgreSQL database access with migration privileges
2. Backend server with Python 3.8+
3. Frontend build environment with Node.js 16+
4. Admin access to the MaxLab platform

## Backend Deployment Steps

### 1. Database Migration

First, backup your database before running migrations:

```bash
# Backup current database
pg_dump -h your_host -U your_user -d max_lab > backup_before_rbac_$(date +%Y%m%d_%H%M%S).sql
```

Run the scope migration:

```bash
cd backend

# Check current database state
python verify_scope_implementation.py

# Run migration if needed
python run_scope_migration.py
```

Expected output:
```
🚀 Process Flow Scope Columns Migration Tool
==================================================
✅ All scope columns already exist! No migration needed.
```

### 2. Update Backend Code

Deploy the following updated files:

```bash
# Core permission logic
backend/app/core/flow_permissions.py

# Updated API router
backend/app/routers/personal_test_process_flow.py

# Migration scripts (for reference)
backend/migrations/add_scope_columns.sql
backend/run_scope_migration.py
backend/verify_scope_implementation.py
```

### 3. Restart Backend Services

```bash
# If using systemd
sudo systemctl restart maxlab-backend

# If using Docker
docker-compose restart backend

# If running directly
# Kill existing process and restart
pkill -f "uvicorn app.main:app"
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

### 4. Verify Backend Deployment

Test the API endpoints:

```bash
# Check health
curl http://localhost:8010/health

# Test flow list with scope (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8010/api/v1/personal-test/process-flow/flows?workspace_id=YOUR_WORKSPACE_ID&scope=all"
```

## Frontend Deployment Steps

### 1. Update Frontend Code

Deploy the following updated files:

```bash
# Components
frontend/src/workspaces/personal_test/components/common/ScopeSelectionDialog.tsx
frontend/src/workspaces/personal_test/components/common/FlowScopeIndicator.tsx

# Updated components
frontend/src/workspaces/personal_test/components/editor/LoadFlowDialog.tsx
frontend/src/workspaces/personal_test/pages/ProcessFlowEditor.tsx

# Hooks
frontend/src/workspaces/personal_test/hooks/useFlowEditor.ts

# Types
frontend/src/types/processFlow.ts
```

### 2. Build Frontend

```bash
cd frontend

# Install dependencies if needed
npm install

# Build production bundle
npm run build

# Output will be in dist/ directory
```

### 3. Deploy Frontend Assets

```bash
# Copy built assets to web server
cp -r dist/* /var/www/maxlab/

# Or if using S3/CDN
aws s3 sync dist/ s3://your-bucket/maxlab/ --delete

# Update nginx/apache configuration if needed
sudo nginx -s reload
```

### 4. Clear Browser Cache

Instruct users to clear browser cache or perform hard refresh:
- Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Firefox: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
- Safari: Cmd+Option+R

## Post-Deployment Verification

### 1. Functional Testing

Test the following scenarios:

1. **Create New Flow with Workspace Scope**
   - Create new flow
   - Save and select "Workspace용"
   - Verify other users in workspace can see it

2. **Create New Flow with User Scope**
   - Create new flow
   - Save and select "User용"
   - Verify only creator can see it

3. **Admin Access**
   - Login as admin
   - Verify all flows are visible
   - Test editing other users' flows

4. **Load Flow Dialog**
   - Check scope badges appear correctly
   - Test filtering by scope
   - Verify correct flows appear for each filter

### 2. Performance Testing

Monitor the following metrics:

```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT * FROM personal_test_process_flows
WHERE workspace_id = 'YOUR_WORKSPACE_ID'
  AND (scope_type = 'WORKSPACE' 
    OR created_by = 'USER_ID'
    OR shared_with_workspace = TRUE);

-- Check query performance
SELECT 
  round(total_time::numeric, 2) AS total_time,
  calls,
  round(mean_time::numeric, 2) AS mean_time,
  query
FROM pg_stat_statements
WHERE query LIKE '%personal_test_process_flows%'
ORDER BY mean_time DESC
LIMIT 10;
```

### 3. Security Audit

Verify permission checks:

```python
# Run verification script
cd backend
python verify_scope_implementation.py
```

Check logs for any permission errors:
```bash
# Check backend logs
tail -f /var/log/maxlab/backend.log | grep -E "403|permission|denied"
```

## Rollback Procedure

If issues are encountered, follow these rollback steps:

### 1. Database Rollback

```sql
-- Remove scope columns (CAUTION: This will lose scope data)
ALTER TABLE personal_test_process_flows 
DROP COLUMN IF EXISTS scope_type,
DROP COLUMN IF EXISTS visibility_scope,
DROP COLUMN IF EXISTS shared_with_workspace;

-- Drop constraints
ALTER TABLE personal_test_process_flows
DROP CONSTRAINT IF EXISTS check_scope_type,
DROP CONSTRAINT IF EXISTS check_visibility_scope;

-- Drop indexes
DROP INDEX IF EXISTS idx_flows_scope_workspace;
DROP INDEX IF EXISTS idx_flows_scope_user;
DROP INDEX IF EXISTS idx_flows_shared;
DROP INDEX IF EXISTS idx_flows_scope_access;

-- Drop sync function and trigger
DROP TRIGGER IF EXISTS trigger_sync_flow_scope ON personal_test_process_flows;
DROP FUNCTION IF EXISTS sync_flow_scope();
```

### 2. Code Rollback

```bash
# Restore previous backend code
git checkout HEAD~1 backend/app/routers/personal_test_process_flow.py
git checkout HEAD~1 backend/app/core/flow_permissions.py

# Restore previous frontend code
git checkout HEAD~1 frontend/src/workspaces/personal_test/

# Rebuild and redeploy
```

## Monitoring

### Key Metrics to Monitor

1. **API Response Times**
   - `/api/v1/personal-test/process-flow/flows` endpoint
   - Monitor for performance degradation

2. **Error Rates**
   - 403 Forbidden errors (permission issues)
   - 500 Internal Server errors

3. **Database Performance**
   - Query execution time
   - Index usage statistics
   - Connection pool usage

### Alerting

Set up alerts for:
- Spike in 403 errors (>10 per minute)
- API response time >1 second
- Database query time >500ms
- Failed permission checks in logs

## Support and Troubleshooting

### Common Deployment Issues

1. **Migration Fails**
   - Check database permissions
   - Ensure no active connections during migration
   - Verify PostgreSQL version compatibility (requires 12+)

2. **Frontend Not Updating**
   - Clear CDN cache if using CDN
   - Check browser developer tools for cached assets
   - Verify build output includes latest changes

3. **Permission Errors**
   - Verify JWT tokens are properly configured
   - Check user roles in database
   - Ensure workspace membership is correct

### Contact Information

For deployment support:
- Technical Lead: [Your contact]
- Database Admin: [DBA contact]
- DevOps Team: [DevOps contact]

### Documentation

- Implementation Guide: `/docs/Process_Flow_RBAC_Implementation_Guide.md`
- API Documentation: Update Swagger/OpenAPI specs
- User Guide: Update user-facing documentation

## Checklist

- [ ] Database backed up
- [ ] Migration script tested in staging
- [ ] Backend code deployed
- [ ] Frontend code built and deployed
- [ ] Cache cleared (CDN and browsers)
- [ ] Functional tests passed
- [ ] Performance benchmarks acceptable
- [ ] Security audit completed
- [ ] Monitoring alerts configured
- [ ] Documentation updated
- [ ] Users notified of changes