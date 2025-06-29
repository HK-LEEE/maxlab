import { apiClient } from './client';
import type {
  MVPModule,
  MVPModuleCreate,
  MVPModuleUpdate,
  MVPModuleListResponse,
  ModuleTemplate,
} from '../types/mvpModule';

export const mvpModuleApi = {
  // Get workspace modules
  async getWorkspaceModules(
    workspaceId: string,
    params?: { skip?: number; limit?: number; active_only?: boolean }
  ): Promise<MVPModuleListResponse> {
    const { data } = await apiClient.get(`/api/v1/workspaces/${workspaceId}/modules`, { params });
    return data;
  },

  // Create module
  async createModule(workspaceId: string, formData: FormData): Promise<MVPModule> {
    const { data } = await apiClient.post(`/api/v1/workspaces/${workspaceId}/modules`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  // Get module details
  async getModule(workspaceId: string, moduleId: string): Promise<MVPModule> {
    const { data } = await apiClient.get(`/api/v1/workspaces/${workspaceId}/modules/${moduleId}`);
    return data;
  },

  // Update module
  async updateModule(
    workspaceId: string,
    moduleId: string,
    updateData: MVPModuleUpdate
  ): Promise<MVPModule> {
    const { data } = await apiClient.put(
      `/api/v1/workspaces/${workspaceId}/modules/${moduleId}`,
      updateData
    );
    return data;
  },

  // Delete module
  async deleteModule(workspaceId: string, moduleId: string): Promise<void> {
    await apiClient.delete(`/api/v1/workspaces/${workspaceId}/modules/${moduleId}`);
  },

  // Activate module
  async activateModule(workspaceId: string, moduleId: string): Promise<MVPModule> {
    const { data } = await apiClient.post(
      `/api/v1/workspaces/${workspaceId}/modules/${moduleId}/activate`
    );
    return data;
  },

  // Deactivate module
  async deactivateModule(workspaceId: string, moduleId: string): Promise<MVPModule> {
    const { data } = await apiClient.post(
      `/api/v1/workspaces/${workspaceId}/modules/${moduleId}/deactivate`
    );
    return data;
  },

  // Get module templates
  async getModuleTemplates(): Promise<ModuleTemplate[]> {
    const { data } = await apiClient.get('/api/v1/module-templates');
    return data;
  },

  // Get module config
  async getModuleConfig(workspaceId: string, moduleId: string): Promise<any> {
    const { data } = await apiClient.get(
      `/api/v1/workspaces/${workspaceId}/modules/${moduleId}/config`
    );
    return data;
  },

  // Update module config
  async updateModuleConfig(
    workspaceId: string,
    moduleId: string,
    config: any
  ): Promise<any> {
    const { data } = await apiClient.put(
      `/api/v1/workspaces/${workspaceId}/modules/${moduleId}/config`,
      config
    );
    return data;
  },
};