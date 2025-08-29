/**
 * Auth API - MAX Platform 인증 API 클라이언트
 * 
 * MAX Lab에서 MAX Platform의 인증 서비스를 사용하기 위한 API
 * - 로그인/사용자 정보 조회 (OAuth 2.0/OIDC 토큰 기반)
 * - 관리자 기능: 사용자 및 그룹 관리
 * - MaxLab Backend를 통한 프록시 방식 사용
 */

import { authClient } from './client';
import type { LoginCredentials, LoginResponse } from '../types/auth';

export interface User {
  id: string;
  username?: string;
  email: string;
  full_name?: string;
  real_name?: string;
  is_active: boolean;
  is_admin: boolean;
  role?: string;
  groups?: string[];
  last_login?: string;
  group_id?: string;
}

export interface Group {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  members_count?: number;
  users_count?: number; // API returns users_count
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
    const response = await authClient.post<LoginResponse>('/v1/auth/login', {
      email: credentials.username, // maxplatform expects 'email' field
      password: credentials.password,
    });
    return response.data;
  },

  me: async (): Promise<any> => {
    // Get current user info through Max Lab backend proxy
    const response = await authClient.get('/v1/auth/me');
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
    const response = await authClient.get<UsersListResponse>(`/v1/admin/users?${params}`);
    return response.data;
  },


  // Search endpoints for autocomplete
  searchUsers: async (query: string): Promise<User[]> => {
    try {
      console.log(`🔍 Frontend: Searching users with query: "${query}"`);
      
      if (!query || query.trim().length < 1) {
        console.log('❌ Frontend: Search query is empty or too short');
        return [];
      }
      
      //const response = await authClient.get<User[]>(`/v1/external/users/search?q=${encodeURIComponent(query.trim())}`);
      const response = await authClient.get<User[]>(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
      console.log(`✅ Frontend: Found ${response.data?.length || 0} users`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error('❌ Frontend: Error searching users:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  },

  searchGroups: async (query: string): Promise<Group[]> => {
    try {
      console.log(`🔍 Frontend: Searching groups with query: "${query}"`);
      
      // Allow empty query to get all groups
      const searchQuery = query.trim();
      
      const response = await authClient.get<Group[]>(`/api/groups/search?q=${encodeURIComponent(searchQuery)}`);
      console.log(`✅ Frontend: Found ${response.data?.length || 0} groups`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error('❌ Frontend: Error searching groups:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  },

  // External API endpoints
  getGroups: async (): Promise<Group[]> => {
    try {
      console.log('🔍 Frontend: Getting all groups');
      const response = await authClient.get<Group[]>(`/api/groups`);
      console.log(`✅ Frontend: Found ${response.data?.length || 0} groups`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error('❌ Frontend: Error getting groups:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  },

  getAdminGroups: async (skip = 0, limit = 100, search?: string): Promise<Group[]> => {
    try {
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: limit.toString(),
      });
      if (search) {
        params.append('search', search);
      }
      console.log('🔍 Frontend: Getting admin groups');
      const response = await authClient.get<Group[]>(`/api/admin/groups?${params}`);
      console.log(`✅ Frontend: Found ${response.data?.length || 0} admin groups`);
      return response.data || [];
    } catch (error: any) {
      console.error('❌ Frontend: Error getting admin groups:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  },

  getAdminUsers: async (skip = 0, limit = 100, search?: string): Promise<User[]> => {
    try {
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: limit.toString(),
      });
      if (search) {
        params.append('search', search);
      }
      console.log('🔍 Frontend: Getting admin users');
      const response = await authClient.get<User[]>(`/api/admin/users?${params}`);
      console.log(`✅ Frontend: Found ${response.data?.length || 0} admin users`);
      return response.data || [];
    } catch (error: any) {
      console.error('❌ Frontend: Error getting admin users:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  },
};