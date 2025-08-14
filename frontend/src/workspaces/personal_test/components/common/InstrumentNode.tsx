import React, { memo, useEffect, useRef, useState } from 'react';
import log from '../../../../utils/logger';
import { Handle, Position, NodeResizer, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { 
  Activity,
  AlertCircle,
  CheckCircle,
  PauseCircle
} from 'lucide-react';

// Instrument configuration
const instrumentConfig = {
  name: '계측기',
  icon: <Activity size={20} />,
  color: '#DDA0DD',
  headerBg: 'bg-purple-500',
  headerText: 'text-white',
  borderColor: 'border-purple-300'
};

// Status configuration (same as EquipmentNode)
const statusConfig = {
  ACTIVE: { 
    color: 'text-green-600', 
    bgColor: 'bg-green-100', 
    headerBg: 'bg-green-500',
    headerText: 'text-white',
    icon: <CheckCircle size={16} /> 
  },
  PAUSE: { 
    color: 'text-yellow-600', 
    bgColor: 'bg-yellow-100', 
    headerBg: 'bg-yellow-500',
    headerText: 'text-white',
    icon: <PauseCircle size={16} /> 
  },
  STOP: { 
    color: 'text-red-600', 
    bgColor: 'bg-red-100', 
    headerBg: 'bg-red-500',
    headerText: 'text-white',
    icon: <AlertCircle size={16} /> 
  },
};

// Get status configuration with fallback
const getStatusConfig = (status: string) => {
  const config = statusConfig[status as keyof typeof statusConfig];
  if (config) return config;
  
  // Fallback for unknown statuses
  return {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    headerBg: 'bg-gray-500',
    headerText: 'text-white',
    icon: <AlertCircle size={16} />
  };
};

interface Measurement {
  code: string;
  desc: string;
  value: number;
  unit?: string;
  spec_status?: 'IN_SPEC' | 'ABOVE_SPEC' | 'BELOW_SPEC';
  upper_spec_limit?: number;
  lower_spec_limit?: number;
  target_value?: number;
  trend?: 'up' | 'down' | 'stable';
  history?: number[]; // For trend display
}

interface InstrumentNodeData {
  label: string;
  instrumentType: string;
  instrumentName: string;
  color?: string;
  measurements?: Measurement[];
  displayMeasurements?: string[];
  hasSpecOut?: boolean;
  nodeSize?: '1' | '2' | '3';
  autoScroll?: boolean;
}


export const InstrumentNode = memo((props: NodeProps<InstrumentNodeData>) => {
  const { data, selected, id, ...nodeProps } = props;
  
  const icon = instrumentConfig.icon;
  const nodeColor = data.color || '#6b7280'; // Use dynamic color with gray default
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // Debug logging for monitoring pages
  const isMonitorPage = window.location.pathname.includes('monitor') || window.location.pathname.includes('public');
  if (isMonitorPage) {
    log.debug('InstrumentNode rendering on monitor page', {
      nodeId: id,
      hasMeasurements: !!data.measurements,
      measurementCount: data.measurements?.length || 0,
      displayMeasurements: data.displayMeasurements,
      nodeColor: nodeColor
    });
  }
  
  // Get ReactFlow instance
  const { setNodes, getNode } = useReactFlow();
  
  // Get current node data
  const currentNode = getNode(id);
  
  // Get initial dimensions
  const getInitialDimensions = () => {
    const storedHeight = currentNode?.style?.height;
    const storedWidth = currentNode?.style?.width;
    
    return {
      width: typeof storedWidth === 'number' ? storedWidth : undefined,
      height: typeof storedHeight === 'number' ? storedHeight : undefined
    };
  };
  
  const [resizedDimensions, setResizedDimensions] = useState<{width?: number, height?: number}>(getInitialDimensions);
  
  // Check if any measurements are out of spec
  const hasSpecOut = data.measurements?.some(m => 
    m.spec_status === 'ABOVE_SPEC' || m.spec_status === 'BELOW_SPEC'
  ) || false;
  
  // Get node size info
  const nodeSize = data.nodeSize || '1';
  const getNodeHeight = (size: '1' | '2' | '3') => {
    switch (size) {
      case '1': return 170;
      case '2': return 220;
      case '3': return 270;
      default: return 170;
    }
  };
  
  // Parse style values
  const parseStyleValue = (value: string | number | undefined, context: string = ''): number | undefined => {
    const logPrefix = `parseStyleValue${context ? ` [${context}]` : ''}:`;
    
    if (value === null || value === undefined) {
      return undefined;
    }
    
    if (typeof value === 'number') {
      if (isFinite(value) && value >= 0) {
        return value;
      } else {
        return undefined;
      }
    }
    
    if (typeof value === 'string') {
      const directParsed = parseFloat(value);
      if (!isNaN(directParsed) && isFinite(directParsed) && directParsed >= 0) {
        return directParsed;
      }
      
      const cleaned = value.toString().replace(/px|em|rem|%/g, '').trim();
      const parsed = parseFloat(cleaned);
      
      if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
        return undefined;
      }
      return parsed;
    }
    
    if (typeof value === 'object' && value !== null) {
      return undefined;
    }
    
    const lastResortParsed = Number(value);
    if (!isNaN(lastResortParsed) && isFinite(lastResortParsed) && lastResortParsed >= 0) {
      return lastResortParsed;
    }
    return undefined;
  };

  // Calculate actual node dimensions
  const propsStyleHeight = parseStyleValue(currentNode?.style?.height, 'props');
  const propsStyleWidth = parseStyleValue(currentNode?.style?.width, 'props');
  const reactFlowStyleHeight = parseStyleValue(currentNode?.style?.height, 'reactFlow');
  const reactFlowStyleWidth = parseStyleValue(currentNode?.style?.width, 'reactFlow');
  
  const directReactFlowHeight = currentNode?.style?.height;
  const directReactFlowWidth = currentNode?.style?.width;
  const directPropsHeight = currentNode?.style?.height;
  const directPropsWidth = currentNode?.style?.width;
  
  const defaultHeight = getNodeHeight(nodeSize);
  
  const minHeight = getNodeHeight(nodeSize);
  const minWidth = 200;
  
  const calculatedHeight = reactFlowStyleHeight || 
                          (typeof directReactFlowHeight === 'number' ? directReactFlowHeight : undefined) ||
                          resizedDimensions.height || 
                          propsStyleHeight ||
                          (typeof directPropsHeight === 'number' ? directPropsHeight : undefined) ||
                          defaultHeight;
                           
  const calculatedWidth = reactFlowStyleWidth || 
                         (typeof directReactFlowWidth === 'number' ? directReactFlowWidth : undefined) ||
                         resizedDimensions.width || 
                         propsStyleWidth ||
                         (typeof directPropsWidth === 'number' ? directPropsWidth : undefined) ||
                         200;

  const actualNodeHeight = Math.max(calculatedHeight, minHeight);
  const actualNodeWidth = Math.max(calculatedWidth, minWidth);
  
  // Initialize resizedDimensions from ReactFlow node style
  useEffect(() => {
    const reactFlowHeight = parseStyleValue(currentNode?.style?.height);
    const reactFlowWidth = parseStyleValue(currentNode?.style?.width);
    const propsHeight = parseStyleValue(currentNode?.style?.height);
    const propsWidth = parseStyleValue(currentNode?.style?.width);
    
    const sourceHeight = reactFlowHeight || propsHeight;
    const sourceWidth = reactFlowWidth || propsWidth;
    
    if (sourceHeight !== undefined || sourceWidth !== undefined) {
      const shouldUpdate = 
        (sourceHeight !== undefined && sourceHeight !== resizedDimensions.height) ||
        (sourceWidth !== undefined && sourceWidth !== resizedDimensions.width) ||
        (!resizedDimensions.height && !resizedDimensions.width);
        
      if (shouldUpdate) {
        const minHeight = getNodeHeight(nodeSize);
        const minWidth = 200;
        
        const newDimensions = {
          width: Math.max(
            sourceWidth || 0,
            resizedDimensions.width || 0,
            minWidth
          ),
          height: Math.max(
            sourceHeight || 0,
            resizedDimensions.height || 0,
            minHeight
          )
        };
        
        setResizedDimensions(newDimensions);
      }
    } else if (!resizedDimensions.height && !resizedDimensions.width) {
      const defaultDimensions = {
        width: 200,
        height: getNodeHeight(nodeSize)
      };
      
      setResizedDimensions(defaultDimensions);
    }
  }, [currentNode?.style?.height, currentNode?.style?.width, nodeSize, id]);

  // Force re-render when style changes
  useEffect(() => {
    // This effect ensures the component re-renders when ReactFlow style changes
  }, [currentNode?.style?.height, currentNode?.style?.width, actualNodeHeight, actualNodeWidth]);

  // Update resized dimensions when nodeSize changes
  useEffect(() => {
    const newMinHeight = getNodeHeight(nodeSize);
    const newWidth = 200;
    
    const currentStoredHeight = parseStyleValue(currentNode?.style?.height) || 
                               resizedDimensions.height || 
                               newMinHeight;
    const currentStoredWidth = parseStyleValue(currentNode?.style?.width) || 
                              resizedDimensions.width || 
                              newWidth;
    
    const needsHeightUpdate = currentStoredHeight < newMinHeight;
    const needsWidthUpdate = !currentStoredWidth || currentStoredWidth < newWidth;
    
    if (needsHeightUpdate || needsWidthUpdate) {
      const updatedDimensions = {
        width: needsWidthUpdate ? newWidth : currentStoredWidth,
        height: needsHeightUpdate ? newMinHeight : currentStoredHeight
      };
      
      setResizedDimensions(updatedDimensions);
      
      if (setNodes && id && (needsHeightUpdate || needsWidthUpdate)) {
        setNodes((nodes) => nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              style: {
                ...node.style,
                width: updatedDimensions.width,
                height: updatedDimensions.height,
              }
            };
          }
          return node;
        }));
      }
    }
  }, [nodeSize]);
  
  // Auto-scroll measurements (similar to EquipmentNode)
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollPositionRef = useRef<number>(0);
  const isScrollActiveRef = useRef<boolean>(false);
  
  const globalScrollKey = `autoScroll_${id}`;
  const isGlobalScrollActive = () => (window as any)[globalScrollKey] === true;
  const setGlobalScrollActive = (active: boolean) => {
    (window as any)[globalScrollKey] = active;
  };
  
  useEffect(() => {
    const timer = setTimeout(() => {
      const isMonitorPage = window.location.pathname.includes('monitor') || 
                           window.location.pathname.includes('public');
      // Use autoScroll from props instead of global value
      const shouldScroll = isMonitorPage && data.autoScroll;
      
      log.debug('InstrumentNode auto-scroll check', {
        nodeId: id,
        isMonitorPage,
        autoScroll: data.autoScroll,
        shouldScroll,
        hasMeasurements: !!data.measurements,
        measurementCount: data.measurements?.length || 0
      });
      
      if (shouldScroll && data.measurements && data.measurements.length > 0 && scrollRef.current && !isResizing) {
        const nodeHeight = actualNodeHeight;
        const visibleMeasurements = Math.floor((nodeHeight - 100) / 50);
        const needsScroll = data.measurements.length > visibleMeasurements;
        
        if (needsScroll && !isScrollActiveRef.current && !isGlobalScrollActive()) {
          log.info('Auto-scroll started for instrument node', { nodeId: id });
          setIsScrolling(true);
          isScrollActiveRef.current = true;
          setGlobalScrollActive(true);
          const scrollContainer = scrollRef.current;
          
          if (scrollPositionRef.current > 0 && scrollContainer) {
            scrollContainer.scrollTop = scrollPositionRef.current;
          }
          
          const scroll = () => {
            if (scrollContainer && isScrollActiveRef.current && isGlobalScrollActive()) {
              const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
              scrollPositionRef.current += 0.5;
              
              if (scrollPositionRef.current >= maxScroll) {
                scrollPositionRef.current = 0;
              }
              
              scrollContainer.scrollTop = scrollPositionRef.current;
            }
          };
          
          if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
          }
          
          scrollIntervalRef.current = setInterval(scroll, 50);
        } else if (!needsScroll && isScrollActiveRef.current) {
          if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
          }
          setIsScrolling(false);
          isScrollActiveRef.current = false;
          setGlobalScrollActive(false);
          scrollPositionRef.current = 0;
        }
      } else if (isScrollActiveRef.current) {
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current);
          scrollIntervalRef.current = null;
        }
        setIsScrolling(false);
        isScrollActiveRef.current = false;
        setGlobalScrollActive(false);
        scrollPositionRef.current = 0;
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [actualNodeHeight, isResizing, id, data.measurements, data.autoScroll]);
  
  // Cleanup scroll interval on unmount
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      isScrollActiveRef.current = false;
      setGlobalScrollActive(false);
      delete (window as any)[globalScrollKey];
    };
  }, [globalScrollKey]);
  
  return (
    <>
      <NodeResizer
        color={nodeColor}
        isVisible={selected && !window.location.pathname.includes('monitor') && !window.location.pathname.includes('public')}
        minWidth={200}
        minHeight={120}
        handleStyle={{ width: 8, height: 8 }}
        onResizeStart={() => {
          setIsResizing(true);
        }}
        onResizeEnd={() => {
          setIsResizing(false);
        }}
        onResize={(event, params) => {
          log.debug('Instrument node resized', {
            nodeId: id,
            newSize: { width: params.width, height: params.height }
          });
          
          // Update local state immediately
          setResizedDimensions({
            width: params.width,
            height: params.height
          });
          
          // Update the node with new size
          if (setNodes && id) {
            try {
              setNodes((nodes) => nodes.map((node) => {
                if (node.id === id) {
                  return {
                    ...node,
                    style: {
                      ...node.style,
                      width: params.width,
                      height: params.height,
                    },
                    position: {
                      x: params.x,
                      y: params.y,
                    }
                  };
                }
                return node;
              }));
            } catch (error) {
              log.error('Failed to update instrument node size', { nodeId: id, error });
            }
          }
        }}
      />
      
      <Handle
        type="target"
        position={Position.Top}
        className="target"
        style={{
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 10,
          height: 10,
          background: nodeColor,
          border: 'none',
          zIndex: 20
        }}
      />
      
      <div
        className={`
          rounded-lg border-2 shadow-sm overflow-hidden
          ${selected ? 'shadow-lg' : ''}
          min-w-[200px] ${currentNode?.style?.width ? '' : 'w-full'} flex flex-col
        `}
        style={{ 
          height: `${actualNodeHeight}px`,
          width: `${actualNodeWidth}px`,
          borderColor: nodeColor,
          backgroundColor: 'transparent'
        }}
      >
      
      {/* Tier 1: Instrument Name (Center aligned) */}
      <div className={`px-3 py-2 border-b relative`}
        style={{ backgroundColor: nodeColor }}>
        <div className="flex items-center justify-center space-x-1">
          <div className="text-white">{icon}</div>
          <div className={`font-semibold text-sm text-center text-white`}>
            {data.label || '계측기'}
          </div>
          {hasSpecOut && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" />
            </div>
          )}
        </div>
      </div>
      
      {/* Tier 2.5: Selected Measurement Preview (Editor only) */}
      {!window.location.pathname.includes('monitor') && !window.location.pathname.includes('public') && data.displayMeasurements && data.displayMeasurements.length > 0 && (
        <div className="border-b" style={{ backgroundColor: nodeColor + '10' }}>
          <div className="px-2 py-1">
            <div className="text-[10px] font-medium mb-1" style={{ color: nodeColor }}>Selected Measurements Preview:</div>
            <div className="space-y-0.5">
              {data.displayMeasurements.map((measurementCode: string, index: number) => (
                <div 
                  key={index}
                  className="text-xs rounded px-2 py-1 border"
                  style={{ 
                    backgroundColor: nodeColor + '05',
                    borderColor: nodeColor + '30'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[10px]" style={{ color: nodeColor }}>{measurementCode}: [Measurement Name]</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Tier 3: Measurements Section (transparent background) */}
      <div className="px-2 py-1.5 flex-1 overflow-hidden" style={{ backgroundColor: 'transparent' }}>
        {data.measurements && data.measurements.length > 0 ? (
          <div 
            ref={scrollRef}
            className="h-full overflow-y-auto"
            style={{ 
              maxHeight: '100%',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            <div className="space-y-0.5">
              {(() => {
                const filteredMeasurements = data.measurements
                  .filter(m => !data.displayMeasurements || data.displayMeasurements.length === 0 || data.displayMeasurements.includes(m.code));
                
                // Duplicate measurements for smooth infinite scroll when scrolling
                const measurementsToShow = isScrolling
                  ? [...filteredMeasurements, ...filteredMeasurements]
                  : filteredMeasurements;
                
                return measurementsToShow.map((measurement, index) => {
                  const isAboveSpec = measurement.spec_status === 'ABOVE_SPEC';
                  const isBelowSpec = measurement.spec_status === 'BELOW_SPEC';
                  const isOutOfSpec = isAboveSpec || isBelowSpec;
                  
                  return (
                    <div 
                      key={`${measurement.code}-${index}`} 
                      className={`text-xs rounded px-2 py-1 ${
                        isOutOfSpec ? 'bg-red-50 border border-red-300' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-gray-600 text-[10px]">{measurement.code}: {measurement.desc}</div>
                        {isOutOfSpec && (
                          <AlertCircle className="w-3 h-3 text-red-500" />
                        )}
                      </div>
                      <div className={`font-semibold ${isOutOfSpec ? 'text-red-700' : 'text-gray-800'}`}>
                        {measurement.value.toLocaleString()} {measurement.unit || ''}
                        {isAboveSpec && measurement.upper_spec_limit !== undefined && (
                          <span className="text-[10px] ml-1">(USL: {measurement.upper_spec_limit})</span>
                        )}
                        {isBelowSpec && measurement.lower_spec_limit !== undefined && (
                          <span className="text-[10px] ml-1">(LSL: {measurement.lower_spec_limit})</span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : (
          // Show placeholder when no measurements available
          <div className="h-full flex items-center justify-center">
            <div className="text-xs text-gray-400 text-center">
              <Activity size={24} className="mx-auto mb-1 opacity-50" />
              <div>No measurements available</div>
            </div>
          </div>
        )}
      </div>
      
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="source"
        style={{
          bottom: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 10,
          height: 10,
          background: nodeColor,
          border: 'none',
          zIndex: 20
        }}
      />
    </>
  );
});

InstrumentNode.displayName = 'InstrumentNode';