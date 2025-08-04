import { useState, useCallback, useEffect } from 'react';
import type { Node, Edge, Connection } from 'reactflow';
import { addEdge, useNodesState, useEdgesState } from 'reactflow';
import { apiClient } from '../../../api/client';
import { toast } from 'react-hot-toast';
import { deleteFlowBackup } from '../utils/flowBackup';
import log from '../../../utils/logger';

interface ProcessFlow {
  id: string;
  name: string;
  flow_data: {
    nodes: Node[];
    edges: Edge[];
  };
  created_at: string;
  updated_at: string;
  is_published?: boolean;
  published_at?: string;
  publish_token?: string;
  data_source_id?: string;
  scope_type?: 'WORKSPACE' | 'USER';
  visibility_scope?: 'WORKSPACE' | 'PRIVATE';
  shared_with_workspace?: boolean;
  _isImported?: boolean;
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
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | null>(null);
  
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
    (params: Connection) => {
      // Get source and target nodes to determine edge styling
      const sourceNode = nodes.find(n => n.id === params.source);
      const targetNode = nodes.find(n => n.id === params.target);
      
      // Determine if this edge should have status representation
      const shouldShowStatus = sourceNode?.type === 'equipment' && targetNode?.type === 'equipment';
      
      // Set edge style based on node types
      const edgeStyle = shouldShowStatus 
        ? { strokeWidth: 2, stroke: '#374151' } // Default gray for equipment-to-equipment (will be updated with status colors)
        : { strokeWidth: 1, stroke: '#000000', strokeDasharray: '3,2' }; // Black dashed for equipment-to-other
      
      const newEdge = {
        ...params,
        type: edgeType,
        style: edgeStyle,
        data: { 
          type: edgeType,
          showStatus: shouldShowStatus,
          sourceNodeType: sourceNode?.type,
          targetNodeType: targetNode?.type
        }
      };
      
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges, edgeType, nodes]
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

  const saveFlow = async (isAutoSave = false, scopeData?: { scopeType: 'WORKSPACE' | 'USER', visibilityScope: 'WORKSPACE' | 'PRIVATE', sharedWithWorkspace: boolean }, overrideName?: string): Promise<any> => {
    if (!workspaceId) return;
    
    if (!isAutoSave) {
      setIsSaving(true);
    }
    setError(null);
    
    const finalFlowName = overrideName || flowName;
    
    log.debug('Flow save initiated', {
      totalNodes: nodes.length,
      flowName: finalFlowName,
      nodeSize: nodeSize,
      scopeData
    });
    
    try {
      // Use provided scope data or default to USER/PRIVATE
      const scope = scopeData || {
        scopeType: currentFlow?.scope_type || 'USER',
        visibilityScope: currentFlow?.visibility_scope || 'PRIVATE',
        sharedWithWorkspace: currentFlow?.shared_with_workspace || false
      };
      
      const flowData = {
        workspace_id: workspaceUuid,
        name: finalFlowName,
        flow_data: { nodes, edges, nodeSize },
        data_source_id: selectedDataSourceId,
        scope_type: scope.scopeType,
        visibility_scope: scope.visibilityScope,
        shared_with_workspace: scope.sharedWithWorkspace,
      };

      let savedFlow;
      
      // Check if this is an imported flow that needs to be created instead of updated
      if (currentFlow && !currentFlow._isImported) {
        const response = await apiClient.put(`/api/v1/personal-test/process-flow/flows/${currentFlow.id}`, {
          name: finalFlowName,
          flow_data: { nodes, edges, nodeSize },
          data_source_id: selectedDataSourceId,
          scope_type: scope.scopeType,
          visibility_scope: scope.visibilityScope,
          shared_with_workspace: scope.sharedWithWorkspace,
        });
        // Update currentFlow with the response to ensure we have the latest data
        log.debug('Flow update response received', { flowId: response.data.id });
        savedFlow = response.data;
        setCurrentFlow(savedFlow);
        if (!isAutoSave) {
          toast.success('Flow updated successfully');
        }
      } else {
        // Create new flow (either no currentFlow or imported flow)
        // IMPORTANT: Don't send the pre-generated id for imported flows
        const createFlowData = { ...flowData };
        if (currentFlow?._isImported) {
          // Remove the pre-generated id to let backend generate a new one
          delete (createFlowData as any).id;
          log.debug('Creating imported flow without pre-generated ID');
        }
        
        const response = await apiClient.post('/api/v1/personal-test/process-flow/flows', createFlowData);
        // Don't set _isImported flag on the saved flow - it's now a real flow in the database
        savedFlow = response.data;
        setCurrentFlow(savedFlow);
        if (!isAutoSave) {
          toast.success(currentFlow?._isImported ? 'Imported flow saved successfully' : 'Flow created successfully');
        }
      }
      
      if (isAutoSave) {
        setLastAutoSaveTime(new Date());
      }
      
      // 저장 성공 시 백업 삭제 (수동 저장일 때만, 자동 저장은 백업을 유지)
      if (!isAutoSave) {
        deleteFlowBackup(workspaceId, savedFlow?.id || null);
        log.debug('Backup deleted after successful save');
      }
      
      return savedFlow;
    } catch (err) {
      setError('Failed to save process flow');
      if (!isAutoSave) {
        toast.error('Failed to save flow');
      }
      log.error('Flow save failed', { error: err });
      throw err; // Re-throw error so caller can handle it
    } finally {
      if (!isAutoSave) {
        setIsSaving(false);
      }
    }
  };

  const loadFlow = async (flow: ProcessFlow) => {
    log.debug('Flow load initiated', {
      flowId: flow.id,
      flowName: flow.name,
      totalNodes: flow.flow_data?.nodes?.length || 0,
      flowDataSource: flow.data_source_id
    });
    
    // 로드하는 플로우의 백업 데이터 삭제 (새로운 플로우 로드 시 백업 불필요)
    deleteFlowBackup(workspaceId, flow.id);
    log.debug('Backup deleted for loaded flow', { flowId: flow.id });
    
    setCurrentFlow(flow);
    setFlowName(flow.name);
    setSelectedDataSourceId(flow.data_source_id || null);
    
    // Restore nodeSize from flow data
    if (flow.flow_data?.nodeSize) {
      setNodeSize(flow.flow_data.nodeSize);
      log.debug('Node size restored', { nodeSize: flow.flow_data.nodeSize });
    } else {
      setNodeSize('1'); // Default size if not saved
    }
    
    log.debug('Data source ID set', { dataSourceId: flow.data_source_id || null });
    
    const nodesWithDefaults = (flow.flow_data?.nodes || []).map((node: Node) => {
      // Ensure all nodes have proper structure
      const baseNode = {
        ...node,
        position: node.position || { x: 0, y: 0 },
        data: node.data || {}
      };

      // Add default styles based on node type
      if (node.type === 'equipment') {
        // Use saved nodeSize from flow data, fallback to node data, then default
        const savedNodeSize = flow.flow_data?.nodeSize || node.data?.nodeSize || '1';
        const defaultHeight = getNodeHeight(savedNodeSize);
        const defaultWidth = 200;
        
        // CRITICAL: Prioritize stored resized dimensions over nodeSize defaults
        // This ensures user-resized nodes maintain their custom sizes
        const finalWidth = baseNode.style?.width || defaultWidth;
        const finalHeight = baseNode.style?.height || defaultHeight;
        
        
        return {
          ...baseNode,
          style: {
            // PRESERVE stored resized dimensions - they take priority over nodeSize defaults
            width: finalWidth,
            height: finalHeight,
            ...baseNode.style // Preserve other style properties like position, etc.
          },
          data: {
            ...baseNode.data,
            nodeSize: savedNodeSize // Ensure nodeSize is in data for UI controls
          }
        };
      } else if (node.type === 'group') {
        return {
          ...baseNode,
          style: {
            width: 300,
            height: 200,
            ...baseNode.style // Preserve saved styles
          }
        };
      } else if (node.type === 'text') {
        // Text nodes typically don't need explicit size
        return baseNode;
      }
      
      return baseNode;
    });
    setNodes(nodesWithDefaults);
    
    const edgesWithType = (flow.flow_data?.edges || []).map((edge: Edge) => {
      // Preserve existing edge data and ensure backward compatibility
      const baseEdge = {
        ...edge,
        type: edge.type === 'bezier' ? 'default' : (edge.type || 'step')
      };
      
      // For existing edges without showStatus data, determine based on connected nodes
      if (baseEdge.data?.showStatus === undefined) {
        const sourceNode = nodesWithDefaults.find(n => n.id === edge.source);
        const targetNode = nodesWithDefaults.find(n => n.id === edge.target);
        const shouldShowStatus = sourceNode?.type === 'equipment' && targetNode?.type === 'equipment';
        
        // Update edge style if it's not equipment-to-equipment connection
        if (!shouldShowStatus && (!baseEdge.style?.strokeDasharray)) {
          baseEdge.style = {
            ...baseEdge.style,
            stroke: '#000000',
            strokeDasharray: '3,2',
            strokeWidth: 1
          };
        }
        
        baseEdge.data = {
          ...baseEdge.data,
          showStatus: shouldShowStatus,
          sourceNodeType: sourceNode?.type,
          targetNodeType: targetNode?.type
        };
      }
      
      return baseEdge;
    });
    setEdges(edgesWithType);
  };

  const loadMoreEquipment = async () => {
    // No longer needed - all equipment loaded at initialization
  };

  const publishFlow = async (flowId?: string, versionId?: string) => {
    const targetFlowId = flowId || currentFlow?.id;
    if (!targetFlowId) return;
    
    try {
      let response;
      if (versionId) {
        // Publish specific version
        response = await apiClient.put(`/api/v1/personal-test/process-flow/flows/${targetFlowId}/versions/${versionId}/publish`);
      } else {
        // Publish current version
        response = await apiClient.put(`/api/v1/personal-test/process-flow/flows/${targetFlowId}/publish`);
      }
      
      if (targetFlowId === currentFlow?.id) {
        setCurrentFlow({
          ...currentFlow,
          is_published: true,
          published_at: new Date().toISOString(),
          publish_token: response.data.publish_token
        });
      }
      
      toast.success('Flow published successfully');
      return response.data;
    } catch (err) {
      toast.error('Failed to publish flow');
      console.error('Publish error:', err);
      throw err;
    }
  };

  const unpublishFlow = async () => {
    if (!currentFlow) return;
    
    try {
      await apiClient.put(`/api/v1/personal-test/process-flow/flows/${currentFlow.id}/unpublish`);
      setCurrentFlow({
        ...currentFlow,
        is_published: false,
        published_at: undefined,
        publish_token: undefined
      });
      toast.success('Flow unpublished successfully');
    } catch (err) {
      toast.error('Failed to unpublish flow');
      console.error('Unpublish error:', err);
      throw err;
    }
  };

  const deleteFlow = async (flowId: string) => {
    try {
      await apiClient.delete(`/api/v1/personal-test/process-flow/flows/${flowId}`);
      
      // Update flows list
      setFlows((prevFlows) => prevFlows.filter(f => f.id !== flowId));
      
      // If deleting current flow, reset
      if (currentFlow?.id === flowId) {
        setCurrentFlow(null);
        setFlowName('New Process Flow');
        setNodes([]);
        setEdges([]);
      }
      
      toast.success('Flow deleted successfully');
    } catch (err) {
      toast.error('Failed to delete flow');
      console.error('Delete error:', err);
      throw err;
    }
  };

  // Validate equipment mappings
  const validateMappings = useCallback(() => {
    const issues: string[] = [];
    const equipmentCodes = new Set<string>();
    const unmappedNodes: Node[] = [];
    
    nodes.forEach(node => {
      if (node.type === 'equipment') {
        const code = node.data.equipmentCode;
        
        // Check for unmapped nodes
        if (!code && node.id !== 'common-equipment') {
          unmappedNodes.push(node);
        }
        
        // Check for duplicate mappings
        if (code && equipmentCodes.has(code)) {
          issues.push(`Duplicate mapping: Equipment ${code} is mapped to multiple nodes`);
        }
        if (code) equipmentCodes.add(code);
        
        // Check if equipment still exists
        if (code && equipmentList.length > 0) {
          const exists = equipmentList.some(eq => eq.equipment_code === code);
          if (!exists) {
            issues.push(`Missing equipment: ${code} no longer exists in database`);
          }
        }
      }
    });
    
    if (unmappedNodes.length > 0) {
      // Highlight unmapped nodes
      setNodes((nds) => nds.map(n => ({
        ...n,
        className: unmappedNodes.includes(n) ? 'ring-2 ring-yellow-400' : ''
      })));
    }
    
    return { isValid: issues.length === 0, issues, unmappedNodes };
  }, [nodes, equipmentList]);

  const alignNodes = useCallback((alignment: string) => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length < 2 && alignment !== 'canvas-center' && alignment !== 'grid') return;
    if (selectedNodes.length < 1) return;

    // Handle single node alignments
    if (alignment === 'canvas-center') {
      // Center selected nodes on canvas
      const viewportBounds = { width: window.innerWidth - 320, height: window.innerHeight - 100 }; // Approximate viewport size
      const centerX = viewportBounds.width / 2;
      const centerY = viewportBounds.height / 2;
      
      if (selectedNodes.length === 1) {
        // Center single node
        setNodes((nds) => nds.map((node) => {
          if (node.selected) {
            return {
              ...node,
              position: {
                x: centerX - ((node.style?.width || 200) / 2),
                y: centerY - ((node.style?.height || 150) / 2)
              }
            };
          }
          return node;
        }));
      } else {
        // Center group of nodes
        const bounds = selectedNodes.reduce((acc, node) => ({
          minX: Math.min(acc.minX, node.position.x),
          minY: Math.min(acc.minY, node.position.y),
          maxX: Math.max(acc.maxX, node.position.x + (node.style?.width || 200)),
          maxY: Math.max(acc.maxY, node.position.y + (node.style?.height || 150))
        }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
        
        const groupWidth = bounds.maxX - bounds.minX;
        const groupHeight = bounds.maxY - bounds.minY;
        const offsetX = centerX - (groupWidth / 2) - bounds.minX;
        const offsetY = centerY - (groupHeight / 2) - bounds.minY;
        
        setNodes((nds) => nds.map((node) => {
          if (node.selected) {
            return {
              ...node,
              position: {
                x: node.position.x + offsetX,
                y: node.position.y + offsetY
              }
            };
          }
          return node;
        }));
      }
      return;
    }

    if (alignment === 'grid') {
      // Snap to grid (15x15 grid as defined in ReactFlow)
      setNodes((nds) => nds.map((node) => {
        if (node.selected) {
          return {
            ...node,
            position: {
              x: Math.round(node.position.x / 15) * 15,
              y: Math.round(node.position.y / 15) * 15
            }
          };
        }
        return node;
      }));
      return;
    }

    if (alignment === 'circular') {
      // Arrange nodes in a circle
      const centerNode = selectedNodes[Math.floor(selectedNodes.length / 2)];
      const centerX = centerNode.position.x + ((centerNode.style?.width || 200) / 2);
      const centerY = centerNode.position.y + ((centerNode.style?.height || 150) / 2);
      const radius = Math.max(150, selectedNodes.length * 30);
      
      setNodes((nds) => nds.map((node, index) => {
        const nodeIndex = selectedNodes.findIndex(n => n.id === node.id);
        if (nodeIndex !== -1) {
          const angle = (nodeIndex * 2 * Math.PI) / selectedNodes.length;
          return {
            ...node,
            position: {
              x: centerX + radius * Math.cos(angle) - ((node.style?.width || 200) / 2),
              y: centerY + radius * Math.sin(angle) - ((node.style?.height || 150) / 2)
            }
          };
        }
        return node;
      }));
      return;
    }

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

  // Update node sizes when nodeSize changes - apply to selected equipment nodes only, PRESERVE larger dimensions
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      if (node.type === 'equipment' && node.selected) {
        const currentHeight = node.style?.height || getNodeHeight('1');
        const currentWidth = node.style?.width || 200;
        const newMinHeight = getNodeHeight(nodeSize);
        const newMinWidth = 200;
        
        // Parse current dimensions properly
        const parsedCurrentHeight = typeof currentHeight === 'number' 
          ? currentHeight 
          : parseFloat(String(currentHeight).replace('px', ''));
        const parsedCurrentWidth = typeof currentWidth === 'number' 
          ? currentWidth 
          : parseFloat(String(currentWidth).replace('px', ''));
        
        // CRITICAL: Only update if current dimensions are smaller than minimums
        // This preserves user-resized larger dimensions
        const shouldUpdateHeight = parsedCurrentHeight < newMinHeight;
        const shouldUpdateWidth = parsedCurrentWidth < newMinWidth;
        
        const finalHeight = shouldUpdateHeight ? newMinHeight : parsedCurrentHeight;
        const finalWidth = shouldUpdateWidth ? newMinWidth : parsedCurrentWidth;


        return {
          ...node,
          style: {
            ...node.style,
            height: finalHeight,
            width: finalWidth
          },
          data: {
            ...node.data,
            nodeSize: nodeSize
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

  // Auto-save feature
  useEffect(() => {
    if (!currentFlow) return;

    const autoSaveTimer = setTimeout(() => {
      saveFlow(true);
    }, 300000); // 5 minutes

    return () => clearTimeout(autoSaveTimer);
  }, [nodes, edges, currentFlow, flowName]);

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
      apiClient.get(`/api/v1/personal-test/process-flow/equipment/status?limit=100`),
      apiClient.get(`/api/v1/personal-test/process-flow/measurements?limit=100`),
    ]).then(([equipmentRes, measurementsRes]) => {
      const items = equipmentRes.data.items || equipmentRes.data;
      setEquipmentList(items);
      setEquipmentOffset(items.length);
      setHasMoreEquipment(false);
      setMeasurementsList(measurementsRes.data);
    }).catch((err) => {
      log.error('Failed to load equipment data', { error: err });
    });

    // Load available flows
    apiClient.get(`/api/v1/personal-test/process-flow/flows?workspace_id=${workspaceUuid}`)
      .then((response) => {
        setFlows(response.data);
      })
      .catch((err) => {
        log.error('Failed to load flows', { error: err });
      });

    // Load existing flow if ID is provided
    const flowId = new URLSearchParams(window.location.search).get('flowId');
    if (flowId) {
      apiClient.get(`/api/v1/personal-test/process-flow/flows/${flowId}`)
        .then((response) => {
          loadFlow(response.data);
        })
        .catch((err) => {
          log.error('Failed to load flow', { error: err });
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
    selectedDataSourceId,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setFlowName,
    setEdgeType,
    setNodeSize,
    setAutoScroll,
    setNodes,
    setEdges,
    setFlows,
    setCurrentFlow,
    setSelectedDataSourceId,
    saveFlow,
    loadFlow,
    validateMappings,
    loadMoreEquipment,
    deleteSelectedNodes,
    addGroupNode,
    alignNodes,
    getNodeHeight,
    publishFlow,
    unpublishFlow,
    deleteFlow,
    lastAutoSaveTime,
  };
};