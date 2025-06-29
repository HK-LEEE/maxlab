import { useState, useCallback, useEffect } from 'react';
import type { Node, Edge, Connection } from 'reactflow';
import { addEdge, useNodesState, useEdgesState } from 'reactflow';
import { apiClient } from '../../../api/client';
import { toast } from 'react-hot-toast';

interface ProcessFlow {
  id: string;
  name: string;
  flow_data: {
    nodes: Node[];
    edges: Edge[];
  };
  created_at: string;
  updated_at: string;
}

interface Equipment {
  code: string;
  name: string;
  icon: string;
}

interface EquipmentItem {
  equipment_code: string;
  equipment_name: string;
  equipment_type: string;
  status: string;
}

export const useFlowEditor = (workspaceId: string) => {
  // TODO: Get actual workspace UUID from context or props
  const workspaceUuid = '21ee03db-90c4-4592-b00f-c44801e0b164'; // temporary hardcoded UUID
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [currentFlow, setCurrentFlow] = useState<ProcessFlow | null>(null);
  const [flowName, setFlowName] = useState('New Process Flow');
  const [flows, setFlows] = useState<ProcessFlow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Equipment states
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [equipmentOffset, setEquipmentOffset] = useState(0);
  const [hasMoreEquipment, setHasMoreEquipment] = useState(true);
  const [isLoadingEquipment, setIsLoadingEquipment] = useState(false);
  const [measurementsList, setMeasurementsList] = useState<any[]>([]);
  
  // Editor settings
  const [edgeType, setEdgeType] = useState<string>('step');
  const [nodeSize, setNodeSize] = useState<'1' | '2' | '3'>('1');
  const [autoScroll, setAutoScroll] = useState(false);
  const [selectedElements, setSelectedElements] = useState({ nodes: 0, edges: 0 });

  const getNodeHeight = (size: '1' | '2' | '3') => {
    switch (size) {
      case '1': return 170;
      case '2': return 220;
      case '3': return 270;
      default: return 170;
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: edgeType }, eds)),
    [setEdges, edgeType]
  );

  const deleteSelectedNodes = useCallback(() => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  }, [setNodes, setEdges]);

  const addGroupNode = useCallback(() => {
    const newNode: Node = {
      id: `group_${Date.now()}`,
      type: 'group',
      position: { x: 200, y: 200 },
      data: {
        label: 'Group',
        color: '#3b82f6'
      },
      style: {
        width: 300,
        height: 200,
        zIndex: -1
      }
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const saveFlow = async () => {
    if (!workspaceId) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const flowData = {
        workspace_id: workspaceUuid,
        name: flowName,
        flow_data: { nodes, edges },
      };

      if (currentFlow) {
        await apiClient.put(`/api/v1/personal-test/process-flow/flows/${currentFlow.id}`, {
          name: flowName,
          flow_data: { nodes, edges },
        });
        toast.success('Flow updated successfully');
      } else {
        const response = await apiClient.post('/api/v1/personal-test/process-flow/flows', flowData);
        setCurrentFlow(response.data);
        toast.success('Flow created successfully');
      }
    } catch (err) {
      setError('Failed to save process flow');
      toast.error('Failed to save flow');
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const loadFlow = async (flow: ProcessFlow) => {
    setCurrentFlow(flow);
    setFlowName(flow.name);
    
    const nodesWithSizes = (flow.flow_data.nodes || []).map((node: Node) => {
      if (node.type === 'equipment' && !node.style?.width) {
        return {
          ...node,
          style: {
            ...node.style,
            width: 200,
            height: 150
          }
        };
      }
      return node;
    });
    setNodes(nodesWithSizes);
    
    const edgesWithType = (flow.flow_data.edges || []).map((edge: Edge) => ({
      ...edge,
      type: edge.type || 'step'
    }));
    setEdges(edgesWithType);
  };

  const loadMoreEquipment = async () => {
    // No longer needed - all equipment loaded at initialization
  };

  const alignNodes = useCallback((alignment: string) => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length < 2) return;

    const firstNode = selectedNodes[0];
    const firstNodeBounds = {
      left: firstNode.position.x,
      right: firstNode.position.x + (firstNode.style?.width || 200),
      top: firstNode.position.y,
      bottom: firstNode.position.y + (firstNode.style?.height || 150),
      centerX: firstNode.position.x + ((firstNode.style?.width || 200) / 2),
      centerY: firstNode.position.y + ((firstNode.style?.height || 150) / 2)
    };

    if (alignment === 'distribute-h' || alignment === 'distribute-v') {
      const sortedNodes = [...selectedNodes].sort((a, b) => 
        alignment === 'distribute-h' ? a.position.x - b.position.x : a.position.y - b.position.y
      );
      
      const firstPos = alignment === 'distribute-h' ? sortedNodes[0].position.x : sortedNodes[0].position.y;
      const lastPos = alignment === 'distribute-h' 
        ? sortedNodes[sortedNodes.length - 1].position.x 
        : sortedNodes[sortedNodes.length - 1].position.y;
      
      const totalDistance = lastPos - firstPos;
      const spacing = totalDistance / (sortedNodes.length - 1);
      
      setNodes((nds) => nds.map((node) => {
        const nodeIndex = sortedNodes.findIndex(n => n.id === node.id);
        if (nodeIndex > 0 && nodeIndex < sortedNodes.length - 1) {
          const newPosition = { ...node.position };
          if (alignment === 'distribute-h') {
            newPosition.x = firstPos + (spacing * nodeIndex);
          } else {
            newPosition.y = firstPos + (spacing * nodeIndex);
          }
          return { ...node, position: newPosition };
        }
        return node;
      }));
    } else {
      setNodes((nds) => nds.map((node) => {
        if (node.selected && node.id !== firstNode.id) {
          let newPosition = { ...node.position };
          
          switch (alignment) {
            case 'top':
              newPosition.y = firstNodeBounds.top;
              break;
            case 'bottom':
              newPosition.y = firstNodeBounds.bottom - (node.style?.height || 150);
              break;
            case 'left':
              newPosition.x = firstNodeBounds.left;
              break;
            case 'right':
              newPosition.x = firstNodeBounds.right - (node.style?.width || 200);
              break;
            case 'center-h':
              newPosition.x = firstNodeBounds.centerX - ((node.style?.width || 200) / 2);
              break;
            case 'center-v':
              newPosition.y = firstNodeBounds.centerY - ((node.style?.height || 150) / 2);
              break;
          }
          
          return { ...node, position: newPosition };
        }
        return node;
      }));
    }
  }, [nodes, setNodes]);

  // Update node sizes when nodeSize changes
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      if (node.type === 'equipment' && node.selected) {
        return {
          ...node,
          style: {
            ...node.style,
            height: getNodeHeight(nodeSize)
          }
        };
      }
      return node;
    }));
  }, [nodeSize, setNodes]);

  // Track selected elements
  useEffect(() => {
    const selectedNodes = nodes.filter(n => n.selected).length;
    const selectedEdges = edges.filter(e => e.selected).length;
    setSelectedElements({ nodes: selectedNodes, edges: selectedEdges });
  }, [nodes, edges]);

  // Update selected edges' type when edgeType changes
  useEffect(() => {
    setEdges((eds) => eds.map((edge) => {
      if (edge.selected) {
        return { ...edge, type: edgeType };
      }
      return edge;
    }));
  }, [edgeType, setEdges]);

  // Load initial data
  useEffect(() => {
    // Load all equipment and measurements
    Promise.all([
      apiClient.get('/api/v1/personal-test/process-flow/equipment/status?limit=1000'),
      apiClient.get('/api/v1/personal-test/process-flow/measurements?limit=1000'),
    ]).then(([equipmentRes, measurementsRes]) => {
      const items = equipmentRes.data.items || equipmentRes.data;
      setEquipmentList(items);
      setEquipmentOffset(items.length);
      setHasMoreEquipment(false);
      setMeasurementsList(measurementsRes.data);
    }).catch((err) => {
      console.error('Failed to load equipment data:', err);
    });

    // Load available flows
    apiClient.get(`/api/v1/personal-test/process-flow/flows?workspace_id=${workspaceUuid}`)
      .then((response) => {
        setFlows(response.data);
      })
      .catch((err) => {
        console.error('Failed to load flows:', err);
      });

    // Load existing flow if ID is provided
    const flowId = new URLSearchParams(window.location.search).get('flowId');
    if (flowId) {
      apiClient.get(`/api/v1/personal-test/process-flow/flows/${flowId}`)
        .then((response) => {
          loadFlow(response.data);
        })
        .catch((err) => {
          console.error('Failed to load flow:', err);
          setError('Failed to load process flow');
        });
    }
  }, []);

  return {
    nodes,
    edges,
    currentFlow,
    flowName,
    flows,
    isSaving,
    error,
    equipmentList,
    hasMoreEquipment,
    isLoadingEquipment,
    measurementsList,
    edgeType,
    nodeSize,
    autoScroll,
    selectedElements,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setFlowName,
    setEdgeType,
    setNodeSize,
    setAutoScroll,
    setNodes,
    setEdges,
    saveFlow,
    loadFlow,
    loadMoreEquipment,
    deleteSelectedNodes,
    addGroupNode,
    alignNodes,
    getNodeHeight,
  };
};