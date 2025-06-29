import React from 'react';
import type { Workspace } from '../../types/workspace';
import { WorkspaceItem } from './WorkspaceItem';

interface WorkspaceListProps {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
}

export const WorkspaceList: React.FC<WorkspaceListProps> = ({
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
}) => {
  return (
    <div className="space-y-2">
      {workspaces.map((workspace) => (
        <WorkspaceItem
          key={workspace.id}
          workspace={workspace}
          isSelected={selectedWorkspace?.id === workspace.id}
          onClick={() => onSelectWorkspace(workspace)}
        />
      ))}
    </div>
  );
};