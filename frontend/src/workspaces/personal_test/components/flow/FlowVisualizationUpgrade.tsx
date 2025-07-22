import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Panel
} from 'reactflow';

// Enhanced components
import { EnhancedCustomEdge } from './EnhancedCustomEdge';
import { EnhancedEquipmentNode } from '../nodes/EnhancedEquipmentNode';
import { useEnhancedFlowEffects } from '../../hooks/useEnhancedFlowEffects';

// Import styles
import '../../styles/enhanced-flow-animations.css';
import 'reactflow/dist/style.css';

interface FlowVisualizationUpgradeProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onNodeClick?: (node: Node) => void;
  onEdgeClick?: (edge: Edge) => void;
  isMonitorMode?: boolean;
  className?: string;
}

// Enhanced node and edge types
const nodeTypes = {
  enhancedEquipment: EnhancedEquipmentNode,
};

const edgeTypes = {
  enhanced: EnhancedCustomEdge,
};

export const FlowVisualizationUpgrade: React.FC<FlowVisualizationUpgradeProps> = ({
  initialNodes,
  initialEdges,
  onNodeClick,
  onEdgeClick,
  isMonitorMode = false,
  className = ''
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [effectsConfig, setEffectsConfig] = useState({
    enableParticles: true,
    enableGlow: true,
    enableDirectionIndicators: true,
    performanceMode: 'high' as 'high' | 'medium' | 'low',
    maxParticleCount: 50,
    animationSpeed: 1.0
  });

  // Enhanced flow effects hook
  const {
    enhancedNodes,
    enhancedEdges,
    effectsEnabled,
    currentFps,
    effectConfig,
    setEffectsEnabled,
    updateMultipleEquipmentStatuses,
    updateConnectionQuality,
    equipmentStatuses,
    isHighPerformance
  } = useEnhancedFlowEffects(nodes, edges, effectsConfig);

  // Update nodes and edges when enhanced versions change
  useEffect(() => {
    setNodes(enhancedNodes);
  }, [enhancedNodes, setNodes]);

  useEffect(() => {
    setEdges(enhancedEdges);
  }, [enhancedEdges, setEdges]);

  // Simulate real-time status updates (in production, this would connect to WebSocket or polling)
  useEffect(() => {
    if (!isMonitorMode) return;

    const interval = setInterval(() => {
      // Simulate status updates for demo purposes
      const updates = nodes.map(node => ({
        nodeId: node.id,
        status: (['ACTIVE', 'PAUSE', 'STOP'] as const)[Math.floor(Math.random() * 3)],
        connectionQuality: (['connected', 'intermittent', 'disconnected'] as const)[Math.floor(Math.random() * 10) > 8 ? Math.floor(Math.random() * 3) : 0],
        performanceScore: 70 + Math.random() * 30,
        lastUpdate: new Date()
      }));

      updateMultipleEquipmentStatuses(updates);
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [isMonitorMode, nodes, updateMultipleEquipmentStatuses]);

  // Performance-based effects adjustment
  const handlePerformanceToggle = useCallback(() => {
    if (currentFps < 30) {
      setEffectsConfig(prev => ({ ...prev, performanceMode: 'low' }));
    } else if (currentFps < 45) {
      setEffectsConfig(prev => ({ ...prev, performanceMode: 'medium' }));
    } else {
      setEffectsConfig(prev => ({ ...prev, performanceMode: 'high' }));
    }
  }, [currentFps]);

  // Manual effects control
  const toggleEffects = useCallback((effectType: keyof typeof effectsConfig) => {
    setEffectsConfig(prev => ({
      ...prev,
      [effectType]: !prev[effectType]
    }));
  }, [effectsConfig]);

  // Node click handler with enhanced info
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const status = equipmentStatuses.get(node.id);
    console.log('Enhanced Node Info:', {
      node: node.data,
      status,
      connectionQuality: status?.connectionQuality,
      performanceScore: status?.performanceScore
    });
    
    if (onNodeClick) {
      onNodeClick(node);
    }
  }, [equipmentStatuses, onNodeClick]);

  // Edge click handler with flow info
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    console.log('Enhanced Edge Info:', {
      edge: edge.data,
      intensity: edge.data?.intensity,
      sourceStatus: edge.data?.sourceStatus,
      targetStatus: edge.data?.targetStatus,
      connectionQuality: edge.data?.connectionQuality
    });
    
    if (onEdgeClick) {
      onEdgeClick(edge);
    }
  }, [onEdgeClick]);

  return (
    <div className={`enhanced-flow-visualization ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{
          type: 'enhanced',
          animated: true,
        }}
        nodesDraggable={!isMonitorMode}
        nodesConnectable={!isMonitorMode}
        elementsSelectable={true}
        selectNodesOnDrag={false}
      >
        <Background variant="dots" gap={20} size={1} color="#e5e7eb" />
        
        <Controls 
          position="top-left"
          showInteractive={false}
        />
        
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            const status = equipmentStatuses.get(node.id)?.status;
            switch (status) {
              case 'ACTIVE': return '#10b981';
              case 'PAUSE': return '#eab308';
              case 'STOP': return '#ef4444';
              default: return '#6b7280';
            }
          }}
          nodeStrokeWidth={2}
          zoomable
          pannable
        />

        {/* Enhanced Controls Panel */}
        <Panel position="top-right" className="enhanced-controls-panel">
          <div className="bg-white rounded-lg shadow-lg p-4 space-y-3 max-w-xs">
            <div className="text-sm font-semibold text-gray-800 border-b pb-2">
              Flow Effects Control
            </div>
            
            {/* Performance Monitor */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-600">FPS:</span>
              <span className={`font-mono ${currentFps > 50 ? 'text-green-600' : currentFps > 30 ? 'text-yellow-600' : 'text-red-600'}`}>
                {currentFps}
              </span>
            </div>
            
            {/* Effects Toggles */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-xs">
                <input
                  type="checkbox"
                  checked={effectsConfig.enableParticles && effectsEnabled}
                  onChange={() => toggleEffects('enableParticles')}
                  className="rounded"
                />
                <span>Particle Effects</span>
              </label>
              
              <label className="flex items-center space-x-2 text-xs">
                <input
                  type="checkbox"
                  checked={effectsConfig.enableGlow && effectsEnabled}
                  onChange={() => toggleEffects('enableGlow')}
                  className="rounded"
                />
                <span>Glow Effects</span>
              </label>
              
              <label className="flex items-center space-x-2 text-xs">
                <input
                  type="checkbox"
                  checked={effectsConfig.enableDirectionIndicators && effectsEnabled}
                  onChange={() => toggleEffects('enableDirectionIndicators')}
                  className="rounded"
                />
                <span>Flow Indicators</span>
              </label>
            </div>
            
            {/* Performance Mode */}
            <div className="text-xs">
              <label className="block text-gray-600 mb-1">Performance Mode:</label>
              <select
                value={effectsConfig.performanceMode}
                onChange={(e) => setEffectsConfig(prev => ({ 
                  ...prev, 
                  performanceMode: e.target.value as 'high' | 'medium' | 'low' 
                }))}
                className="w-full text-xs p-1 border rounded"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            
            {/* Animation Speed */}
            <div className="text-xs">
              <label className="block text-gray-600 mb-1">Animation Speed:</label>
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.25"
                value={effectsConfig.animationSpeed}
                onChange={(e) => setEffectsConfig(prev => ({ 
                  ...prev, 
                  animationSpeed: parseFloat(e.target.value) 
                }))}
                className="w-full"
              />
              <div className="text-center text-gray-500">{effectsConfig.animationSpeed}x</div>
            </div>
            
            {/* Status Overview */}
            <div className="text-xs border-t pt-2">
              <div className="font-medium text-gray-700 mb-1">Node Status:</div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="bg-green-100 text-green-700 rounded px-1 py-1">
                  <div className="font-mono text-xs">
                    {Array.from(equipmentStatuses.values()).filter(s => s.status === 'ACTIVE').length}
                  </div>
                  <div style={{ fontSize: '10px' }}>ACTIVE</div>
                </div>
                <div className="bg-yellow-100 text-yellow-700 rounded px-1 py-1">
                  <div className="font-mono text-xs">
                    {Array.from(equipmentStatuses.values()).filter(s => s.status === 'PAUSE').length}
                  </div>
                  <div style={{ fontSize: '10px' }}>PAUSE</div>
                </div>
                <div className="bg-red-100 text-red-700 rounded px-1 py-1">
                  <div className="font-mono text-xs">
                    {Array.from(equipmentStatuses.values()).filter(s => s.status === 'STOP').length}
                  </div>
                  <div style={{ fontSize: '10px' }}>STOP</div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

// Wrapper component with ReactFlowProvider
export const FlowVisualizationUpgradeProvider: React.FC<FlowVisualizationUpgradeProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowVisualizationUpgrade {...props} />
    </ReactFlowProvider>
  );
};