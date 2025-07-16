import React, { memo } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
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

export const GroupNode = memo(({ data, selected }: NodeProps<GroupNodeData>) => {
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
      {/* Enhanced Ports for Group Node */}
      <Handle
        type="target"
        position={Position.Top}
        className="target"
        style={{
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 8,
          height: 8,
          border: 'none',
          zIndex: 30
        }}
      />
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="source"
        style={{
          bottom: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 8,
          height: 8,
          border: 'none',
          zIndex: 30
        }}
      />
      
      <NodeResizer
        color="#3b82f6"
        isVisible={selected && !window.location.pathname.includes('monitor') && !window.location.pathname.includes('public')}
        minWidth={100}
        minHeight={100}
      />
      <div
        className="w-full h-full rounded-lg border-2 relative"
        style={{
          backgroundColor: getBgColorWithOpacity(),
          borderColor: selected ? '#3b82f6' : color,
          borderStyle: borderStyle,
          minWidth: 200,
          minHeight: 150,
          zIndex: zIndex,
        }}
      >
        {/* Z-index indicator */}
        {selected && zIndex !== 0 && (
          <div className="absolute top-1 right-1 text-xs bg-gray-800 text-white px-1.5 py-0.5 rounded">
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