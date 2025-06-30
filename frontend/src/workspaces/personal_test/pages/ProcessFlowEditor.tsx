import React, { useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import type { Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { Save, FileText, Square, Trash2 } from 'lucide-react';

import { EquipmentNode } from '../components/common/EquipmentNode';
import { GroupNode } from '../components/common/GroupNode';
import { TextNode } from '../components/common/TextNode';
import { NodeConfigDialog } from '../components/common/NodeConfigDialog';
import { TextConfigDialog } from '../components/common/TextConfigDialog';
import { FloatingActionButton } from '../components/common/FloatingActionButton';

import { EditorSidebar } from '../components/editor/EditorSidebar';
import { LoadFlowDialog } from '../components/editor/LoadFlowDialog';
import { AlignmentMenu } from '../components/editor/AlignmentMenu';

import { useFlowEditor } from '../hooks/useFlowEditor';
import { Layout } from '../../../components/common/Layout';

// Define nodeTypes outside component to avoid re-creation
const nodeTypes = {
  equipment: EquipmentNode,
  group: GroupNode,
  text: TextNode,
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
  { code: 'H1', name: '냉각기', icon: 'snowflake' },
];

// Node color function for minimap
const nodeColor = (node: Node) => {
  switch (node.type) {
    case 'equipment':
      return node.data.equipmentType ? '#3b82f6' : '#9ca3af'; // Blue for typed, gray for untyped
    case 'group':
      return '#8b5cf6'; // Purple
    case 'text':
      return '#10b981'; // Green
    default:
      return '#6b7280'; // Gray
  }
};

const ProcessFlowEditorContent: React.FC = () => {
  const workspaceId = 'personal_test';
  const { screenToFlowPosition } = useReactFlow();
  
  const {
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
  } = useFlowEditor(workspaceId);

  const [isLoadFlowOpen, setIsLoadFlowOpen] = useState(false);
  const [configNode, setConfigNode] = useState<Node | null>(null);
  const [textConfigNode, setTextConfigNode] = useState<Node | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const dragData = event.dataTransfer.getData('application/dragdata');
      if (!dragData) return;

      const { type, data } = JSON.parse(dragData);
      
      // Convert screen coordinates to flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let newNode: Node;

      if (type === 'equipment') {
        newNode = {
          id: `${data.code}_${Date.now()}`,
          type: 'equipment',
          position,
          style: { width: 200, height: getNodeHeight(nodeSize) },
          data: {
            label: data.name,
            equipmentType: data.code,
            equipmentCode: '',
            equipmentName: data.name,
            status: 'STOP',
            icon: data.icon,
            displayMeasurements: [],
          },
        };
      } else if (type === 'text') {
        newNode = {
          id: `text_${Date.now()}`,
          type: 'text',
          position,
          data: {
            text: data.text || 'Text',
            fontSize: data.fontSize || 14,
            color: data.color || '#000000',
          },
        };
      } else if (type === 'group') {
        newNode = {
          id: `group_${Date.now()}`,
          type: 'group',
          position,
          style: {
            width: 300,
            height: 200,
          },
          data: { 
            label: 'Group',
            color: '#6b7280',
            backgroundColor: '#6b7280',
            backgroundOpacity: 10,
            titleSize: 14,
            titleColor: '#374151',
            titlePosition: 'top',
            zIndex: 0,
            borderStyle: 'dashed',
          },
        };
      } else if (type === 'template') {
        // Create node from template
        const templateType = data.equipmentType ? 'equipment' : data.label !== undefined ? 'group' : 'text';
        newNode = {
          id: `${templateType}_${Date.now()}`,
          type: templateType,
          position,
          style: templateType === 'group' ? { width: 300, height: 200 } : templateType === 'equipment' ? { width: 200, height: getNodeHeight(nodeSize) } : undefined,
          data: { ...data },
        };
      } else {
        return;
      }

      setNodes((nds) => nds.concat(newNode));
    },
    [nodeSize, setNodes, getNodeHeight, screenToFlowPosition]
  );


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

  const handleDeleteAction = (elementId: string, elementType: 'node' | 'edge') => {
    if (elementType === 'node') {
      setNodes((nds) => nds.filter((node) => node.id !== elementId));
    } else {
      setEdges((eds) => eds.filter((edge) => edge.id !== elementId));
    }
  };

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'equipment' || node.type === 'group') {
      setConfigNode(node);
    } else if (node.type === 'text') {
      setTextConfigNode(node);
    }
  }, []);

  const onDragStart = (event: React.DragEvent, dragData: any) => {
    event.dataTransfer.setData('application/dragdata', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleLoadFlow = async (flow: any) => {
    await loadFlow(flow);
    setIsLoadFlowOpen(false);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Flow Editor Controls Bar */}
      <div className="bg-white border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              placeholder="Flow name"
            />
            <button
              onClick={saveFlow}
              disabled={isSaving}
              className="flex items-center space-x-1 px-3 py-1.5 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 text-sm"
            >
              <Save size={16} />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              onClick={() => setIsLoadFlowOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
            >
              <FileText size={16} />
              <span>Load</span>
            </button>
          </div>
          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: edgeType,
            animated: false,
            style: { strokeWidth: 2, stroke: '#374151' },
          }}
          connectionLineStyle={{ strokeWidth: 2, stroke: '#374151' }}
          snapToGrid={true}
          snapGrid={[15, 15]}
          fitView
        >
          <Background color="#aaa" gap={16} />
          <Controls />
          <MiniMap nodeColor={nodeColor} />
        </ReactFlow>

        {/* Sidebar */}
        <EditorSidebar
          equipmentTypes={equipmentTypes}
          equipmentList={equipmentList}
          hasMoreEquipment={hasMoreEquipment}
          isLoadingEquipment={isLoadingEquipment}
          searchTerm={searchTerm}
          edgeType={edgeType}
          nodeSize={nodeSize}
          autoScroll={autoScroll}
          selectedElements={selectedElements}
          onSearchChange={setSearchTerm}
          onDragStart={onDragStart}
          onLoadMore={loadMoreEquipment}
          onEdgeTypeChange={setEdgeType}
          onAddGroup={addGroupNode}
          onNodeSizeChange={setNodeSize}
          onAutoScrollChange={setAutoScroll}
        />

        {/* Floating Action Button */}
        <FloatingActionButton
          nodes={nodes}
          edges={edges}
          onDelete={handleDeleteAction}
        />

        {/* Alignment Menu - Shows when multiple nodes are selected */}
        {selectedElements.nodes >= 2 && (
          <AlignmentMenu
            onAlign={alignNodes}
          />
        )}

        {/* Dialogs */}
        <LoadFlowDialog
          isOpen={isLoadFlowOpen}
          flows={flows}
          currentFlowId={currentFlow?.id}
          onClose={() => setIsLoadFlowOpen(false)}
          onLoad={handleLoadFlow}
        />

        {configNode && (
          <NodeConfigDialog
            node={configNode}
            isOpen={true}
            onClose={() => setConfigNode(null)}
            onSave={handleNodeConfigSave}
            equipmentTypes={equipmentTypes}
            availableEquipment={equipmentList}
            availableMeasurements={measurementsList}
          />
        )}

        {textConfigNode && (
          <TextConfigDialog
            node={textConfigNode}
            isOpen={true}
            onClose={() => setTextConfigNode(null)}
            onSave={handleNodeConfigSave}
          />
        )}
      </div>
    </div>
  );
};

export const ProcessFlowEditor: React.FC = () => {
  return (
    <Layout title="Process Flow Editor">
      <ReactFlowProvider>
        <ProcessFlowEditorContent />
      </ReactFlowProvider>
    </Layout>
  );
};