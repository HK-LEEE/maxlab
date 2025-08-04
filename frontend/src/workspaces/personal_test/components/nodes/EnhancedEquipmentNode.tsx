import React, { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';
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
  PauseCircle,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';

type Measurement = {
  code: string;
  desc: string;
  value: number;
  unit?: string;
  spec_status?: 'IN_SPEC' | 'ABOVE_SPEC' | 'BELOW_SPEC';
  upper_spec_limit?: number;
  lower_spec_limit?: number;
  target_value?: number;
  trend?: 'up' | 'down' | 'stable';
  efficiency?: number; // 0-100%
};

interface EnhancedEquipmentNodeData {
  label: string;
  equipmentType: string;
  equipmentCode?: string;
  equipmentName: string;
  status: 'ACTIVE' | 'PAUSE' | 'STOP';
  icon?: string;
  measurements?: Measurement[];
  displayMeasurements?: string[];
  hasSpecOut?: boolean;
  nodeSize?: '1' | '2' | '3';
  connectionStatus?: 'connected' | 'disconnected' | 'intermittent';
  lastUpdate?: Date;
  performanceScore?: number; // 0-100
}

// Enhanced icon mapping
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

// Enhanced status configuration with animations
const enhancedStatusConfig = {
  ACTIVE: { 
    color: 'text-green-600', 
    bgColor: 'bg-green-50', 
    headerBg: 'bg-gradient-to-r from-green-500 to-green-600',
    headerText: 'text-white',
    icon: <CheckCircle size={16} />,
    glowEffect: '0 0 20px rgba(34, 197, 94, 0.3)',
    pulseAnimation: 'pulse-green',
    borderColor: 'border-green-300'
  },
  PAUSE: { 
    color: 'text-yellow-600', 
    bgColor: 'bg-yellow-50', 
    headerBg: 'bg-gradient-to-r from-yellow-500 to-amber-500',
    headerText: 'text-white',
    icon: <PauseCircle size={16} />,
    glowEffect: '0 0 20px rgba(245, 158, 11, 0.3)',
    pulseAnimation: 'pulse-yellow',
    borderColor: 'border-yellow-300'
  },
  STOP: { 
    color: 'text-red-600', 
    bgColor: 'bg-red-50', 
    headerBg: 'bg-gradient-to-r from-red-500 to-red-600',
    headerText: 'text-white',
    icon: <AlertCircle size={16} />,
    glowEffect: '0 0 20px rgba(239, 68, 68, 0.4)',
    pulseAnimation: 'pulse-red',
    borderColor: 'border-red-300'
  },
};

// Connection status indicator component
const ConnectionStatusIndicator: React.FC<{
  status: 'connected' | 'disconnected' | 'intermittent';
  className?: string;
}> = ({ status, className = '' }) => {
  const statusConfig = {
    connected: { color: 'bg-green-400', animation: 'ping' },
    intermittent: { color: 'bg-yellow-400', animation: 'pulse' },
    disconnected: { color: 'bg-red-400', animation: 'none' }
  };

  const config = statusConfig[status];

  return (
    <div className={`relative ${className}`}>
      <div className={`w-3 h-3 ${config.color} rounded-full`}>
        {config.animation !== 'none' && (
          <div className={`absolute inset-0 w-3 h-3 ${config.color} rounded-full animate-${config.animation}`} />
        )}
      </div>
    </div>
  );
};

// Performance score visualization
const PerformanceIndicator: React.FC<{
  score: number;
  size?: 'sm' | 'md' | 'lg';
}> = ({ score, size = 'sm' }) => {
  const sizeConfig = {
    sm: { width: 'w-16', height: 'h-2', text: 'text-xs' },
    md: { width: 'w-20', height: 'h-3', text: 'text-sm' },
    lg: { width: 'w-24', height: 'h-4', text: 'text-base' }
  };

  const config = sizeConfig[size];
  const scoreColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="performance-indicator">
      <div className={`${config.width} ${config.height} bg-gray-200 rounded-full overflow-hidden`}>
        <div 
          className={`h-full ${scoreColor} transition-all duration-500 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`${config.text} text-gray-600 ml-1`}>{score}%</span>
    </div>
  );
};

// Enhanced measurement display with trends
const EnhancedMeasurementItem: React.FC<{
  measurement: Measurement;
  isScrolling?: boolean;
}> = ({ measurement, isScrolling = false }) => {
  const getSpecStatusStyle = (status?: string) => {
    switch (status) {
      case 'ABOVE_SPEC':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'BELOW_SPEC':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      default:
        return 'text-green-600 bg-green-50 border-green-200';
    }
  };

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up': return <TrendingUp size={12} className="text-green-500" />;
      case 'down': return <TrendingDown size={12} className="text-red-500" />;
      default: return <Minus size={12} className="text-gray-400" />;
    }
  };

  return (
    <div className={`measurement-item ${isScrolling ? 'scrolling' : ''} p-2 rounded border-l-2 ${getSpecStatusStyle(measurement.spec_status)}`}>
      <div className="flex flex-col space-y-1">
        {/* Measurement name and code */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <span className="text-xs font-medium">{measurement.desc}</span>
            <span className="text-xs text-gray-500">({measurement.code})</span>
            {getTrendIcon(measurement.trend)}
          </div>
        </div>
        
        {/* Value and specs in a clean layout */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold">
              {measurement.value.toLocaleString()} {measurement.unit || ''}
            </span>
          </div>
          
          {/* Spec limits displayed inline */}
          {(measurement.upper_spec_limit !== undefined || measurement.lower_spec_limit !== undefined) && (
            <div className="flex items-center space-x-2 text-xs text-gray-600">
              {measurement.lower_spec_limit !== undefined && (
                <span className="flex items-center">
                  <span className="font-medium">LSL:</span>
                  <span className="ml-1">{measurement.lower_spec_limit}</span>
                </span>
              )}
              {measurement.upper_spec_limit !== undefined && (
                <span className="flex items-center">
                  <span className="font-medium">USL:</span>
                  <span className="ml-1">{measurement.upper_spec_limit}</span>
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Efficiency indicator if available */}
        {measurement.efficiency !== undefined && (
          <PerformanceIndicator score={measurement.efficiency} size="sm" />
        )}
      </div>
    </div>
  );
};

// Heartbeat animation component
const HeartbeatIndicator: React.FC<{
  isActive: boolean;
  className?: string;
}> = ({ isActive, className = '' }) => {
  if (!isActive) return null;

  return (
    <div className={`heartbeat-indicator ${className}`}>
      <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" />
      <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
    </div>
  );
};

export const EnhancedEquipmentNode = memo((props: NodeProps<EnhancedEquipmentNodeData>) => {
  const { data, selected, id } = props;
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolling, setScrolling] = useState(false);

  // Get enhanced status configuration
  const statusConfig = enhancedStatusConfig[data.status] || enhancedStatusConfig.STOP;
  
  // Auto-scroll measurements if more than 3 items
  const visibleMeasurements = data.measurements?.filter(m => 
    !data.displayMeasurements?.length || data.displayMeasurements.includes(m.code)
  ) || [];
  
  const shouldScroll = visibleMeasurements.length > 3;

  useEffect(() => {
    if (shouldScroll && scrollRef.current) {
      const element = scrollRef.current;
      const scrollHeight = element.scrollHeight;
      const clientHeight = element.clientHeight;
      
      if (scrollHeight > clientHeight) {
        let scrollPosition = 0;
        const scrollInterval = setInterval(() => {
          scrollPosition += 1;
          if (scrollPosition > scrollHeight - clientHeight) {
            scrollPosition = 0;
          }
          element.scrollTop = scrollPosition;
          setScrolling(scrollPosition > 0);
        }, 50);

        return () => clearInterval(scrollInterval);
      }
    }
  }, [shouldScroll, visibleMeasurements.length]);

  // Update current time for last update calculation
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getLastUpdateText = () => {
    if (!data.lastUpdate) return 'N/A';
    const diffMs = currentTime.getTime() - data.lastUpdate.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}h ago`;
  };

  const nodeWidth = data.nodeSize === '3' ? 280 : data.nodeSize === '2' ? 220 : 180;
  const nodeHeight = 'auto';

  return (
    <div className="enhanced-equipment-node-container relative group">
      <NodeResizer 
        isVisible={selected} 
        minWidth={180}
        minHeight={120}
      />
      
      <div
        className={`enhanced-equipment-node relative border-2 ${statusConfig.borderColor} rounded-lg shadow-lg 
          ${selected ? 'ring-2 ring-blue-400' : ''} 
          transition-all duration-300 ease-in-out
          ${data.status === 'ACTIVE' ? 'animate-pulse-subtle' : ''}
        `}
        data-node-size={data.nodeSize || '2'}
        style={{
          width: nodeWidth,
          minHeight: 120,
          boxShadow: data.status === 'ACTIVE' ? statusConfig.glowEffect : '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Enhanced Header with gradients and animations */}
        <div className={`${statusConfig.headerBg} ${statusConfig.headerText} p-3 rounded-t-md relative overflow-hidden`}>
          {/* Animated background pattern for ACTIVE status */}
          {data.status === 'ACTIVE' && (
            <div className="absolute inset-0 opacity-20">
              <div className="w-full h-full bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer" />
            </div>
          )}
          
          <div className="flex justify-between items-center relative z-10">
            <div className="flex items-center space-x-2">
              {iconMap[data.icon || 'settings']}
              <span className="font-bold text-sm truncate">
                {data.equipmentName || data.label}
              </span>
              <HeartbeatIndicator 
                isActive={data.status === 'ACTIVE'} 
                className="relative"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <ConnectionStatusIndicator 
                status={data.connectionStatus || 'connected'} 
              />
              {statusConfig.icon}
            </div>
          </div>
          
          {/* Equipment code and performance score */}
          <div className="flex justify-between items-center mt-1 text-xs opacity-90">
            <span>{data.equipmentCode || 'N/A'}</span>
            {data.performanceScore !== undefined && (
              <div className="flex items-center space-x-1">
                <span>Performance:</span>
                <PerformanceIndicator score={data.performanceScore} size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Body with measurements */}
        <div className={`${statusConfig.bgColor} p-3 rounded-b-md`}>
          {/* Status and last update info */}
          <div className="flex justify-between items-center mb-2 text-xs text-gray-600">
            <span className={`${statusConfig.color} font-medium`}>
              {data.status}
            </span>
            <span>
              Updated: {getLastUpdateText()}
            </span>
          </div>

          {/* Enhanced measurements display */}
          {visibleMeasurements.length > 0 && (
            <div 
              ref={scrollRef}
              className={`measurements-container space-y-1 ${
                shouldScroll ? 'h-24 overflow-hidden' : 'max-h-32 overflow-y-auto'
              }`}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 transparent'
              }}
            >
              {visibleMeasurements.map((measurement, index) => (
                <EnhancedMeasurementItem 
                  key={measurement.code}
                  measurement={measurement}
                  isScrolling={scrolling}
                />
              ))}
            </div>
          )}

          {/* Spec violation alert */}
          {data.hasSpecOut && (
            <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700 animate-pulse">
              ⚠️ Spec violation detected
            </div>
          )}
        </div>

        {/* Connection Handles - Top and Bottom only */}
        <Handle 
          type="target" 
          position={Position.Top} 
          className="w-3 h-3 bg-blue-500 border-2 border-white shadow-md"
          style={{ left: '50%', transform: 'translateX(-50%)' }}
        />
        <Handle 
          type="source" 
          position={Position.Bottom} 
          className="w-3 h-3 bg-green-500 border-2 border-white shadow-md"
          style={{ left: '50%', transform: 'translateX(-50%)' }}
        />
      </div>
    </div>
  );
});

EnhancedEquipmentNode.displayName = 'EnhancedEquipmentNode';