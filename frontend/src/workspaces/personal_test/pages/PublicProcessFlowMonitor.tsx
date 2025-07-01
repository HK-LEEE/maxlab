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
import type { Viewport } from 'reactflow';
import type { Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { ZoomIn, Globe, Maximize2, Minimize2, RefreshCw } from 'lucide-react';

import { EquipmentNode } from '../components/common/EquipmentNode';
import { GroupNode } from '../components/common/GroupNode';
import { TextNode } from '../components/common/TextNode';
import { EquipmentDetailModal } from '../components/common/EquipmentDetailModal';
import { usePublicFlowMonitor } from '../hooks/usePublicFlowMonitor';

// Define nodeTypes outside component to avoid re-creation
const nodeTypes = {
  equipment: EquipmentNode,
  group: GroupNode,
  text: TextNode,
};

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
  edges: any[];
  nodeTypes: any;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  equipmentStatusCount: number;
  activeCount: number;
  onViewportChange?: (viewport: Viewport) => void;
  defaultViewport?: Viewport;
}> = ({ nodes, edges, nodeTypes, onNodeClick, equipmentStatusCount, activeCount, onViewportChange, defaultViewport }) => {
  const { fitView, setViewport, getViewport } = useReactFlow();
  const viewportRef = useRef<Viewport>();

  // Store viewport changes
  useEffect(() => {
    const handleViewportChange = () => {
      const currentViewport = getViewport();
      viewportRef.current = currentViewport;
      onViewportChange?.(currentViewport);
    };

    // Listen for viewport changes
    const timer = setInterval(handleViewportChange, 500);
    return () => clearInterval(timer);
  }, [getViewport, onViewportChange]);

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
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      fitView={false}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={true}
      zoomOnScroll={true}
      minZoom={0.1}
      maxZoom={4}
    >
      <Background color="#aaa" gap={16} />
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
};

const PublicProcessFlowMonitorContent: React.FC = () => {
  const { publishToken } = useParams<{ publishToken: string }>();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState<Viewport | undefined>();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const {
    flow,
    nodes,
    edges,
    equipmentStatuses,
    measurements,
    isLoading,
    lastUpdate,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    setRefreshInterval,
    error,
  } = usePublicFlowMonitor(publishToken || '');

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
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

  const equipmentStatusCount = equipmentStatuses.length;
  const activeCount = equipmentStatuses.filter(eq => eq.status === 'ACTIVE').length;

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Flow Not Found</h2>
          <p className="text-gray-600">This flow is not publicly available or the link is invalid.</p>
        </div>
      </div>
    );
  }

  if (isLoading || !flow) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading flow...</p>
        </div>
      </div>
    );
  }

  const refreshIntervalOptions = [
    { value: 30000, label: '30 seconds' },
    { value: 60000, label: '1 minute' },
    { value: 180000, label: '3 minutes' },
    { value: 300000, label: '5 minutes' },
  ];

  return (
    <div ref={containerRef} className="h-screen flex flex-col bg-gray-50">
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
            {/* Status Summary */}
            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-gray-600">Active: {activeCount}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span className="text-gray-600">
                  Pause: {equipmentStatuses.filter(eq => eq.status === 'PAUSE').length}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-gray-600">
                  Stop: {equipmentStatuses.filter(eq => eq.status === 'STOP').length}
                </span>
              </div>
            </div>

            {/* Refresh Controls */}
            <div className="flex items-center space-x-2">
              <RefreshCw size={16} className={`text-gray-500 ${autoRefresh ? 'animate-spin' : ''}`} />
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

      {/* Main Content */}
      <div className="flex-1 relative">
        <ReactFlowProvider>
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            equipmentStatusCount={equipmentStatusCount}
            activeCount={activeCount}
            onViewportChange={setViewport}
            defaultViewport={viewport}
          />
        </ReactFlowProvider>

        {/* Equipment Detail Modal */}
        {selectedNode && (
          <EquipmentDetailModal
            node={selectedNode}
            measurements={measurements.filter(m => m.equipment_code === selectedNode.data.equipmentCode)}
            isOpen={true}
            onClose={() => setSelectedNode(null)}
            onSave={() => {}} // Read-only in public view
            readOnly={true}
          />
        )}
      </div>
    </div>
  );
};

export const PublicProcessFlowMonitor: React.FC = () => {
  return <PublicProcessFlowMonitorContent />;
};