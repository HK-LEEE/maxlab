# Instrument Node Implementation Plan

## Overview
This document outlines the implementation plan for adding instrument type equipment nodes to the Process Flow editor. These nodes will allow users to display measurement data without requiring a physical equipment association.

## 1. Component Structure for InstrumentNode

### 1.1 New Component: `InstrumentNode.tsx`
Location: `/frontend/src/workspaces/personal_test/components/common/InstrumentNode.tsx`

```typescript
interface InstrumentNodeData {
  label: string;
  instrumentType: 'gauge' | 'meter' | 'sensor' | 'analyzer' | 'transmitter';
  measurementCode?: string;
  measurementDesc?: string;
  displayFormat: 'value' | 'gauge' | 'trend' | 'digital';
  unit?: string;
  nodeSize?: '1' | '2' | '3';
  showSpecs?: boolean;
  showTrend?: boolean;
  refreshInterval?: number; // in seconds
  // Real-time data (populated from monitoring)
  currentValue?: number;
  spec_status?: 'IN_SPEC' | 'ABOVE_SPEC' | 'BELOW_SPEC';
  upper_spec_limit?: number;
  lower_spec_limit?: number;
  target_value?: number;
  trend?: number[]; // Last N values for trend display
}
```

### 1.2 Visual Component Features
- **Compact Design**: Smaller than equipment nodes, focused on data display
- **Multiple Display Formats**:
  - Simple value display with unit
  - Gauge visualization (radial or linear)
  - Trend line sparkline
  - Digital display with color coding
- **Real-time Updates**: Auto-refresh based on configured interval
- **Spec Indicators**: Visual alerts for out-of-spec conditions
- **Handle Positioning**: Single input/output handles for flow integration

### 1.3 Component Architecture
```typescript
export const InstrumentNode = memo((props: NodeProps<InstrumentNodeData>) => {
  // Core functionality similar to EquipmentNode but simplified
  // Focus on measurement display rather than equipment status
  // Support for direct measurement selection without equipment context
});
```

## 2. Sidebar UI Changes

### 2.1 New Sidebar Section: "Instruments"
Update `EditorSidebar.tsx` to include:

```typescript
// Add to expandedSections state
expandedSections: {
  equipment: true,
  instruments: true, // New section
  draw: true,
  // ...
}

// New instrument types array
const instrumentTypes = [
  { id: 'gauge', name: 'Gauge', icon: Gauge, description: 'Analog gauge display' },
  { id: 'meter', name: 'Digital Meter', icon: Monitor, description: 'Digital value display' },
  { id: 'sensor', name: 'Sensor', icon: Activity, description: 'Sensor reading display' },
  { id: 'analyzer', name: 'Analyzer', icon: BarChart3, description: 'Analysis display' },
  { id: 'transmitter', name: 'Transmitter', icon: Radio, description: 'Signal transmitter' },
];
```

### 2.2 Drag & Drop Implementation
```jsx
{/* Instruments Section */}
<div className="border-b">
  <button onClick={() => toggleSection('instruments')} className="...">
    <span className="text-sm font-medium">Instruments</span>
    {expandedSections.instruments ? <ChevronDown /> : <ChevronRight />}
  </button>
  
  {expandedSections.instruments && (
    <div className="px-2 pb-2 space-y-1">
      {instrumentTypes.map((instrument) => (
        <div
          key={instrument.id}
          draggable
          onDragStart={(e) => onDragStart(e, { 
            type: 'instrument', 
            data: { 
              instrumentType: instrument.id,
              label: instrument.name,
              displayFormat: getDefaultFormat(instrument.id)
            }
          })}
          className="flex items-center space-x-2 px-2 py-1.5 rounded cursor-move hover:bg-gray-100"
        >
          <instrument.icon size={18} className="text-blue-600" />
          <div className="flex-1">
            <div className="text-sm font-medium">{instrument.name}</div>
            <div className="text-xs text-gray-500">{instrument.description}</div>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

## 3. Data Flow for Measurement Selection

### 3.1 Instrument Configuration Dialog
Create `InstrumentConfigDialog.tsx`:

```typescript
interface InstrumentConfigDialogProps {
  node: Node;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
}

// Key features:
// 1. Measurement browser with search
// 2. No equipment selection required
// 3. Display format configuration
// 4. Refresh interval settings
// 5. Visual customization options
```

### 3.2 Measurement Selection Flow
1. **Browse All Measurements**: Load from `/api/v1/personal-test/process-flow/measurements`
2. **Search & Filter**: 
   - By measurement code
   - By description
   - By unit type
   - By current value range
3. **Preview**: Show current value and recent history
4. **Direct Selection**: No equipment context required

### 3.3 API Integration
```typescript
// Load measurements independently
const loadMeasurements = async (searchTerm?: string) => {
  const response = await apiClient.get('/api/v1/personal-test/process-flow/measurements', {
    params: {
      workspace_id: 'personal_test',
      search: searchTerm,
      limit: 100,
      // No equipment_code filter
    }
  });
  return response.data;
};
```

## 4. Integration with Existing Monitoring System

### 4.1 Update `useFlowMonitor` Hook
Add support for instrument nodes:

```typescript
// In useFlowMonitor.ts
const updateInstrumentNodes = (nodes: Node[], measurements: Map<string, MeasurementData>) => {
  return nodes.map(node => {
    if (node.type === 'instrument' && node.data.measurementCode) {
      const measurement = measurements.get(node.data.measurementCode);
      if (measurement) {
        return {
          ...node,
          data: {
            ...node.data,
            currentValue: measurement.measurement_value,
            spec_status: getSpecStatus(measurement),
            upper_spec_limit: measurement.upper_spec_limit,
            lower_spec_limit: measurement.lower_spec_limit,
            target_value: measurement.target_value,
            // Update trend data
            trend: updateTrendData(node.data.trend, measurement.measurement_value)
          }
        };
      }
    }
    return node;
  });
};
```

### 4.2 Real-time Updates
- Subscribe to measurement updates for configured measurement codes
- Update instrument nodes independently of equipment nodes
- Support configurable refresh intervals per instrument

### 4.3 WebSocket Integration
```typescript
// Subscribe to specific measurements
const subscribedMeasurements = nodes
  .filter(n => n.type === 'instrument' && n.data.measurementCode)
  .map(n => n.data.measurementCode);

// Handle updates
socket.on('measurement_update', (data) => {
  if (subscribedMeasurements.includes(data.measurement_code)) {
    updateInstrumentNode(data);
  }
});
```

## 5. Visual Design Specifications

### 5.1 Node Dimensions
```typescript
const getInstrumentNodeSize = (nodeSize: '1' | '2' | '3', displayFormat: string) => {
  const baseWidth = displayFormat === 'gauge' ? 150 : 120;
  const heights = {
    '1': 80,  // Compact - value only
    '2': 120, // Medium - value + specs
    '3': 160  // Large - value + specs + trend
  };
  return { width: baseWidth, height: heights[nodeSize] };
};
```

### 5.2 Handle Positioning
```jsx
{/* Input Handle - Top Center */}
<Handle
  type="target"
  position={Position.Top}
  style={{
    top: -8,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 8,
    height: 8,
    background: '#3b82f6',
    border: '2px solid white',
  }}
/>

{/* Output Handle - Bottom Center */}
<Handle
  type="source"
  position={Position.Bottom}
  style={{
    bottom: -8,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 8,
    height: 8,
    background: '#3b82f6',
    border: '2px solid white',
  }}
/>
```

### 5.3 Visual Variants

#### 5.3.1 Value Display
```jsx
<div className="text-center p-2">
  <div className="text-xs text-gray-500">{data.measurementDesc}</div>
  <div className={`text-2xl font-bold ${getValueColor(data.spec_status)}`}>
    {data.currentValue?.toFixed(2)} {data.unit}
  </div>
  {data.showSpecs && <SpecIndicator {...specProps} />}
</div>
```

#### 5.3.2 Gauge Display
```jsx
<RadialGauge
  value={data.currentValue}
  min={data.lower_spec_limit || 0}
  max={data.upper_spec_limit || 100}
  target={data.target_value}
  size={nodeSize}
  colorScheme={getGaugeColors(data.spec_status)}
/>
```

#### 5.3.3 Trend Display
```jsx
<MiniTrendLine
  data={data.trend || []}
  width={nodeWidth - 20}
  height={40}
  showSpecs={data.showSpecs}
  upperLimit={data.upper_spec_limit}
  lowerLimit={data.lower_spec_limit}
/>
```

### 5.4 Color Coding
```typescript
const instrumentColors = {
  normal: {
    background: '#f0f9ff',
    border: '#3b82f6',
    text: '#1e40af'
  },
  warning: {
    background: '#fef3c7',
    border: '#f59e0b',
    text: '#92400e'
  },
  error: {
    background: '#fee2e2',
    border: '#ef4444',
    text: '#991b1b'
  }
};
```

## 6. Implementation Steps

### Phase 1: Core Components (Week 1)
1. Create `InstrumentNode.tsx` component
2. Add instrument types to `nodeTypes` in ProcessFlowEditor
3. Implement basic value display format
4. Add drag & drop support in sidebar

### Phase 2: Configuration & Data (Week 2)
1. Create `InstrumentConfigDialog.tsx`
2. Implement measurement selection without equipment
3. Add display format options
4. Integrate with monitoring data flow

### Phase 3: Visual Enhancements (Week 3)
1. Implement gauge visualization
2. Add trend line display
3. Create digital display format
4. Add animations and transitions

### Phase 4: Integration & Testing (Week 4)
1. Update `useFlowMonitor` for instrument support
2. Add WebSocket subscriptions
3. Implement auto-refresh logic
4. Comprehensive testing

## 7. File Structure
```
frontend/src/workspaces/personal_test/
├── components/
│   ├── common/
│   │   ├── InstrumentNode.tsx          # New instrument node component
│   │   └── NodeErrorBoundary.tsx       # Update with InstrumentNodeErrorBoundary
│   ├── editor/
│   │   ├── EditorSidebar.tsx          # Add instruments section
│   │   └── InstrumentConfigDialog.tsx  # New configuration dialog
│   └── visualizations/
│       ├── RadialGauge.tsx            # New gauge component
│       └── MiniTrendLine.tsx          # New trend component
├── hooks/
│   └── useFlowMonitor.ts              # Update for instrument nodes
└── pages/
    └── ProcessFlowEditor.tsx          # Register instrument node type
```

## 8. Testing Considerations

### 8.1 Unit Tests
- InstrumentNode rendering with different formats
- Measurement selection without equipment
- Real-time data updates
- Spec status calculations

### 8.2 Integration Tests
- Drag & drop from sidebar
- Save/load with instrument nodes
- Monitor mode functionality
- WebSocket updates

### 8.3 Performance Tests
- Multiple instruments updating simultaneously
- Large trend data arrays
- Refresh interval optimization
- Memory usage with animations

## 9. Future Enhancements
1. **Calculated Values**: Support for derived measurements
2. **Alarm Configuration**: Set custom thresholds and alerts
3. **Historical Data**: Click to view detailed history
4. **Export Options**: Export instrument readings
5. **Mobile Optimization**: Responsive design for tablets
6. **Custom Formulas**: User-defined calculations
7. **Group Instruments**: Instrument panels/dashboards