export interface MVPModule {
  id: string;
  workspace_id: string;
  module_name: string;
  display_name: string;
  description?: string;
  version: string;
  module_type: 'dashboard' | 'analytics' | 'report' | 'custom';
  route_path: string;
  module_path?: string;
  is_active: boolean;
  is_installed: boolean;
  config: Record<string, any>;
  sort_order: number;
  icon?: string;
  color?: string;
  template: string;
  permissions: {
    view: string[];
    edit: string[];
    delete: string[];
  };
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface MVPModuleCreate {
  workspace_id: string;
  module_name: string;
  display_name: string;
  description?: string;
  module_type?: 'dashboard' | 'analytics' | 'report' | 'custom';
  route_path: string;
  template?: string;
  is_active?: boolean;
  config?: Record<string, any>;
  sort_order?: number;
  icon?: string;
  color?: string;
  permissions?: {
    view: string[];
    edit: string[];
    delete: string[];
  };
}

export interface MVPModuleUpdate {
  display_name?: string;
  description?: string;
  version?: string;
  is_active?: boolean;
  config?: Record<string, any>;
  sort_order?: number;
  icon?: string;
  color?: string;
}

export interface MVPModuleListResponse {
  modules: MVPModule[];
  total: number;
  skip: number;
  limit: number;
}

export interface ModuleTemplate {
  name: string;
  display_name: string;
  description: string;
  icon: string;
}