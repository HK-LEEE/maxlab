import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import type { Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { Save, FolderOpen, Download, Database, Server, ChevronDown } from 'lucide-react';

import { EquipmentNode } from '../components/common/EquipmentNode';
import { GroupNode } from '../components/common/GroupNode';
import { TextNode } from '../components/common/TextNode';
import { CustomEdgeWithLabel } from '../components/common/CustomEdgeWithLabel';
import { NodeConfigDialog } from '../components/common/NodeConfigDialog';
import { TextConfigDialog } from '../components/common/TextConfigDialog';
import { GroupConfigDialog } from '../components/common/GroupConfigDialog';
import { FloatingActionButton } from '../components/common/FloatingActionButton';
import { BackupRecoveryModal } from '../components/common/BackupRecoveryModal';
import { ReactFlowErrorBoundary } from '../components/common/ReactFlowErrorBoundary';
import { EquipmentNodeErrorBoundary, GroupNodeErrorBoundary, TextNodeErrorBoundary } from '../components/common/NodeErrorBoundary';

import { EditorSidebar } from '../components/editor/EditorSidebar';
import { LoadFlowDialog } from '../components/editor/LoadFlowDialog';
import { AlignmentMenu } from '../components/editor/AlignmentMenu';
import { DataSourceDialog } from '../components/editor/DataSourceDialog';

import { useFlowEditor } from '../hooks/useFlowEditor';
import { useDataSources } from '../hooks/useDataSources';
import { Layout } from '../../../components/common/Layout';
import { saveFlowBackup, loadFlowBackup, deleteFlowBackup, cleanupExpiredBackups, hasSignificantChanges, type FlowBackupData } from '../utils/flowBackup';
import { toast } from 'react-hot-toast';
import { apiClient } from '../../../api/client';
import { PageErrorBoundary } from '../../../components/common/ErrorBoundary';
import { errorReportingService } from '../../../services/errorReportingService';


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

// Create wrapped node components with error boundaries
const WrappedEquipmentNode = (props: any) => (
  <EquipmentNodeErrorBoundary 
    nodeId={props.id} 
    equipmentType={props.data?.equipmentType}
  >
    <EquipmentNode {...props} />
  </EquipmentNodeErrorBoundary>
);

const WrappedGroupNode = (props: any) => (
  <GroupNodeErrorBoundary 
    nodeId={props.id} 
    groupName={props.data?.label}
  >
    <GroupNode {...props} />
  </GroupNodeErrorBoundary>
);

const WrappedTextNode = (props: any) => (
  <TextNodeErrorBoundary nodeId={props.id}>
    <TextNode {...props} />
  </TextNodeErrorBoundary>
);

// Define nodeTypes and edgeTypes outside component to avoid re-creation
const nodeTypes = Object.freeze({
  equipment: WrappedEquipmentNode,
  group: WrappedGroupNode,
  text: WrappedTextNode,
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
    addGroupNode,
    alignNodes,
    getNodeHeight,
    deleteFlow,
    lastAutoSaveTime,
  } = useFlowEditor(workspaceId);

  // Data sources hook
  const { dataSources, isLoading: isLoadingDataSources } = useDataSources(workspaceId);
  
  
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
  const [groupConfigNode, setGroupConfigNode] = useState<Node | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDataSourceDialogOpen, setIsDataSourceDialogOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Backup/Recovery state
  const [showBackupRecovery, setShowBackupRecovery] = useState(false);
  const [backupData, setBackupData] = useState<FlowBackupData | null>(null);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);

  // 컴포넌트 마운트 시 백업 확인 및 정리
  useEffect(() => {
    cleanupExpiredBackups();
    
    // 기존 백업 데이터가 있는지 확인
    const existingBackup = loadFlowBackup(workspaceId, currentFlow?.id || null);
    if (existingBackup) {
      // 정확한 비교를 통해 실질적인 변경사항이 있는지 확인
      const hasChanges = hasSignificantChanges(
        {
          nodes,
          edges,
          flowName,
          dataSourceId: selectedDataSourceId,
          nodeSize,
        },
        existingBackup
      );
      
      if (hasChanges) {
        console.log('📋 Significant changes detected, showing backup recovery modal');
        setBackupData(existingBackup);
        setShowBackupRecovery(true);
      } else {
        // 실질적인 차이가 없으면 백업 삭제
        console.log('🗑️ No significant changes, deleting backup');
        deleteFlowBackup(workspaceId, currentFlow?.id || null);
      }
    }
  }, []);

  // 자동 백업 (디바운스 적용 + 저장 후 일정 시간 대기)
  useEffect(() => {
    const timer = setTimeout(() => {
      // 최근 저장 후 30초 이내에는 백업하지 않음 (불필요한 백업 방지)
      const now = new Date();
      if (lastSaveTime && (now.getTime() - lastSaveTime.getTime()) < 30000) {
        console.log('⏳ Skipping backup - recent save detected');
        return;
      }

      // 의미있는 내용이 있을 때만 백업
      const hasContent = nodes.length > 0 || edges.length > 0 || flowName !== 'New Process Flow';
      if (hasContent) {
        console.log('💾 Auto-saving backup');
        saveFlowBackup(workspaceId, currentFlow?.id || null, {
          nodes,
          edges,
          flowName,
          dataSourceId: selectedDataSourceId || undefined,
          nodeSize,
        });
      }
    }, 2000); // 2초 디바운스

    return () => clearTimeout(timer);
  }, [nodes, edges, flowName, selectedDataSourceId, workspaceId, currentFlow?.id, lastSaveTime]);

  // 백업 복구 핸들러
  const handleBackupRecover = useCallback((backup: FlowBackupData) => {
    // 백업 데이터로 상태 복원
    setNodes(backup.nodes);
    setEdges(backup.edges);
    setFlowName(backup.flowName);
    if (backup.dataSourceId) {
      setSelectedDataSourceId(backup.dataSourceId);
    }
    if (backup.nodeSize) {
      setNodeSize(backup.nodeSize);
    }
    
    toast.success('백업 데이터가 복구되었습니다', {
      icon: '🔄',
    });
    
    // 백업 데이터 삭제
    deleteFlowBackup(workspaceId, currentFlow?.id || null);
  }, [setNodes, setEdges, setFlowName, setSelectedDataSourceId, workspaceId, currentFlow?.id]);

  // 백업 삭제 핸들러
  const handleBackupDiscard = useCallback(() => {
    deleteFlowBackup(workspaceId, currentFlow?.id || null);
    toast.success('백업 데이터가 삭제되었습니다', {
      icon: '🗑️',
    });
  }, [workspaceId, currentFlow?.id]);

  // 저장 완료 감지를 위한 이펙트
  useEffect(() => {
    if (lastAutoSaveTime) {
      setLastSaveTime(lastAutoSaveTime);
    }
  }, [lastAutoSaveTime]);


  // 수동 저장 래퍼 (저장 시간 추적)
  const handleManualSave = useCallback(async () => {
    await saveFlow(false);
    setLastSaveTime(new Date());
  }, [saveFlow]);

  // 새 버전으로 저장
  const handleSaveAsNewVersion = useCallback(async () => {
    if (!currentFlow) {
      // If no current flow, create new one first
      await saveFlow(false);
      setLastSaveTime(new Date());
      return;
    }

    // First, try to save normally to ensure data is persisted
    try {
      await saveFlow(false);
      setLastSaveTime(new Date());
      toast.success('Flow saved successfully', {
        duration: 3000,
        icon: '✅'
      });
    } catch (saveError) {
      console.error('Failed to save flow:', saveError);
      toast.error('Failed to save flow');
      return; // Don't proceed with versioning if save failed
    }

    // Then attempt versioning (this is optional and can fail)
    const versionName = `${flowName} - Version ${new Date().toLocaleString()}`;
    const description = `Saved from editor at ${new Date().toLocaleString()}`;
    
    try {
      console.log('🔄 Attempting to create new version...');
      const response = await apiClient.post(`/api/v1/personal-test/process-flow/flows/${currentFlow.id}/versions`, {
        name: versionName,
        description,
        flow_data: { nodes, edges, nodeSize }
      });
      
      // Update the flow data in currentFlow (version number is optional)
      if (response.data && currentFlow) {
        const updatedFlow = {
          ...currentFlow,
          flow_data: { nodes, edges, nodeSize },  // Include current editor state
          ...(response.data.version_number && { current_version: response.data.version_number })  // Only add if available
        };
        // Update flows list to reflect new version
        setFlows(prevFlows => 
          prevFlows.map(f => f.id === currentFlow.id ? updatedFlow : f)
        );
        // Also update currentFlow in the editor
        setCurrentFlow(updatedFlow);
      }
      
      toast.success('New version created successfully', {
        duration: 3000,
        icon: '🆕'
      });
    } catch (error: any) {
      console.error('Failed to create new version (but flow was saved):', error);
      
      // More detailed error handling
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        toast.error('Version management service is unavailable. Your changes have been saved to the main flow.', {
          duration: 5000,
          icon: '⚠️'
        });
      } else if (error.response?.status === 500) {
        toast.error('Server error during version creation. Your changes have been saved to the main flow.', {
          duration: 5000,
          icon: '⚠️'
        });
      } else if (error.response?.status === 503) {
        toast.error('Version management is temporarily unavailable. Your changes have been saved to the main flow.', {
          duration: 5000,
          icon: '⚠️'
        });
      } else {
        toast.error('Could not create new version, but your changes have been saved to the main flow.', {
          duration: 5000,
          icon: '⚠️'
        });
      }
    }
  }, [currentFlow, flowName, nodes, edges, nodeSize, saveFlow, setFlows, setCurrentFlow]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as HTMLElement)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);


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
          style: { width: 200, height: getNodeHeight('1') },
          data: {
            label: data.name,
            equipmentType: data.code,
            equipmentCode: '',
            equipmentName: data.name,
            status: 'STOP',
            icon: data.icon,
            displayMeasurements: [],
            nodeSize: '1',
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
          style: templateType === 'group' ? { width: 300, height: 200 } : templateType === 'equipment' ? { width: 200, height: getNodeHeight('1') } : undefined,
          data: { ...data, nodeSize: templateType === 'equipment' ? '1' : data.nodeSize },
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
    if (node.type === 'equipment') {
      setConfigNode(node);
    } else if (node.type === 'group') {
      setGroupConfigNode(node);
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
      flow_data: { nodes, edges, nodeSize },
      exported_at: new Date().toISOString(),
      version: (currentFlow as any)?.current_version || 1
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `${flowName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    toast.success('Flow exported successfully');
  };


  // Memoize node and edge types to prevent ReactFlow warnings
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);

  // Memoize default edge options
  const defaultEdgeOptions = useMemo(() => ({
    type: 'custom',
    animated: false,
    style: { strokeWidth: 2, stroke: '#374151' },
    data: { type: edgeType }, // Pass edge type in data for CustomEdgeWithLabel
  }), [edgeType]);

  return (
    <div className="h-screen flex flex-col bg-white">
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
                  v{(currentFlow as any)?.current_version || 1}
                </span>
              )}
            </div>
            {/* Save Dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                disabled={isSaving}
                className="flex items-center space-x-1 px-3 py-1.5 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 text-sm"
              >
                <Save size={16} />
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
                <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[180px]">
                  <button
                    onClick={() => {
                      handleSaveAsNewVersion();
                      setIsDropdownOpen(false);
                    }}
                    disabled={isSaving}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 border-b border-gray-100"
                  >
                    <div className="flex items-center space-x-2">
                      <Save size={14} />
                      <span>Save & Create Version</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Saves flow and attempts to create version</div>
                  </button>
                  <button
                    onClick={() => {
                      handleManualSave();
                      setIsDropdownOpen(false);
                    }}
                    disabled={isSaving}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    <div className="flex items-center space-x-2">
                      <Save size={14} />
                      <span>Update Current Version</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Overwrites existing flow</div>
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsLoadDialogOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
            >
              <FolderOpen size={16} />
              <span>Load</span>
            </button>
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
        <ReactFlowErrorBoundary
          flowData={{ nodes, edges, flowName, dataSourceId: selectedDataSourceId, nodeSize }}
          onError={(error) => {
            errorReportingService.reportError({
              component: 'ReactFlow',
              message: error.message,
              stack: error.stack,
              level: 'error',
              context: {
                nodeCount: nodes.length,
                edgeCount: edges.length,
                flowName,
                selectedDataSourceId
              },
              tags: ['reactflow', 'flow-editor']
            });
          }}
          onSaveBackup={() => {
            saveFlowBackup(workspaceId, currentFlow?.id || null, {
              nodes,
              edges,
              flowName,
              dataSourceId: selectedDataSourceId || undefined,
              nodeSize,
            });
          }}
          onLoadBackup={() => {
            const backup = loadFlowBackup(workspaceId, currentFlow?.id || null);
            if (backup) {
              setNodes(backup.nodes);
              setEdges(backup.edges);
              setFlowName(backup.flowName);
              if (backup.dataSourceId) {
                setSelectedDataSourceId(backup.dataSourceId);
              }
              if (backup.nodeSize) {
                setNodeSize(backup.nodeSize);
              }
            }
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={memoizedNodeTypes}
            edgeTypes={memoizedEdgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineStyle={{ strokeWidth: 2, stroke: '#374151' }}
            connectionMode="loose"
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            snapToGrid={true}
            snapGrid={[15, 15]}
            fitView
          >
            <Background variant="dots" gap={20} size={1} color="#e5e7eb" />
            <Controls />
            <MiniMap nodeColor={nodeColor} />
          </ReactFlow>
        </ReactFlowErrorBoundary>

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

        {groupConfigNode && (
          <GroupConfigDialog
            node={groupConfigNode}
            isOpen={true}
            onClose={() => setGroupConfigNode(null)}
            onSave={handleNodeConfigSave}
          />
        )}

        <DataSourceDialog
          isOpen={isDataSourceDialogOpen}
          onClose={() => setIsDataSourceDialogOpen(false)}
          workspaceId={workspaceId}
        />



        {/* Backup Recovery Modal */}
        <BackupRecoveryModal
          isOpen={showBackupRecovery}
          onClose={() => setShowBackupRecovery(false)}
          onRecover={handleBackupRecover}
          onDiscard={handleBackupDiscard}
          backupData={backupData}
        />
      </div>
    </div>
  );
};

export const ProcessFlowEditor: React.FC = () => {
  return (
    <PageErrorBoundary>
      <Layout title="Process Flow Editor">
        <ReactFlowProvider>
          <ProcessFlowEditorContent />
        </ReactFlowProvider>
      </Layout>
    </PageErrorBoundary>
  );
};