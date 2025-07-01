import { useState, useEffect, useCallback } from 'react';
import type { Node, Edge } from 'reactflow';
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
  last_run_time?: string;
}

interface Measurement {
  id: number;
  equipment_type: string;
  equipment_code: string;
  measurement_code: string;
  measurement_desc: string;
  measurement_value: number;
  timestamp: string;
}

export const usePublicFlowMonitor = (publishToken: string) => {
  const [flow, setFlow] = useState<ProcessFlow | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // Default 30 seconds
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Create a public axios instance without auth headers
  const publicClient = axios.create({
    baseURL: apiClient.defaults.baseURL,
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
      setEquipmentStatuses(statuses);

      // Get measurements
      const measurementResponse = await publicClient.get(
        `/api/v1/personal-test/process-flow/measurements?limit=100`
      );
      setMeasurements(measurementResponse.data);

      // Update nodes with real-time data
      setNodes((currentNodes) => {
        // Use current nodes for updates, not flowData nodes
        const nodesToUpdate = isInitialLoad ? flowData.flow_data?.nodes || [] : currentNodes;
        
        return nodesToUpdate.map((node: Node) => {
          if (node.type === 'equipment' && node.data.equipmentCode) {
            const status = statuses.find(
              (s: EquipmentStatus) => s.equipment_code === node.data.equipmentCode
            );
            const nodeMeasurements = measurementResponse.data.filter(
              (m: Measurement) => m.equipment_code === node.data.equipmentCode
            );

            if (status) {
              return {
                ...node,
                data: {
                  ...node.data,
                  status: status.status,
                  measurements: nodeMeasurements.map((m: Measurement) => ({
                    code: m.measurement_code,
                    desc: m.measurement_desc,
                    value: m.measurement_value,
                    unit: 'units',
                  })),
                },
              };
            }
          }
          return node;
        });
      });

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