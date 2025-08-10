import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Panel,
  useReactFlow,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { RefreshCw, Activity, AlertCircle, Clock, ChevronLeft, ChevronRight, Maximize2, Minimize2, ZoomIn } from 'lucide-react';
import { apiClient } from '../../../api/client';
import { EquipmentNode } from '../components/common/EquipmentNode';
import { GroupNode } from '../components/common/GroupNode';
import { EquipmentDetailModal } from '../components/common/EquipmentDetailModal';
import { CustomEdgeWithLabel } from '../components/common/CustomEdgeWithLabel';
import { useParams } from 'react-router-dom';

const nodeTypes = {
  equipment: EquipmentNode,
  group: GroupNode,
};

const edgeTypes = {
  custom: CustomEdgeWithLabel,
};

// Separate component to use useReactFlow hook
const FlowCanvas: React.FC<{
  nodes: Node[];
  edges: Edge[];
  nodeTypes: any;
  edgeTypes: any;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  equipmentStatusCount: number;
  activeCount: number;
}> = ({ nodes, edges, nodeTypes, edgeTypes, onNodeClick, equipmentStatusCount, activeCount }) => {
  const { fitView } = useReactFlow();

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
      fitView={false}
      nodesDraggable={true}
      nodesConnectable={false}
      elementsSelectable={true}
      panOnDrag={true}
      zoomOnScroll={true}
      minZoom={0.1}
      maxZoom={4}
      defaultEdgeOptions={{ type: 'custom' }}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap />
      <Panel position="bottom-right" className="bg-white p-2 rounded shadow">
        <div className="text-xs text-gray-600 mb-2">
          Equipment: {equipmentStatusCount} | Active: {activeCount}
        </div>
        <button
          onClick={() => fitView({ padding: 0.2 })}
          className="flex items-center justify-center w-full px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800"
        >
          <ZoomIn size={14} className="mr-1" />
          Fit View
        </button>
      </Panel>
    </ReactFlow>
  );
};

interface EquipmentStatus {
  equipment_type: string;
  equipment_code: string;
  equipment_name: string;
  status: 'ACTIVE' | 'PAUSE' | 'STOP';
  last_run_time: string | null;
}

interface MeasurementData {
  id: number;
  equipment_type: string;
  equipment_code: string;
  measurement_code: string;
  measurement_desc: string;
  measurement_value: number;
  timestamp: string;
}

interface ProcessFlow {
  id: string;
  name: string;
  flow_data: {
    nodes: Node[];
    edges: Edge[];
  };
}

export const ProcessFlowMonitor: React.FC = () => {
  const workspaceId = 'personal_test'; // Fixed workspace ID
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flows, setFlows] = useState<ProcessFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<ProcessFlow | null>(null);
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // Default 30 seconds
  const [autoScroll, setAutoScroll] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Set global auto-scroll state
  useEffect(() => {
    (window as any).autoScrollMeasurements = autoScroll;
  }, [autoScroll]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Load process flows
  useEffect(() => {
    if (!workspaceId) return;
    
    apiClient.get(`/v1/workspaces/personal_test/process-flow/flows?workspace_id=${workspaceId}`)
      .then((response) => {
        setFlows(response.data);
        if (response.data.length > 0 && !selectedFlow) {
          setSelectedFlow(response.data[0]);
        }
      })
      .catch((err) => console.error('Failed to load flows:', err));
  }, [workspaceId, selectedFlow]);

  // Load equipment status and measurements
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statusResponse, measurementResponse] = await Promise.all([
        apiClient.get('/v1/workspaces/personal_test/process-flow/equipment/status?limit=100'),
        apiClient.get('/v1/workspaces/personal_test/process-flow/measurements?limit=100'),
      ]);
      
      const equipmentStatusList = statusResponse.data.items || statusResponse.data;
      setEquipmentStatuses(equipmentStatusList);
      setMeasurements(measurementResponse.data);
      setLastUpdate(new Date());
      
      // Update nodes with real-time data
      setNodes((currentNodes) => {
        const updatedNodes = currentNodes.map((node) => {
          if (node.type === 'equipment' && node.data.equipmentCode) {
            // Find status by equipment code
            const status = equipmentStatusList.find((s: EquipmentStatus) => s.equipment_code === node.data.equipmentCode);
            
            // Find all measurements for this equipment
            const equipmentMeasurements = measurementResponse.data.filter(
              (m: MeasurementData) => m.equipment_code === node.data.equipmentCode
            );
            
            // Group measurements by code and take the latest
            const measurementMap = new Map<string, MeasurementData>();
            equipmentMeasurements.forEach((m: MeasurementData) => {
              const existing = measurementMap.get(m.measurement_code);
              if (!existing || new Date(m.timestamp) > new Date(existing.timestamp)) {
                measurementMap.set(m.measurement_code, m);
              }
            });
            
            const latestMeasurements = Array.from(measurementMap.values()).map((m) => ({
              code: m.measurement_code,
              desc: m.measurement_desc,
              value: m.measurement_value,
            }));
            
            return {
              ...node,
              data: {
                ...node.data,
                status: status?.status || 'STOP',
                measurements: latestMeasurements,
              },
            };
          }
          return node;
        });
        
        // Update edges based on node statuses
        setEdges((currentEdges) => {
          const nodeStatusMap = new Map<string, string>();
          updatedNodes.forEach(node => {
            if (node.type === 'equipment' && node.data.equipmentCode) {
              nodeStatusMap.set(node.id, node.data.status);
            }
          });
          
          return currentEdges.map(edge => {
            const sourceStatus = nodeStatusMap.get(edge.source) || 'STOP';
            const targetStatus = nodeStatusMap.get(edge.target) || 'STOP';
            
            // Define edge styles based on status combinations
            const statusKey = `${sourceStatus}-${targetStatus}`;
            let edgeStyle = {};
            let label = null;
            let animated = false;
            
            switch (statusKey) {
              case 'ACTIVE-ACTIVE':
                edgeStyle = { stroke: '#10b981', strokeWidth: 3 };
                animated = true;
                break;
              case 'ACTIVE-PAUSE':
                edgeStyle = { stroke: '#eab308', strokeWidth: 4, strokeDasharray: '8 4' };
                animated = true;
                label = 'Target Pause';
                break;
              case 'ACTIVE-STOP':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = 'Target Stop';
                break;
              case 'PAUSE-ACTIVE':
                edgeStyle = { stroke: '#eab308', strokeWidth: 4, strokeDasharray: '8 4' };
                animated = true;
                label = 'Source Pause';
                break;
              case 'PAUSE-PAUSE':
                edgeStyle = { stroke: '#eab308', strokeWidth: 4, strokeDasharray: '8 4' };
                animated = true;
                label = 'Both Pause';
                break;
              case 'PAUSE-STOP':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = 'Target Stop';
                break;
              case 'STOP-ACTIVE':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = 'Source Stop';
                break;
              case 'STOP-PAUSE':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = 'Source Stop';
                break;
              case 'STOP-STOP':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = 'Both Stop';
                break;
              default:
                edgeStyle = { stroke: '#000', strokeWidth: 2 };
            }
            
            return {
              ...edge,
              type: 'custom',
              animated: animated,
              style: {
                ...edge.style,
                ...edgeStyle,
              },
              data: {
                ...edge.data,
                type: edge.type || 'step',
                label: label,
                animated: animated,
              }
            };
          });
        });
        
        return updatedNodes;
      });
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  };


  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      loadData();
      const interval = setInterval(loadData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, selectedFlow]);

  // Update view when flow is selected
  useEffect(() => {
    if (selectedFlow) {
      setNodes(selectedFlow.flow_data.nodes || []);
      setEdges(selectedFlow.flow_data.edges || []);
      loadData();
    }
  }, [selectedFlow]);

  const getStatusCounts = () => {
    const counts = { ACTIVE: 0, PAUSE: 0, STOP: 0 };
    equipmentStatuses.forEach((status) => {
      counts[status.status]++;
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

  const onNodeClick = (event: React.MouseEvent, node: Node) => {
    if (node.type === 'equipment') {
      setSelectedNode(node);
      setIsDetailModalOpen(true);
    }
  };

  const selectedEquipmentStatus = selectedNode 
    ? equipmentStatuses.find(s => s.equipment_code === selectedNode.data.equipmentCode)
    : undefined;

  const selectedEquipmentMeasurements = selectedNode
    ? measurements.filter(m => m.equipment_code === selectedNode.data.equipmentCode)
    : [];

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle fullscreen exit with ESC key
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Load sidebar state from localStorage
  useEffect(() => {
    const savedSidebarState = localStorage.getItem('monitorSidebarOpen');
    if (savedSidebarState !== null) {
      setIsSidebarOpen(JSON.parse(savedSidebarState));
    }
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('monitorSidebarOpen', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      {!isFullscreen && (
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">Process Flow Monitor</h1>
            {flows.length > 0 && (
              <select
                value={selectedFlow?.id || ''}
                onChange={(e) => {
                  const flow = flows.find((f) => f.id === e.target.value);
                  setSelectedFlow(flow || null);
                }}
                className="px-3 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-black"
              >
                {flows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.name}
                  </option>
                ))}
              </select>
            )}
            {flows.length === 0 && workspaceId && (
              <span className="text-gray-500 text-sm">No process flows available</span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Clock size={16} />
              <span>Last update: {lastUpdate.toLocaleTimeString()}</span>
            </div>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value={30000}>30초</option>
              <option value={60000}>1분</option>
              <option value={180000}>3분</option>
              <option value={300000}>5분</option>
            </select>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Auto-refresh</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Auto-scroll</span>
            </label>
            <button
              onClick={loadData}
              disabled={isLoading}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              <span>Fullscreen</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Status Summary */}
      {!isFullscreen && (
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-sm">Active: {statusCounts.ACTIVE}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className="text-sm">Paused: {statusCounts.PAUSE}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-sm">Stopped: {statusCounts.STOP}</span>
          </div>
        </div>
      </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute left-0 top-4 z-10 bg-white border border-gray-300 rounded-r-md p-2 hover:bg-gray-50 transition-all"
          style={{ left: isSidebarOpen ? '320px' : '0px' }}
        >
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
        
        {/* Equipment List */}
        <div className={`bg-white border-r overflow-y-auto transition-all duration-300 ${isSidebarOpen ? 'w-80 p-4' : 'w-0 p-0'}`}>
          {isSidebarOpen && (
          <>
          <h3 className="font-semibold mb-4">Equipment Status</h3>
          {isLoading ? (
            <div className="text-center py-4 text-gray-500">
              <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
              <p>Loading equipment data...</p>
            </div>
          ) : (
          <div className="space-y-2">
            {equipmentStatuses.map((equipment) => {
              const measurement = measurements.find(
                (m) => m.equipment_code === equipment.equipment_code
              );
              const statusConfig = {
                ACTIVE: 'bg-green-100 text-green-800',
                PAUSE: 'bg-yellow-100 text-yellow-800',
                STOP: 'bg-red-100 text-red-800',
              };
              
              return (
                <div
                  key={equipment.equipment_code}
                  className="p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">{equipment.equipment_name}</div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        statusConfig[equipment.status]
                      }`}
                    >
                      {equipment.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Code: {equipment.equipment_code}
                  </div>
                  {measurement && (
                    <div className="mt-2 text-xs bg-gray-50 rounded p-2">
                      <div>{measurement.measurement_desc}</div>
                      <div className="font-bold">
                        {measurement.measurement_value.toLocaleString()}
                      </div>
                    </div>
                  )}
                  {equipment.last_run_time && (
                    <div className="text-xs text-gray-500 mt-1">
                      Last run: {new Date(equipment.last_run_time).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
          </>
          )}
        </div>

        {/* Flow Canvas */}
        <div className="flex-1">
          <ReactFlowProvider>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              equipmentStatusCount={equipmentStatuses.length}
              activeCount={statusCounts.ACTIVE}
            />
          </ReactFlowProvider>
        </div>
      </div>

      {/* Equipment Detail Modal */}
      <EquipmentDetailModal
        node={selectedNode}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedNode(null);
        }}
        equipmentStatus={selectedEquipmentStatus}
        measurements={selectedEquipmentMeasurements}
      />
    </div>
  );
};