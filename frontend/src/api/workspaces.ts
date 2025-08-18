import { apiClient } from './client';
import type { Workspace, WorkspaceCreate, WorkspaceListResponse, WorkspaceTreeResponse } from '../types/workspace';

export const workspaceApi = {
  getWorkspaces: async (skip = 0, limit = 100): Promise<WorkspaceListResponse> => {
    const response = await apiClient.get<WorkspaceListResponse>('/v1/workspaces/', {
      params: { skip, limit },
    });
    return response.data;
  },

  getWorkspaceTree: async (parentId?: string): Promise<WorkspaceTreeResponse> => {
    console.log('📡 API: Getting workspace tree, parentId:', parentId);
    
    const makeRequest = async (attemptNumber = 1): Promise<WorkspaceTreeResponse> => {
      try {
        const response = await apiClient.get<WorkspaceTreeResponse>('/v1/workspaces/tree', {
          params: { parent_id: parentId },
        });
        console.log('📡 API: Workspace tree response:', response.status, response.data);
        return response.data;
      } catch (error: any) {
        console.error('📡 API: Workspace tree error:', {
          attempt: attemptNumber,
          status: error?.response?.status,
          statusText: error?.response?.statusText,
          data: error?.response?.data,
          message: error?.message,
          config: {
            url: error?.config?.url,
            method: error?.config?.method,
            headers: error?.config?.headers,
          }
        });

        // Retry logic for 403 Forbidden errors (token propagation delay)
        if (error?.response?.status === 403 && attemptNumber < 3) {
          const retryDelay = attemptNumber === 1 ? 1500 : 3000; // 1.5s, then 3s
          console.log(`🔄 API: Retrying workspace tree request in ${retryDelay}ms (attempt ${attemptNumber + 1}/3) due to 403 - likely token propagation delay`);
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return makeRequest(attemptNumber + 1);
        }
        
        throw error;
      }
    };

    return makeRequest();
  },

  getWorkspace: async (id: string): Promise<Workspace> => {
    const response = await apiClient.get<Workspace>(`/v1/workspaces/${id}`);
    return response.data;
  },

  createWorkspace: async (data: WorkspaceCreate): Promise<Workspace> => {
    const response = await apiClient.post<Workspace>('/v1/workspaces/', data);
    return response.data;
  },

  updateWorkspace: async (id: string, data: Partial<WorkspaceCreate>): Promise<Workspace> => {
    const response = await apiClient.put<Workspace>(`/v1/workspaces/${id}`, data);
    return response.data;
  },

  deleteWorkspace: async (id: string): Promise<void> => {
    await apiClient.delete(`/v1/workspaces/${id}`);
  },
};