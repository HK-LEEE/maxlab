import React, { memo, useEffect, useRef, useState } from 'react';
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
  const { data, selected, style, id, ...nodeProps } = props;
  
  // Comprehensive props logging
  console.log('📦 EquipmentNode props received:', {
    id,
    selected,
    style,
    data,
    allProps: props,
    nodeProps
  });
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
    
    console.log('🚀 Initializing resizedDimensions:', {
      nodeId: id,
      storedHeight,
      storedWidth,
      typeHeight: typeof storedHeight,
      typeWidth: typeof storedWidth
    });
    
    return {
      width: typeof storedWidth === 'number' ? storedWidth : undefined,
      height: typeof storedHeight === 'number' ? storedHeight : undefined
    };
  };
  
  const [resizedDimensions, setResizedDimensions] = useState<{width?: number, height?: number}>(getInitialDimensions);
  console.log('🔍 Current node from ReactFlow:', {
    nodeId: id,
    currentNode,
    nodeStyle: currentNode?.style,
    nodeData: currentNode?.data
  });
  
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
      console.log(`${logPrefix} value is null/undefined`);
      return undefined;
    }
    
    // Handle numbers (including those that might be stored as strings by API)
    if (typeof value === 'number') {
      if (isFinite(value) && value >= 0) {
        console.log(`${logPrefix} valid number:`, value);
        return value;
      } else {
        console.log(`${logPrefix} invalid number (NaN/Infinity/negative):`, value);
        return undefined;
      }
    }
    
    // Handle strings (including numeric strings from API serialization)
    if (typeof value === 'string') {
      // First, try direct number conversion for pure numeric strings
      const directParsed = parseFloat(value);
      if (!isNaN(directParsed) && isFinite(directParsed) && directParsed >= 0) {
        console.log(`${logPrefix} numeric string parsed directly:`, value, '→ result:', directParsed);
        return directParsed;
      }
      
      // Handle various string formats: "200px", "200", "200.5px", etc.
      const cleaned = value.toString().replace(/px|em|rem|%/g, '').trim();
      const parsed = parseFloat(cleaned);
      
      if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
        console.log(`${logPrefix} string parsing failed:`, value, '→ cleaned:', cleaned, '→ invalid result:', parsed);
        return undefined;
      }
      
      console.log(`${logPrefix} string parsed successfully:`, value, '→ cleaned:', cleaned, '→ result:', parsed);
      return parsed;
    }
    
    // Handle edge cases where API might return unexpected types
    if (typeof value === 'object' && value !== null) {
      console.log(`${logPrefix} unexpected object type:`, value);
      return undefined;
    }
    
    // Try to convert any other type to number as last resort
    const lastResortParsed = Number(value);
    if (!isNaN(lastResortParsed) && isFinite(lastResortParsed) && lastResortParsed >= 0) {
      console.log(`${logPrefix} converted via Number():`, value, '→ result:', lastResortParsed);
      return lastResortParsed;
    }
    
    console.log(`${logPrefix} unknown/invalid type:`, typeof value, value);
    return undefined;
  };

  // Calculate actual node dimensions with multiple fallback strategies
  const propsStyleHeight = parseStyleValue(style?.height, 'props');
  const propsStyleWidth = parseStyleValue(style?.width, 'props');
  const reactFlowStyleHeight = parseStyleValue(currentNode?.style?.height, 'reactFlow');
  const reactFlowStyleWidth = parseStyleValue(currentNode?.style?.width, 'reactFlow');
  
  // Direct access as fallback (bypass parseStyleValue)
  const directReactFlowHeight = currentNode?.style?.height;
  const directReactFlowWidth = currentNode?.style?.width;
  const directPropsHeight = style?.height;
  const directPropsWidth = style?.width;
  
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
  
  // Comprehensive debug logging for size calculation chain
  console.log('🔍 EquipmentNode Size Calculation Chain:', {
    nodeId: id,
    selected,
    nodeSize,
    
    // Raw stored values
    rawData: {
      reactFlowStyle: currentNode?.style,
      propsStyle: style,
      resizedDimensions
    },
    
    // Direct access values
    directAccess: {
      reactFlowHeight: directReactFlowHeight,
      reactFlowWidth: directReactFlowWidth,
      propsHeight: directPropsHeight,
      propsWidth: directPropsWidth
    },
    
    // Parsed values
    parsedValues: {
      reactFlowHeight: reactFlowStyleHeight,
      reactFlowWidth: reactFlowStyleWidth,
      propsHeight: propsStyleHeight,
      propsWidth: propsStyleWidth
    },
    
    // Fallback chain results
    fallbackChain: {
      height: {
        '1_reactFlowParsed': reactFlowStyleHeight,
        '2_reactFlowDirect': typeof directReactFlowHeight === 'number' ? directReactFlowHeight : undefined,
        '3_resizedDimensions': resizedDimensions.height,
        '4_propsParsed': propsStyleHeight,
        '5_propsDirect': typeof directPropsHeight === 'number' ? directPropsHeight : undefined,
        '6_default': defaultHeight,
        'selected': actualNodeHeight
      },
      width: {
        '1_reactFlowParsed': reactFlowStyleWidth,
        '2_reactFlowDirect': typeof directReactFlowWidth === 'number' ? directReactFlowWidth : undefined,
        '3_resizedDimensions': resizedDimensions.width,
        '4_propsParsed': propsStyleWidth,
        '5_propsDirect': typeof directPropsWidth === 'number' ? directPropsWidth : undefined,
        '6_default': 200,
        'selected': actualNodeWidth
      }
    },
    
    // Final results
    final: { height: actualNodeHeight, width: actualNodeWidth },
    
    // Priority determination
    usedSource: {
      height: actualNodeHeight === reactFlowStyleHeight ? 'reactFlowParsed' :
              actualNodeHeight === directReactFlowHeight ? 'reactFlowDirect' :
              actualNodeHeight === resizedDimensions.height ? 'resizedDimensions' :
              actualNodeHeight === propsStyleHeight ? 'propsParsed' :
              actualNodeHeight === directPropsHeight ? 'propsDirect' : 'default',
      width: actualNodeWidth === reactFlowStyleWidth ? 'reactFlowParsed' :
             actualNodeWidth === directReactFlowWidth ? 'reactFlowDirect' :
             actualNodeWidth === resizedDimensions.width ? 'resizedDimensions' :
             actualNodeWidth === propsStyleWidth ? 'propsParsed' :
             actualNodeWidth === directPropsWidth ? 'propsDirect' : 'default'
    },
    
    handlePositions: {
      topHandle: { top: -16 },
      bottomHandle: { top: `${actualNodeHeight + 16}px` }
    }
  });

  // Legacy debug logging removed - using enhanced logging above
  
  
  
  // Initialize resizedDimensions from ReactFlow node style and sync when it changes - PRESERVE larger dimensions
  useEffect(() => {
    const reactFlowHeight = parseStyleValue(currentNode?.style?.height);
    const reactFlowWidth = parseStyleValue(currentNode?.style?.width);
    const propsHeight = parseStyleValue(style?.height);
    const propsWidth = parseStyleValue(style?.width);
    
    console.log('🔄 resizedDimensions sync check:', {
      nodeId: id,
      currentResized: resizedDimensions,
      reactFlowStyle: { height: currentNode?.style?.height, width: currentNode?.style?.width },
      propsStyle: { height: style?.height, width: style?.width },
      parsedReactFlow: { height: reactFlowHeight, width: reactFlowWidth },
      parsedProps: { height: propsHeight, width: propsWidth },
      nodeSize
    });
    
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
        
        console.log('📐 Syncing dimensions (preserving larger values):', {
          from: resizedDimensions,
          to: newDimensions,
          sources: { 
            reactFlow: { height: reactFlowHeight, width: reactFlowWidth },
            props: { height: propsHeight, width: propsWidth }
          },
          minimums: { height: minHeight, width: minWidth },
          reason: !resizedDimensions.height && !resizedDimensions.width ? 'initial' : 'style_changed'
        });
        
        setResizedDimensions(newDimensions);
      }
    } else if (!resizedDimensions.height && !resizedDimensions.width) {
      // No style data but nothing in resizedDimensions - use defaults
      const defaultDimensions = {
        width: 200,
        height: getNodeHeight(nodeSize)
      };
      
      console.log('📐 Setting default resizedDimensions:', defaultDimensions);
      setResizedDimensions(defaultDimensions);
    }
  }, [currentNode?.style?.height, currentNode?.style?.width, style?.height, style?.width, nodeSize, id]); // Sync when ReactFlow or props style changes, but NOT on selection changes

  // Monitor selection state changes to ensure size doesn't change
  useEffect(() => {
    console.log('🎯 Selection state changed:', {
      nodeId: id,
      selected,
      actualNodeHeight,
      actualNodeWidth,
      message: selected ? 'Node SELECTED - size should remain stable' : 'Node DESELECTED - size should remain stable'
    });
  }, [selected, id, actualNodeHeight, actualNodeWidth]);

  // Force re-render when style changes (reduced logging)
  useEffect(() => {
    // This effect ensures the component re-renders when ReactFlow style changes
    // Logging removed to reduce console noise
  }, [style?.height, style?.width, actualNodeHeight, actualNodeWidth]);

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
      
      console.log('📏 NodeSize changed - preserving larger dimensions:', {
        nodeId: id,
        nodeSize,
        currentStored: { width: currentStoredWidth, height: currentStoredHeight },
        newMinimums: { width: newWidth, height: newMinHeight },
        needsUpdate: { width: needsWidthUpdate, height: needsHeightUpdate },
        finalDimensions: updatedDimensions
      });
      
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
    } else {
      console.log('📏 NodeSize changed - keeping existing larger dimensions:', {
        nodeId: id,
        nodeSize,
        currentStored: { width: currentStoredWidth, height: currentStoredHeight },
        newMinimums: { width: newWidth, height: newMinHeight },
        action: 'preserved'
      });
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
      const isMonitor = window.location.pathname.includes('monitor');
      const globalAutoScrollValue = (window as any).autoScrollMeasurements;
      const shouldScroll = isMonitor && globalAutoScrollValue;
      
      console.log('🔄 Auto-scroll check for node:', id, {
        isMonitor,
        globalAutoScrollValue,
        shouldScroll,
        hasMeasurements: !!data.measurements,
        measurementCount: data.measurements?.length || 0,
        hasScrollRef: !!scrollRef.current,
        isResizing,
        pathname: window.location.pathname
      });
      
      // Don't auto-scroll during resizing to prevent ResizeObserver conflicts
      if (shouldScroll && data.measurements && scrollRef.current && !isResizing) {
        // Use fixed node height from nodeSize setting
        const nodeHeight = actualNodeHeight;
        
        // Calculate how many measurements can be shown based on height
        // Header takes ~100px, each measurement takes ~50px
        const visibleMeasurements = Math.floor((nodeHeight - 100) / 50);
        
        // Only scroll if we have more measurements than can fit
        const needsScroll = data.measurements.length > visibleMeasurements;
        
        console.log('📏 Auto-scroll calculations for node:', id, {
          nodeHeight,
          measurementCount: data.measurements.length,
          visibleMeasurements,
          needsScroll,
          isScrollActiveRef: isScrollActiveRef.current,
          isGlobalScrollActive: isGlobalScrollActive(),
          scrollContainerExists: !!scrollRef.current,
          scrollContainerClientHeight: scrollRef.current?.clientHeight,
          scrollContainerScrollHeight: scrollRef.current?.scrollHeight
        });
        
        if (needsScroll && !isScrollActiveRef.current && !isGlobalScrollActive()) {
          console.log('🔄 Starting auto-scroll for node:', id);
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
                console.log('🔄 Auto-scroll reset to top for node:', id);
              }
              
              scrollContainer.scrollTop = scrollPositionRef.current;
              
              // Log every 100 scroll increments to avoid spam
              if (Math.floor(scrollPositionRef.current) % 50 === 0) {
                console.log('🔄 Auto-scroll progress for node:', id, {
                  currentPosition: scrollPositionRef.current,
                  maxScroll,
                  scrollTop: scrollContainer.scrollTop,
                  clientHeight: scrollContainer.clientHeight,
                  scrollHeight: scrollContainer.scrollHeight
                });
              }
            } else {
              console.log('🛑 Auto-scroll stopped due to conditions for node:', id, {
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
          console.log('🛑 Stopping auto-scroll for node:', id);
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
        console.log('🛑 Stopping auto-scroll (conditions not met) for node:', id);
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
  }, [actualNodeHeight, isResizing, id]); // REMOVED data.measurements to prevent restart on data updates
  
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
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        handleStyle={{ width: 8, height: 8 }}
        onResizeStart={() => {
          setIsResizing(true);
          console.log('NodeResizer resize started');
        }}
        onResizeEnd={() => {
          setIsResizing(false);
          console.log('NodeResizer resize ended');
        }}
        onResize={(event, params) => {
          console.log('🎛️ NodeResizer onResize triggered:', {
            nodeId: id,
            newSize: { width: params.width, height: params.height },
            newPosition: { x: params.x, y: params.y },
            previousResized: resizedDimensions
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
              console.log('✅ Node updated via setNodes successfully');
            } catch (error) {
              console.error('❌ Failed to update node:', error);
            }
          }
        }}
      />
      
      
      
      <Handle
        type="target"
        position={Position.Top}
        style={{
          top: -16,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#6b7280',
          width: 12,
          height: 12,
          border: 'none',
          zIndex: 20
        }}
      />
      
      <div
        className={`
          rounded-lg border-2 bg-white shadow-sm overflow-hidden
          ${selected ? 'border-blue-500 shadow-lg' : data.equipmentType ? 'border-gray-300' : 'border-gray-300 border-dashed'}
          min-w-[200px] ${style?.width ? '' : 'w-full'} flex flex-col
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
        style={{
          top: `${actualNodeHeight + 16}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#6b7280',
          width: 12,
          height: 12,
          border: 'none',
          zIndex: 20
        }}
      />
    </>
  );
});

EquipmentNode.displayName = 'EquipmentNode';