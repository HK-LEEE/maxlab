import React from 'react';
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
  zIndex?: number;
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
    zIndex = 0,
  } = data;

  const getBorderStyle = () => {
    if (borderStyle === 'none') return 'none';
    return `${borderWidth}px ${borderStyle} ${borderColor}`;
  };

  return (
    <div style={{ zIndex: zIndex, position: 'relative' }}>
      {/* Z-index indicator */}
      {selected && zIndex !== 0 && (
        <div className="absolute top-1 right-1 text-xs bg-gray-800 text-white px-1.5 py-0.5 rounded z-10">
          z: {zIndex}
        </div>
      )}
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
      </div>
    </div>
  );
};