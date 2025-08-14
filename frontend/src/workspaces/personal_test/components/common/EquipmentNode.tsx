import React, { memo, useEffect, useRef, useState } from 'react';
import log from '../../../../utils/logger';
import { Handle, Position, NodeResizer, useReactFlow } from 'reactflow';
import type { Node, NodeProps } from 'reactflow';
import { 
  Gauge, 
  Activity, 
  Filter, 
  Thermometer, 
  Wind, 
  Zap, 
  Database, 
  Archive, 
  GitMerge, 
  Flame,
  Snowflake,
  Settings,
  AlertCircle,
  CheckCircle,
  PauseCircle
} from 'lucide-react';

interface EquipmentNodeData {
  label: string;
  equipmentType: string;
  equipmentCode?: string;
  equipmentName: string;
  status: 'ACTIVE' | 'PAUSE' | 'STOP';
  icon?: string;
  measurements?: Array<{
    code: string;
    desc: string;
    value: number;
    unit?: string;
    spec_status?: 'IN_SPEC' | 'ABOVE_SPEC' | 'BELOW_SPEC';
    upper_spec_limit?: number;
    lower_spec_limit?: number;
    target_value?: number;
  }>;
  displayMeasurements?: string[];
  hasSpecOut?: boolean;
  nodeSize?: '1' | '2' | '3';
  autoScroll?: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  gauge: <Gauge size={20} />,
  activity: <Activity size={20} />,
  filter: <Filter size={20} />,
  thermometer: <Thermometer size={20} />,
  wind: <Wind size={20} />,
  zap: <Zap size={20} />,
  database: <Database size={20} />,
  archive: <Archive size={20} />,
  'git-merge': <GitMerge size={20} />,
  flame: <Flame size={20} />,
  snowflake: <Snowflake size={20} />,
  settings: <Settings size={20} />,
};

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

// Get status configuration with fallback for unknown statuses
const getStatusConfig = (status: string) => {
  const config = statusConfig[status as keyof typeof statusConfig];
  if (config) return config;
  
  // Fallback for unknown statuses - default to STOP styling
  return {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    headerBg: 'bg-gray-500',
    headerText: 'text-white',
    icon: <AlertCircle size={16} />
  };
};

export const EquipmentNode = memo((props: NodeProps<EquipmentNodeData>) => {
  const { data, selected, id, ...nodeProps } = props;
  
  const status = getStatusConfig(data.status);
  const icon = data.icon ? iconMap[data.icon] : <Gauge size={20} />;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // Get ReactFlow instance to update nodes and query current node FIRST
  const { setNodes, getNode } = useReactFlow();
  
  // Get current node data directly from ReactFlow
  const currentNode = getNode(id);
  
  // Immediate initialization of resizedDimensions with stored values
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
  
  // Enhanced parseStyleValue function with comprehensive type handling and API data type resilience
  const parseStyleValue = (value: string | number | undefined, context: string = ''): number | undefined => {
    const logPrefix = `parseStyleValue${context ? ` [${context}]` : ''}:`;
    
    if (value === null || value === undefined) {
      return undefined;
    }
    
    // Handle numbers (including those that might be stored as strings by API)
    if (typeof value === 'number') {
      if (isFinite(value) && value >= 0) {
        return value;
      } else {
        return undefined;
      }
    }
    
    // Handle strings (including numeric strings from API serialization)
    if (typeof value === 'string') {
      // First, try direct number conversion for pure numeric strings
      const directParsed = parseFloat(value);
      if (!isNaN(directParsed) && isFinite(directParsed) && directParsed >= 0) {
        return directParsed;
      }
      
      // Handle various string formats: "200px", "200", "200.5px", etc.
      const cleaned = value.toString().replace(/px|em|rem|%/g, '').trim();
      const parsed = parseFloat(cleaned);
      
      if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
        return undefined;
      }
      return parsed;
    }
    
    // Handle edge cases where API might return unexpected types
    if (typeof value === 'object' && value !== null) {
      return undefined;
    }
    
    // Try to convert any other type to number as last resort
    const lastResortParsed = Number(value);
    if (!isNaN(lastResortParsed) && isFinite(lastResortParsed) && lastResortParsed >= 0) {
      return lastResortParsed;
    }
    return undefined;
  };

  // Calculate actual node dimensions with multiple fallback strategies
  const propsStyleHeight = parseStyleValue(currentNode?.style?.height, 'props');
  const propsStyleWidth = parseStyleValue(currentNode?.style?.width, 'props');
  const reactFlowStyleHeight = parseStyleValue(currentNode?.style?.height, 'reactFlow');
  const reactFlowStyleWidth = parseStyleValue(currentNode?.style?.width, 'reactFlow');
  
  // Direct access as fallback (bypass parseStyleValue)
  const directReactFlowHeight = currentNode?.style?.height;
  const directReactFlowWidth = currentNode?.style?.width;
  const directPropsHeight = currentNode?.style?.height;
  const directPropsWidth = currentNode?.style?.width;
  
  const defaultHeight = getNodeHeight(nodeSize);
  
  // Enhanced fallback logic with direct access - SAFEGUARD: Prioritize larger stored values
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

  // SAFEGUARD: Ensure final dimensions are never smaller than minimums, but preserve larger values
  const actualNodeHeight = Math.max(calculatedHeight, minHeight);
  const actualNodeWidth = Math.max(calculatedWidth, minWidth);
  

  // Legacy debug logging removed - using enhanced logging above
  
  
  
  // Initialize resizedDimensions from ReactFlow node style and sync when it changes - PRESERVE larger dimensions
  useEffect(() => {
    const reactFlowHeight = parseStyleValue(currentNode?.style?.height);
    const reactFlowWidth = parseStyleValue(currentNode?.style?.width);
    const propsHeight = parseStyleValue(currentNode?.style?.height);
    const propsWidth = parseStyleValue(currentNode?.style?.width);
    
    
    // Use ReactFlow style as primary source, but preserve larger existing values
    const sourceHeight = reactFlowHeight || propsHeight;
    const sourceWidth = reactFlowWidth || propsWidth;
    
    // Initialize or update if we have style values and they differ from current resizedDimensions
    if (sourceHeight !== undefined || sourceWidth !== undefined) {
      const shouldUpdate = 
        (sourceHeight !== undefined && sourceHeight !== resizedDimensions.height) ||
        (sourceWidth !== undefined && sourceWidth !== resizedDimensions.width) ||
        (!resizedDimensions.height && !resizedDimensions.width);
        
      if (shouldUpdate) {
        // CRITICAL: Preserve larger dimensions when syncing
        const minHeight = getNodeHeight(nodeSize);
        const minWidth = 200;
        
        const newDimensions = {
          // Use the larger of: stored value, source value, existing value, or minimum
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
      // No style data but nothing in resizedDimensions - use defaults
      const defaultDimensions = {
        width: 200,
        height: getNodeHeight(nodeSize)
      };
      
      setResizedDimensions(defaultDimensions);
    }
  }, [currentNode?.style?.height, currentNode?.style?.width, nodeSize, id]); // Sync when ReactFlow style changes, but NOT on selection changes


  // Force re-render when style changes (reduced logging)
  useEffect(() => {
    // This effect ensures the component re-renders when ReactFlow style changes
    // Logging removed to reduce console noise
  }, [currentNode?.style?.height, currentNode?.style?.width, actualNodeHeight, actualNodeWidth]);

  // Update resized dimensions when nodeSize changes from settings - PRESERVE larger user-resized dimensions
  useEffect(() => {
    const newMinHeight = getNodeHeight(nodeSize);
    const newWidth = 200;
    
    // Get current stored dimensions from multiple sources (prioritize actual stored values)
    const currentStoredHeight = parseStyleValue(currentNode?.style?.height) || 
                               resizedDimensions.height || 
                               newMinHeight;
    const currentStoredWidth = parseStyleValue(currentNode?.style?.width) || 
                              resizedDimensions.width || 
                              newWidth;
    
    // CRITICAL: Only update if current dimensions are smaller than the new minimum
    // This preserves larger user-resized dimensions while enforcing minimums
    const needsHeightUpdate = currentStoredHeight < newMinHeight;
    const needsWidthUpdate = !currentStoredWidth || currentStoredWidth < newWidth;
    
    if (needsHeightUpdate || needsWidthUpdate) {
      const updatedDimensions = {
        width: needsWidthUpdate ? newWidth : currentStoredWidth,
        height: needsHeightUpdate ? newMinHeight : currentStoredHeight
      };
      
      
      setResizedDimensions(updatedDimensions);
      
      // Also update ReactFlow node ONLY if dimensions actually need to change
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
  }, [nodeSize]); // Remove setNodes and id from dependencies to prevent infinite loop

  // Auto-scroll measurements if enabled - FIXED: Persistent scroll state across data updates
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollPositionRef = useRef<number>(0);
  const isScrollActiveRef = useRef<boolean>(false);
  
  // Global scroll state management
  const globalScrollKey = `autoScroll_${id}`;
  const isGlobalScrollActive = () => (window as any)[globalScrollKey] === true;
  const setGlobalScrollActive = (active: boolean) => {
    (window as any)[globalScrollKey] = active;
  };
  
  // Initialize or update scroll based on conditions (not on data changes)
  useEffect(() => {
    const timer = setTimeout(() => {
      const isMonitorPage = window.location.pathname.includes('monitor') || 
                           window.location.pathname.includes('public');
      // Use autoScroll from props instead of global value
      const shouldScroll = isMonitorPage && data.autoScroll;
      
      // Debug logging for auto-scroll conditions
      // Auto-scroll debug console log removed
      
      // Only log if there's an issue or first time scroll starts
      if (shouldScroll && data.measurements && !isScrollActiveRef.current) {
        log.debug('Auto-scroll starting for equipment node', { 
          nodeId: id, 
          measurementCount: data.measurements.length 
        });
      }
      
      // Don't auto-scroll during resizing to prevent ResizeObserver conflicts
      if (shouldScroll && data.measurements && scrollRef.current && !isResizing) {
        // Use fixed node height from nodeSize setting
        const nodeHeight = actualNodeHeight;
        
        // Calculate how many measurements can be shown based on height
        // Header takes ~100px, each measurement takes ~50px
        const visibleMeasurements = Math.floor((nodeHeight - 100) / 50);
        
        // Only scroll if we have more measurements than can fit
        const needsScroll = data.measurements.length > visibleMeasurements;
        
        console.log('[Auto-scroll Calculation]', {
          nodeId: id,
          nodeHeight: actualNodeHeight,
          visibleMeasurements,
          actualMeasurements: data.measurements.length,
          needsScroll,
          isScrollActiveRef: isScrollActiveRef.current,
          isGlobalScrollActive: isGlobalScrollActive()
        });
        
        if (needsScroll && !isScrollActiveRef.current && !isGlobalScrollActive()) {
          log.info('Auto-scroll started for equipment node', { nodeId: id });
          setIsScrolling(true);
          isScrollActiveRef.current = true;
          setGlobalScrollActive(true);
          const scrollContainer = scrollRef.current;
          
          // Preserve existing scroll position if available
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
              
            } else {
              // Check if only global state is missing - try to recover
              if (scrollContainer && isScrollActiveRef.current && !isGlobalScrollActive()) {
                log.debug('Recovering global scroll state for equipment node', { nodeId: id });
                setGlobalScrollActive(true);
                return; // Don't log stop message, try to continue
              }
              
              log.warn('Auto-scroll stopped unexpectedly for equipment node', { 
                nodeId: id,
                hasContainer: !!scrollContainer,
                isActive: isScrollActiveRef.current,
                globalActive: isGlobalScrollActive()
              });
            }
          };
          
          // Clear any existing interval to prevent duplicates
          if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
          }
          
          scrollIntervalRef.current = setInterval(scroll, 50); // Smooth scrolling
        } else if (!needsScroll && isScrollActiveRef.current) {
          // Stop scrolling if no longer needed
          log.debug('Stopping auto-scroll for equipment node - no longer needed', { nodeId: id });
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
        // Stop scrolling if conditions no longer met
        log.debug('Stopping auto-scroll for equipment node - conditions not met', { nodeId: id });
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current);
          scrollIntervalRef.current = null;
        }
        setIsScrolling(false);
        isScrollActiveRef.current = false;
        setGlobalScrollActive(false);
        scrollPositionRef.current = 0;
      }
    }, 250); // Debounce to prevent rapid state changes

    return () => clearTimeout(timer);
  }, [actualNodeHeight, isResizing, id, data.autoScroll, data.measurements]); // Detect size and resize changes for scroll recalculation
  
  // Cleanup scroll interval on unmount
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      isScrollActiveRef.current = false;
      setGlobalScrollActive(false);
      
      // Clean up global scroll state
      delete (window as any)[globalScrollKey];
    };
  }, [globalScrollKey]);

  return (
    <>
      <NodeResizer
        color="#3b82f6"
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
          log.debug('Equipment node resized', {
            nodeId: id,
            newSize: { width: params.width, height: params.height }
          });
          
          // Update local state immediately for instant visual feedback
          setResizedDimensions({
            width: params.width,
            height: params.height
          });
          
          // Update the node with new size using setNodes
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
              log.error('Failed to update equipment node size', { nodeId: id, error });
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
          border: 'none',
          zIndex: 20
        }}
      />
      
      <div
        className={`
          rounded-lg border-2 bg-white shadow-sm overflow-hidden
          ${selected ? 'border-blue-500 shadow-lg' : data.equipmentType ? 'border-gray-300' : 'border-gray-300 border-dashed'}
          min-w-[200px] ${currentNode?.style?.width ? '' : 'w-full'} flex flex-col
        `}
        style={{ 
          height: `${actualNodeHeight}px`,
          width: `${actualNodeWidth}px`
        }}
      >
      
      {/* Tier 1: Equipment Name (Center aligned) */}
      <div className={`px-3 py-2 border-b ${(window.location.pathname.includes('monitor') || window.location.pathname.includes('public')) ? status.headerBg : data.equipmentType ? 'bg-gray-50' : 'bg-gray-100'} relative`}>
        <div className="flex items-center justify-center space-x-1">
          <div className={(window.location.pathname.includes('monitor') || window.location.pathname.includes('public')) ? status.headerText : "text-gray-600"}>{icon}</div>
          <div className={`font-semibold text-sm text-center ${(window.location.pathname.includes('monitor') || window.location.pathname.includes('public')) ? status.headerText : ''}`}>
            {data.equipmentType ? data.label : '공통설비 (미지정)'}
          </div>
          {hasSpecOut && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" />
            </div>
          )}
        </div>
      </div>
      
      {/* Tier 2: Status and Code (Split layout) */}
      <div className={`flex border-b divide-x ${window.location.pathname.includes('monitor') ? 'bg-gray-100' : 'bg-white'}`}>
        <div className="flex-1 px-2 py-1.5 flex items-center justify-center">
          <div className={`flex items-center space-x-1 ${window.location.pathname.includes('monitor') ? status.color : status.color}`}>
            {status.icon}
            <span className="text-xs font-medium">{data.status}</span>
          </div>
        </div>
        {data.equipmentCode && (
          <div className="flex-1 px-2 py-1.5 flex items-center justify-center">
            <span className="text-xs text-gray-600">{data.equipmentCode}</span>
          </div>
        )}
      </div>
      
      {/* Tier 2.5: Selected Measurement Preview (Editor only) */}
      {!window.location.pathname.includes('monitor') && !window.location.pathname.includes('public') && data.displayMeasurements && data.displayMeasurements.length > 0 && (
        <div className="border-b bg-blue-50">
          <div className="px-2 py-1">
            <div className="text-[10px] text-blue-600 font-medium mb-1">Selected Measurements Preview:</div>
            <div className="space-y-0.5">
              {data.displayMeasurements.map((measurementCode: string, index: number) => (
                <div 
                  key={index}
                  className="text-xs rounded px-2 py-1 bg-blue-100 border border-blue-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-blue-600 text-[10px]">{measurementCode}: [Measurement Name]</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Tier 3: Measurements Section (with minimal spacing) */}
      {data.measurements && data.measurements.length > 0 && (
        <div className="px-2 py-1.5 flex-1 overflow-hidden">
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
        </div>
      )}
      
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
          border: 'none',
          zIndex: 20
        }}
      />
    </>
  );
});

EquipmentNode.displayName = 'EquipmentNode';