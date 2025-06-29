export enum WorkspaceType {
  PERSONAL = 'PERSONAL',
  GROUP = 'GROUP',
}

export enum OwnerType {
  USER = 'USER',
  GROUP = 'GROUP',
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  workspace_type: WorkspaceType;
  owner_type: OwnerType;
  owner_id: string;
  parent_id?: string;
  path: string;
  is_folder: boolean;
  is_active: boolean;
  settings?: Record<string, any>;
  created_at: string;
  updated_at?: string;
  children?: Workspace[];
}

export interface WorkspaceCreate {
  name: string;
  workspace_type: WorkspaceType;
  owner_type: OwnerType;
  owner_id: string;
  parent_id?: string;
  is_folder?: boolean;
  description?: string;
}

export interface WorkspaceListResponse {
  workspaces: Workspace[];
  total: number;
  skip: number;
  limit: number;
}

export interface WorkspaceTreeResponse {
  workspaces: Workspace[];
  total: number;
}