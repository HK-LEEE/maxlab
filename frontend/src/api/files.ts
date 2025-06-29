import { apiClient } from './client';
import type { 
  WorkspaceFile, 
  FileListResponse, 
  DirectoryCreate, 
  FileUploadResponse,
  StorageStats 
} from '../types/file';

export const fileApi = {
  uploadFile: async (
    workspaceId: string,
    file: File,
    parentId?: string,
    description?: string,
    isPublic: boolean = false
  ): Promise<FileUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const params = new URLSearchParams();
    if (parentId) params.append('parent_id', parentId);
    if (description) params.append('description', description);
    params.append('is_public', isPublic.toString());
    
    const response = await apiClient.post<FileUploadResponse>(
      `/api/v1/workspaces/${workspaceId}/files/upload?${params.toString()}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  createDirectory: async (
    workspaceId: string,
    data: DirectoryCreate
  ): Promise<WorkspaceFile> => {
    const response = await apiClient.post<WorkspaceFile>(
      `/api/v1/workspaces/${workspaceId}/files/directory`,
      data
    );
    return response.data;
  },

  listFiles: async (
    workspaceId: string,
    parentId?: string,
    includeDeleted: boolean = false
  ): Promise<FileListResponse> => {
    const params = new URLSearchParams();
    if (parentId) params.append('parent_id', parentId);
    if (includeDeleted) params.append('include_deleted', 'true');
    
    const response = await apiClient.get<FileListResponse>(
      `/api/v1/workspaces/${workspaceId}/files?${params.toString()}`
    );
    return response.data;
  },

  getFile: async (fileId: string): Promise<WorkspaceFile> => {
    const response = await apiClient.get<WorkspaceFile>(`/api/v1/files/${fileId}`);
    return response.data;
  },

  downloadFile: async (fileId: string): Promise<void> => {
    const response = await apiClient.get(`/api/v1/files/${fileId}/download`, {
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    
    // Extract filename from Content-Disposition header or use default
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'download';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) filename = filenameMatch[1];
    }
    
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  updateFile: async (
    fileId: string,
    data: Partial<WorkspaceFile>
  ): Promise<WorkspaceFile> => {
    const response = await apiClient.put<WorkspaceFile>(`/api/v1/files/${fileId}`, data);
    return response.data;
  },

  moveFile: async (
    fileId: string,
    targetParentId?: string
  ): Promise<WorkspaceFile> => {
    const response = await apiClient.post<WorkspaceFile>(
      `/api/v1/files/${fileId}/move`,
      { target_parent_id: targetParentId }
    );
    return response.data;
  },

  deleteFile: async (fileId: string, permanent: boolean = false): Promise<void> => {
    await apiClient.delete(`/api/v1/files/${fileId}?permanent=${permanent}`);
  },

  getStorageStats: async (workspaceId: string): Promise<StorageStats> => {
    const response = await apiClient.get<StorageStats>(
      `/api/v1/workspaces/${workspaceId}/storage/stats`
    );
    return response.data;
  },
};