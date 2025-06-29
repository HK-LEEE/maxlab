export interface WorkspaceFile {
  id: string;
  workspace_id: string;
  parent_id?: string;
  name: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  file_hash?: string;
  is_directory: boolean;
  file_extension?: string;
  is_deleted: boolean;
  is_public: boolean;
  version: number;
  version_of?: string;
  uploaded_by: string;
  uploaded_at: string;
  modified_by?: string;
  modified_at?: string;
  metadata?: Record<string, any>;
  description?: string;
}

export interface FileListResponse {
  files: WorkspaceFile[];
  total: number;
  path: Array<{
    id: string;
    name: string;
    is_directory: boolean;
  }>;
}

export interface DirectoryCreate {
  name: string;
  parent_id?: string;
  description?: string;
}

export interface FileUploadResponse {
  file: WorkspaceFile;
  upload_url?: string;
}

export interface StorageStats {
  total_size: number;
  file_count: number;
  directory_count: number;
  by_type: Record<string, { count: number; size: number }>;
}