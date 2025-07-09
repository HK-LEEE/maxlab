import React, { useCallback, useState, useMemo } from 'react';
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
import { Save, FileText, Square, Trash2, FolderOpen, Download, Database, Ruler, Server } from 'lucide-react';

import { EquipmentNode } from '../components/common/EquipmentNode';
import { GroupNode } from '../components/common/GroupNode';
import { TextNode } from '../components/common/TextNode';
import { CustomEdgeWithLabel } from '../components/common/CustomEdgeWithLabel';
import { NodeConfigDialog } from '../components/common/NodeConfigDialog';
import { TextConfigDialog } from '../components/common/TextConfigDialog';
import { FloatingActionButton } from '../components/common/FloatingActionButton';

import { EditorSidebar } from '../components/editor/EditorSidebar';
import { LoadFlowDialog } from '../components/editor/LoadFlowDialog';
import { AlignmentMenu } from '../components/editor/AlignmentMenu';
import { MeasurementSpecDialog } from '../components/editor/MeasurementSpecDialog';
import { DataSourceDialog } from '../components/editor/DataSourceDialog';

import { useFlowEditor } from '../hooks/useFlowEditor';
import { useDataSources } from '../hooks/useDataSources';
import { Layout } from '../../../components/common/Layout';
import { apiClient } from '../../../api/client';
import { toast } from 'react-hot-toast';


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

// Define nodeTypes and edgeTypes outside component to avoid re-creation
const nodeTypes = Object.freeze({
  equipment: EquipmentNode,
  group: GroupNode,
  text: TextNode,
});

const edgeTypes = Object.freeze({
  custom: CustomEdgeWithLabel,
});

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
    loadMoreEquipment,
    deleteSelectedNodes,
    addGroupNode,
    alignNodes,
    getNodeHeight,
    deleteFlow,
    lastAutoSaveTime,
  } = useFlowEditor(workspaceId);

  // Data sources hook
  const { dataSources, isLoading: isLoadingDataSources } = useDataSources(workspaceId);
  
  // Debug: Log data sources and selected data source ID
  console.log('Data sources:', dataSources);
  console.log('Selected data source ID:', selectedDataSourceId);
  console.log('Is loading data sources:', isLoadingDataSources);
  
  // Ensure selected data source is valid when data sources are loaded
  React.useEffect(() => {
    if (!isLoadingDataSources && selectedDataSourceId && dataSources.length > 0) {
      const isValidDataSource = dataSources.some(ds => ds.id === selectedDataSourceId);
      if (!isValidDataSource) {
        console.warn('Selected data source ID is not valid:', selectedDataSourceId);
        console.warn('Available data sources:', dataSources.map(ds => ds.id));
      }
    }
  }, [isLoadingDataSources, selectedDataSourceId, dataSources]);

  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [configNode, setConfigNode] = useState<Node | null>(null);
  const [textConfigNode, setTextConfigNode] = useState<Node | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [versionManagementAvailable, setVersionManagementAvailable] = useState(true);
  const [isDataSourceDialogOpen, setIsDataSourceDialogOpen] = useState(false);
  const [isMeasurementSpecDialogOpen, setIsMeasurementSpecDialogOpen] = useState(false);

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

  const handleLoadFlow = async (flow: any, version?: any) => {
    await loadFlow(flow);
    setIsLoadDialogOpen(false);
  };

  const handleExportFlow = () => {
    const exportData = {
      name: flowName,
      flow_data: { nodes, edges },
      exported_at: new Date().toISOString(),
      version: currentFlow?.current_version || 1
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `${flowName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    toast.success('Flow exported successfully');
  };

  const handleSaveAsNewVersion = async () => {
    const versionName = `${flowName} - Version ${new Date().toLocaleString()}`;
    const description = `Saved from editor at ${new Date().toLocaleString()}`;
    
    try {
      const versionResponse = await apiClient.post(`/api/v1/personal-test/process-flow/flows/${currentFlow?.id}/versions`, {
        name: versionName,
        description,
        flow_data: { nodes, edges }
      });
      
      // Update the current version number in currentFlow
      if (versionResponse.data && currentFlow) {
        const updatedFlow = {
          ...currentFlow,
          current_version: versionResponse.data.version_number,
          flow_data: { nodes, edges }  // Include current editor state
        };
        // Update flows list to reflect new version
        setFlows(prevFlows => 
          prevFlows.map(f => f.id === currentFlow.id ? updatedFlow : f)
        );
        // Also update currentFlow in the editor
        setCurrentFlow(updatedFlow);
      }
      
      toast.success('Saved as new version successfully');
    } catch (error: any) {
      console.error('Failed to save as new version:', error);
      if (error.response?.status === 503 || error.response?.status === 500) {
        setVersionManagementAvailable(false);
        toast.error('Version management is not available. The flow has been saved normally.', {
          duration: 5000,
          icon: '⚠️'
        });
      } else {
        toast.error('Failed to save as new version');
      }
    }
  };

  // Memoize default edge options
  const defaultEdgeOptions = useMemo(() => ({
    type: 'custom',
    animated: false,
    style: { strokeWidth: 2, stroke: '#374151' },
    data: { type: edgeType }, // Pass edge type in data for CustomEdgeWithLabel
  }), [edgeType]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Flow Editor Controls Bar */}
      <div className="bg-white border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                placeholder="Flow name"
              />
              {currentFlow && (
                <span className="text-sm text-gray-500">
                  v{currentFlow.current_version || 1}
                </span>
              )}
            </div>
            <button
              onClick={saveFlow}
              disabled={isSaving}
              className="flex items-center space-x-1 px-3 py-1.5 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 text-sm"
            >
              <Save size={16} />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              onClick={() => setIsLoadDialogOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
            >
              <FolderOpen size={16} />
              <span>Load</span>
            </button>
            {currentFlow && versionManagementAvailable && (
              <button
                onClick={handleSaveAsNewVersion}
                className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                title={!versionManagementAvailable ? "Version management not available" : ""}
              >
                <Save size={16} />
                <span>Save as Version</span>
              </button>
            )}
            <button
              onClick={handleExportFlow}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
            >
              <Download size={16} />
              <span>Export</span>
            </button>
            <div className="w-px h-6 bg-gray-300" />
            
            {/* Data Source Selection */}
            <div className="flex items-center space-x-2">
              <Server size={16} className="text-gray-500" />
              <select
                value={selectedDataSourceId || ''}
                onChange={(e) => setSelectedDataSourceId(e.target.value || null)}
                className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                disabled={isLoadingDataSources}
              >
                <option value="">Default Data Source</option>
                {dataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.source_type.toUpperCase()} - {ds.id.slice(0, 8)}...
                  </option>
                ))}
              </select>
              {/* Debug info */}
              {selectedDataSourceId && (
                <span className="text-xs text-gray-500">
                  Selected: {selectedDataSourceId.slice(0, 8)}...
                </span>
              )}
            </div>
            
            <button
              onClick={() => setIsDataSourceDialogOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
            >
              <Database size={16} />
              <span>Data Sources</span>
            </button>
            <button
              onClick={() => setIsMeasurementSpecDialogOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
            >
              <Ruler size={16} />
              <span>Measurement Specs</span>
            </button>
          </div>
          <div className="flex items-center space-x-4">
            {lastAutoSaveTime && (
              <span className="text-xs text-gray-500">
                Auto-saved {lastAutoSaveTime.toLocaleTimeString()}
              </span>
            )}
            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}
          </div>
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
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
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
          isOpen={isLoadDialogOpen}
          flows={flows}
          currentFlowId={currentFlow?.id}
          onClose={() => setIsLoadDialogOpen(false)}
          onLoad={handleLoadFlow}
          onDelete={deleteFlow}
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


        <DataSourceDialog
          isOpen={isDataSourceDialogOpen}
          onClose={() => setIsDataSourceDialogOpen(false)}
          workspaceId={workspaceId}
        />

        <MeasurementSpecDialog
          isOpen={isMeasurementSpecDialogOpen}
          onClose={() => setIsMeasurementSpecDialogOpen(false)}
        />
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