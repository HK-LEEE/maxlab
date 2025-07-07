import { useState, useEffect, useCallback } from 'react';
import type { Node, Edge } from 'reactflow';
import { apiClient } from '../../../api/client';
import { useWebSocket } from './useWebSocket';

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
  spec_status?: 'IN_SPEC' | 'ABOVE_SPEC' | 'BELOW_SPEC';
  upper_spec_limit?: number;
  lower_spec_limit?: number;
  target_value?: number;
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
  
  // WebSocket connection (optional)
  const { isConnected: wsConnected } = useWebSocket({
    workspace_id: workspaceUuid,
    onMessage: (data) => {
      // Handle real-time updates from WebSocket
      if (data.type === 'equipment_update') {
        setEquipmentStatuses(prev => {
          const updated = [...prev];
          const index = updated.findIndex(e => e.equipment_code === data.equipment_code);
          if (index >= 0) {
            updated[index] = { ...updated[index], ...data.data };
          }
          return updated;
        });
        setLastUpdate(new Date());
      } else if (data.type === 'measurement_update') {
        setMeasurements(data.measurements);
        setLastUpdate(new Date());
      }
    }
  });

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

  // Track visible equipment codes to optimize API calls
  const [visibleEquipmentCodes, setVisibleEquipmentCodes] = useState<Set<string>>(new Set());
  const [previousData, setPreviousData] = useState<{
    statuses: Map<string, any>,
    measurements: Map<string, any>
  }>({
    statuses: new Map(),
    measurements: new Map()
  });

  // Load equipment status and measurements (optimized)
  const loadData = useCallback(async () => {
    // Don't skip if no equipment codes - still load all statuses
    setIsLoading(true);
    try {
      // Build equipment codes parameter
      const equipmentCodesParam = visibleEquipmentCodes.size > 0 
        ? Array.from(visibleEquipmentCodes).join(',')
        : '';
      
      const [statusResponse, measurementResponse] = await Promise.all([
        apiClient.get(`/api/v1/personal-test/process-flow/equipment/status?workspace_id=${workspaceId}&limit=100`),
        apiClient.get(`/api/v1/personal-test/process-flow/measurements?workspace_id=${workspaceId}&equipment_codes=${equipmentCodesParam}&limit=500`),
      ]);
      
      const equipmentStatusList = statusResponse.data.items || statusResponse.data;
      const newMeasurements = measurementResponse.data;
      
      // Debug logging (commented out for production)
      // console.log('Equipment Status Response:', equipmentStatusList);
      // console.log('Total equipment count:', equipmentStatusList.length);
      // console.log('Measurements Response:', newMeasurements.length, 'items');
      
      // Check if data has actually changed
      let hasStatusChanged = false;
      let hasMeasurementChanged = false;
      
      // Compare statuses
      const newStatusMap = new Map();
      equipmentStatusList.forEach((status: any) => {
        newStatusMap.set(status.equipment_code, status);
        const prevStatus = previousData.statuses.get(status.equipment_code);
        if (!prevStatus || prevStatus.status !== status.status || 
            prevStatus.last_run_time !== status.last_run_time) {
          hasStatusChanged = true;
        }
      });
      
      // Compare measurements
      const newMeasurementMap = new Map();
      newMeasurements.forEach((measurement: any) => {
        const key = `${measurement.equipment_code}_${measurement.measurement_code}`;
        newMeasurementMap.set(key, measurement);
        const prevMeasurement = previousData.measurements.get(key);
        if (!prevMeasurement || prevMeasurement.measurement_value !== measurement.measurement_value ||
            prevMeasurement.spec_status !== measurement.spec_status) {
          hasMeasurementChanged = true;
        }
      });
      
      // Only update state if data has changed
      if (hasStatusChanged) {
        setEquipmentStatuses(equipmentStatusList);
      }
      if (hasMeasurementChanged) {
        setMeasurements(newMeasurements);
        
        // Check for spec violations and trigger alarms
        newMeasurements.forEach((measurement: MeasurementData) => {
          if (measurement.spec_status && measurement.spec_status !== 'IN_SPEC') {
            // Check if this is a new alarm or status change
            const key = `${measurement.equipment_code}_${measurement.measurement_code}`;
            const prevMeasurement = previousData.measurements.get(key);
            
            if (!prevMeasurement || prevMeasurement.spec_status !== measurement.spec_status) {
              // Find equipment info
              const equipment = equipmentStatusList.find((e: EquipmentStatus) => 
                e.equipment_code === measurement.equipment_code
              );
              
              // Trigger spec alarm event
              const alarmEvent = new CustomEvent('specAlarm', {
                detail: {
                  id: `${measurement.equipment_code}_${measurement.measurement_code}_${Date.now()}`,
                  equipment_code: measurement.equipment_code,
                  equipment_name: equipment?.equipment_name || measurement.equipment_code,
                  measurement_code: measurement.measurement_code,
                  measurement_desc: measurement.measurement_desc,
                  value: measurement.measurement_value,
                  spec_type: measurement.spec_status,
                  spec_limit: measurement.spec_status === 'ABOVE_SPEC' 
                    ? measurement.upper_spec_limit 
                    : measurement.lower_spec_limit,
                  timestamp: new Date()
                }
              });
              window.dispatchEvent(alarmEvent);
            }
          }
        });
      }
      
      if (hasStatusChanged || hasMeasurementChanged) {
        setPreviousData({
          statuses: newStatusMap,
          measurements: newMeasurementMap
        });
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
            
            const latestMeasurements = Array.from(measurementMap.values()).map((m) => {
              // Trigger alarm if spec_status is 1 (out of spec)
              if (m.spec_status === 1) {
                const alarmEvent = new CustomEvent('specAlarm', {
                  detail: {
                    id: `${m.equipment_code}-${m.measurement_code}-${Date.now()}`,
                    equipment_code: m.equipment_code,
                    equipment_name: equipmentList.find(e => e.equipment_code === m.equipment_code)?.equipment_name || m.equipment_code,
                    measurement_code: m.measurement_code,
                    measurement_desc: m.measurement_desc,
                    value: m.measurement_value,
                    spec_type: m.usl !== undefined && m.measurement_value > m.usl ? 'ABOVE_SPEC' : 'BELOW_SPEC',
                    spec_limit: m.usl !== undefined && m.measurement_value > m.usl ? m.usl : m.lsl || 0,
                    timestamp: new Date()
                  }
                });
                window.dispatchEvent(alarmEvent);
              }
              
              return {
                code: m.measurement_code,
                desc: m.measurement_desc,
                value: m.measurement_value,
                spec_status: m.spec_status,
                usl: m.usl,
                lsl: m.lsl
              };
            });
            
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
                label = '대상 일시정지';
                break;
              case 'ACTIVE-STOP':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = '대상 정지';
                break;
              case 'PAUSE-ACTIVE':
                edgeStyle = { stroke: '#eab308', strokeWidth: 4, strokeDasharray: '8 4' };
                animated = true;
                label = '출발 일시정지';
                break;
              case 'PAUSE-PAUSE':
                edgeStyle = { stroke: '#eab308', strokeWidth: 4, strokeDasharray: '8 4' };
                animated = true;
                label = '모두 일시정지';
                break;
              case 'PAUSE-STOP':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = '대상 정지';
                break;
              case 'STOP-ACTIVE':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = '출발 정지';
                break;
              case 'STOP-PAUSE':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = '출발 정지';
                break;
              case 'STOP-STOP':
                edgeStyle = { stroke: '#ef4444', strokeWidth: 3 };
                animated = false;
                label = '모두 정지';
                break;
              default:
                edgeStyle = { stroke: '#000', strokeWidth: 2 };
            }
            
            return {
              ...edge,
              type: 'custom', // Keep custom type for CustomEdgeWithLabel component
              animated: animated,
              style: {
                ...edge.style,
                ...edgeStyle,
              },
              data: {
                ...edge.data,
                type: edge.type || edge.data?.type || 'smoothstep', // Preserve original edge type
                label: label,
                animated: animated,
              }
            };
          });
        });
        
        return updatedNodes;
      });
      } // Close the if (hasStatusChanged || hasMeasurementChanged) block
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, visibleEquipmentCodes]);

  // Update visible equipment codes when nodes change
  useEffect(() => {
    const codes = new Set<string>();
    nodes.forEach(node => {
      if (node.type === 'equipment' && node.data.equipmentCode) {
        codes.add(node.data.equipmentCode);
      }
    });
    setVisibleEquipmentCodes(codes);
  }, [nodes]);

  // Load data when visible equipment codes change or on initial flow selection
  useEffect(() => {
    if (selectedFlow) {
      const timer = setTimeout(() => {
        loadData();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visibleEquipmentCodes, selectedFlow, loadData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && selectedFlow) {
      loadData();
      const interval = setInterval(loadData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, selectedFlow, loadData]);

  // Update view when flow is selected
  useEffect(() => {
    if (selectedFlow) {
      // Clear previous data when switching flows
      setPreviousData({
        statuses: new Map(),
        measurements: new Map()
      });
      setEquipmentStatuses([]);
      setMeasurements([]);
      
      // Set new nodes and edges
      setNodes(selectedFlow.flow_data.nodes || []);
      setEdges(selectedFlow.flow_data.edges || []);
    }
  }, [selectedFlow]);

  const getStatusCounts = () => {
    const counts = { ACTIVE: 0, PAUSE: 0, STOP: 0 };
    equipmentStatuses.forEach((status) => {
      counts[status.status]++;
    });
    // console.log('Status Counts:', counts, 'from', equipmentStatuses.length, 'equipment');
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