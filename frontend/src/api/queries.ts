import { apiClient } from './client';
import type {
  Query,
  QueryCreate,
  QueryListResponse,
  QueryExecuteRequest,
  QueryExecuteResponse,
  QueryStatus,
} from '../types/query';

export const queryApi = {
  getQueries: async (workspaceId: number, skip = 0, limit = 100): Promise<QueryListResponse> => {
    const response = await apiClient.get<QueryListResponse>(
      `/v1/workspaces/${workspaceId}/queries`,
      { params: { skip, limit } }
    );
    return response.data;
  },

  getQuery: async (queryId: number): Promise<Query> => {
    const response = await apiClient.get<Query>(`/v1/queries/${queryId}`);
    return response.data;
  },

  createQuery: async (workspaceId: number, data: QueryCreate): Promise<Query> => {
    const response = await apiClient.post<Query>(
      `/v1/workspaces/${workspaceId}/queries`,
      data
    );
    return response.data;
  },

  updateQueryStatus: async (queryId: number, status: QueryStatus): Promise<Query> => {
    const response = await apiClient.patch<Query>(
      `/v1/queries/${queryId}/status`,
      { status }
    );
    return response.data;
  },

  executeQuery: async (queryId: number, params: QueryExecuteRequest): Promise<QueryExecuteResponse> => {
    const response = await apiClient.post<QueryExecuteResponse>(
      `/v1/internal/execute/${queryId}`,
      params
    );
    return response.data;
  },
};