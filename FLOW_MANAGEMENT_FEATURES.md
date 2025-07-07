# Process Flow Management Features

## Implemented Features

### 1. Save Functionality
- **Save Button**: Saves the current flow state
- **Save as Version**: Creates a new version of the current flow
- **Auto-save**: Automatically saves every 5 minutes with status indicator

### 2. Load Functionality
- **Integrated Load Dialog** with three tabs:
  - **Saved Flows Tab**: Grid view of all saved flows with metadata
    - Shows flow name, creation date, update time
    - Indicates published status and current version
    - Click to load immediately
  
  - **Versions Tab**: Version management interface
    - Left panel shows flow list
    - Right panel shows version history
    - Features: Restore version, publish version, load specific version
    - Delete flow functionality (with confirmation)
  
  - **Import File Tab**: Import flows from JSON files
    - Drag & drop or click to select
    - Preview shows flow name, node count, edge count
    - Validates JSON format before import

### 3. Export Functionality
- **Export Button**: Downloads flow as JSON file
- Filename format: `FlowName_YYYY-MM-DD.json`
- Includes flow data, version number, and export timestamp

### 4. Version Management
- **Version History**: Track all changes with metadata
- **Version Numbering**: Automatic increment
- **Version Metadata**: Name, description, creator, timestamp
- **Version Actions**: Restore, publish, load
- **Graceful Degradation**: Works without database migration

### 5. Auto-save Feature
- **Interval**: Every 5 minutes
- **Status Indicator**: Shows last auto-save time
- **Silent Operation**: No toast notifications for auto-save
- **Smart Trigger**: Only when flow has been loaded/created

## UI Changes

### Editor Toolbar
1. **Save** - Manual save with loading indicator
2. **Load** - Opens integrated load dialog
3. **Save as Version** - Creates new version (only shows when flow exists)
4. **Export** - Download as JSON
5. **Publish** - Publish/unpublish flow

### Status Bar
- Auto-save indicator: "Auto-saved HH:MM:SS"
- Error messages display inline

## Technical Implementation

### Frontend Components
- `LoadFlowDialog.tsx` - Integrated tabbed dialog
- `useFlowEditor.ts` - Hook with auto-save logic
- `ProcessFlowEditor.tsx` - Updated UI with new features

### API Endpoints Used
- `GET /flows` - List all flows
- `POST /flows` - Create new flow
- `PUT /flows/{id}` - Update existing flow
- `DELETE /flows/{id}` - Delete flow
- `GET /flows/{id}/versions` - List versions
- `POST /flows/{id}/versions` - Create version
- `PUT /flows/{id}/versions/{vid}/restore` - Restore version
- `PUT /flows/{id}/versions/{vid}/publish` - Publish version

## Usage Notes

1. **Auto-save**: Runs in background, doesn't interfere with manual saves
2. **Import**: Supports flows exported from this system or compatible JSON format
3. **Version Management**: Optional - system works without version tables
4. **Export Format**: Standard JSON, can be edited externally

## Future Enhancements (Not Implemented)
- Export as PNG/SVG image
- Undo/Redo functionality  
- Collaborative editing indicators
- Version diff viewer
- Bulk operations (export/import multiple flows)