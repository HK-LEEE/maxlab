// OIDC Standard Claims interface
export interface OIDCClaims {
  // Core claims
  sub: string;              // Subject identifier
  name?: string;            // Full name
  given_name?: string;      // Given name
  family_name?: string;     // Family name
  email?: string;           // Email address
  email_verified?: boolean; // Email verification status
  locale?: string;          // User's locale
  zoneinfo?: string;        // User's timezone
  updated_at?: number;      // Last update timestamp
  
  // Custom claims
  groups?: string[];        // User groups
  role?: string;            // User role
  is_admin?: boolean;       // Admin status
}

// MAX Platform Enhanced Claims
export interface MAXPlatformClaims extends OIDCClaims {
  // Group information
  group_id?: string;        // Primary group ID
  group_name?: string;      // Primary group name
  
  // Role information
  role_id?: string;         // Role ID
  role_name?: string;       // Role name
  
  // Permission information
  permissions?: string[];   // Detailed permissions list
  
  // Additional information
  department?: string;      // Department
  position?: string;        // Position/Title
  employee_id?: string;     // Employee ID
  
  // Authentication metadata
  auth_time?: number;       // Time of authentication
  acr?: string;             // Authentication Context Class Reference
  amr?: string[];           // Authentication Methods References
}

export interface User {
  // Primary identifiers
  id?: string;
  user_id?: string; // Some APIs might use user_id
  
  // OIDC standard fields
  sub?: string;              // OIDC subject identifier
  name?: string;             // OIDC name claim
  given_name?: string;       // OIDC given name
  family_name?: string;      // OIDC family name
  email: string;
  email_verified?: boolean;  // OIDC email verification
  locale?: string;           // OIDC locale
  zoneinfo?: string;         // OIDC timezone
  
  // Legacy fields for compatibility
  username?: string;
  full_name?: string;
  real_name?: string;
  display_name?: string;
  
  // Authorization fields
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
  id_token?: string;        // OIDC ID Token
  token_type: string;
  expires_in?: number;
  scope?: string;           // OAuth scopes
  user: User;
}

export interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token: string;
  refresh_expires_in: number;
  id_token?: string;        // New ID Token on refresh
}

export enum TokenRefreshError {
  REFRESH_TOKEN_EXPIRED = 'refresh_token_expired',
  REFRESH_TOKEN_INVALID = 'refresh_token_invalid',
  NETWORK_ERROR = 'network_error',
  SILENT_AUTH_FAILED = 'silent_auth_failed',
  SERVER_ERROR = 'server_error',
  OAUTH_CALLBACK_ERROR = 'oauth_callback_error',
  ID_TOKEN_INVALID = 'id_token_invalid',
  NONCE_MISMATCH = 'nonce_mismatch'
}