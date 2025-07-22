import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, Edge } from 'reactflow';

interface FlowEffectsConfig {
  enableParticles: boolean;
  enableGlow: boolean;
  enableDirectionIndicators: boolean;
  performanceMode: 'high' | 'medium' | 'low';
  maxParticleCount: number;
  animationSpeed: number;
}

interface EquipmentStatus {
  nodeId: string;
  status: 'ACTIVE' | 'PAUSE' | 'STOP';
  connectionQuality: 'connected' | 'intermittent' | 'disconnected';
  performanceScore: number;
  lastUpdate: Date;
}

export const useEnhancedFlowEffects = (
  nodes: Node[],
  edges: Edge[],
  config: FlowEffectsConfig = {
    enableParticles: true,
    enableGlow: true,
    enableDirectionIndicators: true,
    performanceMode: 'high',
    maxParticleCount: 50,
    animationSpeed: 1.0
  }
) => {
  const [equipmentStatuses, setEquipmentStatuses] = useState<Map<string, EquipmentStatus>>(new Map());
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const animationFrameRef = useRef<number>();
  const performanceMonitorRef = useRef<{ fps: number; lastTime: number; frameCount: number }>({
    fps: 60,
    lastTime: Date.now(),
    frameCount: 0
  });

  // Performance monitoring
  const monitorPerformance = useCallback(() => {
    const now = Date.now();
    const monitor = performanceMonitorRef.current;
    monitor.frameCount++;

    if (now - monitor.lastTime >= 1000) {
      monitor.fps = Math.round((monitor.frameCount * 1000) / (now - monitor.lastTime));
      monitor.frameCount = 0;
      monitor.lastTime = now;

      // Auto-adjust effects based on performance
      if (monitor.fps < 30 && config.performanceMode === 'high') {
        setEffectsEnabled(false);
        console.warn('Flow effects disabled due to low performance');
      } else if (monitor.fps > 50 && !effectsEnabled) {
        setEffectsEnabled(true);
      }
    }

    animationFrameRef.current = requestAnimationFrame(monitorPerformance);
  }, [config.performanceMode, effectsEnabled]);

  // Start performance monitoring
  useEffect(() => {
    if (config.performanceMode === 'high') {
      monitorPerformance();
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [monitorPerformance, config.performanceMode]);

  // Update equipment status
  const updateEquipmentStatus = useCallback((nodeId: string, status: EquipmentStatus) => {
    setEquipmentStatuses(prev => {
      const newMap = new Map(prev);
      newMap.set(nodeId, { ...status, lastUpdate: new Date() });
      return newMap;
    });
  }, []);

  // Calculate edge intensity based on connected node statuses
  const calculateEdgeIntensity = useCallback((edge: Edge): 'low' | 'medium' | 'high' => {
    const sourceStatus = equipmentStatuses.get(edge.source)?.status;
    const targetStatus = equipmentStatuses.get(edge.target)?.status;

    if (sourceStatus === 'ACTIVE' && targetStatus === 'ACTIVE') return 'high';
    if (sourceStatus === 'ACTIVE' || targetStatus === 'ACTIVE') return 'medium';
    return 'low';
  }, [equipmentStatuses]);

  // Generate enhanced edge properties
  const getEnhancedEdgeProps = useCallback((edge: Edge) => {
    const sourceStatus = equipmentStatuses.get(edge.source)?.status;
    const targetStatus = equipmentStatuses.get(edge.target)?.status;
    const intensity = calculateEdgeIntensity(edge);
    
    const sourceConnectionQuality = equipmentStatuses.get(edge.source)?.connectionQuality || 'connected';
    const targetConnectionQuality = equipmentStatuses.get(edge.target)?.connectionQuality || 'connected';

    // Determine edge color based on worst case status
    let edgeColor = '#10b981'; // Default green
    let animated = true;

    if (sourceStatus === 'STOP' || targetStatus === 'STOP') {
      edgeColor = '#ef4444'; // Red for critical
      animated = config.enableParticles;
    } else if (sourceStatus === 'PAUSE' || targetStatus === 'PAUSE') {
      edgeColor = '#eab308'; // Yellow for warning
      animated = config.enableParticles;
    }

    // Adjust for connection quality
    if (sourceConnectionQuality === 'disconnected' || targetConnectionQuality === 'disconnected') {
      animated = false;
      edgeColor = '#6b7280'; // Gray for disconnected
    } else if (sourceConnectionQuality === 'intermittent' || targetConnectionQuality === 'intermittent') {
      animated = true;
      // Keep existing color but add intermittent behavior
    }

    return {
      ...edge,
      style: {
        ...edge.style,
        stroke: edgeColor,
        strokeWidth: intensity === 'high' ? 3 : intensity === 'medium' ? 2 : 1,
        opacity: sourceConnectionQuality === 'disconnected' || targetConnectionQuality === 'disconnected' ? 0.3 : 1,
      },
      data: {
        ...edge.data,
        animated: animated && effectsEnabled,
        intensity,
        sourceStatus,
        targetStatus,
        connectionQuality: sourceConnectionQuality === 'connected' && targetConnectionQuality === 'connected' 
          ? 'connected' 
          : sourceConnectionQuality === 'disconnected' || targetConnectionQuality === 'disconnected'
          ? 'disconnected'
          : 'intermittent'
      },
      type: 'enhanced'
    };
  }, [equipmentStatuses, calculateEdgeIntensity, config.enableParticles, effectsEnabled]);

  // Generate enhanced node properties
  const getEnhancedNodeProps = useCallback((node: Node) => {
    const status = equipmentStatuses.get(node.id);
    
    return {
      ...node,
      data: {
        ...node.data,
        connectionStatus: status?.connectionQuality || 'connected',
        performanceScore: status?.performanceScore || 85,
        lastUpdate: status?.lastUpdate || new Date(),
        // Add trend simulation (in real implementation, this would come from actual data)
        measurements: node.data.measurements?.map((m: any) => ({
          ...m,
          trend: Math.random() > 0.6 ? 'up' : Math.random() > 0.3 ? 'down' : 'stable',
          efficiency: Math.min(100, Math.max(0, m.efficiency || (75 + Math.random() * 25)))
        }))
      },
      type: 'enhancedEquipment'
    };
  }, [equipmentStatuses]);

  // Process all edges for enhanced effects
  const enhancedEdges = edges.map(getEnhancedEdgeProps);
  
  // Process all nodes for enhanced effects
  const enhancedNodes = nodes.map(getEnhancedNodeProps);

  // Effect configuration helpers
  const getEffectConfig = useCallback(() => {
    const baseConfig = {
      particles: config.enableParticles && effectsEnabled,
      glow: config.enableGlow && effectsEnabled,
      directionIndicators: config.enableDirectionIndicators && effectsEnabled,
      maxParticles: config.maxParticleCount,
      animationSpeed: config.animationSpeed
    };

    // Adjust based on performance mode
    switch (config.performanceMode) {
      case 'low':
        return {
          ...baseConfig,
          maxParticles: Math.min(10, config.maxParticleCount),
          animationSpeed: config.animationSpeed * 0.5,
          particles: false,
          glow: false
        };
      case 'medium':
        return {
          ...baseConfig,
          maxParticles: Math.min(25, config.maxParticleCount),
          animationSpeed: config.animationSpeed * 0.75
        };
      case 'high':
      default:
        return baseConfig;
    }
  }, [config, effectsEnabled]);

  // Status transition animation trigger
  const triggerStatusTransition = useCallback((nodeId: string, fromStatus: string, toStatus: string) => {
    // This would trigger CSS transitions or JS animations
    const nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
    if (nodeElement) {
      nodeElement.classList.add('status-transitioning');
      setTimeout(() => {
        nodeElement.classList.remove('status-transitioning');
      }, 300);
    }
  }, []);

  // Bulk update equipment statuses (for real-time updates)
  const updateMultipleEquipmentStatuses = useCallback((updates: EquipmentStatus[]) => {
    setEquipmentStatuses(prev => {
      const newMap = new Map(prev);
      updates.forEach(update => {
        const existing = newMap.get(update.nodeId);
        if (existing && existing.status !== update.status) {
          triggerStatusTransition(update.nodeId, existing.status, update.status);
        }
        newMap.set(update.nodeId, { ...update, lastUpdate: new Date() });
      });
      return newMap;
    });
  }, [triggerStatusTransition]);

  // Connection quality monitoring
  const updateConnectionQuality = useCallback((nodeId: string, quality: 'connected' | 'intermittent' | 'disconnected') => {
    setEquipmentStatuses(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(nodeId);
      if (existing) {
        newMap.set(nodeId, { ...existing, connectionQuality: quality, lastUpdate: new Date() });
      }
      return newMap;
    });
  }, []);

  return {
    enhancedNodes,
    enhancedEdges,
    effectsEnabled,
    currentFps: performanceMonitorRef.current.fps,
    effectConfig: getEffectConfig(),
    
    // Control functions
    setEffectsEnabled,
    updateEquipmentStatus,
    updateMultipleEquipmentStatuses,
    updateConnectionQuality,
    calculateEdgeIntensity,
    
    // Status maps
    equipmentStatuses: equipmentStatuses,
    
    // Utility functions
    getNodeStatus: (nodeId: string) => equipmentStatuses.get(nodeId),
    getEdgeIntensity: calculateEdgeIntensity,
    isHighPerformance: () => performanceMonitorRef.current.fps > 50
  };
};