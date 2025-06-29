import React, { memo } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import type { NodeProps } from 'reactflow';

interface GroupNodeData {
  label: string;
  color?: string;
}

export const GroupNode = memo(({ data, selected }: NodeProps<GroupNodeData>) => {
  return (
    <>
      <NodeResizer
        color="#3b82f6"
        isVisible={selected}
        minWidth={100}
        minHeight={100}
      />
      <div
        className={`
          w-full h-full rounded-lg border-2 border-dashed
          ${selected ? 'border-blue-500' : 'border-gray-400'}
        `}
        style={{
          backgroundColor: data.color ? `${data.color}20` : 'rgba(0, 0, 0, 0.05)',
          minWidth: 200,
          minHeight: 150
        }}
      >
        <div className="p-2">
          <div className="text-sm font-medium text-gray-600">{data.label}</div>
        </div>
      </div>
    </>
  );
});

GroupNode.displayName = 'GroupNode';