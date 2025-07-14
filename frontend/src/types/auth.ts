export interface User {
  id?: string;
  user_id?: string; // Some APIs might use user_id
  email: string;
  username?: string;
  full_name?: string;
  real_name?: string;
  display_name?: string;
  is_admin: boolean;
  is_active?: boolean;
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

export interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token: string;
  refresh_expires_in: number;
}

export enum TokenRefreshError {
  REFRESH_TOKEN_EXPIRED = 'refresh_token_expired',
  REFRESH_TOKEN_INVALID = 'refresh_token_invalid',
  NETWORK_ERROR = 'network_error',
  SILENT_AUTH_FAILED = 'silent_auth_failed',
  SERVER_ERROR = 'server_error',
  OAUTH_CALLBACK_ERROR = 'oauth_callback_error'
}