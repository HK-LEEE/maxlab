import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { workspaceApi } from '../api/workspaces';
import type { Workspace } from '../types/workspace';

interface WorkspaceContextType {
  workspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  refreshWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = async () => {
    if (!workspaceId) {
      setError('No workspace ID provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // First try to get workspace by slug
      const workspacesData = await workspaceApi.getWorkspaces();
      const workspaceBySlug = workspacesData.workspaces.find(w => w.slug === workspaceId);
      
      if (workspaceBySlug) {
        setWorkspace(workspaceBySlug);
      } else {
        // If not found by slug, try by ID
        const workspaceData = await workspaceApi.getWorkspace(workspaceId);
        setWorkspace(workspaceData);
      }
    } catch (err) {
      console.error('Failed to load workspace:', err);
      setError('Failed to load workspace');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [workspaceId]);

  const value: WorkspaceContextType = {
    workspace,
    isLoading,
    error,
    refreshWorkspace: loadWorkspace,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};