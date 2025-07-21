"""
MAX Lab API 응답 스키마 정의
표준화된 API 응답 구조와 Pydantic 모델을 제공합니다.
"""
from typing import Dict, Any, Optional, Union, List
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

from .error_codes import UserAction, ErrorSeverity


class ErrorResponseSchema(BaseModel):
    """표준 오류 응답 스키마"""
    
    error: 'ErrorDetailSchema'
    
    class Config:
        schema_extra = {
            "example": {
                "error": {
                    "code": "AUTH_001",
                    "title": "Invalid Token Format",
                    "message": "Your session appears to be invalid. Please log in again.",
                    "user_action": "login_required",
                    "user_action_message": "Please log in again.",
                    "severity": "medium",
                    "timestamp": 1642684200,
                    "request_id": "550e8400-e29b-41d4-a716-446655440000",
                    "language": "en",
                    "details": {
                        "field": "token",
                        "reason": "malformed"
                    },
                    "context": {
                        "endpoint": "/api/v1/workspaces",
                        "method": "GET"
                    },
                    "help_url": "https://docs.maxlab.com/errors/AUTH_001"
                }
            }
        }


class ErrorDetailSchema(BaseModel):
    """오류 세부 정보 스키마"""
    
    code: str = Field(..., description="고유 오류 코드 (예: AUTH_001)")
    title: str = Field(..., description="오류 제목")
    message: str = Field(..., description="사용자 친화적 오류 메시지")
    user_action: str = Field(..., description="권장 사용자 액션")
    user_action_message: str = Field(..., description="액션 메시지")
    severity: str = Field(..., description="오류 심각도")
    timestamp: int = Field(..., description="오류 발생 시간 (Unix timestamp)")
    request_id: str = Field(..., description="요청 추적 ID")
    language: str = Field(default="en", description="응답 언어 코드")
    
    # 선택적 필드
    details: Optional[Dict[str, Any]] = Field(None, description="추가 오류 세부 정보")
    context: Optional[Dict[str, Any]] = Field(None, description="오류 발생 컨텍스트")
    help_url: Optional[str] = Field(None, description="도움말 URL")
    correlation_id: Optional[str] = Field(None, description="분산 추적 ID")
    
    class Config:
        use_enum_values = True


class SuccessResponseSchema(BaseModel):
    """표준 성공 응답 스키마"""
    
    data: Any = Field(..., description="응답 데이터")
    message: Optional[str] = Field(None, description="성공 메시지")
    timestamp: int = Field(..., description="응답 시간 (Unix timestamp)")
    request_id: str = Field(..., description="요청 추적 ID")
    
    class Config:
        schema_extra = {
            "example": {
                "data": {"id": 1, "name": "example"},
                "message": "Operation completed successfully",
                "timestamp": 1642684200,
                "request_id": "550e8400-e29b-41d4-a716-446655440000"
            }
        }


class PaginatedResponseSchema(BaseModel):
    """페이지네이션 응답 스키마"""
    
    data: List[Any] = Field(..., description="데이터 목록")
    pagination: 'PaginationSchema' = Field(..., description="페이지네이션 정보")
    message: Optional[str] = Field(None, description="응답 메시지")
    timestamp: int = Field(..., description="응답 시간")
    request_id: str = Field(..., description="요청 추적 ID")


class PaginationSchema(BaseModel):
    """페이지네이션 정보 스키마"""
    
    page: int = Field(..., description="현재 페이지")
    per_page: int = Field(..., description="페이지당 항목 수")
    total: int = Field(..., description="전체 항목 수")
    total_pages: int = Field(..., description="전체 페이지 수")
    has_next: bool = Field(..., description="다음 페이지 존재 여부")
    has_prev: bool = Field(..., description="이전 페이지 존재 여부")


class ValidationErrorSchema(BaseModel):
    """유효성 검사 오류 스키마"""
    
    error: 'ValidationErrorDetailSchema'
    
    class Config:
        schema_extra = {
            "example": {
                "error": {
                    "code": "VALID_001",
                    "title": "Validation Error",
                    "message": "The provided data is invalid",
                    "user_action": "check_input",
                    "user_action_message": "Please check your input and try again",
                    "severity": "medium",
                    "timestamp": 1642684200,
                    "request_id": "550e8400-e29b-41d4-a716-446655440000",
                    "language": "en",
                    "validation_errors": [
                        {
                            "field": "email",
                            "message": "Invalid email format",
                            "value": "invalid-email"
                        }
                    ]
                }
            }
        }


class ValidationErrorDetailSchema(ErrorDetailSchema):
    """유효성 검사 오류 세부 정보"""
    
    validation_errors: List['FieldErrorSchema'] = Field(..., description="필드별 오류 목록")


class FieldErrorSchema(BaseModel):
    """필드 오류 스키마"""
    
    field: str = Field(..., description="오류 발생 필드명")
    message: str = Field(..., description="필드 오류 메시지")
    value: Optional[Any] = Field(None, description="제공된 값 (민감하지 않은 경우만)")
    constraint: Optional[str] = Field(None, description="위반된 제약조건")


class HealthCheckResponseSchema(BaseModel):
    """헬스체크 응답 스키마"""
    
    status: str = Field(..., description="서비스 상태")
    timestamp: int = Field(..., description="체크 시간")
    version: str = Field(..., description="애플리케이션 버전")
    uptime: float = Field(..., description="가동 시간 (초)")
    dependencies: Dict[str, 'DependencyStatusSchema'] = Field(..., description="의존성 상태")
    
    class Config:
        schema_extra = {
            "example": {
                "status": "healthy",
                "timestamp": 1642684200,
                "version": "1.0.0",
                "uptime": 3600.5,
                "dependencies": {
                    "database": {
                        "status": "healthy",
                        "response_time_ms": 15.2,
                        "last_check": 1642684200
                    },
                    "oauth_service": {
                        "status": "healthy",
                        "response_time_ms": 45.8,
                        "last_check": 1642684195
                    }
                }
            }
        }


class DependencyStatusSchema(BaseModel):
    """의존성 상태 스키마"""
    
    status: str = Field(..., description="의존성 상태")
    response_time_ms: Optional[float] = Field(None, description="응답 시간 (밀리초)")
    last_check: int = Field(..., description="마지막 체크 시간")
    error_message: Optional[str] = Field(None, description="오류 메시지 (실패시)")


# TypeScript 인터페이스 생성을 위한 유틸리티
def generate_typescript_interfaces() -> str:
    """TypeScript 인터페이스 코드 생성"""
    
    typescript_code = '''
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
'''
    
    return typescript_code


# 응답 스키마 업데이트를 위한 Forward reference 해결
ErrorResponseSchema.model_rebuild()
ValidationErrorSchema.model_rebuild()
PaginatedResponseSchema.model_rebuild()
HealthCheckResponseSchema.model_rebuild()