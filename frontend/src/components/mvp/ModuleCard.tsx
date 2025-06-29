import React from 'react';
import {
  LayoutDashboard,
  BarChart3,
  FileText,
  Code,
  Settings,
  Trash2,
  Power,
  PowerOff,
  MoreVertical,
} from 'lucide-react';
import type { MVPModule } from '../../types/mvpModule';

interface ModuleCardProps {
  module: MVPModule;
  viewMode: 'grid' | 'list';
  isAdmin: boolean;
  onClick: () => void;
  onAction: (action: string) => void;
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  viewMode,
  isAdmin,
  onClick,
  onAction,
}) => {
  const getIcon = () => {
    switch (module.module_type) {
      case 'dashboard':
        return <LayoutDashboard className="h-6 w-6" />;
      case 'analytics':
        return <BarChart3 className="h-6 w-6" />;
      case 'report':
        return <FileText className="h-6 w-6" />;
      default:
        return <Code className="h-6 w-6" />;
    }
  };

  const getStatusColor = () => {
    if (!module.is_installed) return 'bg-gray-100 text-gray-600';
    if (module.is_active) return 'bg-green-100 text-green-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  const getStatusText = () => {
    if (!module.is_installed) return 'Not Installed';
    if (module.is_active) return 'Active';
    return 'Inactive';
  };

  if (viewMode === 'list') {
    return (
      <div className="flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-md transition-shadow">
        <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={onClick}>
          <div className={`p-3 rounded-lg ${module.color ? '' : 'bg-gray-100'}`} 
               style={module.color ? { backgroundColor: `${module.color}20`, color: module.color } : {}}>
            {getIcon()}
          </div>
          <div className="flex-1">
            <h3 className="font-medium">{module.display_name}</h3>
            {module.description && (
              <p className="text-sm text-gray-600 mt-1">{module.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor()}`}>
              {getStatusText()}
            </span>
            <span className="text-xs text-gray-500">{module.version}</span>
          </div>
        </div>
        
        {isAdmin && (
          <div className="flex items-center gap-2 ml-4">
            {module.is_active ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('deactivate');
                }}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                title="Deactivate"
              >
                <PowerOff size={16} />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('activate');
                }}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                title="Activate"
              >
                <Power size={16} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAction('settings');
              }}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded"
              title="Settings"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAction('delete');
              }}
              className="p-2 text-red-600 hover:bg-red-50 rounded"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer"
         onClick={onClick}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${module.color ? '' : 'bg-gray-100'}`}
             style={module.color ? { backgroundColor: `${module.color}20`, color: module.color } : {}}>
          {getIcon()}
        </div>
        {isAdmin && (
          <div className="relative group">
            <button
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <MoreVertical size={16} />
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(module.is_active ? 'deactivate' : 'activate');
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                {module.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                {module.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('settings');
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Settings size={14} />
                Settings
              </button>
              <hr className="my-1" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('delete');
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
      
      <h3 className="font-medium text-lg mb-2">{module.display_name}</h3>
      {module.description && (
        <p className="text-sm text-gray-600 mb-4">{module.description}</p>
      )}
      
      <div className="flex items-center justify-between">
        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor()}`}>
          {getStatusText()}
        </span>
        <span className="text-xs text-gray-500">{module.version}</span>
      </div>
    </div>
  );
};