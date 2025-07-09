import { useState, useEffect, useCallback } from 'react';
import type { Node, Edge } from 'reactflow';
import { apiClient } from '../../../api/client';
import { useWebSocket } from './useWebSocket';
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
  last_run_time?: string;
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
}

export const usePublicFlowMonitor = (publishToken: string) => {
  const [flow, setFlow] = useState<ProcessFlow | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // Default 30 seconds
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [alarmCheck, setAlarmCheck] = useState(true);
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
  });

  // WebSocket connection for real-time updates
  const { isConnected: wsConnected } = useWebSocket({
    workspace_id: '21ee03db-90c4-4592-b00f-c44801e0b164', // TODO: Get actual workspace UUID
    onMessage: (data) => {
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

  // Load flow data
  const loadFlow = useCallback(async () => {
    if (!publishToken) return;

    try {
      // Only show loading on initial load
      if (isInitialLoad) {
        setIsLoading(true);
      }
      setError(null);

      // Get the published flow
      const flowResponse = await publicClient.get(
        `/api/v1/personal-test/process-flow/public/${publishToken}`
      );
      const flowData = flowResponse.data;
      setFlow(flowData);

      // Set nodes and edges only on initial load
      if (isInitialLoad && flowData.flow_data) {
        setNodes(flowData.flow_data.nodes || []);
        setEdges(flowData.flow_data.edges || []);
      }

      // Get equipment statuses
      const statusResponse = await publicClient.get(
        `/api/v1/personal-test/process-flow/public/${publishToken}/status?limit=100`
      );
      const statuses = statusResponse.data.items || statusResponse.data;
      // console.log('Public Equipment Status Response:', statuses);
      setEquipmentStatuses(statuses);

      // Get measurements using the public endpoint
      const measurementResponse = await publicClient.get(
        `/api/v1/personal-test/process-flow/public/${publishToken}/measurements?limit=100`
      );
      setMeasurements(measurementResponse.data);

      // Check for spec violations and trigger alarms (only if alarm check is enabled)
      if (alarmCheck) {
        // Get all measurement codes that are configured to be displayed on current screen nodes
        const visibleMeasurementCodes = new Set<string>();
        const currentNodes = isInitialLoad ? flowData.flow_data?.nodes || [] : nodes;
        currentNodes.forEach(node => {
          if (node.type === 'equipment' && node.data.displayMeasurements) {
            node.data.displayMeasurements.forEach((code: string) => {
              visibleMeasurementCodes.add(code);
            });
          }
        });
        
        measurementResponse.data.forEach((measurement: MeasurementData) => {
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
              const equipment = statuses.find((e: EquipmentStatus) => 
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

      // Update previous data for alarm checking
      const newStatusMap = new Map();
      statuses.forEach((status: EquipmentStatus) => {
        newStatusMap.set(status.equipment_code, status);
      });
      
      const newMeasurementMap = new Map();
      measurementResponse.data.forEach((measurement: MeasurementData) => {
        const key = `${measurement.equipment_code}_${measurement.measurement_code}`;
        newMeasurementMap.set(key, measurement);
      });
      
      setPreviousData({
        statuses: newStatusMap,
        measurements: newMeasurementMap
      });

      // Update nodes with real-time data
      const updatedNodes = isInitialLoad ? flowData.flow_data?.nodes || [] : nodes;
      const finalNodes = updatedNodes.map((node: Node) => {
        if (node.type === 'equipment' && node.data.equipmentCode) {
          const status = statuses.find(
            (s: EquipmentStatus) => s.equipment_code === node.data.equipmentCode
          );
          
          // Filter measurements based on displayMeasurements configuration
          const configuredMeasurements = measurementResponse.data.filter((m: MeasurementData) => {
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

          return {
            ...node,
            data: {
              ...node.data,
              status: status?.status || 'STOP',
              measurements: latestMeasurements,
              last_run_time: status?.last_run_time || null,
            },
          };
        }
        return node;
      });
      setNodes(finalNodes);

      // Update edges based on node statuses
      const edgesToUpdate = isInitialLoad ? flowData.flow_data?.edges || [] : edges;
      const nodeStatusMap = new Map<string, string>();
      finalNodes.forEach((node: Node) => {
        if (node.type === 'equipment' && node.data.status) {
          nodeStatusMap.set(node.id, node.data.status);
        }
      });
      
      const updatedEdges = edgesToUpdate.map((edge: Edge) => {
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
      setEdges(updatedEdges);

      setLastUpdate(new Date());
      setIsInitialLoad(false);
    } catch (err: any) {
      console.error('Failed to load public flow:', err);
      if (err.response?.status === 404) {
        setError('Flow not found or not published');
      } else {
        setError('Failed to load flow data');
      }
    } finally {
      setIsLoading(false);
    }
  }, [publishToken, isInitialLoad, nodes, edges]);

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

  // Enable auto scroll for monitor
  useEffect(() => {
    (window as any).autoScrollMeasurements = true;
    return () => {
      (window as any).autoScrollMeasurements = false;
    };
  }, []);

  return {
    flow,
    nodes,
    edges,
    equipmentStatuses,
    measurements,
    isLoading,
    error,
    lastUpdate,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    setRefreshInterval,
  };
};