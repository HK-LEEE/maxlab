import React from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Type } from 'lucide-react';

interface TextNodeData {
  text: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  color?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  padding?: number;
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  borderWidth?: number;
  borderColor?: string;
}

export const TextNode: React.FC<NodeProps<TextNodeData>> = ({ data, selected }) => {
  const {
    text = 'Text',
    fontSize = 14,
    fontWeight = 'normal',
    color = '#000000',
    backgroundColor = 'transparent',
    textAlign = 'center',
    padding = 8,
    borderStyle = 'none',
    borderWidth = 1,
    borderColor = '#999999',
  } = data;

  const getBorderStyle = () => {
    if (borderStyle === 'none') return 'none';
    return `${borderWidth}px ${borderStyle} ${borderColor}`;
  };

  return (
    <div
      className={`text-node ${selected ? 'ring-2 ring-black' : ''}`}
      style={{
        backgroundColor,
        padding: `${padding}px`,
        minWidth: '50px',
        borderRadius: '4px',
        border: getBorderStyle(),
      }}
    >
      <div
        style={{
          fontSize: `${fontSize}px`,
          fontWeight,
          color,
          textAlign,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
      
      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />
    </div>
  );
};