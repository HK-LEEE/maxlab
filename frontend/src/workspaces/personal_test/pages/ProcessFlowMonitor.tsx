import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import { InstrumentNode } from '../components/common/InstrumentNode';
import { GroupNode } from '../components/common/GroupNode';
import { TextNode } from '../components/common/TextNode';
import { CustomTableNode } from '../components/common/CustomTableNode';
import { EquipmentDetailModal } from '../components/common/EquipmentDetailModal';
import { CustomEdgeWithLabel } from '../components/common/CustomEdgeWithLabel';
import { DatabaseConfigAlert } from '../components/common/DatabaseConfigAlert';

import { MonitorHeader } from '../components/monitor/MonitorHeader';
import { StatusSummary } from '../components/monitor/StatusSummary';
import { EquipmentSidebar } from '../components/monitor/EquipmentSidebar';
import { AlarmNotification } from '../components/monitor/AlarmNotification';

import { useFlowMonitor } from '../hooks/useFlowMonitor';
import { useDataSources } from '../hooks/useDataSources';
import { Layout } from '../../../components/common/Layout';

// Define edgeTypes outside component to avoid re-creation
// nodeTypes will be defined inside component to access tableData

const edgeTypes = Object.freeze({
  custom: CustomEdgeWithLabel,
});

// Separate component to use useReactFlow hook
const FlowCanvas: React.FC<{
  nodes: Node[];
  edges: any[];
  onNodesChange: any;
  onEdgesChange: any;
  nodeTypes: any;
  edgeTypes: any;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  equipmentStatusCount: number;
  activeCount: number;
}> = React.memo(({ nodes, edges, onNodesChange, onEdgesChange, nodeTypes, edgeTypes, onNodeClick, equipmentStatusCount, activeCount }) => {
  const { fitView } = useReactFlow();

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={() => {}}
      onEdgesChange={() => {}}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
      fitView={false}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={true}
      zoomOnScroll={true}
      minZoom={0.1}
      maxZoom={4}
      connectionLineStyle={{ strokeWidth: 2, stroke: '#374151' }}
      connectionMode="loose"
      defaultEdgeOptions={{
        type: 'custom',
        style: { strokeWidth: 2, stroke: '#374151' },
        animated: false
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#ffffff" />
      <Controls showInteractive={false} />
      <MiniMap nodeColor={(node) => {
        switch (node.type) {
          case 'equipment':
            return node.data.equipmentType ? '#3b82f6' : '#9ca3af';
          case 'instrument':
            return node.data.color || '#6b7280'; // Use instrument's color or gray default
          case 'group':
            return '#8b5cf6';
          case 'text':
            return '#10b981';
          case 'table':
            return node.data.color || '#f59e0b'; // Use table's color or orange default
          default:
            return '#6b7280';
        }
      }} />
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
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  return (
    prevProps.nodes === nextProps.nodes &&
    prevProps.edges === nextProps.edges &&
    prevProps.nodeTypes === nextProps.nodeTypes &&
    prevProps.edgeTypes === nextProps.edgeTypes &&
    prevProps.equipmentStatusCount === nextProps.equipmentStatusCount &&
    prevProps.activeCount === nextProps.activeCount
  );
});

const ProcessFlowMonitorContent: React.FC = () => {
  const workspaceId = 'personal_test';
  
  // Remove data source validation from monitoring - handle at save time instead
  // const { isDefaultDatabase, isLoading: isLoadingDataSources } = useDataSources(workspaceId);
  
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
    alarmCheck,
    isSidebarOpen,
    isFullscreen,
    statusCounts,
    onNodesChange,
    onEdgesChange,
    setSelectedFlow,
    setAutoRefresh,
    setRefreshInterval,
    setAutoScroll,
    setAlarmCheck,
    setIsSidebarOpen,
    loadData,
    forceRefresh,
    toggleFullscreen,
  } = useFlowMonitor(workspaceId);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [showAlarms, setShowAlarms] = useState(true);

  // Define nodeTypes outside component since Custom Table nodes handle their own data
  const nodeTypes = useMemo(() => ({
    equipment: EquipmentNode,
    instrument: InstrumentNode,
    group: GroupNode,
    text: TextNode,
    table: CustomTableNode,
  }), []);
  // Remove database alert from monitoring
  // const [showDBAlert, setShowDBAlert] = useState(false);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'equipment') {
      // console.log('Monitor - Node clicked:', {
      //   nodeId: node.id,
      //   nodeType: node.type,
      //   nodeData: node.data,
      //   equipmentCode: node.data.equipmentCode,
      //   availableStatuses: equipmentStatuses.map(s => s.equipment_code)
      // });
      setSelectedNode(node);
      setIsDetailModalOpen(true);
    }
  }, [equipmentStatuses]);

  const selectedEquipmentStatus = selectedNode 
    ? equipmentStatuses.find(s => s.equipment_code === selectedNode.data.equipmentCode)
    : undefined;

  const selectedEquipmentMeasurements = selectedNode
    ? measurements.filter(m => {
        // If displayMeasurements is configured, only show those measurements
        if (selectedNode.data.displayMeasurements && selectedNode.data.displayMeasurements.length > 0) {
          return selectedNode.data.displayMeasurements.includes(m.measurement_code);
        }
        
        // Otherwise show no measurements (empty array)
        return false;
      })
    : [];

  const handleFlowChange = (flowId: string) => {
    const flow = flows.find(f => f.id === flowId);
    if (flow) {
      setSelectedFlow(flow);
    }
  };

  // Remove database configuration check from monitoring
  // useEffect(() => {
  //   if (!isLoadingDataSources && isDefaultDatabase) {
  //     setShowDBAlert(true);
  //   }
  // }, [isDefaultDatabase, isLoadingDataSources]);

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <MonitorHeader
        flows={flows}
        selectedFlow={selectedFlow}
        lastUpdate={lastUpdate}
        refreshInterval={refreshInterval}
        autoRefresh={autoRefresh}
        autoScroll={autoScroll}
        alarmCheck={alarmCheck}
        isLoading={isLoading}
        isFullscreen={isFullscreen}
        onFlowChange={handleFlowChange}
        onRefreshIntervalChange={setRefreshInterval}
        onAutoRefreshChange={setAutoRefresh}
        onAutoScrollChange={setAutoScroll}
        onAlarmCheckChange={setAlarmCheck}
        onRefresh={forceRefresh}
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
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
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

      {/* Alarm Notification - Hidden
      {showAlarms && alarmCheck && (
        <AlarmNotification onClose={() => setShowAlarms(false)} />
      )} */}

      {/* Remove Database Configuration Alert from monitoring */}
      {/* <DatabaseConfigAlert
        isVisible={showDBAlert}
        onClose={() => setShowDBAlert(false)}
      /> */}
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