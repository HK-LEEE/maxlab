# Process Monitoring Frontend Implementation Guide

## Table of Contents
1. [Technology Stack & Dependencies](#technology-stack--dependencies)
2. [Project Architecture Overview](#project-architecture-overview)
3. [Component Architecture](#component-architecture)
4. [State Management Strategy](#state-management-strategy)
5. [ReactFlow Implementation Details](#reactflow-implementation-details)
6. [Data Flow & API Integration](#data-flow--api-integration)
7. [Routing Structure](#routing-structure)
8. [Theme Integration Implementation](#theme-integration-implementation)
9. [Performance Optimization](#performance-optimization)
10. [Testing Strategy](#testing-strategy)
11. [Deployment Considerations](#deployment-considerations)
12. [Advanced Features Implementation](#advanced-features-implementation)

---

## Technology Stack & Dependencies

### Core Technologies
```json
{
  "react": "^19.1.0",
  "react-dom": "^19.1.0",
  "typescript": "~5.8.3",
  "vite": "^7.0.0",
  "tailwindcss": "^3.4.17"
}
```

### Process Flow Specific Dependencies
```json
{
  "reactflow": "^11.11.4",
  "zustand": "^5.0.5",
  "@tanstack/react-query": "^5.81.2",
  "axios": "^1.10.0",
  "echarts": "^5.6.0",
  "echarts-for-react": "^3.0.2"
}
```

### UI & Utilities
```json
{
  "lucide-react": "^0.523.0",
  "react-hot-toast": "^2.5.2",
  "react-router-dom": "^7.6.2",
  "uuid": "^11.1.0",
  "@types/uuid": "^10.0.0"
}
```

### Development Dependencies
```json
{
  "@testing-library/react": "^16.3.0",
  "@testing-library/jest-dom": "^6.1.5",
  "@testing-library/user-event": "^14.5.1",
  "jest": "^29.7.0",
  "jest-environment-jsdom": "^29.7.0"
}
```

---

## Project Architecture Overview

### Directory Structure
```
src/
├── components/
│   ├── common/           # Shared UI components
│   └── monitor/          # Monitoring-specific components
├── workspaces/
│   └── personal_test/
│       ├── components/
│       │   ├── common/   # Flow nodes and shared components
│       │   ├── editor/   # Editor-specific components
│       │   ├── monitor/  # Monitoring-specific components
│       │   └── publish/  # Publishing components
│       ├── hooks/        # Custom React hooks
│       ├── pages/        # Main page components
│       ├── styles/       # CSS and animations
│       └── utils/        # Utility functions
├── api/                  # API client and services
├── stores/              # Zustand state stores
├── types/               # TypeScript definitions
└── utils/               # Global utility functions
```

### Key Architectural Principles

1. **Workspace-based Organization**: Each workspace has isolated components and logic
2. **Component Composition**: Reusable components with clear responsibilities
3. **Hook-based Logic**: Business logic encapsulated in custom hooks
4. **Type Safety**: Comprehensive TypeScript interfaces and types
5. **Error Boundaries**: Comprehensive error handling at multiple levels

---

## Component Architecture

### Core Components Hierarchy

```
ProcessFlowEditor (Editor Page)
├── Layout (Common wrapper)
├── ReactFlowProvider
└── ProcessFlowEditorContent
    ├── ReactFlowErrorBoundary
    ├── ReactFlow (Core canvas)
    │   ├── Background
    │   ├── Controls
    │   └── MiniMap
    ├── EditorSidebar
    ├── NodeConfigDialog
    ├── DataSourceDialog
    └── Various Modals

ProcessFlowMonitor (Monitor Page)
├── Layout (Common wrapper)
├── MonitorHeader
├── StatusSummary
├── ReactFlowProvider
└── FlowCanvas
    ├── ReactFlow (Core canvas)
    ├── EquipmentSidebar
    └── EquipmentDetailModal
```

### Node Component Architecture

#### Base Node Interface
```typescript
interface BaseNodeData {
  label: string;
  nodeSize: '1' | '2' | '3';
  color?: string;
  status?: 'ACTIVE' | 'STOP' | 'ALARM' | 'MAINTENANCE';
}

interface NodeProps {
  id: string;
  data: BaseNodeData;
  selected?: boolean;
  dragging?: boolean;
}
```

#### Equipment Node Implementation
```typescript
// src/workspaces/personal_test/components/common/EquipmentNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { CustomNodeResizer } from './CustomNodeResizer';

interface EquipmentNodeData extends BaseNodeData {
  equipmentType: string;
  equipmentCode: string;
  equipmentName: string;
  displayMeasurements: string[];
  icon?: string;
}

export const EquipmentNode = memo<NodeProps<EquipmentNodeData>>(({ 
  id, 
  data, 
  selected 
}) => {
  const nodeHeight = getNodeHeight(data.nodeSize);
  
  return (
    <div 
      className={`equipment-node relative bg-white border rounded-lg shadow-sm ${
        selected ? 'ring-2 ring-blue-500' : ''
      }`}
      style={{ 
        width: 200, 
        height: nodeHeight,
        backgroundColor: data.color || '#ffffff'
      }}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3" 
      />
      
      {/* Node Header */}
      <div className="px-3 py-2 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {data.equipmentName || data.label}
          </span>
          <StatusIndicator status={data.status} />
        </div>
      </div>
      
      {/* Measurements Display */}
      <div className="px-3 py-2 flex-1">
        <MeasurementDisplay 
          measurements={data.displayMeasurements || []}
          nodeSize={data.nodeSize}
        />
      </div>
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3" 
      />
      
      {selected && (
        <CustomNodeResizer 
          minWidth={200}
          minHeight={nodeHeight}
        />
      )}
    </div>
  );
});
```

#### Instrument Node Implementation
```typescript
// src/workspaces/personal_test/components/common/InstrumentNode.tsx
interface InstrumentNodeData extends BaseNodeData {
  instrumentType: string;
  instrumentName: string;
  measurements: any[];
  displayMeasurements: string[];
}

export const InstrumentNode = memo<NodeProps<InstrumentNodeData>>(({
  id,
  data,
  selected
}) => {
  return (
    <div className={`instrument-node ${selected ? 'selected' : ''}`}>
      {/* Similar structure to EquipmentNode but with instrument-specific styling */}
      <div className="instrument-header">
        <InstrumentIcon type={data.instrumentType} />
        <span>{data.instrumentName}</span>
      </div>
      <div className="instrument-measurements">
        {data.displayMeasurements.map(measurement => (
          <MeasurementValue 
            key={measurement} 
            measurement={measurement}
          />
        ))}
      </div>
    </div>
  );
});
```

#### Group Node Implementation
```typescript
// src/workspaces/personal_test/components/common/GroupNode.tsx
interface GroupNodeData extends BaseNodeData {
  backgroundColor: string;
  backgroundOpacity: number;
  titleSize: number;
  titleColor: string;
  titlePosition: 'top' | 'center' | 'bottom';
  borderStyle: 'solid' | 'dashed' | 'dotted';
  zIndex: number;
}

export const GroupNode = memo<NodeProps<GroupNodeData>>(({ data, selected }) => {
  return (
    <div 
      className="group-node"
      style={{
        backgroundColor: `${data.backgroundColor}${Math.round(data.backgroundOpacity * 255).toString(16).padStart(2, '0')}`,
        borderStyle: data.borderStyle,
        zIndex: data.zIndex
      }}
    >
      <div 
        className={`group-title position-${data.titlePosition}`}
        style={{ 
          fontSize: data.titleSize,
          color: data.titleColor 
        }}
      >
        {data.label}
      </div>
    </div>
  );
});
```

### Custom Edge Implementation
```typescript
// src/workspaces/personal_test/components/common/CustomEdgeWithLabel.tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow';

interface CustomEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  data?: {
    type: string;
    showStatus: boolean;
    label?: string;
  };
}

export const CustomEdgeWithLabel = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data
}: CustomEdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const edgeStyle = getEdgeStyle(data?.type, data?.showStatus);

  return (
    <>
      <BaseEdge path={edgePath} style={edgeStyle} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
            className="edge-label bg-white px-2 py-1 rounded shadow-sm text-xs"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
```

---

## State Management Strategy

### Zustand Store Architecture

#### Flow Editor Store
```typescript
// src/workspaces/personal_test/stores/flowEditorStore.ts
import { create } from 'zustand';
import { Node, Edge } from 'reactflow';

interface FlowEditorState {
  // Flow data
  nodes: Node[];
  edges: Edge[];
  currentFlow: ProcessFlow | null;
  flowName: string;
  
  // UI state
  selectedDataSourceId: string | null;
  edgeType: string;
  nodeSize: '1' | '2' | '3';
  autoScroll: boolean;
  
  // Loading states
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setCurrentFlow: (flow: ProcessFlow | null) => void;
  setFlowName: (name: string) => void;
  setSelectedDataSourceId: (id: string | null) => void;
  saveFlow: () => Promise<void>;
  loadFlow: (flowId: string) => Promise<void>;
  resetState: () => void;
}

export const useFlowEditorStore = create<FlowEditorState>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  currentFlow: null,
  flowName: 'New Process Flow',
  selectedDataSourceId: null,
  edgeType: 'step',
  nodeSize: '1',
  autoScroll: false,
  isSaving: false,
  isLoading: false,
  error: null,
  
  // Actions
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setCurrentFlow: (flow) => set({ currentFlow: flow }),
  setFlowName: (name) => set({ flowName: name }),
  setSelectedDataSourceId: (id) => set({ selectedDataSourceId: id }),
  
  saveFlow: async () => {
    const { nodes, edges, flowName, selectedDataSourceId, currentFlow } = get();
    set({ isSaving: true, error: null });
    
    try {
      const flowData = { nodes, edges, nodeSize: get().nodeSize };
      const response = await apiClient.post('/v1/personal-test/process-flow/flows', {
        name: flowName,
        flow_data: flowData,
        data_source_id: selectedDataSourceId
      });
      
      set({ currentFlow: response.data, isSaving: false });
    } catch (error) {
      set({ error: 'Failed to save flow', isSaving: false });
    }
  },
  
  loadFlow: async (flowId: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await apiClient.get(`/v1/personal-test/process-flow/flows/${flowId}`);
      const flow = response.data;
      
      set({
        currentFlow: flow,
        flowName: flow.name,
        nodes: flow.flow_data.nodes,
        edges: flow.flow_data.edges,
        selectedDataSourceId: flow.data_source_id,
        nodeSize: flow.flow_data.nodeSize || '1',
        isLoading: false
      });
    } catch (error) {
      set({ error: 'Failed to load flow', isLoading: false });
    }
  },
  
  resetState: () => set({
    nodes: [],
    edges: [],
    currentFlow: null,
    flowName: 'New Process Flow',
    selectedDataSourceId: null,
    error: null
  })
}));
```

#### Flow Monitor Store
```typescript
// src/workspaces/personal_test/stores/flowMonitorStore.ts
interface FlowMonitorState {
  // Flow data
  selectedFlow: ProcessFlow | null;
  nodes: Node[];
  edges: Edge[];
  
  // Real-time data
  equipmentStatuses: EquipmentStatus[];
  measurements: Measurement[];
  lastUpdate: Date | null;
  
  // Settings
  autoRefresh: boolean;
  refreshInterval: number;
  autoScroll: boolean;
  alarmCheck: boolean;
  
  // UI state
  isSidebarOpen: boolean;
  isFullscreen: boolean;
  statusCounts: StatusCounts;
  
  // Actions
  setSelectedFlow: (flow: ProcessFlow) => void;
  loadFlowData: () => Promise<void>;
  refreshData: () => Promise<void>;
  toggleAutoRefresh: () => void;
  setRefreshInterval: (interval: number) => void;
}
```

### Custom Hooks for State Management

#### useFlowEditor Hook
```typescript
// src/workspaces/personal_test/hooks/useFlowEditor.ts
export const useFlowEditor = (workspaceId: string) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [currentFlow, setCurrentFlow] = useState<ProcessFlow | null>(null);
  const [flowName, setFlowName] = useState('New Process Flow');
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | null>(null);
  
  // Auto-save functionality
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasSignificantChanges()) {
        saveFlowBackup(workspaceId, currentFlow?.id || null, {
          nodes,
          edges,
          flowName,
          dataSourceId: selectedDataSourceId,
          nodeSize
        });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [nodes, edges, flowName, selectedDataSourceId]);
  
  const saveFlow = useCallback(async (
    createVersion = false,
    scopeData?: ScopeData,
    customName?: string
  ) => {
    setIsSaving(true);
    try {
      const flowData = {
        name: customName || flowName,
        flow_data: { nodes, edges, nodeSize },
        data_source_id: selectedDataSourceId,
        ...scopeData
      };
      
      const response = currentFlow 
        ? await apiClient.put(`/v1/personal-test/process-flow/flows/${currentFlow.id}`, flowData)
        : await apiClient.post('/v1/personal-test/process-flow/flows', flowData);
      
      const savedFlow = response.data;
      setCurrentFlow(savedFlow);
      setLastAutoSaveTime(new Date());
      
      // Delete backup after successful save
      deleteFlowBackup(workspaceId, currentFlow?.id || null);
      
      return savedFlow;
    } catch (error) {
      console.error('Save failed:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, flowName, selectedDataSourceId, currentFlow, nodeSize]);
  
  return {
    nodes,
    edges,
    currentFlow,
    flowName,
    selectedDataSourceId,
    isSaving,
    onNodesChange,
    onEdgesChange,
    setNodes,
    setEdges,
    setFlowName,
    setSelectedDataSourceId,
    saveFlow,
    loadFlow,
    // ... other methods
  };
};
```

#### useFlowMonitor Hook
```typescript
// src/workspaces/personal_test/hooks/useFlowMonitor.ts
export const useFlowMonitor = (workspaceId: string) => {
  const [selectedFlow, setSelectedFlow] = useState<ProcessFlow | null>(null);
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  
  // Real-time data fetching
  useEffect(() => {
    if (!autoRefresh || !selectedFlow) return;
    
    const interval = setInterval(async () => {
      try {
        const [statusResponse, measurementsResponse] = await Promise.all([
          apiClient.get(`/v1/personal-test/monitoring/equipment-status`),
          apiClient.get(`/v1/personal-test/monitoring/measurements`)
        ]);
        
        setEquipmentStatuses(statusResponse.data);
        setMeasurements(measurementsResponse.data);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to refresh monitoring data:', error);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, selectedFlow]);
  
  return {
    selectedFlow,
    equipmentStatuses,
    measurements,
    autoRefresh,
    refreshInterval,
    setSelectedFlow,
    setAutoRefresh,
    setRefreshInterval,
    // ... other methods
  };
};
```

---

## ReactFlow Implementation Details

### Core ReactFlow Setup

#### ReactFlow Provider Setup
```typescript
// Main page wrapper
export const ProcessFlowEditor: React.FC = () => {
  return (
    <Layout title="Process Flow Editor">
      <ReactFlowProvider>
        <ProcessFlowEditorContent />
      </ReactFlowProvider>
    </Layout>
  );
};
```

#### ReactFlow Configuration
```typescript
const ProcessFlowEditorContent: React.FC = () => {
  const { screenToFlowPosition } = useReactFlow();
  
  const defaultEdgeOptions = useMemo(() => ({
    type: 'custom',
    animated: false,
    style: { strokeWidth: 2, stroke: '#374151' },
    data: { 
      type: edgeType,
      showStatus: true
    }
  }), [edgeType]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDrop={onDrop}
      onDragOver={onDragOver}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineStyle={{ strokeWidth: 2, stroke: '#374151' }}
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={true}
      nodesConnectable={true}
      elementsSelectable={true}
      snapToGrid={true}
      snapGrid={[15, 15]}
      fitView
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
      <Controls />
      <MiniMap nodeColor={nodeColor} />
    </ReactFlow>
  );
};
```

### Node Types Configuration
```typescript
const nodeTypes = Object.freeze({
  equipment: WrappedEquipmentNode,
  instrument: WrappedInstrumentNode,
  group: WrappedGroupNode,
  text: WrappedTextNode,
  table: WrappedCustomTableNode,
});

const edgeTypes = Object.freeze({
  custom: CustomEdgeWithLabel,
});
```

### Drag and Drop Implementation
```typescript
const onDragOver = useCallback((event: React.DragEvent) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}, []);

const onDrop = useCallback((event: React.DragEvent) => {
  event.preventDefault();

  const dragData = event.dataTransfer.getData('application/dragdata');
  if (!dragData) return;

  const { type, data } = JSON.parse(dragData);
  
  const position = screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });

  let newNode: Node;

  if (type === 'equipment') {
    newNode = {
      id: `${data.code}_${Date.now()}`,
      type: 'equipment',
      position,
      style: { width: 200, height: getNodeHeight('1') },
      data: {
        label: data.name,
        equipmentType: data.code,
        equipmentCode: '',
        equipmentName: data.name,
        status: 'STOP',
        icon: data.icon,
        displayMeasurements: [],
        nodeSize: '1',
      },
    };
  }
  // Handle other node types...

  setNodes((nds) => nds.concat(newNode));
}, [screenToFlowPosition, setNodes, getNodeHeight]);
```

### Connection Logic
```typescript
const onConnect = useCallback((params: Connection) => {
  const sourceNode = nodes.find(n => n.id === params.source);
  const targetNode = nodes.find(n => n.id === params.target);
  
  const shouldShowStatus = sourceNode?.type === 'equipment' && targetNode?.type === 'equipment';
  
  const edgeStyle = shouldShowStatus 
    ? { strokeWidth: 2, stroke: '#374151' }
    : { strokeWidth: 1, stroke: '#000000', strokeDasharray: '3,2' };
  
  const newEdge = {
    ...params,
    type: 'custom',
    style: edgeStyle,
    data: { 
      type: edgeType,
      showStatus: shouldShowStatus,
      sourceNodeType: sourceNode?.type,
      targetNodeType: targetNode?.type
    }
  };

  setEdges((eds) => addEdge(newEdge, eds));
}, [nodes, edgeType, setEdges]);
```

---

## Data Flow & API Integration

### API Client Configuration
```typescript
// src/api/client.ts
import axios, { AxiosInstance } from 'axios';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      timeout: 10000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for auth
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle auth error
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Flow management methods
  async getFlows(workspaceId: string) {
    return this.client.get(`/v1/${workspaceId}/process-flow/flows`);
  }

  async saveFlow(workspaceId: string, flowData: any) {
    return this.client.post(`/v1/${workspaceId}/process-flow/flows`, flowData);
  }

  async updateFlow(workspaceId: string, flowId: string, flowData: any) {
    return this.client.put(`/v1/${workspaceId}/process-flow/flows/${flowId}`, flowData);
  }

  // Monitoring methods
  async getEquipmentStatus(workspaceId: string) {
    return this.client.get(`/v1/${workspaceId}/monitoring/equipment-status`);
  }

  async getMeasurements(workspaceId: string) {
    return this.client.get(`/v1/${workspaceId}/monitoring/measurements`);
  }

  // Data source methods
  async getDataSources(workspaceId: string) {
    return this.client.get(`/v1/${workspaceId}/data-sources`);
  }
}

export const apiClient = new ApiClient();
```

### Real-time Data Integration
```typescript
// src/hooks/useRealTimeMonitoring.ts
export const useRealTimeMonitoring = (
  workspaceId: string,
  autoRefresh: boolean,
  refreshInterval: number
) => {
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!autoRefresh) return;
    
    const ws = new WebSocket(`ws://localhost:8000/ws/${workspaceId}/monitoring`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'equipment_status_update':
          setEquipmentStatuses(prev => 
            prev.map(status => 
              status.equipment_code === data.equipment_code 
                ? { ...status, ...data.data }
                : status
            )
          );
          break;
          
        case 'measurement_update':
          setMeasurements(prev => 
            prev.map(measurement =>
              measurement.measurement_code === data.measurement_code
                ? { ...measurement, ...data.data }
                : measurement
            )
          );
          break;
      }
      
      setLastUpdate(new Date());
    };
    
    return () => {
      ws.close();
    };
  }, [workspaceId, autoRefresh]);
  
  // Fallback polling for when WebSocket is not available
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(async () => {
      try {
        const [statusResponse, measurementsResponse] = await Promise.all([
          apiClient.getEquipmentStatus(workspaceId),
          apiClient.getMeasurements(workspaceId)
        ]);
        
        setEquipmentStatuses(statusResponse.data);
        setMeasurements(measurementsResponse.data);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch monitoring data:', error);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [workspaceId, autoRefresh, refreshInterval]);
  
  return {
    equipmentStatuses,
    measurements,
    lastUpdate
  };
};
```

### Data Transformation Layer
```typescript
// src/utils/dataTransformers.ts
export const transformEquipmentData = (
  rawData: any[],
  nodeMapping: Map<string, Node>
): EquipmentStatus[] => {
  return rawData.map(item => ({
    equipment_code: item.equipment_code,
    equipment_name: item.equipment_name,
    status: normalizeStatus(item.status),
    measurements: item.measurements || [],
    last_update: new Date(item.last_update),
    // Apply node-specific configurations
    display_config: nodeMapping.get(item.equipment_code)?.data || {}
  }));
};

export const transformMeasurementData = (
  rawData: any[]
): Measurement[] => {
  return rawData.map(item => ({
    measurement_code: item.measurement_code,
    measurement_name: item.measurement_name,
    value: parseFloat(item.value),
    unit: item.unit,
    timestamp: new Date(item.timestamp),
    quality: item.quality || 'GOOD'
  }));
};
```

---

## Routing Structure

### Main Routing Configuration
```typescript
// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Process Flow Routes */}
          <Route 
            path="/workspaces/:workspaceId/process-flow/editor" 
            element={<ProcessFlowEditor />} 
          />
          <Route 
            path="/workspaces/:workspaceId/process-flow/monitor" 
            element={<ProcessFlowMonitor />} 
          />
          <Route 
            path="/workspaces/:workspaceId/process-flow/publish" 
            element={<ProcessFlowPublish />} 
          />
          
          {/* Public monitoring routes */}
          <Route 
            path="/public/monitor/:publishToken" 
            element={<PublicProcessFlowMonitor />} 
          />
          
          {/* Workspace routes */}
          <Route path="/workspaces/:workspaceId" element={<WorkspaceDashboard />} />
          <Route path="/workspaces" element={<WorkspaceList />} />
          
          {/* Default routes */}
          <Route path="/" element={<Navigate to="/workspaces" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Router>
  );
}
```

### Route Protection
```typescript
// src/components/common/ProtectedRoute.tsx
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredPermissions = [] 
}) => {
  const { user, isAuthenticated } = useAuth();
  const { workspaceId } = useParams();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (requiredPermissions.length > 0) {
    const hasPermissions = checkUserPermissions(user, workspaceId, requiredPermissions);
    if (!hasPermissions) {
      return <Navigate to="/unauthorized" replace />;
    }
  }
  
  return <>{children}</>;
};
```

### Navigation Component
```typescript
// src/components/common/ProcessFlowNavigation.tsx
export const ProcessFlowNavigation: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const location = useLocation();
  
  const navItems = [
    {
      path: `/workspaces/${workspaceId}/process-flow/editor`,
      label: 'Flow Editor',
      icon: <Edit size={16} />
    },
    {
      path: `/workspaces/${workspaceId}/process-flow/monitor`,
      label: 'Flow Monitor',
      icon: <Monitor size={16} />
    },
    {
      path: `/workspaces/${workspaceId}/process-flow/publish`,
      label: 'Publish Flow',
      icon: <Share size={16} />
    }
  ];
  
  return (
    <nav className="flex space-x-4">
      {navItems.map(item => (
        <Link
          key={item.path}
          to={item.path}
          className={`flex items-center space-x-2 px-3 py-2 rounded ${
            location.pathname === item.path
              ? 'bg-black text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
};
```

---

## Theme Integration Implementation

### Tailwind Configuration
```javascript
// tailwind.config.js
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // MAX Platform monochrome theme
        white: '#FFFFFF',
        black: '#000000',
        gray: {
          50: '#FAFAFA',
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#A3A3A3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
        },
        // Process monitoring specific colors
        status: {
          active: '#10b981',    // Green
          stop: '#6b7280',      // Gray
          alarm: '#ef4444',     // Red
          maintenance: '#f59e0b', // Orange
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

### Theme Provider Context
```typescript
// src/contexts/ThemeContext.tsx
interface ThemeContextType {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  colors: ColorScheme;
}

interface ColorScheme {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: {
    primary: string;
    secondary: string;
  };
  status: {
    active: string;
    stop: string;
    alarm: string;
    maintenance: string;
  };
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  const colors: ColorScheme = {
    background: theme === 'light' ? '#ffffff' : '#171717',
    surface: theme === 'light' ? '#f5f5f5' : '#262626',
    primary: '#000000',
    secondary: theme === 'light' ? '#737373' : '#a3a3a3',
    text: {
      primary: theme === 'light' ? '#000000' : '#ffffff',
      secondary: theme === 'light' ? '#525252' : '#d4d4d4',
    },
    status: {
      active: '#10b981',
      stop: '#6b7280',
      alarm: '#ef4444',
      maintenance: '#f59e0b',
    }
  };

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.className = theme;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};
```

### Themed Components
```typescript
// src/components/common/ThemedReactFlow.tsx
export const ThemedReactFlow: React.FC<ReactFlowProps> = (props) => {
  const { theme, colors } = useTheme();
  
  const themedProps = {
    ...props,
    style: {
      backgroundColor: colors.background,
      ...props.style
    }
  };
  
  return (
    <ReactFlow {...themedProps}>
      <Background 
        variant={BackgroundVariant.Dots} 
        gap={20} 
        size={1} 
        color={theme === 'light' ? '#e5e7eb' : '#374151'} 
      />
      <Controls className={theme === 'dark' ? 'dark-controls' : ''} />
      <MiniMap 
        nodeColor={(node) => getThemedNodeColor(node, colors)}
        maskColor={theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}
      />
      {props.children}
    </ReactFlow>
  );
};
```

---

## Performance Optimization

### Component Optimization

#### React.memo Usage
```typescript
// Optimize expensive components
export const EquipmentNode = memo<NodeProps<EquipmentNodeData>>(
  ({ id, data, selected }) => {
    // Component implementation
  },
  (prevProps, nextProps) => {
    // Custom comparison for optimal re-rendering
    return (
      prevProps.data === nextProps.data &&
      prevProps.selected === nextProps.selected
    );
  }
);
```

#### useMemo for Expensive Calculations
```typescript
export const ProcessFlowMonitor = () => {
  // Memoize nodeTypes to prevent recreation
  const nodeTypes = useMemo(() => ({
    equipment: EquipmentNode,
    instrument: InstrumentNode,
    group: GroupNode,
    text: TextNode,
    table: CustomTableNode,
  }), []);
  
  // Memoize status calculations
  const statusCounts = useMemo(() => {
    return equipmentStatuses.reduce((acc, status) => {
      acc[status.status] = (acc[status.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [equipmentStatuses]);
  
  // Memoize expensive filtering operations
  const filteredMeasurements = useMemo(() => {
    return measurements.filter(m => 
      selectedEquipmentCodes.includes(m.equipment_code)
    );
  }, [measurements, selectedEquipmentCodes]);
};
```

### Virtual Scrolling for Large Lists
```typescript
// src/components/common/VirtualizedEquipmentList.tsx
import { FixedSizeList as List } from 'react-window';

interface VirtualizedEquipmentListProps {
  equipmentList: EquipmentItem[];
  height: number;
  itemHeight: number;
  onItemClick: (item: EquipmentItem) => void;
}

export const VirtualizedEquipmentList: React.FC<VirtualizedEquipmentListProps> = ({
  equipmentList,
  height,
  itemHeight,
  onItemClick
}) => {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = equipmentList[index];
    
    return (
      <div style={style}>
        <EquipmentListItem 
          item={item} 
          onClick={() => onItemClick(item)}
        />
      </div>
    );
  };

  return (
    <List
      height={height}
      itemCount={equipmentList.length}
      itemSize={itemHeight}
      width="100%"
    >
      {Row}
    </List>
  );
};
```

### Data Caching Strategy
```typescript
// src/utils/cache.ts
class DataCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  set(key: string, data: any, ttl = 300000) { // 5 minutes default TTL
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear() {
    this.cache.clear();
  }
}

export const dataCache = new DataCache();

// Usage in API calls
export const getCachedEquipmentStatus = async (workspaceId: string) => {
  const cacheKey = `equipment-status-${workspaceId}`;
  const cached = dataCache.get(cacheKey);
  
  if (cached) {
    return cached;
  }
  
  const response = await apiClient.getEquipmentStatus(workspaceId);
  dataCache.set(cacheKey, response.data, 30000); // 30 seconds TTL for real-time data
  
  return response.data;
};
```

### Debounced Operations
```typescript
// src/hooks/useDebounce.ts
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Usage in search functionality
export const EquipmentSearch: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  useEffect(() => {
    if (debouncedSearchTerm) {
      performSearch(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);
  
  return (
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search equipment..."
    />
  );
};
```

### Bundle Size Optimization

#### Lazy Loading
```typescript
// Lazy load heavy components
const ProcessFlowEditor = lazy(() => import('./pages/ProcessFlowEditor'));
const ProcessFlowMonitor = lazy(() => import('./pages/ProcessFlowMonitor'));

// Code splitting by route
export const App = () => {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/editor" element={<ProcessFlowEditor />} />
        <Route path="/monitor" element={<ProcessFlowMonitor />} />
      </Routes>
    </Suspense>
  );
};
```

#### Dynamic Imports
```typescript
// Dynamic import of heavy libraries
export const useEChartsLazy = () => {
  const [ECharts, setECharts] = useState<any>(null);
  
  useEffect(() => {
    import('echarts').then(echarts => {
      setECharts(echarts);
    });
  }, []);
  
  return ECharts;
};
```

---

## Testing Strategy

### Test Environment Setup
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapping: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/serviceWorker.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### Unit Testing

#### Component Tests
```typescript
// src/workspaces/personal_test/components/common/__tests__/EquipmentNode.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { EquipmentNode } from '../EquipmentNode';
import { ReactFlowProvider } from 'reactflow';

const mockNodeData = {
  label: 'Test Equipment',
  equipmentType: 'E1',
  equipmentCode: 'EQ001',
  equipmentName: 'Test Equipment',
  status: 'ACTIVE' as const,
  displayMeasurements: ['TEMP', 'PRESSURE'],
  nodeSize: '1' as const
};

const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <ReactFlowProvider>
      {component}
    </ReactFlowProvider>
  );
};

describe('EquipmentNode', () => {
  it('renders equipment node with correct data', () => {
    renderWithProvider(
      <EquipmentNode
        id="test-node"
        data={mockNodeData}
        selected={false}
      />
    );

    expect(screen.getByText('Test Equipment')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('applies selected styling when selected', () => {
    renderWithProvider(
      <EquipmentNode
        id="test-node"
        data={mockNodeData}
        selected={true}
      />
    );

    const nodeElement = screen.getByTestId('equipment-node');
    expect(nodeElement).toHaveClass('ring-2', 'ring-blue-500');
  });

  it('displays measurements correctly', () => {
    renderWithProvider(
      <EquipmentNode
        id="test-node"
        data={mockNodeData}
        selected={false}
      />
    );

    expect(screen.getByText('TEMP')).toBeInTheDocument();
    expect(screen.getByText('PRESSURE')).toBeInTheDocument();
  });
});
```

#### Hook Tests
```typescript
// src/workspaces/personal_test/hooks/__tests__/useFlowEditor.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFlowEditor } from '../useFlowEditor';
import { apiClient } from '../../../api/client';

jest.mock('../../../api/client');
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('useFlowEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useFlowEditor('test-workspace'));

    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
    expect(result.current.flowName).toBe('New Process Flow');
    expect(result.current.currentFlow).toBeNull();
  });

  it('saves flow successfully', async () => {
    const mockFlow = {
      id: 'flow-1',
      name: 'Test Flow',
      flow_data: { nodes: [], edges: [] }
    };

    mockApiClient.post.mockResolvedValueOnce({ data: mockFlow });

    const { result } = renderHook(() => useFlowEditor('test-workspace'));

    act(() => {
      result.current.setFlowName('Test Flow');
    });

    await act(async () => {
      await result.current.saveFlow();
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/v1/test-workspace/process-flow/flows',
      expect.objectContaining({
        name: 'Test Flow',
        flow_data: expect.any(Object)
      })
    );

    expect(result.current.currentFlow).toEqual(mockFlow);
  });
});
```

### Integration Testing

#### Flow Editor Integration Test
```typescript
// src/workspaces/personal_test/pages/__tests__/ProcessFlowEditor.integration.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProcessFlowEditor } from '../ProcessFlowEditor';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe('ProcessFlowEditor Integration', () => {
  it('creates and saves a new flow', async () => {
    renderWithProviders(<ProcessFlowEditor />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByDisplayValue('New Process Flow')).toBeInTheDocument();
    });

    // Change flow name
    const nameInput = screen.getByDisplayValue('New Process Flow');
    fireEvent.change(nameInput, { target: { value: 'Integration Test Flow' } });

    // Drag and drop equipment node
    const equipmentItem = screen.getByTestId('equipment-item-E1');
    const canvas = screen.getByTestId('react-flow-canvas');

    fireEvent.dragStart(equipmentItem);
    fireEvent.dragOver(canvas);
    fireEvent.drop(canvas, {
      dataTransfer: {
        getData: () => JSON.stringify({
          type: 'equipment',
          data: { code: 'E1', name: 'Equipment 1', icon: 'activity' }
        })
      }
    });

    // Verify node was added
    await waitFor(() => {
      expect(screen.getByText('Equipment 1')).toBeInTheDocument();
    });

    // Save flow
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/saved successfully/i)).toBeInTheDocument();
    });
  });
});
```

### End-to-End Testing

#### Playwright E2E Tests
```typescript
// tests/e2e/process-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Process Flow Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces/personal_test/process-flow/editor');
  });

  test('should create and monitor a process flow', async ({ page }) => {
    // Create a new flow
    await page.fill('[data-testid="flow-name-input"]', 'E2E Test Flow');
    
    // Add equipment nodes
    await page.dragAndDrop('[data-testid="equipment-item-E1"]', '[data-testid="react-flow-canvas"]');
    await page.dragAndDrop('[data-testid="equipment-item-E2"]', '[data-testid="react-flow-canvas"]');
    
    // Connect nodes
    await page.hover('[data-testid="node-E1"] .react-flow__handle-source');
    await page.mouse.down();
    await page.hover('[data-testid="node-E2"] .react-flow__handle-target');
    await page.mouse.up();
    
    // Save flow
    await page.click('[data-testid="save-button"]');
    await expect(page.locator('.toast-success')).toBeVisible();
    
    // Navigate to monitor
    await page.goto('/workspaces/personal_test/process-flow/monitor');
    
    // Verify flow appears in monitor
    await expect(page.locator('[data-testid="flow-selector"]')).toContainText('E2E Test Flow');
    
    // Select the flow
    await page.selectOption('[data-testid="flow-selector"]', { label: 'E2E Test Flow' });
    
    // Verify nodes are displayed in monitor mode
    await expect(page.locator('[data-testid="equipment-node"]')).toHaveCount(2);
    
    // Test real-time updates
    await page.click('[data-testid="auto-refresh-toggle"]');
    await expect(page.locator('[data-testid="last-update"]')).not.toBeEmpty();
  });
});
```

### Performance Testing
```typescript
// src/utils/__tests__/performance.test.ts
import { performance, PerformanceObserver } from 'perf_hooks';

describe('Performance Tests', () => {
  it('should render large flow within performance budget', async () => {
    const startTime = performance.now();
    
    // Create large flow with 100 nodes
    const largeFlow = {
      nodes: Array.from({ length: 100 }, (_, i) => ({
        id: `node-${i}`,
        type: 'equipment',
        position: { x: (i % 10) * 200, y: Math.floor(i / 10) * 200 },
        data: { label: `Equipment ${i}` }
      })),
      edges: []
    };
    
    renderWithProviders(<ProcessFlowEditor initialFlow={largeFlow} />);
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should render within 1 second
    expect(renderTime).toBeLessThan(1000);
  });
});
```

---

## Deployment Considerations

### Build Configuration

#### Vite Configuration
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate ReactFlow into its own chunk
          'reactflow': ['reactflow'],
          // Separate chart library
          'charts': ['echarts', 'echarts-for-react'],
          // Vendor chunk for other dependencies
          'vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
```

### Environment Configuration
```typescript
// src/config/environment.ts
interface Environment {
  API_BASE_URL: string;
  WS_BASE_URL: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  FEATURES: {
    REAL_TIME_MONITORING: boolean;
    VERSION_MANAGEMENT: boolean;
    COLLABORATIVE_EDITING: boolean;
  };
}

export const environment: Environment = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
  WS_BASE_URL: import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000/ws',
  ENVIRONMENT: (import.meta.env.VITE_ENVIRONMENT as any) || 'development',
  FEATURES: {
    REAL_TIME_MONITORING: import.meta.env.VITE_ENABLE_REAL_TIME === 'true',
    VERSION_MANAGEMENT: import.meta.env.VITE_ENABLE_VERSIONING === 'true',
    COLLABORATIVE_EDITING: import.meta.env.VITE_ENABLE_COLLABORATION === 'true',
  },
};
```

### Docker Configuration
```dockerfile
# Dockerfile
FROM node:18-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### CI/CD Pipeline
```yaml
# .github/workflows/deploy.yml
name: Deploy Frontend

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm run test:coverage
      - run: npm run build
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      
      - name: Deploy to production
        run: |
          # Deploy commands here
          echo "Deploying to production..."
```

---

## Advanced Features Implementation

### Undo/Redo System
```typescript
// src/stores/undoRedoStore.ts
interface HistoryState {
  nodes: Node[];
  edges: Edge[];
  timestamp: number;
}

interface UndoRedoStore {
  history: HistoryState[];
  currentIndex: number;
  maxHistorySize: number;
  
  pushState: (nodes: Node[], edges: Edge[]) => void;
  undo: () => { nodes: Node[]; edges: Edge[] } | null;
  redo: () => { nodes: Node[]; edges: Edge[] } | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
}

export const useUndoRedoStore = create<UndoRedoStore>((set, get) => ({
  history: [],
  currentIndex: -1,
  maxHistorySize: 50,

  pushState: (nodes, edges) => {
    const { history, currentIndex, maxHistorySize } = get();
    
    // Remove any history after current index
    const newHistory = history.slice(0, currentIndex + 1);
    
    // Add new state
    newHistory.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      timestamp: Date.now()
    });
    
    // Limit history size
    if (newHistory.length > maxHistorySize) {
      newHistory.shift();
    } else {
      set({ currentIndex: currentIndex + 1 });
    }
    
    set({ history: newHistory });
  },

  undo: () => {
    const { history, currentIndex } = get();
    
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      set({ currentIndex: newIndex });
      return history[newIndex];
    }
    
    return null;
  },

  redo: () => {
    const { history, currentIndex } = get();
    
    if (currentIndex < history.length - 1) {
      const newIndex = currentIndex + 1;
      set({ currentIndex: newIndex });
      return history[newIndex];
    }
    
    return null;
  },

  canUndo: () => get().currentIndex > 0,
  canRedo: () => get().currentIndex < get().history.length - 1,
  clearHistory: () => set({ history: [], currentIndex: -1 })
}));
```

### Auto-save with Conflict Resolution
```typescript
// src/utils/autoSave.ts
interface AutoSaveManager {
  startAutoSave: () => void;
  stopAutoSave: () => void;
  saveNow: () => Promise<void>;
  hasUnsavedChanges: () => boolean;
}

export const useAutoSave = (
  workspaceId: string,
  flowId: string | null,
  getCurrentState: () => { nodes: Node[]; edges: Edge[]; flowName: string }
): AutoSaveManager => {
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);
  
  const saveNow = useCallback(async () => {
    const currentState = getCurrentState();
    
    try {
      // Check for conflicts before saving
      if (flowId) {
        const serverFlow = await apiClient.get(`/v1/${workspaceId}/process-flow/flows/${flowId}`);
        const serverUpdateTime = new Date(serverFlow.data.updated_at);
        
        if (lastSaveTime && serverUpdateTime > lastSaveTime) {
          // Conflict detected - show merge dialog
          throw new ConflictError('Flow has been modified by another user');
        }
      }
      
      const response = flowId
        ? await apiClient.put(`/v1/${workspaceId}/process-flow/flows/${flowId}`, currentState)
        : await apiClient.post(`/v1/${workspaceId}/process-flow/flows`, currentState);
      
      setLastSaveTime(new Date());
      deleteFlowBackup(workspaceId, flowId);
      
    } catch (error) {
      if (error instanceof ConflictError) {
        // Handle conflict resolution
        showConflictResolutionDialog(error);
      } else {
        // Save to backup instead
        saveFlowBackup(workspaceId, flowId, currentState);
      }
    }
  }, [workspaceId, flowId, getCurrentState, lastSaveTime]);
  
  const startAutoSave = useCallback(() => {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
    }
    
    const timer = setInterval(() => {
      if (hasUnsavedChanges()) {
        saveNow();
      }
    }, 30000); // Auto-save every 30 seconds
    
    setAutoSaveTimer(timer);
  }, [saveNow]);
  
  const stopAutoSave = useCallback(() => {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      setAutoSaveTimer(null);
    }
  }, [autoSaveTimer]);
  
  const hasUnsavedChanges = useCallback(() => {
    // Compare current state with last saved state
    const currentState = getCurrentState();
    const lastSavedState = getLastSavedState();
    
    return !isEqual(currentState, lastSavedState);
  }, [getCurrentState]);
  
  return {
    startAutoSave,
    stopAutoSave,
    saveNow,
    hasUnsavedChanges
  };
};
```

### Export Functionality
```typescript
// src/utils/exportUtils.ts
export const exportFlowAsSVG = (nodes: Node[], edges: Edge[]): Promise<string> => {
  return new Promise((resolve) => {
    const svgElement = document.querySelector('.react-flow__renderer svg');
    
    if (svgElement) {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      resolve(svgString);
    } else {
      // Fallback: render flow off-screen for export
      renderFlowForExport(nodes, edges).then(resolve);
    }
  });
};

export const exportFlowAsPNG = (nodes: Node[], edges: Edge[]): Promise<Blob> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    exportFlowAsSVG(nodes, edges).then(svgString => {
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob!);
        }, 'image/png');
      };
      
      img.src = url;
    });
  });
};

export const exportFlowAsPDF = (nodes: Node[], edges: Edge[]): Promise<Blob> => {
  return import('jspdf').then(({ jsPDF }) => {
    const pdf = new jsPDF();
    
    return exportFlowAsPNG(nodes, edges).then(pngBlob => {
      return new Promise<Blob>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const imageData = reader.result as string;
          pdf.addImage(imageData, 'PNG', 10, 10, 180, 160);
          
          const pdfBlob = pdf.output('blob');
          resolve(pdfBlob);
        };
        reader.readAsDataURL(pngBlob);
      });
    });
  });
};
```

### Keyboard Shortcuts Implementation
```typescript
// src/hooks/useKeyboardShortcuts.ts
export const useKeyboardShortcuts = (handlers: Record<string, () => void>) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { key, ctrlKey, metaKey, shiftKey } = event;
      const modifierKey = ctrlKey || metaKey;
      
      const shortcutKey = [
        modifierKey ? 'ctrl' : '',
        shiftKey ? 'shift' : '',
        key.toLowerCase()
      ].filter(Boolean).join('+');
      
      const handler = handlers[shortcutKey];
      
      if (handler) {
        event.preventDefault();
        handler();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
};

// Usage in ProcessFlowEditor
export const ProcessFlowEditor = () => {
  const { undo, redo, saveFlow, deleteSelectedElements } = useFlowEditor();
  
  useKeyboardShortcuts({
    'ctrl+z': undo,
    'ctrl+y': redo,
    'ctrl+shift+z': redo,
    'ctrl+s': () => saveFlow(),
    'delete': deleteSelectedElements,
    'backspace': deleteSelectedElements,
    'ctrl+a': () => selectAllElements(),
    'escape': () => clearSelection(),
  });
  
  // ... rest of component
};
```

### Template System
```typescript
// src/utils/templateSystem.ts
interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail: string;
  flow_data: {
    nodes: Node[];
    edges: Edge[];
  };
  tags: string[];
  created_at: string;
  is_public: boolean;
}

export const useFlowTemplates = () => {
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  
  const loadTemplates = useCallback(async (category?: string) => {
    setLoading(true);
    try {
      const params = category ? `?category=${category}` : '';
      const response = await apiClient.get(`/v1/templates/flow${params}`);
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  }, []);
  
  const saveAsTemplate = useCallback(async (
    flowData: { nodes: Node[]; edges: Edge[] },
    templateInfo: {
      name: string;
      description: string;
      category: string;
      tags: string[];
      isPublic: boolean;
    }
  ) => {
    try {
      const response = await apiClient.post('/v1/templates/flow', {
        ...templateInfo,
        flow_data: flowData
      });
      return response.data;
    } catch (error) {
      console.error('Failed to save template:', error);
      throw error;
    }
  }, []);
  
  const applyTemplate = useCallback((template: FlowTemplate) => {
    return {
      nodes: template.flow_data.nodes.map(node => ({
        ...node,
        id: `${node.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        position: {
          x: node.position.x + Math.random() * 20 - 10, // Small random offset
          y: node.position.y + Math.random() * 20 - 10
        }
      })),
      edges: template.flow_data.edges.map(edge => ({
        ...edge,
        id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }))
    };
  }, []);
  
  return {
    templates,
    loading,
    loadTemplates,
    saveAsTemplate,
    applyTemplate
  };
};
```

---

This comprehensive implementation guide provides a complete foundation for building the Process Monitoring frontend feature in Maxlab. The architecture emphasizes maintainability, performance, and scalability while integrating seamlessly with the existing codebase and theme system.

Key implementation highlights:
- **Modular Architecture**: Clear separation of concerns with reusable components
- **Type Safety**: Comprehensive TypeScript interfaces and types
- **Performance Optimization**: Memoization, virtual scrolling, and lazy loading
- **Real-time Capabilities**: WebSocket integration for live monitoring
- **Testing Strategy**: Comprehensive unit, integration, and E2E testing
- **Advanced Features**: Undo/redo, auto-save, export functionality, and templates

The implementation follows React best practices and integrates with the existing Maxlab ecosystem, providing a robust foundation for chemical process monitoring and visualization.