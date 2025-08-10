import { useState, useEffect, useCallback } from 'react';
import log from '../../../utils/logger';
import type { Node, Edge, NodeChange, EdgeChange } from 'reactflow';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { apiClient } from '../../../api/client';
import axios from 'axios';

interface ProcessFlow {
  id: string;
  name: string;
  flow_data: {
    nodes: Node[];
    edges: Edge[];
  };
  created_at: string;
  updated_at: string;
  is_published: boolean;
  publish_token: string;
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
  spec_status?: number; // 0: In spec, 1: Below spec, 2: Above spec, 9: No spec
  upper_spec_limit?: number;
  lower_spec_limit?: number;
  target_value?: number;
  usl?: number; // Alternative field name for upper_spec_limit
  lsl?: number; // Alternative field name for lower_spec_limit
  unit?: string; // Added for compatibility
}

export const usePublicFlowMonitor = (publishToken: string) => {
  const [flow, setFlow] = useState<ProcessFlow | null>(null);
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
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // Default 30 seconds
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [alarmCheck, setAlarmCheck] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [maxRetries] = useState(3);
  const [previousData, setPreviousData] = useState<{
    statuses: Map<string, any>,
    measurements: Map<string, any>
  }>({
    statuses: new Map(),
    measurements: new Map()
  });

  // Create a public axios instance without auth headers
  const publicClient = axios.create({
    baseURL: apiClient.defaults.baseURL,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'If-Modified-Since': 'Mon, 26 Jul 1997 05:00:00 GMT',
    },
  });


  // Load flow data
  const loadFlow = useCallback(async (forceRefresh: boolean = false) => {
    if (!publishToken) return;

    try {
      // Only show loading on initial load
      if (isInitialLoad) {
        setIsLoading(true);
      }
      setError(null);
      
      // Reset global scroll states for all nodes when force refreshing
      if (forceRefresh && typeof window !== 'undefined') {
        Object.keys(window).forEach(key => {
          if (key.startsWith('autoScroll_')) {
            delete (window as any)[key];
          }
        });
        log.info('Global scroll states reset for force refresh (Public)');
      }

      // Get the published flow with aggressive cache-busting
      const flowResponse = await publicClient.get(
        `/v1/personal-test/process-flow/public/${publishToken}?_t=${Date.now()}&_r=${Math.random().toString(36).substring(2)}`
      );
      const flowData = flowResponse.data;
      
      log.debug('Published flow data loaded', {
        flowName: flowData.name,
        totalNodes: flowData.flow_data?.nodes?.length || 0,
        totalEdges: flowData.flow_data?.edges?.length || 0,
        publishToken,
        flowId: flowData.id
      });
      
      setFlow(flowData);

      // Set nodes and edges only on initial load
      if (isInitialLoad && flowData.flow_data) {
        // Process nodes to ensure proper sizing like in useFlowEditor
        const processedNodes = (flowData.flow_data.nodes || []).map((node: any) => {
          if (node.type === 'equipment') {
            // Use saved nodeSize from flow data, fallback to node data, then default
            const savedNodeSize = flowData.flow_data?.nodeSize || node.data?.nodeSize || '1';
            const getNodeHeight = (size: '1' | '2' | '3') => {
              switch (size) {
                case '1': return 170;
                case '2': return 220; 
                case '3': return 270;
                default: return 170;
              }
            };
            const defaultHeight = getNodeHeight(savedNodeSize);
            const defaultWidth = 200;
            
            // CRITICAL: Prioritize stored resized dimensions over nodeSize defaults
            const finalWidth = node.style?.width || defaultWidth;
            const finalHeight = node.style?.height || defaultHeight;
            
            
            return {
              ...node,
              style: {
                // PRESERVE stored resized dimensions - they take priority over nodeSize defaults
                width: finalWidth,
                height: finalHeight,
                ...node.style // Preserve other style properties
              },
              data: {
                ...node.data,
                nodeSize: savedNodeSize // Ensure nodeSize is in data
              }
            };
          }
          return node;
        });
        
        setNodes(processedNodes);
        setEdges(flowData.flow_data.edges || []);
      }

      // Fetch equipment status and measurement data individually for published flows
      const [equipmentResponse, measurementResponse] = await Promise.all([
        publicClient.get(`/v1/personal-test/process-flow/public/${publishToken}/equipment/status?_t=${Date.now()}`),
        publicClient.get(`/v1/personal-test/process-flow/public/${publishToken}/measurements?_t=${Date.now()}`)
      ]);
      
      const validStatuses = equipmentResponse.data.items || [];
      const validMeasurements = measurementResponse.data || [];
      
      setEquipmentStatuses(validStatuses);
      setMeasurements(validMeasurements);

      // Check for spec violations and trigger alarms (only if alarm check is enabled)
      if (alarmCheck) {
        // Get monitored measurements from canvas nodes
        const monitoredMeasurements = new Map<string, Set<string>>();
        let totalMonitoredCount = 0;
        const currentNodes = isInitialLoad ? flowData.flow_data?.nodes || [] : nodes;
        
        currentNodes.forEach((node: any) => {
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
        console.log('🔍 [Public Monitor] Alarm Check Debug:', {
          alarmCheckEnabled: alarmCheck,
          canvasEquipmentCount: monitoredMeasurements.size,
          totalMonitoredMeasurements: totalMonitoredCount,
          monitoredEquipment: Array.from(monitoredMeasurements.keys()),
          measurementsCount: validMeasurements.length,
          measurementsWithSpec: validMeasurements.filter((m: MeasurementData) => m.spec_status !== undefined && m.spec_status !== null).length,
          outOfSpecCount: validMeasurements.filter((m: MeasurementData) => m.spec_status === 1 || m.spec_status === 2).length,
          timestamp: new Date().toISOString()
        });
        
        // Debug: Log monitored measurements configuration
        console.log('📋 [Public Monitor] Monitored measurements configuration:', 
          Array.from(monitoredMeasurements.entries()).map(([equipment, measurements]) => ({
            equipment,
            monitoredMeasurements: Array.from(measurements)
          }))
        );
        
        // Debug: Log all measurements by equipment
        console.log('📊 [Public Monitor] All measurements by equipment:', 
          validMeasurements.reduce((acc: any, m: MeasurementData) => {
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
        const monitoredSpecViolations = validMeasurements.filter((m: MeasurementData) => {
          const equipmentMeasurements = monitoredMeasurements.get(m.equipment_code);
          return equipmentMeasurements && 
                 equipmentMeasurements.has(m.measurement_code) &&
                 (m.spec_status === 1 || m.spec_status === 2);
        });
        
        if (monitoredSpecViolations.length > 0) {
          console.log('🚨 [Public Monitor] Monitored measurements with SPEC violations:', 
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
        
        validMeasurements.forEach((measurement: MeasurementData) => {
          // Check if this measurement is being monitored on canvas
          const equipmentMeasurements = monitoredMeasurements.get(measurement.equipment_code);
          if (!equipmentMeasurements || !equipmentMeasurements.has(measurement.measurement_code)) {
            return;
          }
          
          // Check if spec_status is properly defined
          if (measurement.spec_status === undefined || measurement.spec_status === null) {
            console.warn('⚠️ [Public Monitor] spec_status missing for measurement:', {
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
            console.log('⚠️ [Public Monitor] Out of spec detected:', {
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
              const equipment = validStatuses.find((e: EquipmentStatus) => 
                e.equipment_code === measurement.equipment_code
              );
              
              // Additional validation: only trigger alarm if relevant spec limit exists
              const hasValidLimit = measurement.spec_status === 2 
                ? (measurement.upper_spec_limit != null || measurement.usl != null)
                : (measurement.lower_spec_limit != null || measurement.lsl != null);
              
              if (hasValidLimit) {
                console.log('🚨 [Public Monitor] Triggering spec alarm for:', {
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
        const monitoredAlarmCount = validMeasurements.filter((m: MeasurementData) => {
          const equipmentMeasurements = monitoredMeasurements.get(m.equipment_code);
          return equipmentMeasurements && 
                 equipmentMeasurements.has(m.measurement_code) &&
                 (m.spec_status === 1 || m.spec_status === 2);
        }).length;
        
        console.log('🚨 [Public Monitor] Alarm Check Complete:', {
          monitoringEquipmentCount: monitoredMeasurements.size,
          totalMonitoredMeasurements: totalMonitoredCount,
          totalAlarmsDetected: monitoredAlarmCount,
          message: 'Monitoring only measurements configured in displayMeasurements for each equipment'
        });
      }

      // Update previous data for alarm checking
      const newStatusMap = new Map();
      validStatuses.forEach((status: EquipmentStatus) => {
        newStatusMap.set(status.equipment_code, status);
      });
      
      const newMeasurementMap = new Map();
      validMeasurements.forEach((measurement: MeasurementData) => {
        const key = `${measurement.equipment_code}_${measurement.measurement_code}`;
        newMeasurementMap.set(key, measurement);
      });
      
      setPreviousData({
        statuses: newStatusMap,
        measurements: newMeasurementMap
      });

      // Update nodes with real-time data - OPTIMIZED: Only update nodes that actually changed
      const updatedNodes = isInitialLoad ? flowData.flow_data?.nodes || [] : nodes;
      let hasAnyNodeChanged = false;
      
      const finalNodes = updatedNodes.map((node: Node) => {
        if (node.type === 'equipment' && node.data.equipmentCode) {
          const status = validStatuses.find(
            (s: EquipmentStatus) => s.equipment_code === node.data.equipmentCode
          );
          
          // Filter measurements based on displayMeasurements configuration
          const configuredMeasurements = validMeasurements.filter((m: MeasurementData) => {
            // If displayMeasurements is configured and not empty, filter by it
            if (node.data.displayMeasurements && node.data.displayMeasurements.length > 0) {
              return node.data.displayMeasurements.includes(m.measurement_code);
            }
            // If no displayMeasurements configured, show measurements for this equipment
            return m.equipment_code === node.data.equipmentCode;
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
              usl: m.upper_spec_limit || m.usl,
              lsl: m.lower_spec_limit || m.lsl,
              target_value: m.target_value
            };
          });

          const newStatus = status?.status || 'STOP';
          const newLastRunTime = status?.last_run_time || null;
          
          // Check if this node actually changed (skip on initial load)
          if (!isInitialLoad) {
            const statusChanged = node.data.status !== newStatus;
            const lastRunTimeChanged = node.data.last_run_time !== newLastRunTime;
            const measurementsChanged = !node.data.measurements || 
              JSON.stringify(node.data.measurements) !== JSON.stringify(latestMeasurements);
            
            if (statusChanged || lastRunTimeChanged || measurementsChanged) {
              hasAnyNodeChanged = true;
              log.debug('Public node data changed', {
                nodeId: node.id,
                statusChanged: statusChanged ? `${node.data.status} → ${newStatus}` : false,
                measurementCount: latestMeasurements.length
              });
            } else {
              return node; // No change, return original node
            }
          } else {
            hasAnyNodeChanged = true; // Initial load always counts as change
          }

          return {
            ...node,
            data: {
              ...node.data,
              status: newStatus,
              measurements: latestMeasurements,
              last_run_time: newLastRunTime,
            },
          };
        } else if (node.type === 'instrument' && node.data.displayMeasurements) {
          // For instrument nodes, filter measurements based on displayMeasurements only
          const configuredMeasurements = validMeasurements.filter((m: MeasurementData) => {
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
          
          // Check if measurements changed (skip on initial load)
          if (!isInitialLoad) {
            const measurementsChanged = !node.data.measurements || 
              JSON.stringify(node.data.measurements) !== JSON.stringify(latestMeasurements);
            
            if (measurementsChanged) {
              hasAnyNodeChanged = true;
              log.debug('Public instrument node data changed', {
                nodeId: node.id,
                measurementCount: latestMeasurements.length
              });
            } else {
              return node; // No change, return original node
            }
          } else {
            hasAnyNodeChanged = true; // Initial load always counts as change
          }
          
          return {
            ...node,
            data: {
              ...node.data,
              measurements: latestMeasurements,
            },
          };
        }
        return node;
      });
      
      // Only update nodes if something actually changed or it's initial load
      if (hasAnyNodeChanged || isInitialLoad) {
        if (!isInitialLoad) {
          log.debug('Updating public nodes due to data changes');
        }
        setNodes(finalNodes);
      }

      // Update edges based on node statuses
      const edgesToUpdate = isInitialLoad ? flowData.flow_data?.edges || [] : edges;
      const nodeStatusMap = new Map<string, string>();
      const nodeTypeMap = new Map<string, string>();
      
      // Build maps for node status and types
      finalNodes.forEach((node: Node) => {
        nodeTypeMap.set(node.id, node.type || 'unknown');
        if (node.type === 'equipment' && node.data.status) {
          nodeStatusMap.set(node.id, node.data.status);
        }
      });
      
      const updatedEdges = edgesToUpdate.map((edge: Edge) => {
        // Check node types to determine edge styling
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
      setEdges(updatedEdges);

      setLastUpdate(new Date());
      setIsInitialLoad(false);
      
      // Reset retry count on successful load
      if (retryCount > 0) {
        setRetryCount(0);
      }
    } catch (err: any) {
      log.error('Failed to load public flow', { error: err });
      
      // Check if this is a retryable error
      const isRetryableError = err.response?.status === 503 || 
                              err.response?.status >= 500 || 
                              err.code === 'NETWORK_ERROR' || 
                              !err.response;
      
      if (isRetryableError && retryCount < maxRetries) {
        const nextRetry = retryCount + 1;
        setRetryCount(nextRetry);
        log.info(`Retrying public flow load (${nextRetry}/${maxRetries})`);
        
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, nextRetry) * 1000;
        setTimeout(() => {
          loadFlow();
        }, delay);
        return;
      }
      
      // Set appropriate error message
      if (err.response?.status === 404) {
        setError('Flow not found or not published');
      } else if (err.response?.status === 503) {
        setError('Service temporarily unavailable. The monitoring system may be starting up or under maintenance. Please try again in a few moments.');
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later or contact support if the problem persists.');
      } else if (err.code === 'NETWORK_ERROR' || !err.response) {
        setError('Network connection error. Please check your internet connection and try again.');
      } else {
        setError('Failed to load flow data. Please try refreshing the page.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [publishToken, isInitialLoad]);

  // Initial load
  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh || !flow) return;

    const interval = setInterval(() => {
      loadFlow();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, flow, loadFlow, refreshInterval]);

  // Set global auto-scroll state
  useEffect(() => {
    (window as any).autoScrollMeasurements = autoScroll;
  }, [autoScroll]);

  return {
    flow,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    equipmentStatuses,
    measurements,
    isLoading,
    error,
    lastUpdate,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    setRefreshInterval,
    autoScroll,
    setAutoScroll,
    alarmCheck,
    setAlarmCheck,
    forceRefresh: () => loadFlow(true),
    retryCount,
    maxRetries,
  };
};