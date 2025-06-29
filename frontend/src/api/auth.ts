import { authClient } from './client';
import type { LoginCredentials, LoginResponse } from '../types/auth';

export interface User {
  id: string;
  username?: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_admin?: boolean;
  role?: string;
  groups?: string[];
}

export interface Group {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  members_count?: number;
}

export interface UsersListResponse {
  users: User[];
  total: number;
  skip: number;
  limit: number;
}

export interface GroupsListResponse {
  groups: Group[];
  total: number;
  skip: number;
  limit: number;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    // Send as JSON, not form data - now using Max Lab backend proxy
    const response = await authClient.post<LoginResponse>('/api/v1/auth/login', {
      email: credentials.username, // maxplatform expects 'email' field
      password: credentials.password,
    });
    return response.data;
  },

  me: async (): Promise<any> => {
    // Get current user info through Max Lab backend proxy
    const response = await authClient.get('/api/v1/auth/me');
    return response.data;
  },

  // Admin endpoints for users and groups
  getUsers: async (skip = 0, limit = 100, search?: string): Promise<UsersListResponse> => {
    const params = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (search) {
      params.append('search', search);
    }
    const response = await authClient.get<UsersListResponse>(`/api/v1/admin/users?${params}`);
    return response.data;
  },


  // Search endpoints for autocomplete
  searchUsers: async (query: string): Promise<User[]> => {
    const response = await authClient.get<User[]>(`/api/v1/external/users/search?q=${query}`);
    return response.data;
  },

  searchGroups: async (query: string): Promise<Group[]> => {
    const response = await authClient.get<Group[]>(`/api/v1/admin/groups/search?q=${query}`);
    return response.data;
  },

  // External API endpoints
  getGroups: async (): Promise<Group[]> => {
    const response = await authClient.get<Group[]>(`/api/v1/external/groups`);
    return response.data;
  },
};