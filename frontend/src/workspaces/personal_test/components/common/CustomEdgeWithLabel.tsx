import React from 'react';
import { getBezierPath, getStraightPath, getSmoothStepPath } from 'reactflow';
import type { EdgeProps } from 'reactflow';

// Custom step path function
function getStepPath(params: any): [string, number, number] {
  const { sourceX, sourceY, targetX, targetY } = params;
  const centerX = (sourceX + targetX) / 2;
  const centerY = (sourceY + targetY) / 2;
  
  const path = `M ${sourceX},${sourceY} L ${centerX},${sourceY} L ${centerX},${targetY} L ${targetX},${targetY}`;
  
  return [path, centerX, centerY];
}

export const CustomEdgeWithLabel: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}) => {
  const type = data?.type || 'step';
  
  // Get the appropriate path based on edge type
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  switch (type) {
    case 'straight':
      [edgePath, labelX, labelY] = getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
      });
      break;
    case 'smoothstep':
      [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      });
      break;
    case 'bezier':
      [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      });
      break;
    case 'step':
    default:
      [edgePath, labelX, labelY] = getStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      });
      break;
  }

  const label = data?.label;

  return (
    <>
      <path
        id={id}
        style={style}
        className={`react-flow__edge-path ${data?.animated ? 'animated' : ''}`}
        d={edgePath}
        markerEnd={markerEnd}
      />
      {label && (
        <foreignObject
          width={120}
          height={30}
          x={labelX - 60}
          y={labelY - 25}
          className="edgebutton-foreignobject"
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <div
              style={{
                background: style.stroke === '#ef4444' ? '#fee2e2' : '#fef3c7',
                color: style.stroke === '#ef4444' ? '#991b1b' : '#92400e',
                border: `1px solid ${style.stroke}`,
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
};