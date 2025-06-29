import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Users } from 'lucide-react';
import type { Workspace } from '../../types/workspace';

interface WorkspaceTreeProps {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  level?: number;
}

export const WorkspaceTree: React.FC<WorkspaceTreeProps> = ({
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  level = 0,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const getIcon = (workspace: Workspace) => {
    if (workspace.is_folder) {
      return expandedFolders.has(workspace.id) ? (
        <FolderOpen size={16} className="text-gray-600" />
      ) : (
        <Folder size={16} className="text-gray-600" />
      );
    }
    
    if (workspace.workspace_type === 'GROUP') {
      return <Users size={16} className="text-gray-600" />;
    }
    
    return <FileText size={16} className="text-gray-600" />;
  };

  return (
    <div className="space-y-1">
      {workspaces.map((workspace) => {
        const isExpanded = expandedFolders.has(workspace.id);
        const hasChildren = workspace.children && workspace.children.length > 0;
        const isSelected = selectedWorkspace?.id === workspace.id;

        return (
          <div key={workspace.id}>
            <div
              className={`
                flex items-center px-2 py-1.5 rounded cursor-pointer
                ${isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'}
                ${level > 0 ? `ml-${level * 4}` : ''}
              `}
              style={{ paddingLeft: `${level * 16 + 8}px` }}
              onClick={() => {
                if (workspace.is_folder) {
                  toggleFolder(workspace.id);
                } else {
                  onSelectWorkspace(workspace);
                }
              }}
            >
              {hasChildren && (
                <button
                  className="mr-1 p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFolder(workspace.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-gray-500" />
                  ) : (
                    <ChevronRight size={14} className="text-gray-500" />
                  )}
                </button>
              )}
              {!hasChildren && <div className="w-5" />}
              
              <div className="mr-2">{getIcon(workspace)}</div>
              
              <span className={`
                text-sm flex-1 truncate
                ${isSelected ? 'font-medium' : ''}
              `}>
                {workspace.name}
              </span>
            </div>

            {hasChildren && isExpanded && (
              <WorkspaceTree
                workspaces={workspace.children!}
                selectedWorkspace={selectedWorkspace}
                onSelectWorkspace={onSelectWorkspace}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};