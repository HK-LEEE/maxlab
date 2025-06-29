import React, { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  ReactFlowProvider,
} from 'reactflow';
import type { Node, Edge, Connection } from 'reactflow';
import 'reactflow/dist/style.css';
import { Save, Plus, Trash2, Play, Pause, AlertCircle, Square, FileText, Settings } from 'lucide-react';
import { apiClient } from '../../../api/client';
import { EquipmentNode } from '../components/common/EquipmentNode';
import { GroupNode } from '../components/common/GroupNode';
import { NodeConfigDialog } from '../components/common/NodeConfigDialog';
import { useParams, useNavigate } from 'react-router-dom';

const nodeTypes = {
  equipment: EquipmentNode,
  group: GroupNode,
};

const defaultEdgeOptions = {
  type: 'step',
  animated: false,
  style: { 
    strokeWidth: 2,
    stroke: '#374151'
  },
};

const connectionLineStyle = {
  strokeWidth: 2,
  stroke: '#374151',
};

const equipmentTypes = [
  { code: 'A1', name: '감압기', icon: 'gauge' },
  { code: 'B1', name: '차압기', icon: 'activity' },
  { code: 'C1', name: '흡착기', icon: 'filter' },
  { code: 'C2', name: '측정기', icon: 'thermometer' },
  { code: 'D1', name: '압축기', icon: 'wind' },
  { code: 'D2', name: '펌프', icon: 'zap' },
  { code: 'E1', name: '탱크', icon: 'database' },
  { code: 'E2', name: '저장탱크', icon: 'archive' },
  { code: 'F1', name: '밸브', icon: 'git-merge' },
  { code: 'G1', name: '히터', icon: 'flame' },
];

interface ProcessFlow {
  id: string;
  name: string;
  workspace_id: string;
  flow_data: {
    nodes: Node[];
    edges: Edge[];
  };
}

export const ProcessFlowEditor: React.FC = () => {
  const navigate = useNavigate();
  const workspaceId = 'personal_test'; // Fixed workspace ID
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [currentFlow, setCurrentFlow] = useState<ProcessFlow | null>(null);
  const [flowName, setFlowName] = useState('New Process Flow');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [measurementsList, setMeasurementsList] = useState<any[]>([]);
  const [equipmentOffset, setEquipmentOffset] = useState(0);
  const [hasMoreEquipment, setHasMoreEquipment] = useState(true);
  const [isLoadingEquipment, setIsLoadingEquipment] = useState(false);
  const [flows, setFlows] = useState<ProcessFlow[]>([]);
  const [isLoadFlowOpen, setIsLoadFlowOpen] = useState(false);
  const [nodeSize, setNodeSize] = useState<'1' | '2' | '3'>('2');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [selectedElements, setSelectedElements] = useState<{ nodes: number; edges: number }>({ nodes: 0, edges: 0 });
  const [edgeType, setEdgeType] = useState<'straight' | 'step' | 'smoothstep' | 'bezier'>('step');
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Default edge options for 90-degree angles
  const defaultEdgeOptions = {
    type: 'step',
    animated: false,
    style: { strokeWidth: 2, stroke: '#000' },
    selectable: true
  };

  // Connection line style for 90-degree angles
  const connectionLineStyle = {
    strokeWidth: 2,
    stroke: '#000',
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: edgeType }, eds)),
    [setEdges, edgeType]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const equipmentData = event.dataTransfer.getData('application/equipment');
      if (!equipmentData || !reactFlowInstance) return;

      const type = JSON.parse(equipmentData);
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type.code}_${Date.now()}`,
        type: 'equipment',
        position,
        style: { width: 200, height: getNodeHeight(nodeSize) },
        data: {
          label: type.name,
          equipmentType: type.code,
          equipmentCode: '',
          equipmentName: type.name,
          status: 'STOP',
          icon: type.icon,
          displayMeasurements: [],
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodeSize, setNodes]
  );

  const getNodeHeight = (size: '1' | '2' | '3') => {
    switch (size) {
      case '1': return 170;
      case '2': return 220;
      case '3': return 270;
      default: return 220;
    }
  };

  const addEquipment = (type: typeof equipmentTypes[0]) => {
    const newNode: Node = {
      id: `${type.code}_${Date.now()}`,
      type: 'equipment',
      position: { x: 250, y: 250 },
      style: { width: 200, height: getNodeHeight(nodeSize) },
      data: {
        label: type.name,
        equipmentType: type.code,
        equipmentCode: '',
        equipmentName: type.name,
        status: 'STOP',
        icon: type.icon,
        displayMeasurements: [],
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setIsConfigDialogOpen(true);
  }, []);

  const alignNodes = (alignment: 'top' | 'bottom' | 'left' | 'right' | 'center-h' | 'center-v' | 'distribute-h' | 'distribute-v') => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length < 2) return;

    const firstNode = selected[0];
    const firstNodeBounds = {
      left: firstNode.position.x,
      right: firstNode.position.x + (firstNode.style?.width || 200),
      top: firstNode.position.y,
      bottom: firstNode.position.y + (firstNode.style?.height || 150),
      centerX: firstNode.position.x + ((firstNode.style?.width || 200) / 2),
      centerY: firstNode.position.y + ((firstNode.style?.height || 150) / 2)
    };

    if (alignment === 'distribute-h' || alignment === 'distribute-v') {
      // For distribution, we need at least 3 nodes
      if (selected.length < 3) return;
      
      // Sort nodes by position
      const sortedNodes = [...selected].sort((a, b) => 
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
      // For regular alignment, align all selected nodes to the first node
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
    
    setContextMenu(null);
  };

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    const selected = nodes.filter(n => n.selected);
    if (selected.length >= 2) {
      setContextMenu({ x: event.clientX, y: event.clientY });
    }
  }, [nodes]);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

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

  const handleNodeConfigSave = (nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data };
        }
        return node;
      })
    );
  };

  const deleteSelectedNodes = () => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  };

  const addGroupNode = () => {
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
        zIndex: -1 // Groups should be behind equipment nodes
      }
    };
    setNodes((nds) => nds.concat(newNode));
  };


  const saveFlow = async () => {
    if (!workspaceId) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const flowData = {
        workspace_id: workspaceId,
        name: flowName,
        flow_data: { nodes, edges },
      };

      if (currentFlow) {
        // Update existing flow
        await apiClient.put(`/api/v1/workspaces/personal_test/process-flow/flows/${currentFlow.id}`, {
          name: flowName,
          flow_data: { nodes, edges },
        });
      } else {
        // Create new flow
        const response = await apiClient.post('/api/v1/workspaces/personal_test/process-flow/flows', flowData);
        setCurrentFlow(response.data);
      }
    } catch (err) {
      setError('Failed to save process flow');
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const loadFlow = async (flow: ProcessFlow) => {
    setCurrentFlow(flow);
    setFlowName(flow.name);
    // Ensure nodes have proper default sizes if not specified
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
    // Ensure edges have the correct type for 90-degree angles
    const edgesWithType = (flow.flow_data.edges || []).map((edge: Edge) => ({
      ...edge,
      type: edge.type || 'step'
    }));
    setEdges(edgesWithType);
    setIsLoadFlowOpen(false);
  };

  const loadMoreEquipment = async () => {
    if (isLoadingEquipment || !hasMoreEquipment) return;
    
    setIsLoadingEquipment(true);
    try {
      const response = await apiClient.get(
        `/api/v1/workspaces/personal_test/process-flow/equipment/status?limit=20&offset=${equipmentOffset}`
      );
      const { items, has_more } = response.data;
      
      setEquipmentList(prev => [...prev, ...items]);
      setEquipmentOffset(prev => prev + items.length);
      setHasMoreEquipment(has_more);
    } catch (err) {
      console.error('Failed to load more equipment:', err);
    } finally {
      setIsLoadingEquipment(false);
    }
  };

  useEffect(() => {
    // Load initial equipment and measurements
    Promise.all([
      apiClient.get('/api/v1/workspaces/personal_test/process-flow/equipment/status?limit=20&offset=0'),
      apiClient.get('/api/v1/workspaces/personal_test/process-flow/measurements'),
    ]).then(([equipmentRes, measurementsRes]) => {
      const { items, has_more } = equipmentRes.data;
      setEquipmentList(items);
      setEquipmentOffset(items.length);
      setHasMoreEquipment(has_more);
      setMeasurementsList(measurementsRes.data);
    }).catch((err) => {
      console.error('Failed to load equipment data:', err);
    });

    // Load available flows
    if (workspaceId) {
      apiClient.get('/api/v1/workspaces/personal_test/process-flow/flows')
        .then((response) => {
          setFlows(response.data);
        })
        .catch((err) => {
          console.error('Failed to load flows:', err);
        });
    }

    // Load existing flow if ID is provided
    const flowId = new URLSearchParams(window.location.search).get('flowId');
    if (flowId) {
      apiClient.get(`/api/v1/workspaces/personal_test/process-flow/flows/${flowId}`)
        .then((response) => {
          const flow = response.data;
          setCurrentFlow(flow);
          setFlowName(flow.name);
          // Ensure nodes have proper default sizes if not specified
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
          // Ensure edges have the correct type for 90-degree angles
          const edgesWithType = (flow.flow_data.edges || []).map((edge: Edge) => ({
            ...edge,
            type: edge.type || 'step'
          }));
          setEdges(edgesWithType);
        })
        .catch((err) => {
          console.error('Failed to load flow:', err);
          setError('Failed to load process flow');
        });
    }
  }, [setNodes, setEdges, workspaceId]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">Process Flow Editor</h1>
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="px-3 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Flow name"
            />
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsLoadFlowOpen(!isLoadFlowOpen)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 relative"
            >
              <FileText size={16} />
              <span>Load Flow</span>
              {isLoadFlowOpen && flows.length > 0 && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white border rounded-lg shadow-lg z-10">
                  <div className="p-2">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Select a flow to load:</h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {flows.map((flow) => (
                        <button
                          key={flow.id}
                          onClick={() => loadFlow(flow)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                        >
                          <div className="font-medium">{flow.name}</div>
                          <div className="text-xs text-gray-500">
                            Updated: {new Date(flow.updated_at).toLocaleDateString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </button>
            <button
              onClick={saveFlow}
              disabled={isSaving}
              className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              <Save size={16} />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              onClick={() => navigate(`/workspace/${workspaceId}/personal-test/monitor`)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              <Play size={16} />
              <span>Monitor</span>
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 flex items-center text-red-600 text-sm">
            <AlertCircle size={16} className="mr-1" />
            {error}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r p-4 overflow-y-auto">
          <h3 className="font-semibold mb-4">Equipment Types</h3>
          <p className="text-xs text-gray-500 mb-3">Drag to canvas to add equipment</p>
          <div className="space-y-2">
            {equipmentTypes.map((type) => (
              <div
                key={type.code}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/equipment', JSON.stringify(type));
                  event.dataTransfer.effectAllowed = 'move';
                }}
                className="w-full flex items-center space-x-2 px-3 py-2 border rounded hover:bg-gray-50 text-left cursor-move"
              >
                <span className="text-lg">⚙️</span>
                <span>{type.name}</span>
              </div>
            ))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div
              draggable
              onDragStart={(event) => {
                const commonType = { code: '', name: '공통설비', icon: 'settings' };
                event.dataTransfer.setData('application/equipment', JSON.stringify(commonType));
                event.dataTransfer.effectAllowed = 'move';
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded hover:bg-gray-50 text-left cursor-move"
            >
              <span className="text-lg">⚙️</span>
              <span>공통설비</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">설비 타입을 나중에 지정</p>
          </div>
          
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Tools</h3>
            <div className="space-y-2">
              <button
                onClick={addGroupNode}
                className="w-full flex items-center space-x-2 px-3 py-2 border rounded hover:bg-gray-50"
              >
                <Square size={16} />
                <span>Add Group</span>
              </button>
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-600 mb-1">Node Size Template</h4>
                <div className="flex gap-1">
                  <button
                    onClick={() => setNodeSize('1')}
                    className={`flex-1 px-2 py-1 text-xs border rounded ${nodeSize === '1' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
                  >
                    1개
                  </button>
                  <button
                    onClick={() => setNodeSize('2')}
                    className={`flex-1 px-2 py-1 text-xs border rounded ${nodeSize === '2' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
                  >
                    2개
                  </button>
                  <button
                    onClick={() => setNodeSize('3')}
                    className={`flex-1 px-2 py-1 text-xs border rounded ${nodeSize === '3' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
                  >
                    3개+
                  </button>
                </div>
              </div>
              
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-600 mb-1">Edge Type</h4>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => setEdgeType('straight')}
                    className={`px-2 py-1 text-xs border rounded ${edgeType === 'straight' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
                  >
                    Straight
                  </button>
                  <button
                    onClick={() => setEdgeType('step')}
                    className={`px-2 py-1 text-xs border rounded ${edgeType === 'step' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
                  >
                    Step
                  </button>
                  <button
                    onClick={() => setEdgeType('smoothstep')}
                    className={`px-2 py-1 text-xs border rounded ${edgeType === 'smoothstep' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
                  >
                    Smooth
                  </button>
                  <button
                    onClick={() => setEdgeType('bezier')}
                    className={`px-2 py-1 text-xs border rounded ${edgeType === 'bezier' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
                  >
                    Bezier
                  </button>
                </div>
              </div>

              <button
                onClick={deleteSelectedNodes}
                className="w-full flex items-center space-x-2 px-3 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50"
              >
                <Trash2 size={16} />
                <span>Delete Selected</span>
              </button>
            </div>
          </div>
        </div>

        {/* Flow Canvas */}
        <div className="flex-1">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeContextMenu={onNodeContextMenu}
              onPaneClick={onPaneClick}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              connectionLineType="step"
              connectionLineStyle={connectionLineStyle}
              fitView
              minZoom={0.1}
              maxZoom={2}
              snapToGrid={true}
              snapGrid={[10, 10]}
              proOptions={{ hideAttribution: true }}
              elementsSelectable={true}
              selectNodesOnDrag={false}
            >
              <Background gap={10} />
              <Controls />
              <MiniMap />
              <Panel position="bottom-right" className="bg-white p-2 rounded shadow">
                <div className="text-xs text-gray-600">
                  Nodes: {nodes.length} | Edges: {edges.length}
                </div>
              </Panel>
            </ReactFlow>
          </ReactFlowProvider>
          
          {/* Floating Delete Button */}
          {(selectedElements.nodes > 0 || selectedElements.edges > 0) && (
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50">
              <button
                onClick={deleteSelectedNodes}
                className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 transition-all transform hover:scale-105"
              >
                <Trash2 size={20} />
                <span>
                  Delete {selectedElements.nodes > 0 && `${selectedElements.nodes} node${selectedElements.nodes > 1 ? 's' : ''}`}
                  {selectedElements.nodes > 0 && selectedElements.edges > 0 && ' and '}
                  {selectedElements.edges > 0 && `${selectedElements.edges} edge${selectedElements.edges > 1 ? 's' : ''}`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Node Configuration Dialog */}
      <NodeConfigDialog
        node={selectedNode}
        isOpen={isConfigDialogOpen}
        onClose={() => {
          setIsConfigDialogOpen(false);
          setSelectedNode(null);
        }}
        onSave={handleNodeConfigSave}
        equipmentTypes={equipmentTypes}
        availableEquipment={equipmentList}
        availableMeasurements={measurementsList}
      />

      {/* Context Menu for Node Alignment */}
      {contextMenu && (
        <div
          className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => alignNodes('top')}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          >
            위쪽 정렬
          </button>
          <button
            onClick={() => alignNodes('bottom')}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          >
            아래쪽 정렬
          </button>
          <button
            onClick={() => alignNodes('left')}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          >
            왼쪽 정렬
          </button>
          <button
            onClick={() => alignNodes('right')}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          >
            오른쪽 정렬
          </button>
          <div className="border-t border-gray-200 my-1"></div>
          <button
            onClick={() => alignNodes('center-h')}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          >
            가로 중앙 정렬
          </button>
          <button
            onClick={() => alignNodes('center-v')}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
          >
            세로 중앙 정렬
          </button>
          {nodes.filter(n => n.selected).length >= 3 && (
            <>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() => alignNodes('distribute-h')}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
              >
                가로 균등 배치
              </button>
              <button
                onClick={() => alignNodes('distribute-v')}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
              >
                세로 균등 배치
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};