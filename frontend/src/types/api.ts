// MAX Lab API Response Types
// Auto-generated from Python Pydantic models

export interface ErrorResponse {
  error: ErrorDetail;
}

export interface ErrorDetail {
  code: string;
  title: string;
  message: string;
  user_action: UserAction;
  user_action_message: string;
  severity: ErrorSeverity;
  timestamp: number;
  request_id: string;
  language: string;
  details?: Record<string, any>;
  context?: Record<string, any>;
  help_url?: string;
  correlation_id?: string;
}

export interface SuccessResponse<T = any> {
  data: T;
  message?: string;
  timestamp: number;
  request_id: string;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: Pagination;
  message?: string;
  timestamp: number;
  request_id: string;
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ValidationErrorResponse {
  error: ValidationErrorDetail;
}

export interface ValidationErrorDetail extends ErrorDetail {
  validation_errors: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
  value?: any;
  constraint?: string;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: number;
  version: string;
  uptime: number;
  dependencies: Record<string, DependencyStatus>;
}

export interface DependencyStatus {
  status: string;
  response_time_ms?: number;
  last_check: number;
  error_message?: string;
}

// Enums
export enum UserAction {
  LOGIN_REQUIRED = "login_required",
  RETRY_ALLOWED = "retry_allowed", 
  CONTACT_SUPPORT = "contact_support",
  NO_ACTION = "no_action",
  CHECK_CONFIGURATION = "check_configuration",
  WAIT_AND_RETRY = "wait_and_retry"
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium", 
  HIGH = "high",
  CRITICAL = "critical"
}

export enum SupportedLanguage {
  KOREAN = "ko",
  ENGLISH = "en",
  JAPANESE = "ja", 
  CHINESE = "zh"
}

// Error Code Constants
export const ERROR_CODES = {
  // Authentication Errors
  AUTH_001: "AUTH_001",
  AUTH_002: "AUTH_002", 
  AUTH_003: "AUTH_003",
  AUTH_004: "AUTH_004",
  AUTH_005: "AUTH_005",
  
  // Authorization Errors
  PERM_001: "PERM_001",
  PERM_002: "PERM_002",
  PERM_003: "PERM_003",
  
  // Connection Errors
  CONN_001: "CONN_001",
  CONN_002: "CONN_002",
  CONN_003: "CONN_003",
  CONN_004: "CONN_004",
  
  // Configuration Errors
  CONFIG_001: "CONFIG_001",
  CONFIG_002: "CONFIG_002",
  CONFIG_003: "CONFIG_003",
  
  // Validation Errors
  VALID_001: "VALID_001",
  VALID_002: "VALID_002",
  
  // System Errors
  SYS_001: "SYS_001",
  SYS_002: "SYS_002"
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// Type Guards
export function isErrorResponse(response: any): response is ErrorResponse {
  return response && typeof response === 'object' && 'error' in response;
}

export function isSuccessResponse<T>(response: any): response is SuccessResponse<T> {
  return response && typeof response === 'object' && 'data' in response;
}

export function isPaginatedResponse<T>(response: any): response is PaginatedResponse<T> {
  return response && typeof response === 'object' && 'data' in response && 'pagination' in response;
}

export function isValidationErrorResponse(response: any): response is ValidationErrorResponse {
  return isErrorResponse(response) && 'validation_errors' in response.error;
}

// API Response Handler Utilities
export class ApiResponseHandler {
  static handleError(response: ErrorResponse): void {
    const { error } = response;
    
    console.error('API Error:', {
      code: error.code,
      message: error.message,
      severity: error.severity,
      requestId: error.request_id
    });
    
    // 심각도에 따른 처리
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        // 크리티컬 오류 처리 (예: 전체 시스템 오류 페이지)
        break;
      case ErrorSeverity.HIGH:
        // 높은 오류 처리 (예: 모달 표시)
        break;
      case ErrorSeverity.MEDIUM:
        // 중간 오류 처리 (예: 토스트 알림)
        break;
      case ErrorSeverity.LOW:
        // 낮은 오류 처리 (예: 인라인 메시지)
        break;
    }
  }
  
  static getUserActionText(action: UserAction, language: SupportedLanguage = SupportedLanguage.ENGLISH): string {
    const actionTexts = {
      [UserAction.LOGIN_REQUIRED]: {
        [SupportedLanguage.KOREAN]: "다시 로그인해 주세요",
        [SupportedLanguage.ENGLISH]: "Please log in again",
        [SupportedLanguage.JAPANESE]: "再度ログインしてください",
        [SupportedLanguage.CHINESE]: "请重新登录"
      },
      [UserAction.RETRY_ALLOWED]: {
        [SupportedLanguage.KOREAN]: "다시 시도해 주세요",
        [SupportedLanguage.ENGLISH]: "Please try again",
        [SupportedLanguage.JAPANESE]: "再度お試しください",
        [SupportedLanguage.CHINESE]: "请重试"
      },
      [UserAction.CONTACT_SUPPORT]: {
        [SupportedLanguage.KOREAN]: "지원팀에 문의해 주세요",
        [SupportedLanguage.ENGLISH]: "Please contact support",
        [SupportedLanguage.JAPANESE]: "サポートにお問い合わせください",
        [SupportedLanguage.CHINESE]: "请联系支持"
      },
      [UserAction.WAIT_AND_RETRY]: {
        [SupportedLanguage.KOREAN]: "잠시 후 다시 시도해 주세요",
        [SupportedLanguage.ENGLISH]: "Please wait and try again",
        [SupportedLanguage.JAPANESE]: "しばらくしてから再度お試しください",
        [SupportedLanguage.CHINESE]: "请稍后再试"
      },
      [UserAction.CHECK_CONFIGURATION]: {
        [SupportedLanguage.KOREAN]: "설정을 확인해 주세요",
        [SupportedLanguage.ENGLISH]: "Please check configuration",
        [SupportedLanguage.JAPANESE]: "設定を確認してください",
        [SupportedLanguage.CHINESE]: "请检查配置"
      },
      [UserAction.NO_ACTION]: {
        [SupportedLanguage.KOREAN]: "",
        [SupportedLanguage.ENGLISH]: "",
        [SupportedLanguage.JAPANESE]: "",
        [SupportedLanguage.CHINESE]: ""
      }
    };
    
    return actionTexts[action]?.[language] || actionTexts[action]?.[SupportedLanguage.ENGLISH] || "";
  }
}

// OpenAPI/Swagger schema export for documentation
export const API_SCHEMAS = {
  ErrorResponse: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "title", "message", "user_action", "user_action_message", "severity", "timestamp", "request_id", "language"],
        properties: {
          code: { type: "string", example: "AUTH_001" },
          title: { type: "string", example: "Invalid Token Format" },
          message: { type: "string", example: "Your session appears to be invalid. Please log in again." },
          user_action: { type: "string", enum: Object.values(UserAction) },
          user_action_message: { type: "string", example: "Please log in again." },
          severity: { type: "string", enum: Object.values(ErrorSeverity) },
          timestamp: { type: "integer", example: 1642684200 },
          request_id: { type: "string", format: "uuid" },
          language: { type: "string", enum: Object.values(SupportedLanguage) },
          details: { type: "object" },
          context: { type: "object" },
          help_url: { type: "string", format: "uri" },
          correlation_id: { type: "string", format: "uuid" }
        }
      }
    }
  },
  SuccessResponse: {
    type: "object",
    required: ["data", "timestamp", "request_id"],
    properties: {
      data: { type: "object" },
      message: { type: "string" },
      timestamp: { type: "integer" },
      request_id: { type: "string", format: "uuid" }
    }
  }
};