"""
MAX Lab 구조화된 예외 시스템
오류 코드 기반의 일관된 예외 처리 및 응답 생성을 제공합니다.
"""
from typing import Dict, Any, Optional, List
import uuid
import time
import logging
from fastapi import HTTPException, status

from .error_codes import MaxLabErrorCodes, ErrorCodeDefinition, UserAction
from .error_messages import get_localized_error_message, get_localized_action_message

logger = logging.getLogger(__name__)


class MaxLabException(HTTPException):
    """MAX Lab 구조화된 예외 기본 클래스"""
    
    def __init__(
        self,
        error_definition: ErrorCodeDefinition,
        request_id: Optional[str] = None,
        additional_details: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
        language: str = "en"
    ):
        self.error_definition = error_definition
        self.request_id = request_id or str(uuid.uuid4())
        self.additional_details = additional_details or {}
        self.context = context or {}
        self.language = language
        self.timestamp = time.time()
        
        # FastAPI HTTPException 초기화
        super().__init__(
            status_code=error_definition.http_status,
            detail=self._create_error_response()
        )
    
    def _create_error_response(self) -> Dict[str, Any]:
        """구조화된 오류 응답 생성"""
        # 지역화된 메시지 사용
        localized_message = get_localized_error_message(
            self.error_definition.code, 
            self.language,
            **self.additional_details
        )
        
        localized_action = get_localized_action_message(
            self.error_definition.user_action.value,
            self.language
        )
        
        response = {
            "error": {
                "code": self.error_definition.code,
                "title": self.error_definition.title,
                "message": localized_message,
                "user_action": self.error_definition.user_action.value,
                "user_action_message": localized_action,
                "severity": self.error_definition.severity.value,
                "timestamp": int(self.timestamp),
                "request_id": self.request_id,
                "language": self.language
            }
        }
        
        # 추가 세부 정보가 있는 경우 포함
        if self.additional_details:
            response["error"]["details"] = self.additional_details
        
        # 컨텍스트 정보 (디버그용, 프로덕션에서는 제한적으로 노출)
        if self.context:
            response["error"]["context"] = self._sanitize_context(self.context)
        
        return response
    
    def _sanitize_context(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """민감한 정보를 제거한 컨텍스트 반환"""
        sensitive_keys = {
            'password', 'token', 'secret', 'key', 'auth', 'credential',
            'service_token', 'oauth_token', 'jwt', 'session'
        }
        
        sanitized = {}
        for key, value in context.items():
            key_lower = key.lower()
            if any(sensitive in key_lower for sensitive in sensitive_keys):
                sanitized[key] = "[REDACTED]"
            else:
                sanitized[key] = str(value)[:100]  # 길이 제한
        
        return sanitized
    
    def log_error(self, logger_instance: Optional[logging.Logger] = None):
        """오류 로깅"""
        log = logger_instance or logger
        
        log_message = (
            f"MAX Lab Error [{self.error_definition.code}]: "
            f"{self.error_definition.title} | "
            f"Request ID: {self.request_id}"
        )
        
        extra_info = {
            "error_code": self.error_definition.code,
            "request_id": self.request_id,
            "severity": self.error_definition.severity.value,
            "category": self.error_definition.category.value
        }
        
        if self.error_definition.severity.value in ['high', 'critical']:
            log.error(log_message, extra=extra_info)
        elif self.error_definition.severity.value == 'medium':
            log.warning(log_message, extra=extra_info)
        else:
            log.info(log_message, extra=extra_info)


class AuthenticationException(MaxLabException):
    """인증 관련 예외"""
    pass


class AuthorizationException(MaxLabException):
    """권한 관련 예외"""
    pass


class ConnectionException(MaxLabException):
    """연결 관련 예외"""
    pass


class ConfigurationException(MaxLabException):
    """설정 관련 예외"""
    pass


class ValidationException(MaxLabException):
    """검증 관련 예외"""
    pass


class SystemException(MaxLabException):
    """시스템 관련 예외"""
    pass


class ErrorFactory:
    """오류 생성 팩토리"""
    
    @staticmethod
    def create_auth_error(
        error_code: str,
        request_id: Optional[str] = None,
        additional_details: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> AuthenticationException:
        """인증 오류 생성"""
        error_def = MaxLabErrorCodes.get_by_code(error_code)
        if not error_def:
            # Fallback to generic auth error
            error_def = MaxLabErrorCodes.AUTH_003
            
        return AuthenticationException(
            error_definition=error_def,
            request_id=request_id,
            additional_details=additional_details,
            context=context
        )
    
    @staticmethod
    def create_permission_error(
        error_code: str,
        request_id: Optional[str] = None,
        additional_details: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> AuthorizationException:
        """권한 오류 생성"""
        error_def = MaxLabErrorCodes.get_by_code(error_code)
        if not error_def:
            # Fallback to generic permission error
            error_def = MaxLabErrorCodes.PERM_001
            
        return AuthorizationException(
            error_definition=error_def,
            request_id=request_id,
            additional_details=additional_details,
            context=context
        )
    
    @staticmethod
    def create_connection_error(
        error_code: str,
        request_id: Optional[str] = None,
        additional_details: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> ConnectionException:
        """연결 오류 생성"""
        error_def = MaxLabErrorCodes.get_by_code(error_code)
        if not error_def:
            # Fallback to generic connection error
            error_def = MaxLabErrorCodes.CONN_001
            
        return ConnectionException(
            error_definition=error_def,
            request_id=request_id,
            additional_details=additional_details,
            context=context
        )
    
    @staticmethod
    def create_config_error(
        error_code: str,
        request_id: Optional[str] = None,
        additional_details: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> ConfigurationException:
        """설정 오류 생성"""
        error_def = MaxLabErrorCodes.get_by_code(error_code)
        if not error_def:
            # Fallback to generic config error
            error_def = MaxLabErrorCodes.CONFIG_002
            
        return ConfigurationException(
            error_definition=error_def,
            request_id=request_id,
            additional_details=additional_details,
            context=context
        )
    
    @staticmethod
    def create_validation_error(
        error_code: str,
        request_id: Optional[str] = None,
        additional_details: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> ValidationException:
        """검증 오류 생성"""
        error_def = MaxLabErrorCodes.get_by_code(error_code)
        if not error_def:
            # Fallback to generic validation error
            error_def = MaxLabErrorCodes.VALID_001
            
        return ValidationException(
            error_definition=error_def,
            request_id=request_id,
            additional_details=additional_details,
            context=context
        )
    
    @staticmethod
    def create_system_error(
        error_code: str,
        request_id: Optional[str] = None,
        additional_details: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> SystemException:
        """시스템 오류 생성"""
        error_def = MaxLabErrorCodes.get_by_code(error_code)
        if not error_def:
            # Fallback to generic system error
            error_def = MaxLabErrorCodes.SYS_001
            
        return SystemException(
            error_definition=error_def,
            request_id=request_id,
            additional_details=additional_details,
            context=context
        )


def handle_oauth_error(error: Exception, request_id: Optional[str] = None) -> MaxLabException:
    """OAuth 관련 오류를 구조화된 오류로 변환"""
    import httpx
    
    if isinstance(error, httpx.TimeoutException):
        return ErrorFactory.create_connection_error(
            "CONN_002",
            request_id=request_id,
            context={"original_error": str(error)}
        )
    elif isinstance(error, httpx.ConnectError):
        return ErrorFactory.create_connection_error(
            "CONN_001", 
            request_id=request_id,
            context={"original_error": str(error)}
        )
    elif isinstance(error, httpx.HTTPStatusError):
        if error.response.status_code == 401:
            return ErrorFactory.create_auth_error(
                "AUTH_003",
                request_id=request_id,
                context={"status_code": error.response.status_code}
            )
        elif error.response.status_code == 403:
            return ErrorFactory.create_permission_error(
                "PERM_001",
                request_id=request_id,
                context={"status_code": error.response.status_code}
            )
        elif error.response.status_code >= 500:
            return ErrorFactory.create_connection_error(
                "CONN_001",
                request_id=request_id,
                context={"status_code": error.response.status_code}
            )
    elif isinstance(error, (ValueError, KeyError)):
        return ErrorFactory.create_validation_error(
            "VALID_001",
            request_id=request_id,
            context={"original_error": str(error)}
        )
    
    # Default fallback
    return ErrorFactory.create_system_error(
        "SYS_001",
        request_id=request_id,
        context={"original_error": str(error)}
    )


def handle_service_token_error(error: ValueError, request_id: Optional[str] = None) -> ConfigurationException:
    """SERVICE_TOKEN 관련 오류 처리"""
    error_message = str(error).lower()
    
    if "not configured" in error_message or "missing" in error_message:
        return ErrorFactory.create_config_error(
            "CONFIG_001",
            request_id=request_id,
            context={"original_error": str(error)}
        )
    elif "invalid" in error_message or "too short" in error_message:
        return ErrorFactory.create_config_error(
            "CONFIG_003",
            request_id=request_id,
            context={"original_error": str(error)}
        )
    
    # Generic config error
    return ErrorFactory.create_config_error(
        "CONFIG_002",
        request_id=request_id,
        context={"original_error": str(error)}
    )