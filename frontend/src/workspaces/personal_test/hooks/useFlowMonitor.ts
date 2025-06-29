import { useState, useEffect, useCallback } from 'react';
import type { Node, Edge } from 'reactflow';
import { apiClient } from '../../../api/client';

interface ProcessFlow {
  id: string;
  name: string;
  flow_data: {
    nodes: Node[];
    edges: Edge[];
  };
}

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

export const useFlowMonitor = (workspaceId: string) => {
  // TODO: Get actual workspace UUID from context or props
  const workspaceUuid = '21ee03db-90c4-4592-b00f-c44801e0b164'; // temporary hardcoded UUID
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flows, setFlows] = useState<ProcessFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<ProcessFlow | null>(null);
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [autoScroll, setAutoScroll] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Set global auto-scroll state
  useEffect(() => {
    (window as any).autoScrollMeasurements = autoScroll;
  }, [autoScroll]);

  // Load process flows
  useEffect(() => {
    if (!workspaceId) return;
    
    apiClient.get(`/api/v1/personal-test/process-flow/flows?workspace_id=${workspaceUuid}`)
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
        apiClient.get('/api/v1/personal-test/process-flow/equipment/status?limit=100'),
        apiClient.get('/api/v1/personal-test/process-flow/measurements?limit=100'),
      ]);
      
      const equipmentStatusList = statusResponse.data.items || statusResponse.data;
      setEquipmentStatuses(equipmentStatusList);
      setMeasurements(measurementResponse.data);
      setLastUpdate(new Date());
      
      // Update nodes with real-time data
      setNodes((currentNodes) => {
        const updatedNodes = currentNodes.map((node) => {
          if (node.type === 'equipment' && node.data.equipmentCode) {
            const status = equipmentStatusList.find((s: EquipmentStatus) => 
              s.equipment_code === node.data.equipmentCode
            );
            
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

  return {
    nodes,
    edges,
    flows,
    selectedFlow,
    equipmentStatuses,
    measurements,
    isLoading,
    lastUpdate,
    autoRefresh,
    refreshInterval,
    autoScroll,
    isSidebarOpen,
    isFullscreen,
    statusCounts: getStatusCounts(),
    setSelectedFlow,
    setAutoRefresh,
    setRefreshInterval,
    setAutoScroll,
    setIsSidebarOpen,
    loadData,
    toggleFullscreen,
  };
};