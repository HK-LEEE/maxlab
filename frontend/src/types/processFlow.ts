/**
 * Process Flow 관련 타입 정의
 * 스코프 기반 RBAC 지원
 */

// 스코프 타입 정의
export type ScopeType = 'WORKSPACE' | 'USER';
export type VisibilityScope = 'WORKSPACE' | 'PRIVATE';

// 상수로도 정의 (enum 대신)
export const SCOPE_TYPES = {
  WORKSPACE: 'WORKSPACE' as const,
  USER: 'USER' as const,
} as const;

export const VISIBILITY_SCOPES = {
  WORKSPACE: 'WORKSPACE' as const,
  PRIVATE: 'PRIVATE' as const,
} as const;

export interface ProcessFlowScope {
  scope_type: ScopeType;
  visibility_scope: VisibilityScope;
  shared_with_workspace: boolean;
}

export interface ProcessFlow extends ProcessFlowScope {
  id: string;
  workspace_id: string;
  name: string;
  flow_data: {
    nodes: any[];
    edges: any[];
    nodeSize?: string;
  };
  created_by?: string;
  created_at: string;
  updated_at: string;
  is_published?: boolean;
  published_at?: string;
  publish_token?: string;
  current_version?: number;
  data_source_id?: string;
}

export interface ProcessFlowCreateData {
  workspace_id: string;
  name: string;
  flow_data: {
    nodes: any[];
    edges: any[];
    nodeSize?: string;
  };
  data_source_id?: string;
  scope_type: ScopeType;
  visibility_scope: VisibilityScope;
}

export interface SaveFlowDialogData {
  name: string;
  scopeType: ScopeType;
  description?: string;
}

export interface ScopeOption {
  value: ScopeType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export interface FlowListFilter {
  scopeType?: ScopeType;
  search?: string;
  sortBy?: 'updated_at' | 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}