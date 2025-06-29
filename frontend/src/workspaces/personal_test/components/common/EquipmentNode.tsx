import React, { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import type { Node, NodeProps } from 'reactflow';
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
  AlertCircle,
  CheckCircle,
  PauseCircle
} from 'lucide-react';

interface EquipmentNodeData {
  label: string;
  equipmentType: string;
  equipmentCode?: string;
  equipmentName: string;
  status: 'ACTIVE' | 'PAUSE' | 'STOP';
  icon?: string;
  measurements?: Array<{
    code: string;
    desc: string;
    value: number;
    unit?: string;
  }>;
  displayMeasurements?: string[];
}

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
};

const statusConfig = {
  ACTIVE: { 
    color: 'text-green-600', 
    bgColor: 'bg-green-100', 
    headerBg: 'bg-green-500',
    headerText: 'text-white',
    icon: <CheckCircle size={16} /> 
  },
  PAUSE: { 
    color: 'text-yellow-600', 
    bgColor: 'bg-yellow-100', 
    headerBg: 'bg-yellow-500',
    headerText: 'text-white',
    icon: <PauseCircle size={16} /> 
  },
  STOP: { 
    color: 'text-red-600', 
    bgColor: 'bg-red-100', 
    headerBg: 'bg-red-500',
    headerText: 'text-white',
    icon: <AlertCircle size={16} /> 
  },
};

export const EquipmentNode = memo(({ data, selected }: NodeProps<EquipmentNodeData>) => {
  const status = statusConfig[data.status] || statusConfig.STOP;
  const icon = data.icon ? iconMap[data.icon] : <Gauge size={20} />;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  
  // Auto-scroll measurements if enabled
  useEffect(() => {
    const isMonitor = window.location.pathname.includes('monitor');
    const shouldScroll = isMonitor && (window as any).autoScrollMeasurements;
    
    if (shouldScroll && data.measurements && scrollRef.current) {
      // Get node height from parent element
      const nodeElement = scrollRef.current.closest('[data-id]');
      const nodeHeight = nodeElement?.clientHeight || 270;
      
      // Calculate how many measurements can be shown based on height
      // Header takes ~100px, each measurement takes ~50px
      const visibleMeasurements = Math.floor((nodeHeight - 100) / 50);
      
      // Only scroll if we have more measurements than can fit
      const needsScroll = data.measurements.length > visibleMeasurements;
      
      if (needsScroll) {
        setIsScrolling(true);
        const scrollContainer = scrollRef.current;
        let scrollPos = 0;
        
        const scroll = () => {
          if (scrollContainer) {
            scrollPos += 0.5;
            if (scrollPos >= scrollContainer.scrollHeight - scrollContainer.clientHeight) {
              scrollPos = 0;
            }
            scrollContainer.scrollTop = scrollPos;
          }
        };
        
        const interval = setInterval(scroll, 50); // Smooth scrolling
        return () => clearInterval(interval);
      }
    }
  }, [data.measurements]);

  return (
    <>
      <NodeResizer
        color="#3b82f6"
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        handleStyle={{ width: 8, height: 8 }}
      />
      <div
        className={`
          rounded-lg border-2 bg-white shadow-sm overflow-hidden
          ${selected ? 'border-blue-500 shadow-lg' : data.equipmentType ? 'border-gray-300' : 'border-gray-300 border-dashed'}
          min-w-[200px] w-full h-full flex flex-col
        `}
      >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-gray-400"
      />
      
      {/* Equipment Information Section */}
      <div className={`px-4 py-3 border-b ${window.location.pathname.includes('monitor') ? status.headerBg : data.equipmentType ? 'bg-gray-50' : 'bg-gray-100'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className="text-gray-600">{icon}</div>
            <div className={`font-semibold text-sm ${window.location.pathname.includes('monitor') ? status.headerText : ''}`}>
              {data.equipmentType ? data.label : '공통설비 (미지정)'}
            </div>
          </div>
          <div className={`flex items-center ${window.location.pathname.includes('monitor') ? status.headerText : status.color}`}>
            {status.icon}
          </div>
        </div>
        
        <div className={`text-xs px-2 py-1 rounded inline-block ${window.location.pathname.includes('monitor') ? 'bg-white/20 ' + status.headerText : status.bgColor + ' ' + status.color}`}>
          {data.status}
        </div>
        
        {data.equipmentCode && (
          <div className={`text-xs mt-1 ${window.location.pathname.includes('monitor') ? status.headerText : 'text-gray-500'}`}>
            Code: {data.equipmentCode}
          </div>
        )}
      </div>
      
      {/* Measurements Section */}
      {data.measurements && data.measurements.length > 0 && (
        <div className="px-4 py-3 flex-1 overflow-hidden">
          <div 
            ref={scrollRef}
            className={`${isScrolling ? 'h-full overflow-y-auto scrollbar-hide' : ''}`}
            style={{ maxHeight: isScrolling ? 'calc(100% - 20px)' : 'auto' }}
          >
          <div className="space-y-1">
            {(() => {
              const filteredMeasurements = data.measurements
                .filter(m => !data.displayMeasurements || data.displayMeasurements.length === 0 || data.displayMeasurements.includes(m.code));
              
              // Duplicate measurements for smooth infinite scroll when scrolling
              const measurementsToShow = isScrolling
                ? [...filteredMeasurements, ...filteredMeasurements]
                : filteredMeasurements;
              
              return measurementsToShow.map((measurement, index) => (
                <div key={`${measurement.code}-${index}`} className="text-xs bg-gray-100 rounded px-2 py-1.5">
                  <div className="text-gray-600">{measurement.code}: {measurement.desc}</div>
                  <div className="font-bold text-gray-800">
                    {measurement.value.toLocaleString()} {measurement.unit || ''}
                  </div>
                </div>
              ));
            })()}
          </div>
          </div>
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-gray-400"
      />
      </div>
    </>
  );
});

EquipmentNode.displayName = 'EquipmentNode';