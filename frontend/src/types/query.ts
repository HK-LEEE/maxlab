export enum QueryStatus {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface Query {
  id: number;
  workspace_id: number;
  name: string;
  description: string | null;
  sql_template: string;
  params_info: Record<string, any> | null;
  status: QueryStatus;
  created_by: string;
  created_at: string;
  last_executed_at: string | null;
}

export interface QueryCreate {
  name: string;
  description?: string | null;
  sql_template: string;
  params_info?: Record<string, any> | null;
}

export interface QueryListResponse {
  items: Query[];
  total: number;
}

export interface QueryExecuteRequest {
  params: Record<string, any>;
}

export interface QueryExecuteResponse {
  query_id: number;
  query_name: string;
  executed_at: string;
  row_count: number;
  data: Record<string, any>[];
  execution_time_ms: number;
}