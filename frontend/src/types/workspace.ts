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
  selected_users?: string[];  // Array of user UUIDs
  selected_groups?: string[]; // Array of group UUIDs
}

export interface WorkspaceUpdate {
  name?: string;
  slug?: string;
  description?: string;
  is_active?: boolean;
  settings?: Record<string, any>;
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

export interface WorkspaceGroup {
  id: string;
  workspace_id: string;
  group_id: string;  // UUID of the group
  group_display_name?: string;
  permission_level: 'read' | 'write' | 'admin';
  group_info_updated_at?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
}

export interface WorkspaceUser {
  id: string;
  workspace_id: string;
  user_id: string;  // UUID of the user
  user_email?: string;
  user_display_name?: string;
  permission_level: 'read' | 'write' | 'admin';
  user_info_updated_at?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
}

export interface WorkspaceGroupCreate {
  group_id: string;  // UUID of the group
  group_display_name?: string;
  permission_level?: 'read' | 'write' | 'admin';
}

export interface WorkspaceUserCreate {
  user_id: string;  // UUID of the user
  permission_level?: 'read' | 'write' | 'admin';
}

export interface WorkspaceDetail extends Workspace {
  workspace_groups: WorkspaceGroup[];
  workspace_users: WorkspaceUser[];
  mvp_modules: MVPModule[];
  children: Workspace[];
}

export interface MVPModule {
  id: string;
  workspace_id: string;
  module_name: string;
  display_name: string;
  description?: string;
  version: string;
  module_type: string;
  route_path: string;
  module_path?: string;
  is_active: boolean;
  is_installed: boolean;
  config?: Record<string, any>;
  sort_order: number;
  icon?: string;
  color?: string;
  template: string;
  permissions: Record<string, string[]>;
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface PermissionCheckRequest {
  workspace_id: string;
  required_permission: 'read' | 'write' | 'admin';
}

export interface PermissionCheckResponse {
  has_permission: boolean;
  user_permission_level?: string;
  granted_groups: string[];
  granted_users?: string[];
}