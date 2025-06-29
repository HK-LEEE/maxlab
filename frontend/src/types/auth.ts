export interface User {
  id?: string;
  user_id?: string; // Some APIs might use user_id
  email: string;
  real_name?: string;
  display_name?: string;
  is_admin: boolean;
  role?: string; // 'admin' or 'user'
  is_verified?: boolean;
  approval_status?: string;
  groups?: string[];
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  user: User;
}