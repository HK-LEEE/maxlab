import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Panel,
  useReactFlow,
} from 'reactflow';
import type { Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { ZoomIn } from 'lucide-react';

import { EquipmentNode } from '../components/common/EquipmentNode';
import { GroupNode } from '../components/common/GroupNode';
import { EquipmentDetailModal } from '../components/common/EquipmentDetailModal';
import { CustomEdgeWithLabel } from '../components/common/CustomEdgeWithLabel';

import { MonitorHeader } from '../components/monitor/MonitorHeader';
import { StatusSummary } from '../components/monitor/StatusSummary';
import { EquipmentSidebar } from '../components/monitor/EquipmentSidebar';

import { useFlowMonitor } from '../hooks/useFlowMonitor';
import { Layout } from '../../../components/common/Layout';

// Define nodeTypes and edgeTypes outside component to avoid re-creation
const nodeTypes = {
  equipment: EquipmentNode,
  group: GroupNode,
};

const edgeTypes = {
  custom: CustomEdgeWithLabel,
};

// Separate component to use useReactFlow hook
const FlowCanvas: React.FC<{
  nodes: Node[];
  edges: any[];
  nodeTypes: any;
  edgeTypes: any;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  equipmentStatusCount: number;
  activeCount: number;
}> = ({ nodes, edges, nodeTypes, edgeTypes, onNodeClick, equipmentStatusCount, activeCount }) => {
  const { fitView } = useReactFlow();

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
      fitView={false}
      nodesDraggable={true}
      nodesConnectable={false}
      elementsSelectable={true}
      panOnDrag={true}
      zoomOnScroll={true}
      minZoom={0.1}
      maxZoom={4}
      defaultEdgeOptions={{ type: 'custom' }}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap />
      <Panel position="bottom-right" className="bg-white p-2 rounded shadow">
        <div className="text-xs text-gray-600 mb-2">
          Equipment: {equipmentStatusCount} | Active: {activeCount}
        </div>
        <button
          onClick={() => fitView({ padding: 0.2 })}
          className="flex items-center justify-center w-full px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800"
        >
          <ZoomIn size={14} className="mr-1" />
          Fit View
        </button>
      </Panel>
    </ReactFlow>
  );
};

const ProcessFlowMonitorContent: React.FC = () => {
  const workspaceId = 'personal_test';
  
  const {
    nodes,
    edges,
    flows,
    selectedFlow,
    equipmentStatuses,
    measurements,
    isLoading,
    lastUpdate,
    autoRefresh,
    refreshInterval,
    autoScroll,
    isSidebarOpen,
    isFullscreen,
    statusCounts,
    setSelectedFlow,
    setAutoRefresh,
    setRefreshInterval,
    setAutoScroll,
    setIsSidebarOpen,
    loadData,
    toggleFullscreen,
  } = useFlowMonitor(workspaceId);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'equipment') {
      setSelectedNode(node);
      setIsDetailModalOpen(true);
    }
  }, []);

  const selectedEquipmentStatus = selectedNode 
    ? equipmentStatuses.find(s => s.equipment_code === selectedNode.data.equipmentCode)
    : undefined;

  const selectedEquipmentMeasurements = selectedNode
    ? measurements.filter(m => m.equipment_code === selectedNode.data.equipmentCode)
    : [];

  const handleFlowChange = (flowId: string) => {
    const flow = flows.find(f => f.id === flowId);
    if (flow) {
      setSelectedFlow(flow);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <MonitorHeader
        flows={flows}
        selectedFlow={selectedFlow}
        lastUpdate={lastUpdate}
        refreshInterval={refreshInterval}
        autoRefresh={autoRefresh}
        autoScroll={autoScroll}
        isLoading={isLoading}
        isFullscreen={isFullscreen}
        onFlowChange={handleFlowChange}
        onRefreshIntervalChange={setRefreshInterval}
        onAutoRefreshChange={setAutoRefresh}
        onAutoScrollChange={setAutoScroll}
        onRefresh={loadData}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Status Summary */}
      <StatusSummary statusCounts={statusCounts} isFullscreen={isFullscreen} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Equipment Sidebar */}
        <EquipmentSidebar
          isOpen={isSidebarOpen}
          isLoading={isLoading}
          equipmentStatuses={equipmentStatuses}
          measurements={measurements}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Flow Canvas */}
        <div className="flex-1">
          <ReactFlowProvider>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              equipmentStatusCount={equipmentStatuses.length}
              activeCount={statusCounts.ACTIVE}
            />
          </ReactFlowProvider>
        </div>
      </div>

      {/* Equipment Detail Modal */}
      <EquipmentDetailModal
        node={selectedNode}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedNode(null);
        }}
        equipmentStatus={selectedEquipmentStatus}
        measurements={selectedEquipmentMeasurements}
      />
    </div>
  );
};

export const ProcessFlowMonitor: React.FC = () => {
  return (
    <Layout title="Process Flow Monitor">
      <ProcessFlowMonitorContent />
    </Layout>
  );
};