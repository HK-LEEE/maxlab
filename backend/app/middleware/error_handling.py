"""
MAX Lab 오류 처리 미들웨어
일관된 오류 응답과 로깅을 제공하는 FastAPI 미들웨어입니다.
"""
import time
import uuid
import logging
import traceback
from typing import Dict, Any, Optional
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.exceptions import HTTPException

from ..core.exceptions import (
    MaxLabException, ErrorFactory, handle_oauth_error, 
    handle_service_token_error
)
from ..core.language_detection import detect_language_comprehensive
from ..core.response_schemas import ErrorResponseSchema
from ..core.schema_validation import validate_api_response

logger = logging.getLogger(__name__)


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """오류 처리 미들웨어"""
    
    def __init__(self, app, capture_body: bool = False, max_body_size: int = 1024):
        super().__init__(app)
        self.capture_body = capture_body
        self.max_body_size = max_body_size
        
    async def dispatch(self, request: Request, call_next):
        """요청 처리 및 오류 캐치"""
        request_id = str(uuid.uuid4())
        start_time = time.time()
        
        # 요청 컨텍스트 정보 수집
        request_context = await self._collect_request_context(request, request_id)
        
        # 사용자 언어 감지
        language = detect_language_comprehensive(request)
        
        try:
            # 정상 처리
            response = await call_next(request)
            
            # 성공적인 요청 로깅
            duration_ms = (time.time() - start_time) * 1000
            self._log_request_success(request_context, duration_ms, response.status_code)
            
            return response
            
        except MaxLabException as e:
            # 구조화된 MAX Lab 예외 처리
            return await self._handle_maxlab_exception(
                e, request_context, language, start_time
            )
            
        except HTTPException as e:
            # FastAPI HTTP 예외 처리
            return await self._handle_http_exception(
                e, request_context, language, start_time
            )
            
        except ValueError as e:
            # SERVICE_TOKEN 관련 오류 처리
            if "SERVICE_TOKEN" in str(e) or "token" in str(e).lower():
                config_error = handle_service_token_error(e, request_id)
                config_error.language = language
                return await self._handle_maxlab_exception(
                    config_error, request_context, language, start_time
                )
            
            # 일반 ValueError
            system_error = ErrorFactory.create_validation_error(
                "VALID_001", request_id, context={"original_error": str(e)}
            )
            system_error.language = language
            return await self._handle_maxlab_exception(
                system_error, request_context, language, start_time
            )
            
        except Exception as e:
            # 예상치 못한 오류 처리
            return await self._handle_unexpected_exception(
                e, request_context, language, start_time, request_id
            )
    
    async def _collect_request_context(self, request: Request, request_id: str) -> Dict[str, Any]:
        """요청 컨텍스트 정보 수집"""
        context = {
            "request_id": request_id,
            "method": request.method,
            "url": str(request.url),
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "user_agent": request.headers.get("user-agent", ""),
            "client_ip": self._get_client_ip(request),
            "timestamp": time.time()
        }
        
        # 민감한 정보 제거
        context = self._sanitize_context(context)
        
        # 요청 본문 캡처 (옵션)
        if self.capture_body and request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
                if len(body) <= self.max_body_size:
                    context["body_size"] = len(body)
                else:
                    context["body_size"] = len(body)
                    context["body_truncated"] = True
            except Exception:
                context["body_capture_error"] = True
        
        return context
    
    def _get_client_ip(self, request: Request) -> str:
        """클라이언트 IP 주소 추출"""
        # X-Forwarded-For 헤더 확인 (프록시 환경)
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        # X-Real-IP 헤더 확인
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        
        # 직접 연결
        return request.client.host if request.client else "unknown"
    
    def _sanitize_context(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """민감한 정보 제거"""
        sensitive_keys = {
            'password', 'token', 'secret', 'key', 'auth', 'credential',
            'authorization', 'cookie', 'session'
        }
        
        sanitized = context.copy()
        
        # Query parameters 정화
        if "query_params" in sanitized:
            sanitized_params = {}
            for key, value in sanitized["query_params"].items():
                if any(sensitive in key.lower() for sensitive in sensitive_keys):
                    sanitized_params[key] = "[REDACTED]"
                else:
                    sanitized_params[key] = str(value)[:100]
            sanitized["query_params"] = sanitized_params
        
        return sanitized
    
    async def _handle_maxlab_exception(
        self, 
        exception: MaxLabException, 
        request_context: Dict[str, Any],
        language: str,
        start_time: float
    ) -> JSONResponse:
        """MAX Lab 예외 처리"""
        
        duration_ms = (time.time() - start_time) * 1000
        
        # 예외에 언어 설정
        if not hasattr(exception, 'language') or not exception.language:
            exception.language = language
        
        # 오류 로깅
        exception.log_error(logger)
        self._log_request_error(request_context, duration_ms, exception)
        
        # 응답 생성
        error_response = exception.detail
        
        # 스키마 검증
        if not validate_api_response(error_response, "error"):
            logger.error(f"Error response failed schema validation: {error_response}")
        
        # Add CORS headers to error response
        headers = {
            "X-Request-ID": exception.request_id,
            "X-Error-Code": exception.error_definition.code,
            "Access-Control-Allow-Origin": "*",  # This will be overridden by CORSMiddleware with proper origin
            "Access-Control-Allow-Credentials": "true"
        }
        
        return JSONResponse(
            status_code=exception.status_code,
            content=error_response,
            headers=headers
        )
    
    async def _handle_http_exception(
        self,
        exception: HTTPException,
        request_context: Dict[str, Any],
        language: str,
        start_time: float
    ) -> JSONResponse:
        """FastAPI HTTP 예외 처리"""
        
        duration_ms = (time.time() - start_time) * 1000
        request_id = request_context["request_id"]
        
        # HTTP 상태 코드에 따른 오류 코드 매핑
        error_code_mapping = {
            400: "VALID_001",
            401: "AUTH_001", 
            403: "PERM_001",
            404: "SYS_001",
            422: "VALID_001",
            500: "SYS_001",
            502: "CONN_001",
            503: "SYS_002",
            504: "CONN_002"
        }
        
        error_code = error_code_mapping.get(exception.status_code, "SYS_001")
        
        # MaxLabException으로 변환
        if exception.status_code in [401, 403]:
            maxlab_exception = ErrorFactory.create_auth_error(
                error_code, request_id, 
                additional_details={"original_detail": str(exception.detail)},
                context=request_context
            )
        elif exception.status_code in [400, 422]:
            maxlab_exception = ErrorFactory.create_validation_error(
                error_code, request_id,
                additional_details={"original_detail": str(exception.detail)},
                context=request_context
            )
        else:
            maxlab_exception = ErrorFactory.create_system_error(
                error_code, request_id,
                additional_details={"original_detail": str(exception.detail)},
                context=request_context
            )
        
        maxlab_exception.language = language
        
        return await self._handle_maxlab_exception(
            maxlab_exception, request_context, language, start_time
        )
    
    async def _handle_unexpected_exception(
        self,
        exception: Exception,
        request_context: Dict[str, Any], 
        language: str,
        start_time: float,
        request_id: str
    ) -> JSONResponse:
        """예상치 못한 예외 처리"""
        
        duration_ms = (time.time() - start_time) * 1000
        
        # 상세 오류 로깅
        logger.error(
            f"Unexpected error in request {request_id}: {type(exception).__name__}: {str(exception)}",
            extra={
                "request_id": request_id,
                "exception_type": type(exception).__name__,
                "request_context": request_context,
                "traceback": traceback.format_exc()
            }
        )
        
        # 시스템 오류로 변환
        system_error = ErrorFactory.create_system_error(
            "SYS_001", request_id,
            additional_details={"exception_type": type(exception).__name__},
            context=request_context
        )
        system_error.language = language
        
        return await self._handle_maxlab_exception(
            system_error, request_context, language, start_time
        )
    
    def _log_request_success(
        self, 
        request_context: Dict[str, Any], 
        duration_ms: float, 
        status_code: int
    ):
        """성공 요청 로깅"""
        logger.info(
            f"Request completed: {request_context['method']} {request_context['path']} "
            f"- {status_code} in {duration_ms:.1f}ms",
            extra={
                "request_id": request_context["request_id"],
                "method": request_context["method"],
                "path": request_context["path"],
                "status_code": status_code,
                "duration_ms": duration_ms,
                "client_ip": request_context["client_ip"]
            }
        )
    
    def _log_request_error(
        self,
        request_context: Dict[str, Any],
        duration_ms: float,
        exception: MaxLabException
    ):
        """오류 요청 로깅"""
        logger.error(
            f"Request failed: {request_context['method']} {request_context['path']} "
            f"- {exception.error_definition.code} in {duration_ms:.1f}ms",
            extra={
                "request_id": request_context["request_id"],
                "method": request_context["method"],
                "path": request_context["path"],
                "error_code": exception.error_definition.code,
                "status_code": exception.status_code,
                "duration_ms": duration_ms,
                "client_ip": request_context["client_ip"],
                "error_severity": exception.error_definition.severity.value
            }
        )