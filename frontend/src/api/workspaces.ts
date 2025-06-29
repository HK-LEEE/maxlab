import { apiClient } from './client';
import type { Workspace, WorkspaceCreate, WorkspaceListResponse, WorkspaceTreeResponse } from '../types/workspace';

export const workspaceApi = {
  getWorkspaces: async (skip = 0, limit = 100): Promise<WorkspaceListResponse> => {
    const response = await apiClient.get<WorkspaceListResponse>('/api/v1/workspaces/', {
      params: { skip, limit },
    });
    return response.data;
  },

  getWorkspaceTree: async (parentId?: string): Promise<WorkspaceTreeResponse> => {
    const response = await apiClient.get<WorkspaceTreeResponse>('/api/v1/workspaces/tree', {
      params: { parent_id: parentId },
    });
    return response.data;
  },

  getWorkspace: async (id: string): Promise<Workspace> => {
    const response = await apiClient.get<Workspace>(`/api/v1/workspaces/${id}`);
    return response.data;
  },

  createWorkspace: async (data: WorkspaceCreate): Promise<Workspace> => {
    const response = await apiClient.post<Workspace>('/api/v1/workspaces/', data);
    return response.data;
  },

  updateWorkspace: async (id: string, data: Partial<WorkspaceCreate>): Promise<Workspace> => {
    const response = await apiClient.put<Workspace>(`/api/v1/workspaces/${id}`, data);
    return response.data;
  },

  deleteWorkspace: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/workspaces/${id}`);
  },
};