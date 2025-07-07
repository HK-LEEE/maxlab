# Process Flow Version Management

## Overview
The Process Flow Editor now supports version management, allowing you to:
- Save multiple versions of your process flows
- View version history with metadata
- Restore previous versions
- Publish specific versions
- Track changes over time

## Setup

### Quick Setup (Minimal - Just enable basic features)
If you just want to get the system working without full version management:

```bash
cd backend
psql -U postgres -d platform_integration -c "ALTER TABLE personal_test_process_flows ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;"
```

### Full Setup (Complete version management)
For full version management capabilities:

```bash
cd backend
python run_version_migration.py
```

Or manually:
```bash
psql -U postgres -d platform_integration < migrations/add_version_management.sql
```

## Features

### 1. Version Dialog
- Click "Versions" button instead of "Load" in the editor
- Left panel shows all flows
- Right panel shows version history for selected flow
- Published versions are marked with a green badge

### 2. Save as Version
- Click "Save as Version" to create a new version
- Current work is saved as a new version
- Version numbers are automatically incremented

### 3. Publish Specific Version
- Any version can be published independently
- Published versions get a unique URL
- Only one version can be published at a time

### 4. Restore Version
- Click the restore button on any version
- The flow will be loaded with that version's data
- You can then save it as the current version

## Without Migration
The system will still work without the database migration:
- Shows existing flows as "Version 1"
- Version features will show appropriate error messages
- Basic flow loading and saving continues to work

## Troubleshooting

### "Version management not available" error
Run the migration script:
```bash
python run_version_migration.py
```

### Cannot see versions
Check if the migration has been applied:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name='personal_test_process_flows' AND column_name='current_version';
```

### Edge overlapping issues
This has been fixed by switching to `smoothstep` edge type which automatically handles routing.

## Technical Details

### Database Schema
- `personal_test_process_flow_versions` - Stores all versions
- `current_version` column in main table - Tracks active version
- Functions for version number management
- Views for published flows

### API Endpoints
- `GET /flows/{flow_id}/versions` - List versions
- `POST /flows/{flow_id}/versions` - Create version
- `PUT /flows/{flow_id}/versions/{version_id}/restore` - Restore version
- `PUT /flows/{flow_id}/versions/{version_id}/publish` - Publish version