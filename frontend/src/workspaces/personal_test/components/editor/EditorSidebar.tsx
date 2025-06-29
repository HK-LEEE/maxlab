import React from 'react';
import { Gauge, Activity, Filter, Thermometer, Wind, Zap, Database, Archive, GitMerge, Flame, Snowflake, Settings } from 'lucide-react';

interface Equipment {
  code: string;
  name: string;
  icon: string;
}

interface EditorSidebarProps {
  equipmentTypes: Equipment[];
  equipmentList: any[];
  hasMoreEquipment: boolean;
  isLoadingEquipment: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onDragStart: (event: React.DragEvent, equipment: Equipment) => void;
  onLoadMore: () => void;
}

// Icon mapping
const iconMap: { [key: string]: any } = {
  gauge: Gauge,
  activity: Activity,
  filter: Filter,
  thermometer: Thermometer,
  wind: Wind,
  zap: Zap,
  database: Database,
  archive: Archive,
  'git-merge': GitMerge,
  flame: Flame,
  snowflake: Snowflake,
  settings: Settings,
};

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  equipmentTypes,
  onDragStart,
}) => {
  const getIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName] || Settings;
    return <IconComponent size={20} />;
  };

  return (
    <div className="absolute left-4 top-20 w-64 max-h-[calc(100vh-120px)] bg-white rounded-lg shadow-lg z-10 flex flex-col">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">Equipment Types</h3>
        <p className="text-xs text-gray-500 mt-1">Drag to add to canvas</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {equipmentTypes.map((equipment) => (
            <div
              key={equipment.code}
              draggable
              onDragStart={(e) => onDragStart(e, equipment)}
              className="flex items-center space-x-3 px-3 py-2 rounded cursor-move hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-colors"
            >
              <div className="text-gray-600">
                {getIcon(equipment.icon)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{equipment.name}</div>
                <div className="text-xs text-gray-500">{equipment.code}</div>
              </div>
            </div>
          ))}
          
          {/* Common Equipment Item */}
          <div
            draggable
            onDragStart={(e) => onDragStart(e, { code: 'COMMON', name: '공통설비', icon: 'settings' })}
            className="flex items-center space-x-3 px-3 py-2 rounded cursor-move hover:bg-gray-100 border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors"
          >
            <div className="text-gray-600">
              {getIcon('settings')}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">공통설비</div>
              <div className="text-xs text-gray-500">Type later</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};