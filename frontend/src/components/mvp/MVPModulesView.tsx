import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Grid, List, Settings, Trash2, Power, PowerOff, Activity, Monitor } from 'lucide-react';
import { mvpModuleApi } from '../../api/mvpModules';
import { CreateModuleModal } from './CreateModuleModal';
import { ModuleCard } from './ModuleCard';
import { useNavigate } from 'react-router-dom';
import type { Workspace } from '../../types/workspace';
import type { MVPModule } from '../../types/mvpModule';

interface MVPModulesViewProps {
  workspace: Workspace;
  isAdmin: boolean;
}

export const MVPModulesView: React.FC<MVPModulesViewProps> = ({ workspace, isAdmin }) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedModule, setSelectedModule] = useState<MVPModule | null>(null);
  const navigate = useNavigate();

  const { data: modulesData, isLoading, refetch } = useQuery({
    queryKey: ['mvpModules', workspace.id],
    queryFn: () => mvpModuleApi.getWorkspaceModules(workspace.id),
    enabled: !!workspace.id,
  });

  const modules = modulesData?.modules || [];

  const handleModuleClick = (module: MVPModule) => {
    // TODO: Navigate to module page
    console.log('Module clicked:', module);
  };

  const handleModuleAction = async (module: MVPModule, action: string) => {
    try {
      switch (action) {
        case 'activate':
          await mvpModuleApi.activateModule(workspace.id, module.id);
          break;
        case 'deactivate':
          await mvpModuleApi.deactivateModule(workspace.id, module.id);
          break;
        case 'delete':
          if (window.confirm(`Are you sure you want to delete ${module.display_name}?`)) {
            await mvpModuleApi.deleteModule(workspace.id, module.id);
          }
          break;
        case 'settings':
          // TODO: Open settings modal
          console.log('Open settings for:', module);
          break;
      }
      refetch();
    } catch (error) {
      console.error('Module action failed:', error);
    }
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading modules...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Personal Test Card - Only show on personal_test workspace */}
      {(workspace.slug === 'personaltest' || workspace.name === 'personal_test') && (
        <div 
          className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/workspaces/personal_test')}
        >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-white rounded-lg shadow-sm">
              <Activity size={24} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Process Flow(공정도 작성 및 모니터)</h3>
              <p className="text-gray-600 text-sm">Design and monitor chemial process flows</p>
            </div>
          </div>
          <div className="text-blue-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">MVP Modules</h2>
        <div className="flex items-center gap-4">

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${
                viewMode === 'grid' ? 'bg-white shadow-sm' : 'text-gray-600'
              }`}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${
                viewMode === 'list' ? 'bg-white shadow-sm' : 'text-gray-600'
              }`}
            >
              <List size={16} />
            </button>
          </div>

          {/* Create Button */}
          {isAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors"
            >
              <Plus size={16} />
              Add Module
            </button>
          )}
        </div>
      </div>

      {/* Modules Grid/List */}
      {modules.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <div className="mb-4">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-medium text-gray-900">No modules yet</h3>
          <p className="mt-1 text-gray-500">
            Get started by creating your first MVP module for this workspace.
          </p>
          {isAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors"
            >
              <Plus size={16} />
              Create First Module
            </button>
          )}
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'space-y-4'
          }
        >
          {modules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
              viewMode={viewMode}
              isAdmin={isAdmin}
              onClick={() => handleModuleClick(module)}
              onAction={(action) => handleModuleAction(module, action)}
            />
          ))}
        </div>
      )}

      {/* Create Module Modal */}
      {isCreateModalOpen && (
        <CreateModuleModal
          workspace={workspace}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            refetch();
          }}
        />
      )}
    </div>
  );
};