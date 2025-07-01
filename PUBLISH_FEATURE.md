# Process Flow Publish Feature

## Overview
The Process Flow Editor now includes a publish feature that allows administrators to make process flows publicly accessible without authentication.

## Features

### 1. Publishing a Flow
- Click the "Publish" button in the Process Flow Editor (only visible after saving a flow)
- A dialog will appear with publish options
- Click "Publish Flow" to generate a unique public URL
- The URL can be copied and shared with anyone

### 2. Published Flow Features
- Public URL format: `http://localhost:3000/public/monitor/{token}`
- No authentication required to view
- Read-only access (no editing capabilities)
- Real-time equipment status updates (30-second refresh)
- Equipment detail viewing on node click

### 3. Unpublishing a Flow
- Click the green "Published" button on a published flow
- Click "Unpublish Flow" in the dialog
- The public URL will be immediately invalidated

### 4. Managing Flows
- The Load Flow dialog now shows publish status with a globe icon
- Delete functionality added (trash icon) for non-current flows
- Current flow cannot be deleted from the dialog

## Database Migration
The following columns have been added to `personal_test_process_flows`:
- `is_published` (BOOLEAN) - Whether the flow is published
- `published_at` (TIMESTAMP) - When the flow was published
- `publish_token` (VARCHAR) - Unique token for public access

## API Endpoints

### Publish/Unpublish (Admin Only)
- `PUT /api/v1/personal-test/process-flow/flows/{flow_id}/publish`
- `PUT /api/v1/personal-test/process-flow/flows/{flow_id}/unpublish`

### Public Access (No Authentication)
- `GET /api/v1/personal-test/process-flow/public/{publish_token}`
- `GET /api/v1/personal-test/process-flow/public/{publish_token}/status`

## Security
- Publish tokens are cryptographically secure (32 bytes, URL-safe)
- Public endpoints only expose flow visualization and equipment status
- No write operations allowed on public endpoints
- Unpublishing immediately invalidates the token

## Usage Instructions

1. **To Publish a Flow:**
   - Create and save a process flow in the editor
   - Click the "Publish" button
   - Copy the generated URL and share it

2. **To View a Published Flow:**
   - Open the public URL in any browser
   - No login required
   - View real-time equipment status
   - Click on equipment nodes for details

3. **To Unpublish a Flow:**
   - Open the flow in the editor
   - Click the green "Published" button
   - Click "Unpublish Flow"

## Implementation Files

### Backend
- `/backend/app/routers/personal_test_process_flow.py` - API endpoints
- `/backend/migrations/add_publish_columns.sql` - Database migration

### Frontend
- `/frontend/src/workspaces/personal_test/pages/ProcessFlowEditor.tsx` - Editor with publish button
- `/frontend/src/workspaces/personal_test/pages/PublicProcessFlowMonitor.tsx` - Public view page
- `/frontend/src/workspaces/personal_test/components/editor/PublishDialog.tsx` - Publish dialog
- `/frontend/src/workspaces/personal_test/hooks/useFlowEditor.ts` - Editor logic with publish functions
- `/frontend/src/workspaces/personal_test/hooks/usePublicFlowMonitor.ts` - Public monitoring logic
- `/frontend/src/App.tsx` - Public route configuration