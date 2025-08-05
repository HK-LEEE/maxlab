# Process Flow Editor - Data Source Selection Implementation

## Overview
This implementation provides automatic selection of defined data sources instead of defaulting to 'default' in the Process Flow Editor.

## Key Components

### 1. `useDataSources` Hook (`/src/hooks/useDataSources.js`)
- Custom React hook for managing data source state
- Automatically fetches and selects the first active data source
- Handles loading, error states, and data source refresh
- Returns null for workspace default instead of 'default' string

### 2. `DataSourceSelector` Component (`/src/components/DataSourceSelector.jsx`)
- Reusable dropdown component for data source selection
- Shows "Workspace Default" as an option (value: null)
- Displays data source type and status
- Includes loading and error states
- Supports tooltips and custom styling

### 3. `ProcessFlowEditor` Component (`/src/components/ProcessFlowEditor.jsx`)
- Updated to use the new data source management system
- Automatically selects first defined data source on load
- Sends null instead of 'default' when no specific data source is selected
- Shows current data source selection status

### 4. Error Boundary (`/src/components/ProcessFlowEditorWithErrorBoundary.jsx`)
- Wraps the Process Flow Editor for error handling
- Provides retry functionality
- Shows user-friendly error messages

### 5. Utility Functions (`/src/utils/dataSourceUtils.js`)
- Helper functions for data source formatting and validation
- Sorting logic (active sources first)
- Error handling utilities

## Usage Example

```jsx
import ProcessFlowEditor from './components/ProcessFlowEditor';
// Or with error boundary:
import ProcessFlowEditorWithErrorBoundary from './components/ProcessFlowEditorWithErrorBoundary';

function MyApp() {
  return (
    <ProcessFlowEditorWithErrorBoundary
      workspaceId="personaltest"
      flowId={existingFlowId} // Optional, for editing
      onSave={(savedFlow) => {
        console.log('Flow saved:', savedFlow);
      }}
      onPublish={(publishResult) => {
        console.log('Flow published:', publishResult);
      }}
    />
  );
}
```

## Key Features

1. **Automatic Selection**: First active data source is selected by default
2. **Null for Default**: Sends null instead of 'default' string for workspace default
3. **Loading States**: Shows spinner while fetching data sources
4. **Error Handling**: Graceful error handling with user-friendly messages
5. **Responsive UI**: Works well on different screen sizes

## API Integration

### Endpoints Used:
1. `GET /api/v1/personal-test/process-flow/data-sources?workspace_id={id}`
   - Fetches available data sources
   
2. `GET /api/v1/personal-test/process-flow/default-data-source?workspace_id={id}`
   - Optional endpoint for default data source info

3. `POST/PUT /api/v1/personal-test/process-flow/flows`
   - Creates/updates flow with selected data source

## Migration Guide

### Before:
```javascript
// Old implementation
const [dataSource, setDataSource] = useState('default');

// Sending to API
{
  data_source_id: 'default'  // Always 'default'
}
```

### After:
```javascript
// New implementation
const { selectedDataSource, setSelectedDataSource } = useDataSources(workspaceId);

// Sending to API
{
  data_source_id: selectedDataSource  // null or actual UUID
}
```

## Configuration

No additional configuration required. The components work with existing authentication tokens stored in localStorage.

## Testing

1. **No Data Sources**: Should show "Workspace Default" and send null
2. **One Data Source**: Should auto-select it
3. **Multiple Data Sources**: Should select first active one
4. **Error Cases**: Should show error message and fallback to null

## Notes

- Always sends null for workspace default, never 'default' string
- Active data sources are prioritized over inactive ones
- Component handles authentication tokens automatically
- Error boundaries prevent entire app crashes