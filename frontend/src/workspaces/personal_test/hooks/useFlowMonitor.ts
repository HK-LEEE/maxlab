import { useState, useEffect, useCallback, useRef } from 'react';
import log from '../../../utils/logger';
import type { Node, Edge, NodeChange, EdgeChange } from 'reactflow';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { apiClient } from '../../../api/client';

interface ProcessFlow {
  id: string;
  name: string;
  flow_data: {
    nodes: Node[];
    edges: Edge[];
  };
  data_source_id?: string;
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
  spec_status?: number; // 0: IN_SPEC, 1: BELOW_SPEC, 2: ABOVE_SPEC, 9: NO_SPEC
  upper_spec_limit?: number;
  lower_spec_limit?: number;
  target_value?: number;
  usl?: number; // Alternative field name for upper_spec_limit
  lsl?: number; // Alternative field name for lower_spec_limit
  unit?: string; // Added for compatibility
}

export const useFlowMonitor = (workspaceId: string) => {
  // TODO: Get actual workspace UUID from context or props
  const workspaceUuid = '21ee03db-90c4-4592-b00f-c44801e0b164'; // temporary hardcoded UUID
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // ReactFlow change handlers for node resizing support
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const [flows, setFlows] = useState<ProcessFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<ProcessFlow | null>(null);
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds default
  const [autoScroll, setAutoScroll] = useState(true);
  const [alarmCheck, setAlarmCheck] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isDataLoadingRef = useRef(false);

  // Set global auto-scroll state
  useEffect(() => {
    (window as any).autoScrollMeasurements = autoScroll;
  }, [autoScroll]);

  // Load process flows
  useEffect(() => {
    if (!workspaceId) return;
    
    apiClient.get(`/v1/personal-test/process-flow/flows?workspace_id=${workspaceUuid}&_t=${Date.now()}`)
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
  const loadData = useCallback(async (forceLoad = false) => {
    // Prevent duplicate API calls with stricter timing control
    if (isDataLoadingRef.current) {
      return;
    }
    
    // Rate limiting - prevent calls more frequent than every 5 seconds (unless forced)
    const now = Date.now();
    const lastCallTime = (window as any).lastApiCallTime || 0;
    if (!forceLoad && now - lastCallTime < 5000) {
      return;
    }
    
    // Reset global scroll states for all nodes when force refreshing
    if (forceLoad && typeof window !== 'undefined') {
      Object.keys(window).forEach(key => {
        if (key.startsWith('autoScroll_')) {
          delete (window as any)[key];
        }
      });
      log.info('Global scroll states reset for force refresh');
    }
    
    isDataLoadingRef.current = true;
    (window as any).lastApiCallTime = now;
    setIsLoading(true);
    
    try {
      // Build API URLs with data_source_id if available
      // If no data_source_id in flow, try to get the first active data source from workspace
      let dataSourceParam = '';
      
      if (selectedFlow?.data_source_id) {
        dataSourceParam = `&data_source_id=${selectedFlow.data_source_id}`;
      } else {
        // Fallback: get active data sources for workspace and use the first active one
        try {
          const dataSourcesResponse = await apiClient.get(`/v1/personal-test/process-flow/data-sources?workspace_id=${workspaceId}`);
          
          const activeSources = dataSourcesResponse.data.filter((ds: any) => 
            ds.is_active && 
            ds.source_type !== 'default' &&
            (ds.source_type === 'mssql' || ds.source_type === 'postgresql' || ds.source_type === 'api')
          );
          
          if (activeSources.length > 0) {
            dataSourceParam = `&data_source_id=${activeSources[0].id}`;
          }
        } catch (error) {
          console.warn('Failed to get data sources for fallback:', error);
        }
      }
      
      // Fetch equipment status and measurement data individually
      const [equipmentResponse, measurementResponse] = await Promise.all([
        apiClient.get(`/v1/personal-test/process-flow/equipment/status?workspace_id=${workspaceId}${dataSourceParam}&_t=${Date.now()}`),
        apiClient.get(`/v1/personal-test/process-flow/measurements?workspace_id=${workspaceId}${dataSourceParam}&_t=${Date.now()}`)
      ]);
      
      const equipmentStatusList = equipmentResponse.data.items || [];
      const newMeasurements = measurementResponse.data || [];
      
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
      }
      
      // Check for spec violations and trigger alarms (only if alarm check is enabled and data changed)
      if (alarmCheck && (hasStatusChanged || hasMeasurementChanged)) {
        // Get monitored measurements from canvas nodes
        const monitoredMeasurements = new Map<string, Set<string>>();
        let totalMonitoredCount = 0;
          
          nodes.forEach(node => {
            if (node.type === 'equipment' && node.data.equipmentCode) {
              // Only add if displayMeasurements is configured and not empty
              if (node.data.displayMeasurements && node.data.displayMeasurements.length > 0) {
                // Create set if doesn't exist for this equipment
                if (!monitoredMeasurements.has(node.data.equipmentCode)) {
                  monitoredMeasurements.set(node.data.equipmentCode, new Set());
                }
                
                // Add all measurements to the set (duplicates automatically handled)
                const measurementSet = monitoredMeasurements.get(node.data.equipmentCode)!;
                node.data.displayMeasurements.forEach((measurement: string) => {
                  if (!measurementSet.has(measurement)) {
                    measurementSet.add(measurement);
                    totalMonitoredCount++;
                  }
                });
              }
            }
          });

          // Debug logging for alarm check
          console.log('🔍 Alarm Check Debug:', {
            alarmCheckEnabled: alarmCheck,
            canvasEquipmentCount: monitoredMeasurements.size,
            totalMonitoredMeasurements: totalMonitoredCount,
            monitoredEquipment: Array.from(monitoredMeasurements.keys()),
            measurementsCount: newMeasurements.length,
            measurementsWithSpec: newMeasurements.filter((m: MeasurementData) => m.spec_status !== undefined && m.spec_status !== null).length,
            outOfSpecCount: newMeasurements.filter((m: MeasurementData) => m.spec_status === 1 || m.spec_status === 2).length,
            timestamp: new Date().toISOString()
          });
          
          // Debug: Log monitored measurements configuration
          console.log('📋 Monitored measurements configuration:', 
            Array.from(monitoredMeasurements.entries()).map(([equipment, measurements]) => ({
              equipment,
              monitoredMeasurements: Array.from(measurements)
            }))
          );
          
          // Debug: Log all measurements with their equipment codes
          console.log('📊 All measurements by equipment:', 
            newMeasurements.reduce((acc: any, m: MeasurementData) => {
              if (!acc[m.equipment_code]) acc[m.equipment_code] = [];
              acc[m.equipment_code].push({
                code: m.measurement_code,
                value: m.measurement_value,
                spec_status: m.spec_status,
                desc: m.measurement_desc
              });
              return acc;
            }, {})
          );
          
          // Debug: Log spec violations in monitored measurements
          const monitoredSpecViolations = newMeasurements.filter((m: MeasurementData) => {
            const equipmentMeasurements = monitoredMeasurements.get(m.equipment_code);
            return equipmentMeasurements && 
                   equipmentMeasurements.has(m.measurement_code) &&
                   (m.spec_status === 1 || m.spec_status === 2);
          });
          
          if (monitoredSpecViolations.length > 0) {
            console.log('🚨 Monitored measurements with SPEC violations:', 
              monitoredSpecViolations.map((m: MeasurementData) => ({
                equipment: m.equipment_code,
                measurement: m.measurement_code,
                desc: m.measurement_desc,
                value: m.measurement_value,
                spec_status: m.spec_status,
                status_meaning: m.spec_status === 1 ? 'BELOW_SPEC' : 'ABOVE_SPEC',
                usl: m.upper_spec_limit || m.usl,
                lsl: m.lower_spec_limit || m.lsl
              }))
            );
          }
          
          newMeasurements.forEach((measurement: MeasurementData) => {
            // Check if this measurement is being monitored on canvas
            const equipmentMeasurements = monitoredMeasurements.get(measurement.equipment_code);
            if (!equipmentMeasurements || !equipmentMeasurements.has(measurement.measurement_code)) {
              return;
            }
            
            // Check if spec_status is properly defined
            if (measurement.spec_status === undefined || measurement.spec_status === null) {
              console.warn('⚠️ spec_status missing for measurement:', {
                equipment_code: measurement.equipment_code,
                measurement_code: measurement.measurement_code,
                measurement_desc: measurement.measurement_desc,
                value: measurement.measurement_value
              });
              return;
            }

            // Only trigger alarms for spec_status 1 (BELOW_SPEC) and 2 (ABOVE_SPEC)
            // Exclude spec_status 9 (NO_SPEC) and 0 (IN_SPEC) from alarms
            if (measurement.spec_status === 1 || measurement.spec_status === 2) {
              console.log('⚠️ Out of spec detected:', {
                equipment: measurement.equipment_code,
                measurement: measurement.measurement_code,
                desc: measurement.measurement_desc,
                value: measurement.measurement_value,
                spec_status: measurement.spec_status,
                status_meaning: measurement.spec_status === 1 ? 'BELOW_SPEC' : 'ABOVE_SPEC',
                usl: measurement.upper_spec_limit || measurement.usl,
                lsl: measurement.lower_spec_limit || measurement.lsl
              });

              // Check if this is a new alarm or status change
              const key = `${measurement.equipment_code}_${measurement.measurement_code}`;
              const prevMeasurement = previousData.measurements.get(key);
              const isInitialCheck = previousData.measurements.size === 0;
              
              // Trigger alarm on: initial load with violations, new measurement, or status change
              if (isInitialCheck || !prevMeasurement || prevMeasurement.spec_status !== measurement.spec_status) {
                // Find equipment info
                const equipment = equipmentStatusList.find((e: EquipmentStatus) => 
                  e.equipment_code === measurement.equipment_code
                );
                
                // Additional validation: only trigger alarm if relevant spec limit exists
                const hasValidLimit = measurement.spec_status === 2 
                  ? (measurement.upper_spec_limit != null || measurement.usl != null)
                  : (measurement.lower_spec_limit != null || measurement.lsl != null);
                
                if (hasValidLimit) {
                  console.log('🚨 Triggering spec alarm for:', {
                    equipment: measurement.equipment_code,
                    measurement: measurement.measurement_code,
                    previousStatus: prevMeasurement?.spec_status,
                    currentStatus: measurement.spec_status,
                    isInitialCheck: isInitialCheck,
                    isNewAlarm: !prevMeasurement,
                    isStatusChange: prevMeasurement && prevMeasurement.spec_status !== measurement.spec_status
                  });
                  
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

          // Summary of alarm check completion
          const monitoredAlarmCount = newMeasurements.filter((m: MeasurementData) => {
            const equipmentMeasurements = monitoredMeasurements.get(m.equipment_code);
            return equipmentMeasurements && 
                   equipmentMeasurements.has(m.measurement_code) &&
                   (m.spec_status === 1 || m.spec_status === 2);
          }).length;
          
          console.log('🚨 Alarm Check Complete:', {
            monitoringEquipmentCount: monitoredMeasurements.size,
            totalMonitoredMeasurements: totalMonitoredCount,
            totalAlarmsDetected: monitoredAlarmCount,
            message: 'Monitoring only measurements configured in displayMeasurements for each equipment'
          });
      }
      
      if (hasStatusChanged || hasMeasurementChanged) {
        setPreviousData({
          statuses: newStatusMap,
          measurements: newMeasurementMap
        });
        setLastUpdate(new Date());
      
        // Update nodes with real-time data - OPTIMIZED: Only update nodes that actually changed
        setNodes((currentNodes) => {
          let hasAnyNodeChanged = false;
          
          const updatedNodes = currentNodes.map((node) => {
            if (node.type === 'equipment' && node.data.equipmentCode) {
              const status = equipmentStatusList.find((s: EquipmentStatus) => 
                s.equipment_code === node.data.equipmentCode
              );
              
              // Filter measurements based on displayMeasurements configuration only
              const configuredMeasurements = newMeasurements.filter((m: MeasurementData) => {
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
              
              const newStatus = status?.status || 'STOP';
              
              // Check if this node actually changed
              const statusChanged = node.data.status !== newStatus;
              const measurementsChanged = !node.data.measurements || 
                JSON.stringify(node.data.measurements) !== JSON.stringify(latestMeasurements);
              
              if (statusChanged || measurementsChanged) {
                hasAnyNodeChanged = true;
                
                return {
                  ...node,
                  data: {
                    ...node.data,
                    status: newStatus,
                    measurements: latestMeasurements,
                  },
                };
              }
            } else if (node.type === 'instrument' && node.data.displayMeasurements) {
              // For instrument nodes, filter measurements based on displayMeasurements only
              const configuredMeasurements = newMeasurements.filter((m: MeasurementData) => {
                // Show measurements that are in displayMeasurements array
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
                // Determine trend based on previous value
                let trend = 'stable' as 'up' | 'down' | 'stable';
                const prevMeasurement = node.data.measurements?.find((prev: any) => prev.code === m.measurement_code);
                if (prevMeasurement && prevMeasurement.value !== undefined) {
                  if (m.measurement_value > prevMeasurement.value) trend = 'up';
                  else if (m.measurement_value < prevMeasurement.value) trend = 'down';
                }
                
                return {
                  code: m.measurement_code,
                  desc: m.measurement_desc,
                  value: m.measurement_value,
                  unit: m.unit,
                  spec_status: m.spec_status === 1 ? 'BELOW_SPEC' : 
                             m.spec_status === 2 ? 'ABOVE_SPEC' : 
                             m.spec_status === 9 ? 'NO_SPEC' : 'IN_SPEC',
                  upper_spec_limit: m.upper_spec_limit || m.usl,
                  lower_spec_limit: m.lower_spec_limit || m.lsl,
                  target_value: m.target_value,
                  trend: trend,
                  history: [] // TODO: Maintain history for trend display
                };
              });
              
              // Check if measurements changed
              const measurementsChanged = !node.data.measurements || 
                JSON.stringify(node.data.measurements) !== JSON.stringify(latestMeasurements);
              
              if (measurementsChanged) {
                hasAnyNodeChanged = true;
                
                return {
                  ...node,
                  data: {
                    ...node.data,
                    measurements: latestMeasurements,
                  },
                };
              }
            }
            return node;
          });
          
          // Only return updated nodes if something actually changed
          if (hasAnyNodeChanged) {
            // Update edges based on the UPDATED node statuses (using updatedNodes, not stale nodes state)
            setEdges((currentEdges) => {
              const nodeStatusMap = new Map<string, string>();
              const nodeTypeMap = new Map<string, string>();
              
              // Use updatedNodes to get the current status information and node types
              updatedNodes.forEach(node => {
                nodeTypeMap.set(node.id, node.type || 'unknown');
                if (node.type === 'equipment' && node.data.status) {
                  nodeStatusMap.set(node.id, node.data.status);
                }
              });
              
              return currentEdges.map(edge => {
                // Check if either end is an instrument node
                const sourceType = nodeTypeMap.get(edge.source);
                const targetType = nodeTypeMap.get(edge.target);
                const shouldShowStatus = sourceType === 'equipment' && targetType === 'equipment';
                
                // If it's not equipment-to-equipment edge, use black dashed styling without animation or status labels
                if (!shouldShowStatus) {
                  return {
                    ...edge,
                    type: 'custom',
                    animated: false,
                    style: {
                      ...edge.style,
                      stroke: '#000000', // Black color for non-equipment connections
                      strokeWidth: 1,
                      strokeDasharray: '3,2', // Dashed line
                    },
                    data: {
                      ...edge.data,
                      type: edge.type || edge.data?.type || 'smoothstep',
                      label: null,
                      animated: false,
                      showStatus: false, // Explicitly disable status representation
                      sourceNodeType: sourceType,
                      targetNodeType: targetType,
                    }
                  };
                }
                
                // For equipment nodes, use status-based styling
                const sourceStatus = nodeStatusMap.get(edge.source) || 'STOP';
                const targetStatus = nodeStatusMap.get(edge.target) || 'STOP';
                
                // Define edge styles based on status combinations
                const statusKey = `${sourceStatus}-${targetStatus}`;
                
                let edgeStyle = {};
                let label = null;
                let animated = false;
                
                switch (statusKey) {
                  case 'ACTIVE-ACTIVE':
                    edgeStyle = { stroke: '#10b981', strokeWidth: 1.5 };
                    animated = true;
                    break;
                  case 'ACTIVE-PAUSE':
                    edgeStyle = { stroke: '#eab308', strokeWidth: 2, strokeDasharray: '8 4' };
                    animated = true;
                    label = '대상 일시정지';
                    break;
                  case 'ACTIVE-STOP':
                    edgeStyle = { stroke: '#ef4444', strokeWidth: 1.5 };
                    animated = false;
                    label = '대상 정지';
                    break;
                  case 'PAUSE-ACTIVE':
                    edgeStyle = { stroke: '#eab308', strokeWidth: 2, strokeDasharray: '8 4' };
                    animated = true;
                    label = '출발 일시정지';
                    break;
                  case 'PAUSE-PAUSE':
                    edgeStyle = { stroke: '#eab308', strokeWidth: 2, strokeDasharray: '8 4' };
                    animated = true;
                    label = '모두 일시정지';
                    break;
                  case 'PAUSE-STOP':
                    edgeStyle = { stroke: '#ef4444', strokeWidth: 1.5 };
                    animated = false;
                    label = '대상 정지';
                    break;
                  case 'STOP-ACTIVE':
                    edgeStyle = { stroke: '#ef4444', strokeWidth: 1.5 };
                    animated = false;
                    label = '출발 정지';
                    break;
                  case 'STOP-PAUSE':
                    edgeStyle = { stroke: '#ef4444', strokeWidth: 1.5 };
                    animated = false;
                    label = '출발 정지';
                    break;
                  case 'STOP-STOP':
                    edgeStyle = { stroke: '#ef4444', strokeWidth: 1.5 };
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
                    showStatus: true, // Explicitly enable status representation for equipment-to-equipment
                    sourceNodeType: sourceType,
                    targetNodeType: targetType,
                  }
                };
              });
            });
            
            return updatedNodes;
          } else {
            return currentNodes;
          }
        });
      } // Close the if (hasStatusChanged || hasMeasurementChanged) block
    } catch (err) {
      log.error('Failed to load flow monitor data', { error: err });
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

  // Load data immediately when flow is selected, with debounce only for equipment code changes
  useEffect(() => {
    if (selectedFlow) {
      log.info('Flow selected, loading data', { flowName: selectedFlow.name });
      // Immediate load for flow selection - bypass rate limiting
      loadData(true);
    }
  }, [selectedFlow]); // Remove loadData from dependencies to prevent loops
  
  // Separate effect for equipment code changes with debounce
  useEffect(() => {
    if (selectedFlow && visibleEquipmentCodes.size > 0) {
      const timer = setTimeout(() => {
        loadData();
      }, 1000); // Reduced debounce time to 1 second for equipment changes
      return () => clearTimeout(timer);
    }
  }, [visibleEquipmentCodes, selectedFlow]);

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
      
      // Set new nodes and edges with saved nodeSize applied
      const savedNodeSize = (selectedFlow.flow_data as any).nodeSize || '1';
      const getNodeHeight = (size: '1' | '2' | '3') => {
        switch (size) {
          case '1': return 170;
          case '2': return 220;
          case '3': return 270;
          default: return 170;
        }
      };
      
      const nodesWithSavedSize = (selectedFlow.flow_data.nodes || []).map((node: any) => {
        // Don't add autoScroll here, let global value handle it
        const nodeWithData = {
          ...node,
          data: {
            ...node.data
          }
        };
        
        if (node.type === 'equipment') {
          // Use saved nodeSize from flow data, fallback to node data, then default
          const nodeSize = (selectedFlow.flow_data as any)?.nodeSize || node.data?.nodeSize || '1';
          const defaultHeight = getNodeHeight(nodeSize);
          const defaultWidth = 200;
          
          // CRITICAL: Prioritize stored resized dimensions over nodeSize defaults
          const finalWidth = node.style?.width || defaultWidth;
          const finalHeight = node.style?.height || defaultHeight;
          
          
          return {
            ...nodeWithData,
            style: {
              // PRESERVE stored resized dimensions - they take priority over nodeSize defaults
              width: finalWidth,
              height: finalHeight,
              ...node.style // Preserve other style properties
            },
            data: {
              ...nodeWithData.data,
              nodeSize: nodeSize // Ensure nodeSize is in data
            }
          };
        }
        return nodeWithData;
      });
      
      setNodes(nodesWithSavedSize);
      setEdges(selectedFlow.flow_data.edges || []);
    }
  }, [selectedFlow]);

  const getStatusCounts = () => {
    const counts = { ACTIVE: 0, PAUSE: 0, STOP: 0 };
    
    // 현재 Flow에 등록된 equipment 노드 정보 수집
    const nodeEquipmentMap = new Map<string, any>();
    const nodeEquipmentTypes = new Set<string>();
    
    nodes.forEach(node => {
      if (node.type === 'equipment') {
        // equipmentCode가 있으면 우선 사용
        if (node.data.equipmentCode) {
          nodeEquipmentMap.set(node.data.equipmentCode, node);
        }
        // equipmentType도 수집 (fallback용)
        if (node.data.equipmentType) {
          nodeEquipmentTypes.add(node.data.equipmentType);
        }
      }
    });
    
    // 노드에 등록된 설비만 카운팅
    equipmentStatuses.forEach((status) => {
      // 1. equipmentCode로 먼저 매칭 시도
      const isInFlow = nodeEquipmentMap.has(status.equipment_code) ||
                       // 2. equipmentCode가 없으면 equipmentType으로 매칭
                       nodeEquipmentTypes.has(status.equipment_type);
      
      if (isInFlow) {
        if (status.status === 'ACTIVE') {
          counts.ACTIVE++;
        } else if (status.status === 'PAUSE') {
          counts.PAUSE++;
        } else if (status.status === 'STOP') {
          counts.STOP++;
        }
      }
    });
    
    return counts;
  };

  const getInstrumentCount = () => {
    return nodes.filter(node => node.type === 'instrument').length;
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
    setAutoScroll,
    alarmCheck,
    isSidebarOpen,
    isFullscreen,
    statusCounts: getStatusCounts(),
    instrumentCount: getInstrumentCount(),
    onNodesChange,
    onEdgesChange,
    setSelectedFlow,
    setAutoRefresh,
    setRefreshInterval,
    setAlarmCheck,
    setIsSidebarOpen,
    loadData,
    forceRefresh: () => loadData(true),
    toggleFullscreen,
  };
};