import React from 'react';
import { getBezierPath, getStraightPath, getSmoothStepPath } from 'reactflow';
import type { EdgeProps } from 'reactflow';

// Enhanced Particle Configuration
interface EnhancedParticleConfig {
  color: string;
  speed: number;
  shape: 'circle' | 'triangle' | 'x' | 'diamond' | 'arrow';
  size: number;
  count: number;
  opacity: number;
  glowEffect?: boolean;
  trailLength?: number;
  pulseEffect?: boolean;
}

// Flow Direction Indicator Component
const FlowDirectionIndicator: React.FC<{
  pathId: string;
  color: string;
  isReverse?: boolean;
  intensity: 'low' | 'medium' | 'high';
}> = ({ pathId, color, isReverse = false, intensity }) => {
  const arrowSize = intensity === 'high' ? 8 : intensity === 'medium' ? 6 : 4;
  const arrowCount = intensity === 'high' ? 5 : intensity === 'medium' ? 3 : 2;
  const animationSpeed = intensity === 'high' ? 1.5 : intensity === 'medium' ? 2.5 : 4;

  return (
    <g className="flow-direction-indicators">
      {Array.from({ length: arrowCount }, (_, index) => {
        const delay = (index * animationSpeed) / arrowCount;
        return (
          <g key={`arrow-${index}`}>
            <polygon
              points={`0,-${arrowSize} ${arrowSize * 1.5},0 0,${arrowSize} -${arrowSize * 0.5},0`}
              fill={color}
              opacity="0.6"
              filter="drop-shadow(0 0 3px rgba(59, 130, 246, 0.4))"
            />
            <animateMotion
              dur={`${animationSpeed}s`}
              repeatCount="indefinite"
              begin={`${delay}s`}
              keyPoints={isReverse ? "1;0" : "0;1"}
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
            <animate
              attributeName="opacity"
              values="0;0.8;0"
              dur={`${animationSpeed}s`}
              repeatCount="indefinite"
              begin={`${delay}s`}
            />
          </g>
        );
      })}
    </g>
  );
};

// Enhanced Particle with Trails
const EnhancedParticle: React.FC<{
  config: EnhancedParticleConfig;
  pathId: string;
  index: number;
  isReverse?: boolean;
}> = ({ config, pathId, index, isReverse = false }) => {
  const animationDelay = (index * config.speed) / config.count;
  
  const renderParticleShape = () => {
    const glowFilter = config.glowEffect 
      ? `drop-shadow(0 0 ${config.size}px ${config.color})`
      : undefined;

    const baseProps = {
      fill: config.color,
      opacity: config.opacity,
      filter: glowFilter,
    };
    
    switch (config.shape) {
      case 'circle':
        return (
          <g>
            <circle r={config.size} {...baseProps} />
            {config.trailLength && (
              <circle 
                r={config.size * 0.7} 
                fill={config.color} 
                opacity={config.opacity * 0.5}
                transform="translate(-5,0)"
              />
            )}
          </g>
        );
      
      case 'arrow':
        return (
          <g {...baseProps}>
            <polygon 
              points={`0,-${config.size} ${config.size * 1.5},0 0,${config.size} -${config.size * 0.5},0`}
              fill={config.color}
            />
          </g>
        );
      
      case 'diamond':
        return (
          <g {...baseProps}>
            <polygon 
              points={`0,-${config.size} ${config.size},0 0,${config.size} -${config.size},0`}
              fill={config.color}
            />
            {config.pulseEffect && (
              <polygon 
                points={`0,-${config.size * 1.5} ${config.size * 1.5},0 0,${config.size * 1.5} -${config.size * 1.5},0`}
                fill={config.color}
                opacity="0.3"
              >
                <animate
                  attributeName="opacity"
                  values="0;0.3;0"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values="0.5;1.2;0.5"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </polygon>
            )}
          </g>
        );
      
      default:
        return (
          <g>
            <circle r={config.size} {...baseProps} />
          </g>
        );
    }
  };

  return (
    <g>
      {renderParticleShape()}
      <animateMotion
        dur={`${config.speed}s`}
        repeatCount="indefinite"
        begin={`${animationDelay}s`}
        keyPoints={isReverse ? "1;0" : "0;1"}
      >
        <mpath href={`#${pathId}`} />
      </animateMotion>
      <animate
        attributeName="opacity"
        values={`${config.opacity * 0.2};${config.opacity};${config.opacity * 0.2}`}
        dur={`${config.speed * 0.3}s`}
        repeatCount="indefinite"
        begin={`${animationDelay}s`}
      />
    </g>
  );
};

// Enhanced status-based particle configuration
const getEnhancedParticleConfig = (
  style: any, 
  animated: boolean,
  sourceStatus?: string,
  targetStatus?: string
): EnhancedParticleConfig | null => {
  const stroke = style?.stroke;
  
  if (!animated) return null;
  
  // Base configurations enhanced with new effects
  switch (stroke) {
    case '#10b981': // ACTIVE (green) - High flow
      return {
        color: '#3b82f6',
        speed: 1.5,
        shape: 'arrow',
        size: 4,
        count: 4,
        opacity: 0.9,
        glowEffect: true,
        trailLength: 3,
        pulseEffect: false,
      };
      
    case '#eab308': // PAUSE (yellow) - Reduced flow
      return {
        color: '#f59e0b',
        speed: 3.5,
        shape: 'diamond',
        size: 3,
        count: 2,
        opacity: 0.7,
        glowEffect: false,
        pulseEffect: true,
      };
      
    case '#ef4444': // STOP (red) - Critical/Error state
      return {
        color: '#dc2626',
        speed: 5,
        shape: 'x',
        size: 3,
        count: 1,
        opacity: 0.8,
        glowEffect: true,
        pulseEffect: true,
      };
      
    default:
      return null;
  }
};

// Flow intensity calculation based on source/target status
const getFlowIntensity = (
  sourceStatus?: string, 
  targetStatus?: string
): 'low' | 'medium' | 'high' => {
  if (sourceStatus === 'ACTIVE' && targetStatus === 'ACTIVE') return 'high';
  if (sourceStatus === 'ACTIVE' || targetStatus === 'ACTIVE') return 'medium';
  return 'low';
};

// Edge glow effect component
const EdgeGlowEffect: React.FC<{
  edgePath: string;
  style: any;
  intensity: 'low' | 'medium' | 'high';
}> = ({ edgePath, style, intensity }) => {
  const glowWidth = intensity === 'high' ? 8 : intensity === 'medium' ? 5 : 3;
  const glowOpacity = intensity === 'high' ? 0.4 : intensity === 'medium' ? 0.3 : 0.2;
  
  return (
    <path
      d={edgePath}
      stroke={style.stroke}
      strokeWidth={glowWidth}
      fill="none"
      opacity={glowOpacity}
      filter="blur(3px)"
      className="edge-glow-effect"
    />
  );
};

export const EnhancedCustomEdge: React.FC<EdgeProps & {
  sourceStatus?: string;
  targetStatus?: string;
}> = ({
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
  sourceStatus,
  targetStatus,
}) => {
  const type = data?.type || 'step';
  
  // Get path based on edge type
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
      const centerX = (sourceX + targetX) / 2;
      const centerY = (sourceY + targetY) / 2;
      edgePath = `M ${sourceX},${sourceY} L ${centerX},${sourceY} L ${centerX},${targetY} L ${targetX},${targetY}`;
      labelX = centerX;
      labelY = centerY;
      break;
  }

  const label = data?.label;
  const animated = data?.animated;
  const particleConfig = getEnhancedParticleConfig(style, animated, sourceStatus, targetStatus);
  const pathId = `enhanced-edge-path-${id}`;
  const flowIntensity = getFlowIntensity(sourceStatus, targetStatus);
  const isReverse = style?.stroke === '#ef4444';

  return (
    <>
      {/* Glow effect layer (bottom) */}
      {animated && (
        <EdgeGlowEffect 
          edgePath={edgePath}
          style={style}
          intensity={flowIntensity}
        />
      )}
      
      {/* Main edge path */}
      <path
        id={pathId}
        style={style}
        className={`react-flow__edge-path ${animated ? 'enhanced-animated' : ''}`}
        d={edgePath}
        markerEnd={markerEnd}
      />
      
      {/* Flow direction indicators */}
      {animated && style.stroke !== '#ef4444' && (
        <FlowDirectionIndicator
          pathId={pathId}
          color={style.stroke || '#3b82f6'}
          intensity={flowIntensity}
          isReverse={isReverse}
        />
      )}
      
      {/* Enhanced particle system */}
      {particleConfig && (
        <g className="enhanced-particle-system" style={{ pointerEvents: 'none' }}>
          {Array.from({ length: particleConfig.count }, (_, index) => (
            <EnhancedParticle
              key={`enhanced-particle-${index}`}
              config={particleConfig}
              pathId={pathId}
              index={index}
              isReverse={isReverse}
            />
          ))}
        </g>
      )}
      
      {/* Enhanced label with status-aware styling */}
      {label && (
        <foreignObject
          width={160}
          height={40}
          x={labelX - 80}
          y={labelY - 20}
          className={`enhanced-edge-label ${
            (style?.stroke === '#ef4444' || style?.stroke === '#eab308') ? 'warning' : 'normal'
          }`}
          requiredExtensions="http://www.w3.org/1999/xhtml"
          style={{ zIndex: 15 }}
        >
          <div className="enhanced-label-container">
            <div
              className={`enhanced-label-content ${
                style.stroke === '#ef4444' 
                  ? 'critical-state' 
                  : style.stroke === '#eab308' 
                  ? 'warning-state'
                  : 'normal-state'
              }`}
              style={{
                background: style.stroke === '#ef4444' 
                  ? 'linear-gradient(135deg, rgba(254, 242, 242, 0.95), rgba(252, 235, 235, 0.95))'
                  : style.stroke === '#eab308' 
                  ? 'linear-gradient(135deg, rgba(254, 252, 232, 0.95), rgba(252, 248, 227, 0.95))'
                  : 'linear-gradient(135deg, rgba(240, 253, 244, 0.95), rgba(235, 251, 238, 0.95))',
                color: style.stroke === '#ef4444' 
                  ? '#7f1d1d' 
                  : style.stroke === '#eab308' 
                  ? '#92400e' 
                  : '#16a34a',
                border: `2px solid ${style.stroke}`,
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '700',
                padding: '8px 14px',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.2)',
                backdropFilter: 'blur(8px)',
                textShadow: '0 1px 2px rgba(255,255,255,0.5)',
                position: 'relative' as const,
              }}
            >
              {/* Status indicator dot */}
              <div
                className="status-indicator"
                style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: style.stroke,
                  boxShadow: `0 0 6px ${style.stroke}`,
                  animation: style.stroke === '#ef4444' 
                    ? 'pulse 1s infinite'
                    : style.stroke === '#eab308'
                    ? 'pulse 2s infinite'
                    : 'none',
                }}
              />
              {label}
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
};