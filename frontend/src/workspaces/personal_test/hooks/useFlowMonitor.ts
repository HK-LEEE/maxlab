import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [refreshInterval, setRefreshInterval] = useState(10000); // 10 seconds for better real-time updates
  const [autoScroll, setAutoScroll] = useState(false);
  const [alarmCheck, setAlarmCheck] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isDataLoadingRef = useRef(false);
  
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
    
    apiClient.get(`/api/v1/personal-test/process-flow/flows?workspace_id=${workspaceUuid}&_t=${Date.now()}`)
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
  const visibleEquipmentCodesRef = useRef<Set<string>>(new Set());
  const [previousData, setPreviousData] = useState<{
    statuses: Map<string, any>,
    measurements: Map<string, any>
  }>({
    statuses: new Map(),
    measurements: new Map()
  });

  // Load equipment status and measurements (optimized)
  const loadData = useCallback(async () => {
    // Prevent duplicate API calls with stricter timing control
    if (isDataLoadingRef.current) {
      return;
    }
    
    // Rate limiting - prevent calls more frequent than every 5 seconds
    const now = Date.now();
    const lastCallTime = (window as any).lastApiCallTime || 0;
    if (now - lastCallTime < 5000) {
      return;
    }
    
    isDataLoadingRef.current = true;
    (window as any).lastApiCallTime = now;
    setIsLoading(true);
    
    try {
      // Build API URLs with data_source_id if available
      const dataSourceParam = selectedFlow?.data_source_id ? `&data_source_id=${selectedFlow.data_source_id}` : '';
      
      const [statusResponse, measurementResponse] = await Promise.all([
        apiClient.get(`/api/v1/personal-test/process-flow/equipment/status?workspace_id=${workspaceId}&limit=100${dataSourceParam}&_t=${Date.now()}`),
        apiClient.get(`/api/v1/personal-test/process-flow/measurements?workspace_id=${workspaceId}&limit=500${dataSourceParam}&_t=${Date.now()}`),
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
        
        // Check for spec violations and trigger alarms (only if alarm check is enabled)
        // Only trigger alarms for measurements that are visible on current screen nodes
        if (alarmCheck) {
          // Get all measurement codes that are configured to be displayed on current screen nodes
          const visibleMeasurementCodes = new Set<string>();
          nodes.forEach(node => {
            if (node.type === 'equipment' && node.data.displayMeasurements) {
              node.data.displayMeasurements.forEach((code: string) => {
                visibleMeasurementCodes.add(code);
              });
            }
          });
          
          newMeasurements.forEach((measurement: MeasurementData) => {
            // Only trigger alarms for measurements that are visible on current screen
            if (!visibleMeasurementCodes.has(measurement.measurement_code)) {
              return;
            }
            
            // Only trigger alarms for spec_status 1 (BELOW_SPEC) and 2 (ABOVE_SPEC)
            // Exclude spec_status 9 (NO_SPEC) and 0 (IN_SPEC) from alarms
            if (measurement.spec_status === 1 || measurement.spec_status === 2) {
              // Check if this is a new alarm or status change
              const key = `${measurement.equipment_code}_${measurement.measurement_code}`;
              const prevMeasurement = previousData.measurements.get(key);
              
              if (!prevMeasurement || prevMeasurement.spec_status !== measurement.spec_status) {
                // Find equipment info
                const equipment = equipmentStatusList.find((e: EquipmentStatus) => 
                  e.equipment_code === measurement.equipment_code
                );
                
                // Additional validation: only trigger alarm if relevant spec limit exists
                const hasValidLimit = measurement.spec_status === 2 
                  ? (measurement.upper_spec_limit != null || measurement.usl != null)
                  : (measurement.lower_spec_limit != null || measurement.lsl != null);
                
                if (hasValidLimit) {
                  // Trigger spec alarm event
                  const alarmEvent = new CustomEvent('specAlarm', {
                    detail: {
                      id: `${measurement.equipment_code}_${measurement.measurement_code}_${Date.now()}`,
                      equipment_code: measurement.equipment_code,
                      equipment_name: equipment?.equipment_name || measurement.equipment_code,
                      measurement_code: measurement.measurement_code,
                      measurement_desc: measurement.measurement_desc,
                      value: measurement.measurement_value,
                      spec_type: measurement.spec_status === 2 ? 'ABOVE_SPEC' : 'BELOW_SPEC',
                      spec_limit: measurement.spec_status === 2 
                        ? (measurement.upper_spec_limit || measurement.usl)
                        : (measurement.lower_spec_limit || measurement.lsl),
                      usl: measurement.upper_spec_limit || measurement.usl,
                      lsl: measurement.lower_spec_limit || measurement.lsl,
                      timestamp: new Date()
                    }
                  });
                  
                  window.dispatchEvent(alarmEvent);
                }
              }
            }
          });
        }
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
            
            // Filter measurements based on displayMeasurements configuration only
            const configuredMeasurements = measurementResponse.data.filter((m: MeasurementData) => {
              // If displayMeasurements is not set or empty, show no measurements
              if (!node.data.displayMeasurements || node.data.displayMeasurements.length === 0) {
                return false;
              }
              // Only show measurements that are in displayMeasurements (equipment code independent)
              return node.data.displayMeasurements.includes(m.measurement_code);
            });
            
            // Group measurements by code and take the latest
            const measurementMap = new Map<string, MeasurementData>();
            configuredMeasurements.forEach((m: MeasurementData) => {
              const existing = measurementMap.get(m.measurement_code);
              if (!existing || new Date(m.timestamp) > new Date(existing.timestamp)) {
                measurementMap.set(m.measurement_code, m);
              }
            });
            
            const latestMeasurements = Array.from(measurementMap.values()).map((m) => {
              return {
                code: m.measurement_code,
                desc: m.measurement_desc,
                value: m.measurement_value,
                spec_status: m.spec_status === 1 ? 'BELOW_SPEC' : 
                           m.spec_status === 2 ? 'ABOVE_SPEC' : 
                           m.spec_status === 9 ? 'NO_SPEC' : 'IN_SPEC',
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
      isDataLoadingRef.current = false;
    }
  }, [workspaceId, workspaceUuid, alarmCheck]);

  // Update visible equipment codes when nodes change
  useEffect(() => {
    const codes = new Set<string>();
    nodes.forEach(node => {
      if (node.type === 'equipment' && node.data.equipmentCode) {
        codes.add(node.data.equipmentCode);
      }
    });
    setVisibleEquipmentCodes(codes);
    visibleEquipmentCodesRef.current = codes;
  }, [nodes]);

  // Load data when visible equipment codes change or on initial flow selection
  useEffect(() => {
    if (selectedFlow) {
      const timer = setTimeout(() => {
        loadData();
      }, 2000); // Increased debounce time to 2 seconds
      return () => clearTimeout(timer);
    }
  }, [selectedFlow, loadData]);

  // Auto-refresh with minimum 10 second interval
  useEffect(() => {
    if (autoRefresh && selectedFlow) {
      const actualInterval = Math.max(refreshInterval, 10000); // Minimum 10 seconds
      const interval = setInterval(() => {
        if (!isDataLoadingRef.current) {
          loadData();
        }
      }, actualInterval);
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
    alarmCheck,
    isSidebarOpen,
    isFullscreen,
    statusCounts: getStatusCounts(),
    setSelectedFlow,
    setAutoRefresh,
    setRefreshInterval,
    setAutoScroll,
    setAlarmCheck,
    setIsSidebarOpen,
    loadData,
    forceRefresh: loadData,
    toggleFullscreen,
  };
};