"""
MAX Lab 오류 시스템 통합
기존 시스템과의 통합 및 마이그레이션을 위한 유틸리티입니다.
"""
import logging
from typing import Dict, Any, Optional, Union
from fastapi import Request

from .exceptions import (
    MaxLabException, ErrorFactory, AuthenticationException,
    AuthorizationException, ConnectionException, ConfigurationException,
    ValidationException, SystemException
)
from .error_codes import MaxLabErrorCodes
from .language_detection import detect_language_comprehensive

logger = logging.getLogger(__name__)


class ErrorSystemIntegrator:
    """오류 시스템 통합기"""
    
    @staticmethod
    def migrate_legacy_authentication_error(
        legacy_error: Exception,
        request: Optional[Request] = None,
        request_id: Optional[str] = None
    ) -> AuthenticationException:
        """레거시 AuthenticationError를 새 시스템으로 마이그레이션"""
        
        language = "en"
        if request:
            language = detect_language_comprehensive(request)
        
        # 오류 메시지 기반으로 적절한 오류 코드 결정
        detail = str(getattr(legacy_error, 'detail', str(legacy_error))).lower()
        
        if "expired" in detail or "expire" in detail:
            error_code = "AUTH_002"
        elif "invalid" in detail or "malformed" in detail:
            error_code = "AUTH_001"
        elif "missing" in detail or "authorization" in detail:
            error_code = "AUTH_004"
        elif "revoked" in detail or "blacklisted" in detail:
            error_code = "AUTH_005"
        else:
            error_code = "AUTH_003"  # 기본값
        
        return ErrorFactory.create_auth_error(
            error_code,
            request_id,
            additional_details={"legacy_detail": getattr(legacy_error, 'detail', str(legacy_error))},
            context={"migrated_from": "legacy_authentication_error"}
        )
    
    @staticmethod
    def convert_oauth_server_error(
        status_code: int,
        response_text: str,
        request: Optional[Request] = None,
        request_id: Optional[str] = None
    ) -> Union[AuthenticationException, ConnectionException, SystemException]:
        """OAuth 서버 오류를 적절한 MAX Lab 예외로 변환"""
        
        language = "en"
        if request:
            language = detect_language_comprehensive(request)
        
        context = {
            "oauth_status_code": status_code,
            "oauth_response": response_text[:200]  # 응답 텍스트 일부만
        }
        
        if status_code == 401:
            return ErrorFactory.create_auth_error(
                "AUTH_003", request_id, context=context
            )
        elif status_code == 403:
            return ErrorFactory.create_permission_error(
                "PERM_001", request_id, context=context
            )
        elif status_code == 404:
            return ErrorFactory.create_connection_error(
                "CONN_001", request_id, context=context
            )
        elif status_code >= 500:
            return ErrorFactory.create_connection_error(
                "CONN_001", request_id, context=context
            )
        else:
            return ErrorFactory.create_system_error(
                "SYS_001", request_id, context=context
            )
    
    @staticmethod
    def convert_validation_errors(
        validation_errors: list,
        request: Optional[Request] = None,
        request_id: Optional[str] = None
    ) -> ValidationException:
        """Pydantic 검증 오류를 MAX Lab 예외로 변환"""
        
        language = "en"
        if request:
            language = detect_language_comprehensive(request)
        
        formatted_errors = []
        for error in validation_errors:
            formatted_errors.append({
                "field": ".".join(str(loc) for loc in error.get("loc", [])),
                "message": error.get("msg", "Invalid value"),
                "type": error.get("type", "validation_error"),
                "input": str(error.get("input", ""))[:100]  # 입력값 일부만
            })
        
        return ErrorFactory.create_validation_error(
            "VALID_001",
            request_id,
            additional_details={"validation_errors": formatted_errors},
            context={"error_count": len(validation_errors)}
        )
    
    @staticmethod
    def handle_database_error(
        db_error: Exception,
        request: Optional[Request] = None,
        request_id: Optional[str] = None
    ) -> SystemException:
        """데이터베이스 오류 처리"""
        
        language = "en"
        if request:
            language = detect_language_comprehensive(request)
        
        error_type = type(db_error).__name__
        error_message = str(db_error)
        
        # 민감한 정보 제거
        sanitized_message = error_message[:100]  # 길이 제한
        
        # 데이터베이스 오류 유형별 분류
        if "connection" in error_message.lower():
            return ErrorFactory.create_connection_error(
                "CONN_003",
                request_id,
                additional_details={"db_error_type": error_type},
                context={"database_error": True}
            )
        else:
            return ErrorFactory.create_system_error(
                "SYS_001",
                request_id,
                additional_details={
                    "db_error_type": error_type,
                    "sanitized_message": sanitized_message
                },
                context={"database_error": True}
            )


class ErrorMetricsCollector:
    """오류 메트릭 수집기"""
    
    def __init__(self):
        self.error_counts = {}
        self.error_rates = {}
    
    def record_error(self, error_code: str, severity: str):
        """오류 기록"""
        if error_code not in self.error_counts:
            self.error_counts[error_code] = 0
        self.error_counts[error_code] += 1
        
        # 심각도별 카운트
        severity_key = f"{error_code}_{severity}"
        if severity_key not in self.error_counts:
            self.error_counts[severity_key] = 0
        self.error_counts[severity_key] += 1
    
    def get_error_summary(self) -> Dict[str, Any]:
        """오류 요약 통계"""
        total_errors = sum(self.error_counts.values())
        
        # 카테고리별 집계
        categories = {}
        for error_code, count in self.error_counts.items():
            if "_" in error_code:
                category = error_code.split("_")[0]
                if category not in categories:
                    categories[category] = 0
                categories[category] += count
        
        return {
            "total_errors": total_errors,
            "by_category": categories,
            "by_code": self.error_counts,
            "top_errors": sorted(
                self.error_counts.items(), 
                key=lambda x: x[1], 
                reverse=True
            )[:10]
        }


# 전역 통합기 및 메트릭 수집기 인스턴스
error_integrator = ErrorSystemIntegrator()
error_metrics = ErrorMetricsCollector()


def create_structured_error_response(
    error_code: str,
    request: Optional[Request] = None,
    request_id: Optional[str] = None,
    additional_details: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None
) -> MaxLabException:
    """구조화된 오류 응답 생성 (편의 함수)"""
    
    language = "en"
    if request:
        language = detect_language_comprehensive(request)
    
    # 오류 코드 정의 확인
    error_definition = MaxLabErrorCodes.get_by_code(error_code)
    if not error_definition:
        logger.error(f"Unknown error code: {error_code}")
        error_code = "SYS_001"  # 기본값으로 fallback
        error_definition = MaxLabErrorCodes.get_by_code(error_code)
    
    # 카테고리별 적절한 예외 타입 생성
    category = error_definition.category.value
    
    if category == "AUTH":
        exception = ErrorFactory.create_auth_error(
            error_code, request_id, additional_details, context
        )
    elif category == "PERM":
        exception = ErrorFactory.create_permission_error(
            error_code, request_id, additional_details, context
        )
    elif category == "CONN":
        exception = ErrorFactory.create_connection_error(
            error_code, request_id, additional_details, context
        )
    elif category == "CONFIG":
        exception = ErrorFactory.create_config_error(
            error_code, request_id, additional_details, context
        )
    elif category == "VALID":
        exception = ErrorFactory.create_validation_error(
            error_code, request_id, additional_details, context
        )
    else:  # SYS
        exception = ErrorFactory.create_system_error(
            error_code, request_id, additional_details, context
        )
    
    exception.language = language
    
    # 메트릭 기록
    error_metrics.record_error(error_code, error_definition.severity.value)
    
    return exception


def get_error_help_url(error_code: str) -> Optional[str]:
    """오류 코드에 대한 도움말 URL 생성"""
    base_url = "https://docs.maxlab.com/errors"
    return f"{base_url}/{error_code}"


def format_error_for_logging(exception: MaxLabException) -> Dict[str, Any]:
    """로깅용 오류 정보 포맷팅"""
    return {
        "error_code": exception.error_definition.code,
        "error_title": exception.error_definition.title,
        "severity": exception.error_definition.severity.value,
        "category": exception.error_definition.category.value,
        "user_action": exception.error_definition.user_action.value,
        "request_id": exception.request_id,
        "language": getattr(exception, 'language', 'en'),
        "timestamp": exception.timestamp,
        "has_additional_details": bool(exception.additional_details),
        "has_context": bool(exception.context)
    }