import React, { memo, useState, useEffect } from 'react';
import { NodeResizer, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';

interface GroupNodeData {
  label: string;
  color?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;  // 0-100
  titleSize?: number;          // 12-24px
  titleColor?: string;
  titlePosition?: 'top' | 'center';
  zIndex?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
}

export const GroupNode = memo(({ data, selected, style, id }: NodeProps<GroupNodeData>) => {
  const {
    label = 'Group',
    color = '#3b82f6',
    backgroundColor,
    backgroundOpacity = 10,
    titleSize = 14,
    titleColor = '#374151',
    titlePosition = 'top',
    zIndex = 0,
    borderStyle = 'dashed',
  } = data;

  const { getNode, setNodes } = useReactFlow();

  // Get current node data directly from ReactFlow
  const currentNode = getNode(id);

  // Helper function to parse style values
  const parseStyleValue = (value: any): number | undefined => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace('px', ''));
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  // Initialize resized dimensions with stored values
  const getInitialDimensions = () => {
    const storedHeight = currentNode?.style?.height;
    const storedWidth = currentNode?.style?.width;
    
    return {
      width: typeof storedWidth === 'number' ? storedWidth : undefined,
      height: typeof storedHeight === 'number' ? storedHeight : undefined
    };
  };

  const [resizedDimensions, setResizedDimensions] = useState<{width?: number, height?: number}>(getInitialDimensions);

  // Default dimensions
  const minWidth = 200;
  const minHeight = 150;

  // Calculate actual dimensions
  const propsStyleHeight = parseStyleValue(style?.height);
  const propsStyleWidth = parseStyleValue(style?.width);
  const resizedHeight = resizedDimensions.height;
  const resizedWidth = resizedDimensions.width;

  const calculatedHeight = resizedHeight || propsStyleHeight || minHeight;
  const calculatedWidth = resizedWidth || propsStyleWidth || minWidth;

  const actualNodeHeight = Math.max(calculatedHeight, minHeight);
  const actualNodeWidth = Math.max(calculatedWidth, minWidth);

  // Sync resized dimensions when ReactFlow style changes
  useEffect(() => {
    const reactFlowHeight = parseStyleValue(currentNode?.style?.height);
    const reactFlowWidth = parseStyleValue(currentNode?.style?.width);
    
    if (reactFlowHeight !== undefined || reactFlowWidth !== undefined) {
      setResizedDimensions(prev => ({
        width: reactFlowWidth !== undefined ? reactFlowWidth : prev.width,
        height: reactFlowHeight !== undefined ? reactFlowHeight : prev.height,
      }));
    }
  }, [currentNode?.style?.height, currentNode?.style?.width, style?.height, style?.width, id]);

  // Convert opacity from 0-100 to 0-1
  const opacity = backgroundOpacity / 100;
  
  // Calculate background color with opacity
  const bgColor = backgroundColor || color;
  const getBgColorWithOpacity = () => {
    if (bgColor.startsWith('#')) {
      // Convert hex to rgba
      const r = parseInt(bgColor.slice(1, 3), 16);
      const g = parseInt(bgColor.slice(3, 5), 16);
      const b = parseInt(bgColor.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return bgColor;
  };

  return (
    <>
      <NodeResizer
        color={color}
        isVisible={selected && !window.location.pathname.includes('monitor') && !window.location.pathname.includes('public')}
        minWidth={minWidth}
        minHeight={minHeight}
        onResize={(event, params) => {
          // Update local state immediately for instant visual feedback
          setResizedDimensions({
            width: params.width,
            height: params.height
          });
          
          // Update the node with new size using setNodes
          if (setNodes && id) {
            setNodes((nodes) =>
              nodes.map((node) =>
                node.id === id
                  ? {
                      ...node,
                      style: {
                        ...node.style,
                        width: params.width,
                        height: params.height,
                      },
                    }
                  : node
              )
            );
          }
        }}
      />
      <div
        style={{
          width: `${actualNodeWidth}px`,
          height: `${actualNodeHeight}px`,
          backgroundColor: getBgColorWithOpacity(),
          border: `2px solid ${color}`,
          borderRadius: '8px',
          position: 'relative',
          zIndex: zIndex,
          boxSizing: 'border-box',
        }}
      >
        {/* Z-index indicator */}
        {selected && zIndex !== 0 && (
          <div className="absolute top-1 right-1 text-xs bg-gray-800 text-white px-1.5 py-0.5 rounded z-10">
            z: {zIndex}
          </div>
        )}
        
        {/* Title */}
        <div 
          className={`${titlePosition === 'center' ? 'h-full flex items-center justify-center' : 'p-3'}`}
        >
          <div 
            className="font-medium"
            style={{
              fontSize: `${titleSize}px`,
              color: titleColor,
            }}
          >
            {label}
          </div>
        </div>
      </div>
    </>
  );
});

GroupNode.displayName = 'GroupNode';