import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, ChevronRight, X, Menu,
  Gauge, Activity, Filter, Thermometer, Wind, Zap, 
  Database, Archive, GitMerge, Flame, Snowflake, Settings,
  Square, Type, Minus, CornerDownRight, Spline, Waves
} from 'lucide-react';

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
  edgeType: string;
  nodeSize: '1' | '2' | '3';
  autoScroll: boolean;
  selectedElements: { nodes: number; edges: number };
  onSearchChange: (term: string) => void;
  onDragStart: (event: React.DragEvent, data: any) => void;
  onLoadMore: () => void;
  onEdgeTypeChange: (type: string) => void;
  onAddGroup: () => void;
  onNodeSizeChange: (size: '1' | '2' | '3') => void;
  onAutoScrollChange: (enabled: boolean) => void;
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
  waves: Waves,
};


const edgeTypes = [
  { id: 'straight', name: 'Straight', icon: Minus },
  { id: 'step', name: 'Step (90°)', icon: CornerDownRight },
  { id: 'smoothstep', name: 'Smooth Step', icon: Spline },
  { id: 'default', name: 'Bezier', icon: Spline },
];

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  equipmentTypes,
  edgeType,
  nodeSize,
  autoScroll,
  selectedElements,
  onDragStart,
  onEdgeTypeChange,
  onAddGroup,
  onNodeSizeChange,
  onAutoScrollChange,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    equipment: true,
    draw: true,
    edgeTypes: true,
    settings: true,
    templates: false,
  });
  
  const [templates, setTemplates] = useState<Array<{id: string; name: string; data: any}>>([]);

  // Load templates from localStorage on mount and listen for updates
  useEffect(() => {
    const loadTemplates = () => {
      const savedTemplates = localStorage.getItem('nodeTemplates');
      if (savedTemplates) {
        try {
          setTemplates(JSON.parse(savedTemplates));
        } catch (e) {
          console.error('Failed to load templates:', e);
        }
      }
    };

    loadTemplates();
    
    // Listen for template updates
    window.addEventListener('templatesUpdated', loadTemplates);
    
    return () => {
      window.removeEventListener('templatesUpdated', loadTemplates);
    };
  }, []);

  const getIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName] || Settings;
    return <IconComponent size={18} />;
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute left-4 top-20 p-2 bg-white rounded-lg shadow-lg z-10 hover:bg-gray-50"
        title="Open sidebar"
      >
        <Menu size={20} />
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-20 w-64 max-h-[calc(100vh-120px)] bg-white rounded-lg shadow-lg z-10 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Tools</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-gray-100 rounded"
          title="Close sidebar"
        >
          <X size={16} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {/* Equipment Types Section */}
        <div className="border-b">
          <button
            onClick={() => toggleSection('equipment')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50"
          >
            <span className="text-sm font-medium">Equipment Types</span>
            {expandedSections.equipment ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {expandedSections.equipment && (
            <div className="px-2 pb-2">
              {/* Common Equipment */}
              <div
                draggable
                onDragStart={(e) => onDragStart(e, { type: 'equipment', data: { code: 'COMMON', name: '공통설비', icon: 'settings' }})}
                className="flex items-center space-x-2 px-2 py-1.5 rounded cursor-move hover:bg-gray-100 text-sm border border-dashed border-gray-300"
              >
                <div className="text-gray-600">
                  {getIcon('settings')}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-900 truncate">공통설비</span>
                  <span className="text-gray-500 ml-1">: Type later</span>
                </div>
              </div>
              
              {/* Instrument */}
              <div
                draggable
                onDragStart={(e) => onDragStart(e, { 
                  type: 'instrument', 
                  data: { 
                    instrumentType: 'instrument',
                    label: '계측기',
                    instrumentName: '계측기',
                    color: '#6b7280', // Gray default color
                    displayMeasurements: []
                  }
                })}
                className="flex items-center space-x-2 px-2 py-1.5 rounded cursor-move hover:bg-gray-100 text-sm border border-dashed"
                style={{ borderColor: '#6b728050' }}
              >
                <div style={{ color: '#6b7280' }}>
                  {getIcon('activity')}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-900 truncate">계측기</span>
                  <span className="text-gray-500 ml-1">: Measurements</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Draw Section */}
        <div className="border-b">
          <button
            onClick={() => toggleSection('draw')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50"
          >
            <span className="text-sm font-medium">Draw</span>
            {expandedSections.draw ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {expandedSections.draw && (
            <div className="px-2 pb-2">
              {/* Group */}
              <div
                draggable
                onDragStart={(e) => onDragStart(e, { type: 'group', data: {} })}
                className="flex items-center space-x-2 px-2 py-1.5 rounded cursor-move hover:bg-gray-100 text-sm"
              >
                <Square size={18} className="text-gray-600" />
                <span>Group</span>
              </div>
              
              {/* Text */}
              <div
                draggable
                onDragStart={(e) => onDragStart(e, { type: 'text', data: { text: 'Text', fontSize: 14, color: '#000000' }})}
                className="flex items-center space-x-2 px-2 py-1.5 rounded cursor-move hover:bg-gray-100 text-sm"
              >
                <Type size={18} className="text-gray-600" />
                <span>Text</span>
              </div>
            </div>
          )}
        </div>

        {/* Edge Types Section */}
        <div className="border-b">
          <button
            onClick={() => toggleSection('edgeTypes')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50"
          >
            <span className="text-sm font-medium">Edge Types</span>
            {expandedSections.edgeTypes ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {expandedSections.edgeTypes && (
            <div className="px-2 pb-2">
              {edgeTypes.map((edge) => {
                const IconComponent = edge.icon;
                return (
                  <button
                    key={edge.id}
                    onClick={() => onEdgeTypeChange(edge.id)}
                    className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded text-sm text-left ${
                      edgeType === edge.id ? 'bg-gray-200' : 'hover:bg-gray-100'
                    }`}
                  >
                    <IconComponent size={18} className="text-gray-600" />
                    <span>{edge.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Settings Section */}
        <div>
          <button
            onClick={() => toggleSection('settings')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50"
          >
            <span className="text-sm font-medium">Settings</span>
            {expandedSections.settings ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {expandedSections.settings && (
            <div className="px-4 pb-3 space-y-3">
              {/* Node Size */}
              {selectedElements.nodes > 0 && (
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Node Size (Selected)</label>
                  <select
                    value={nodeSize}
                    onChange={(e) => onNodeSizeChange(e.target.value as '1' | '2' | '3')}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  >
                    <option value="1">1개</option>
                    <option value="2">2개</option>
                    <option value="3">3개+</option>
                  </select>
                </div>
              )}

              {/* Auto Scroll */}
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => onAutoScrollChange(e.target.checked)}
                  className="rounded border-gray-300 text-black focus:ring-black"
                />
                <span className="text-sm text-gray-700">Auto Scroll</span>
              </label>
            </div>
          )}
        </div>

        {/* Templates Section */}
        <div className="border-t">
          <button
            onClick={() => toggleSection('templates')}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50"
          >
            <span className="text-sm font-medium">Node Templates</span>
            {expandedSections.templates ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {expandedSections.templates && (
            <div className="px-2 pb-2">
              {templates.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-2">
                  No templates saved. Create templates by saving configured nodes.
                </p>
              ) : (
                <div className="space-y-1">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, { type: 'template', data: template.data })}
                      className="flex items-center justify-between px-2 py-1.5 rounded cursor-move hover:bg-gray-100 text-sm"
                    >
                      <span className="truncate">{template.name}</span>
                      <button
                        onClick={() => {
                          const newTemplates = templates.filter(t => t.id !== template.id);
                          setTemplates(newTemplates);
                          localStorage.setItem('nodeTemplates', JSON.stringify(newTemplates));
                        }}
                        className="text-red-500 hover:text-red-700 p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};