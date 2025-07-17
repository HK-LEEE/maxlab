import React from 'react';
import { getBezierPath, getStraightPath, getSmoothStepPath } from 'reactflow';
import type { EdgeProps } from 'reactflow';

// 파티클 설정 타입
interface ParticleConfig {
  color: string;
  speed: number; // 애니메이션 지속 시간 (초)
  shape: 'circle' | 'triangle' | 'x' | 'diamond';
  size: number;
  count: number; // 파티클 개수
  opacity: number;
}

// 파티클 형태별 SVG 요소 생성
const ParticleShape: React.FC<{ 
  config: ParticleConfig; 
  pathId: string; 
  index: number; 
  isReverse?: boolean; // STOP 상태에서 역류 효과
}> = ({ config, pathId, index, isReverse = false }) => {
  const animationDelay = (index * config.speed) / config.count;
  
  const shapeElement = () => {
    const baseProps = {
      fill: config.color,
      opacity: config.opacity,
    };
    
    switch (config.shape) {
      case 'circle':
        return <circle r={config.size} {...baseProps} />;
      case 'triangle':
        return (
          <polygon 
            points={`0,-${config.size} -${config.size * 0.866},${config.size * 0.5} ${config.size * 0.866},${config.size * 0.5}`}
            {...baseProps}
          />
        );
      case 'x':
        return (
          <g {...baseProps}>
            <line x1={-config.size} y1={-config.size} x2={config.size} y2={config.size} stroke={config.color} strokeWidth="2" />
            <line x1={-config.size} y1={config.size} x2={config.size} y2={-config.size} stroke={config.color} strokeWidth="2" />
          </g>
        );
      case 'diamond':
        return (
          <polygon 
            points={`0,-${config.size} ${config.size},0 0,${config.size} -${config.size},0`}
            {...baseProps}
          />
        );
      default:
        return <circle r={config.size} {...baseProps} />;
    }
  };

  return (
    <g>
      {shapeElement()}
      <animateMotion
        dur={`${config.speed}s`}
        repeatCount="indefinite"
        begin={`${animationDelay}s`}
        keyTimes={isReverse ? "0;1" : "0;1"}
        keyPoints={isReverse ? "1;0" : "0;1"} // 역류 효과
      >
        <mpath href={`#${pathId}`} />
      </animateMotion>
      <animate
        attributeName="opacity"
        values={isReverse ? `${config.opacity};0.1;${config.opacity}` : `${config.opacity * 0.3};${config.opacity};${config.opacity * 0.3}`}
        dur={isReverse ? "2s" : "1s"}
        repeatCount="indefinite"
        begin={`${animationDelay}s`}
      />
      {/* STOP 상태일 때 추가 깜빡임 효과 */}
      {isReverse && (
        <animate
          attributeName="fill-opacity"
          values="0.5;1;0.5"
          dur="1.5s"
          repeatCount="indefinite"
          begin={`${animationDelay}s`}
        />
      )}
    </g>
  );
};

// 상태별 파티클 설정
const getParticleConfig = (style: any, animated: boolean): ParticleConfig | null => {
  const stroke = style?.stroke;
  
  if (!animated) return null; // 애니메이션이 없는 경우 파티클 없음
  
  switch (stroke) {
    case '#10b981': // ACTIVE (녹색)
      return {
        color: '#3b82f6', // 파란색 파티클
        speed: 2,
        shape: 'circle',
        size: 3,
        count: 2, // 4에서 2로 줄임 (1/2)
        opacity: 0.8,
      };
    case '#eab308': // PAUSE (노란색)
      return {
        color: '#f59e0b', // 주황색 파티클
        speed: 4,
        shape: 'triangle',
        size: 2.5,
        count: 3,
        opacity: 0.7,
      };
    case '#ef4444': // STOP (빨간색) - 역류 또는 정지 효과
      return {
        color: '#dc2626', // 진한 빨간색 파티클
        speed: 6,
        shape: 'x',
        size: 2.5,
        count: 2,
        opacity: 0.5,
      };
    default:
      return null;
  }
};

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
  const animated = data?.animated;
  const particleConfig = getParticleConfig(style, animated);
  const pathId = `edge-path-${id}`;

  return (
    <>
      {/* 기존 Edge 경로 (배경 레이어) - 완전 유지 */}
      <path
        id={pathId}
        style={style}
        className={`react-flow__edge-path ${animated ? 'animated' : ''}`}
        d={edgePath}
        markerEnd={markerEnd}
      />
      
      {/* 파티클 시스템 (오버레이 레이어) - 신규 추가 */}
      {particleConfig && (
        <g className="particle-flow-system" style={{ pointerEvents: 'none' }}>
          {Array.from({ length: particleConfig.count }, (_, index) => (
            <ParticleShape
              key={`particle-${index}`}
              config={particleConfig}
              pathId={pathId}
              index={index}
              isReverse={style?.stroke === '#ef4444'} // STOP 상태에서 역류 효과
            />
          ))}
        </g>
      )}
      
      {/* 기존 라벨 시스템 - 완전 유지 */}
      {label && (
        <foreignObject
          width={140}
          height={36}
          x={labelX - 70}
          y={labelY - 18}
          className={`edgebutton-foreignobject ${(style?.stroke === '#ef4444' || style?.stroke === '#eab308') ? 'warning' : ''}`}
          requiredExtensions="http://www.w3.org/1999/xhtml"
          style={{ zIndex: 10 }} // 파티클 위에 표시
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
                background: style.stroke === '#ef4444' 
                  ? 'rgba(254, 242, 242, 0.9)' // 반투명 빨간 배경 
                  : style.stroke === '#eab308' 
                  ? 'rgba(254, 252, 232, 0.9)' // 반투명 노란 배경
                  : '#f0fdf4', // 기존 녹색 배경 유지
                color: style.stroke === '#ef4444' ? '#7f1d1d' : style.stroke === '#eab308' ? '#92400e' : '#16a34a', // 더 진한 색상
                border: `2px solid ${style.stroke}`,
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800, // 더 두꺼운 폰트
                padding: '6px 12px',
                whiteSpace: 'nowrap',
                boxShadow: style.stroke === '#ef4444' || style.stroke === '#eab308' ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
                textShadow: style.stroke === '#ef4444' || style.stroke === '#eab308' 
                  ? '0 0 4px rgba(255, 255, 255, 0.8), 0 1px 2px rgba(0, 0, 0, 0.3)' // 텍스트 외곽선 효과
                  : 'none',
                backdropFilter: style.stroke === '#ef4444' || style.stroke === '#eab308' 
                  ? 'blur(2px)' // 배경 블러 효과
                  : 'none',
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