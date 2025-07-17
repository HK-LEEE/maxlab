import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Panel,
  useReactFlow,
} from 'reactflow';
import type { Viewport, Edge } from 'reactflow';
import type { Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { ZoomIn, Globe, Maximize2, Minimize2, RefreshCw } from 'lucide-react';

import { EquipmentNode } from '../components/common/EquipmentNode';
import { GroupNode } from '../components/common/GroupNode';
import { TextNode } from '../components/common/TextNode';
import { EquipmentDetailModal } from '../components/common/EquipmentDetailModal';
import { CustomEdgeWithLabel } from '../components/common/CustomEdgeWithLabel';
import { DatabaseConfigAlert } from '../components/common/DatabaseConfigAlert';
import { AlarmNotification } from '../components/monitor/AlarmNotification';
import { StatusSummary } from '../components/monitor/StatusSummary';
import { EquipmentSidebar } from '../components/monitor/EquipmentSidebar';
import { usePublicFlowMonitor } from '../hooks/usePublicFlowMonitor';
import { useDataSources } from '../hooks/useDataSources';

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
      return node.data.equipmentType ? '#3b82f6' : '#9ca3af';
    case 'group':
      return '#8b5cf6';
    case 'text':
      return '#10b981';
    default:
      return '#6b7280';
  }
};

// Separate component to use useReactFlow hook
const FlowCanvas: React.FC<{
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: any[]) => void;
  onEdgesChange: (changes: any[]) => void;
  nodeTypes: Record<string, any>;
  edgeTypes: Record<string, any>;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  equipmentStatusCount: number;
  activeCount: number;
  defaultViewport?: Viewport;
}> = React.memo(({ nodes, edges, onNodesChange, onEdgesChange, nodeTypes, edgeTypes, onNodeClick, equipmentStatusCount, activeCount, defaultViewport }) => {
  const { fitView, setViewport } = useReactFlow();

  // Restore viewport after nodes update
  useEffect(() => {
    if (defaultViewport) {
      setViewport(defaultViewport);
    }
  }, [nodes, defaultViewport, setViewport]);

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
      <MiniMap nodeColor={nodeColor} />
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
    prevProps.activeCount === nextProps.activeCount &&
    prevProps.defaultViewport === nextProps.defaultViewport
  );
});

const PublicProcessFlowMonitorContent: React.FC = () => {
  const { publishToken } = useParams<{ publishToken: string }>();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport] = useState<Viewport | undefined>();
  const [showAlarms, setShowAlarms] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Remove database alert from public monitoring
  // const [showDBAlert, setShowDBAlert] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Remove data source validation from public monitoring - handle at save time instead
  // const { isDefaultDatabase, isLoading: isLoadingDataSources } = useDataSources('personal_test');
  
  const {
    flow,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    equipmentStatuses,
    measurements,
    isLoading,
    lastUpdate,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    setRefreshInterval,
    autoScroll,
    setAutoScroll,
    alarmCheck,
    setAlarmCheck,
    forceRefresh,
    error,
    retryCount,
    maxRetries,
  } = usePublicFlowMonitor(publishToken || '');

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'equipment') {
      setSelectedNode(node);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Remove database configuration check from public monitoring
  // useEffect(() => {
  //   if (!isLoadingDataSources && isDefaultDatabase) {
  //     setShowDBAlert(true);
  //   }
  // }, [isDefaultDatabase, isLoadingDataSources]);

  // 현재 Flow에 등록된 equipment 노드의 equipmentCode 추출
  const nodeEquipmentCodes = new Set<string>();
  nodes.forEach(node => {
    if (node.type === 'equipment' && node.data.equipmentCode) {
      nodeEquipmentCodes.add(node.data.equipmentCode);
    }
  });

  // 노드에 등록된 설비만 필터링하여 카운팅
  const filteredStatuses = equipmentStatuses.filter(eq => 
    nodeEquipmentCodes.has(eq.equipment_code)
  );

  const equipmentStatusCount = filteredStatuses.length;
  const activeCount = filteredStatuses.filter(eq => eq.status === 'ACTIVE').length;
  const pauseCount = filteredStatuses.filter(eq => eq.status === 'PAUSE').length;
  const stopCount = filteredStatuses.filter(eq => eq.status === 'STOP').length;

  // Status counts for StatusSummary component
  const statusCounts = {
    ACTIVE: activeCount,
    PAUSE: pauseCount,
    STOP: stopCount
  };

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md">
          <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {error.includes('Service temporarily unavailable') ? 'Service Unavailable' : 
             error.includes('Server error') ? 'Server Error' :
             error.includes('Network connection error') ? 'Connection Error' :
             'Flow Not Found'}
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          {retryCount > 0 && retryCount < maxRetries && (
            <div className="mb-4">
              <div className="inline-flex items-center px-3 py-2 bg-blue-100 text-blue-800 rounded-lg">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Retrying... ({retryCount}/{maxRetries})
              </div>
            </div>
          )}
          {!error.includes('Service temporarily unavailable') && !error.includes('Server error') && (
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
            >
              Refresh Page
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading || !flow) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading flow...</p>
        </div>
      </div>
    );
  }

  const refreshIntervalOptions = [
    { value: 30000, label: '30초' },
    { value: 60000, label: '1분' },
    { value: 180000, label: '3분' },
    { value: 300000, label: '5분' },
    { value: 600000, label: '10분' },
  ];

  return (
    <div ref={containerRef} className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Globe className="w-6 h-6 text-gray-600" />
            <div>
              <h1 className="text-xl font-semibold">{flow.name}</h1>
              <p className="text-sm text-gray-500">Public Process Flow Monitor</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Monitoring Controls */}
            <div className="flex items-center space-x-4">
              {/* Refresh Controls */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    console.log('🔄 Manual refresh triggered for published flow');
                    forceRefresh();
                  }}
                  disabled={isLoading}
                  className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
                  title="Force refresh data - 최신 데이터 강제 새로고침"
                >
                  <RefreshCw size={16} className={`text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                >
                  {refreshIntervalOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded border-gray-300 text-black focus:ring-black"
                  />
                  <span className="text-sm text-gray-600">Auto</span>
                </label>
              </div>

              {/* Monitoring Options */}
              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded border-gray-300 text-black focus:ring-black"
                  />
                  <span className="text-sm text-gray-600">Auto-Scroll</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alarmCheck}
                    onChange={(e) => setAlarmCheck(e.target.checked)}
                    className="rounded border-gray-300 text-black focus:ring-black"
                  />
                  <span className="text-sm text-gray-600">Alarm Check</span>
                </label>
              </div>
            </div>

            {/* Last Update */}
            {lastUpdate && (
              <div className="text-sm text-gray-500">
                Updated: {new Date(lastUpdate).toLocaleTimeString()}
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-gray-100 rounded"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Status Summary */}
      <StatusSummary statusCounts={statusCounts} isFullscreen={isFullscreen} />

      {/* Main Content */}
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
              onNodeClick={handleNodeClick}
              equipmentStatusCount={equipmentStatusCount}
              activeCount={activeCount}
              defaultViewport={viewport}
            />
          </ReactFlowProvider>
        </div>

        {/* Equipment Detail Modal */}
        {selectedNode && (
          <EquipmentDetailModal
            node={selectedNode}
            isOpen={true}
            onClose={() => setSelectedNode(null)}
            equipmentStatus={equipmentStatuses.find(s => s.equipment_code === selectedNode.data.equipmentCode)}
            measurements={measurements.filter(m => {
              // If displayMeasurements is configured, only show those measurements
              if (selectedNode.data.displayMeasurements && selectedNode.data.displayMeasurements.length > 0) {
                return selectedNode.data.displayMeasurements.includes(m.measurement_code);
              }
              
              // Otherwise show measurements for this equipment
              return m.equipment_code === selectedNode.data.equipmentCode;
            })}
          />
        )}

        {/* Alarm Notification */}
        {showAlarms && alarmCheck && (
          <AlarmNotification onClose={() => setShowAlarms(false)} />
        )}

        {/* Remove Database Configuration Alert from public monitoring */}
        {/* <DatabaseConfigAlert
          isVisible={showDBAlert}
          onClose={() => setShowDBAlert(false)}
        /> */}
      </div>
    </div>
  );
};

export const PublicProcessFlowMonitor: React.FC = () => {
  return <PublicProcessFlowMonitorContent />;
};