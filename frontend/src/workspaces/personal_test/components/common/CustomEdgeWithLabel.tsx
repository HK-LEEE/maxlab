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
    case 'default':
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
          width={140}
          height={36}
          x={labelX - 70}
          y={labelY - 18}
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
                background: style.stroke === '#ef4444' ? '#fef2f2' : style.stroke === '#eab308' ? '#fefce8' : '#f0fdf4',
                color: style.stroke === '#ef4444' ? '#dc2626' : style.stroke === '#eab308' ? '#ca8a04' : '#16a34a',
                border: `2px solid ${style.stroke}`,
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                padding: '6px 12px',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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