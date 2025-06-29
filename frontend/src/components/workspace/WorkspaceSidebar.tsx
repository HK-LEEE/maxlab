import React, { useState } from 'react';
import { Plus, FolderPlus, Search, Settings, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WorkspaceTree } from './WorkspaceTree';
import type { Workspace } from '../../types/workspace';

interface WorkspaceSidebarProps {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace?: () => void;
  onCreateFolder?: () => void;
  isAdmin?: boolean;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  onCreateFolder,
  isAdmin = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  // Filter workspaces based on search term
  const filterWorkspaces = (items: Workspace[], term: string): Workspace[] => {
    if (!term) return items;
    
    return items.reduce((acc: Workspace[], item) => {
      const matchesSearch = item.name.toLowerCase().includes(term.toLowerCase());
      const filteredChildren = item.children ? filterWorkspaces(item.children, term) : [];
      
      if (matchesSearch || filteredChildren.length > 0) {
        acc.push({
          ...item,
          children: filteredChildren,
        });
      }
      
      return acc;
    }, []);
  };

  const filteredWorkspaces = filterWorkspaces(workspaces, searchTerm);

  return (
    <div className="w-64 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Workspaces</h2>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search workspaces..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          />
        </div>
      </div>

      {/* Actions - Removed New Workspace button */}

      {/* Workspace Tree */}
      <div className="flex-1 overflow-y-auto p-3">
        {filteredWorkspaces.length > 0 ? (
          <WorkspaceTree
            workspaces={filteredWorkspaces}
            selectedWorkspace={selectedWorkspace}
            onSelectWorkspace={onSelectWorkspace}
          />
        ) : (
          <div className="text-center text-gray-500 text-sm mt-8">
            {searchTerm ? 'No workspaces found' : 'No workspaces available'}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-2">
          {filteredWorkspaces.length} workspace{filteredWorkspaces.length !== 1 ? 's' : ''}
        </div>
        {isAdmin && (
          <div className="space-y-2">
            <button
              onClick={() => navigate('/admin/workspaces')}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              <Settings size={16} />
              <span>Admin</span>
            </button>
            <button
              onClick={() => navigate('/admin/users')}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              <Users size={16} />
              <span>Users</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};