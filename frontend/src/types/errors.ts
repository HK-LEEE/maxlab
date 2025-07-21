/**
 * Error type definitions for authentication error handling
 */

// Error code definitions matching backend
export interface ErrorCodeDefinition {
  code: string;
  category: 'AUTH' | 'PERM' | 'CONN' | 'CONFIG' | 'VALID' | 'SYS';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userAction: 'login_required' | 'retry_allowed' | 'contact_support' | 'wait_and_retry' | 'no_action';
  httpStatus: number;
}

export interface AuthErrorData {
  error_code: string;
  error_title: string;
  user_message: string;
  user_action: string;
  severity: string;
  category: string;
  request_id?: string;
  additional_details?: Record<string, any>;
}

export type ErrorCategory = 'AUTH' | 'PERM' | 'CONN' | 'CONFIG' | 'VALID' | 'SYS';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type UserAction = 'login_required' | 'retry_allowed' | 'contact_support' | 'wait_and_retry' | 'no_action';