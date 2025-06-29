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
import { NodeConfigDialog } from '../components/common/NodeConfigDialog';
import { FloatingActionButton } from '../components/common/FloatingActionButton';

import { EditorSidebar } from '../components/editor/EditorSidebar';
import { EditorPanel } from '../components/editor/EditorPanel';
import { LoadFlowDialog } from '../components/editor/LoadFlowDialog';
import { AlignmentMenu } from '../components/editor/AlignmentMenu';

import { useFlowEditor } from '../hooks/useFlowEditor';
import { Layout } from '../../../components/common/Layout';

// Define nodeTypes outside component to avoid re-creation
const nodeTypes = {
  equipment: EquipmentNode,
  group: GroupNode,
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

const ProcessFlowEditorContent: React.FC = () => {
  const workspaceId = 'personal_test';
  
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const equipmentData = event.dataTransfer.getData('application/equipment');
      if (!equipmentData) return;

      const type = JSON.parse(equipmentData);
      
      // Get the bounds of the ReactFlow wrapper
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      
      // Calculate position relative to the ReactFlow wrapper
      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

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
    [nodeSize, setNodes, getNodeHeight]
  );

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const selected = nodes.filter(n => n.selected);
    if (selected.length >= 2) {
      setContextMenu({ x: event.clientX, y: event.clientY });
    }
  }, [nodes]);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

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
    if (node.type === 'equipment') {
      setConfigNode(node);
    }
  }, []);

  const onDragStart = (event: React.DragEvent, equipment: any) => {
    event.dataTransfer.setData('application/equipment', JSON.stringify(equipment));
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
          onPaneClick={onPaneClick}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: edgeType,
            animated: false,
            style: { strokeWidth: 2, stroke: '#374151' },
          }}
          connectionLineStyle={{ strokeWidth: 2, stroke: '#374151' }}
          fitView
        >
          <Background color="#aaa" gap={16} />
          <Controls />
          <MiniMap />

          {/* Toolbar for Group and Delete buttons */}
          <Panel position="top-left">
            <div className="bg-white p-3 rounded-lg shadow-lg">
              <div className="flex items-center space-x-3">
                <button
                  onClick={addGroupNode}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                  title="Add group rectangle"
                >
                  <Square size={16} />
                  <span>Group</span>
                </button>
                {(selectedElements.nodes > 0 || selectedElements.edges > 0) && (
                  <button
                    onClick={deleteSelectedNodes}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                  >
                    <Trash2 size={16} />
                    <span>Delete ({selectedElements.nodes + selectedElements.edges})</span>
                  </button>
                )}
              </div>
            </div>
          </Panel>

          {/* Settings Panel */}
          <Panel position="bottom-right">
            <EditorPanel
              edgeType={edgeType}
              nodeSize={nodeSize}
              autoScroll={autoScroll}
              selectedElements={selectedElements}
              onEdgeTypeChange={setEdgeType}
              onNodeSizeChange={setNodeSize}
              onAutoScrollChange={setAutoScroll}
            />
          </Panel>
        </ReactFlow>

        {/* Sidebar */}
        <EditorSidebar
          equipmentTypes={equipmentTypes}
          equipmentList={equipmentList}
          hasMoreEquipment={hasMoreEquipment}
          isLoadingEquipment={isLoadingEquipment}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onDragStart={onDragStart}
          onLoadMore={loadMoreEquipment}
        />

        {/* Floating Action Button */}
        <FloatingActionButton
          nodes={nodes}
          edges={edges}
          onDelete={handleDeleteAction}
        />

        {/* Alignment Menu */}
        <AlignmentMenu
          position={contextMenu}
          onAlign={alignNodes}
          onClose={() => setContextMenu(null)}
        />

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