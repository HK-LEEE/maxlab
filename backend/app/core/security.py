"""
보안 및 인증 시스템
외부 인증 서버(localhost:8000)에서 발급된 JWT 토큰을 검증하고,
사용자 정보 및 권한을 관리합니다.
"""
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import jwt
from typing import Optional, Dict, Any, List
import logging
from datetime import datetime, timedelta
import uuid
import time
from enum import Enum
import asyncio
from functools import lru_cache
import json
from sqlalchemy.ext.asyncio import AsyncSession
from cryptography.fernet import Fernet, InvalidToken
import os
import base64
from pydantic import BaseModel

from .config import settings
from .database import get_db
from .exceptions import (
    MaxLabException, ErrorFactory, AuthenticationException,
    AuthorizationException, ConnectionException, ConfigurationException,
    ValidationException, SystemException
)
# Note: error_integrator is imported inside functions to avoid circular import

logger = logging.getLogger(__name__)

# HTTP Bearer 토큰 스키마
security = HTTPBearer()


class CircuitBreakerState(Enum):
    """Circuit Breaker 상태"""
    CLOSED = "closed"      # 정상 동작
    OPEN = "open"          # 차단 상태 
    HALF_OPEN = "half_open"  # 반개방 상태


class OAuthCircuitBreaker:
    """OAuth 서비스를 위한 Circuit Breaker"""
    
    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.failure_threshold = failure_threshold  # 실패 임계값
        self.timeout = timeout  # 차단 시간 (초)
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitBreakerState.CLOSED
        
    def record_success(self):
        """성공 기록"""
        self.failure_count = 0
        self.state = CircuitBreakerState.CLOSED
        
    def record_failure(self):
        """실패 기록"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitBreakerState.OPEN
            logger.warning(f"OAuth Circuit Breaker OPENED after {self.failure_count} failures")
            
    def can_execute(self) -> bool:
        """실행 가능 여부 확인"""
        if self.state == CircuitBreakerState.CLOSED:
            return True
            
        if self.state == CircuitBreakerState.OPEN:
            if time.time() - self.last_failure_time >= self.timeout:
                self.state = CircuitBreakerState.HALF_OPEN
                logger.info("OAuth Circuit Breaker moved to HALF_OPEN state")
                return True
            return False
            
        # HALF_OPEN state
        return True
        
    def execute_with_breaker(self, func):
        """Circuit Breaker를 적용한 함수 실행"""
        async def wrapper(*args, **kwargs):
            if not self.can_execute():
                logger.error("OAuth Circuit Breaker is OPEN - failing fast")
                # Extract request_id if available from args/kwargs
                request_id = None
                if args:
                    if hasattr(args[0], '__dict__') and 'request_id' in args[0].__dict__:
                        request_id = args[0].request_id
                elif 'request_id' in kwargs:
                    request_id = kwargs['request_id']
                
                raise ErrorFactory.create_connection_error(
                    "CONN_002", request_id,
                    additional_details={"circuit_breaker_state": self.state.value, "failure_count": self.failure_count}
                )
                
            try:
                result = await func(*args, **kwargs)
                self.record_success()
                return result
            except (AuthenticationException, ConnectionException, SystemException, MaxLabException) as e:
                self.record_failure()
                raise
            except AuthenticationError as e:
                # Legacy error handling - convert to new system
                self.record_failure()
                from .error_integration import error_integrator
                migrated_error = error_integrator.migrate_legacy_authentication_error(e)
                raise migrated_error
                
        return wrapper


# OAuth Circuit Breaker 인스턴스
oauth_circuit_breaker = OAuthCircuitBreaker(failure_threshold=10, timeout=30)


class PerformanceMetrics:
    """성능 메트릭 수집 및 관리"""
    
    def __init__(self):
        self.metrics = {
            'oauth_verify_requests': 0,
            'oauth_verify_total_time': 0,
            'oauth_verify_success': 0,
            'oauth_verify_failures': 0,
            'oauth_groups_requests': 0,
            'oauth_groups_total_time': 0,
            'oauth_groups_success': 0,
            'oauth_groups_failures': 0,
            'response_times': []  # Keep last 100 response times for percentile calculation
        }
        
    def record_oauth_verify(self, duration_ms: float, success: bool):
        """OAuth 토큰 검증 메트릭 기록"""
        self.metrics['oauth_verify_requests'] += 1
        self.metrics['oauth_verify_total_time'] += duration_ms
        
        if success:
            self.metrics['oauth_verify_success'] += 1
        else:
            self.metrics['oauth_verify_failures'] += 1
            
        # Keep only last 100 response times
        self.metrics['response_times'].append(duration_ms)
        if len(self.metrics['response_times']) > 100:
            self.metrics['response_times'].pop(0)
    
    def record_oauth_groups(self, duration_ms: float, success: bool):
        """OAuth 그룹 조회 메트릭 기록"""
        self.metrics['oauth_groups_requests'] += 1
        self.metrics['oauth_groups_total_time'] += duration_ms
        
        if success:
            self.metrics['oauth_groups_success'] += 1
        else:
            self.metrics['oauth_groups_failures'] += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """성능 통계 반환"""
        stats = {}
        
        # OAuth verification stats
        if self.metrics['oauth_verify_requests'] > 0:
            stats['oauth_verify'] = {
                'requests': self.metrics['oauth_verify_requests'],
                'success_rate': self.metrics['oauth_verify_success'] / self.metrics['oauth_verify_requests'],
                'avg_response_time_ms': self.metrics['oauth_verify_total_time'] / self.metrics['oauth_verify_requests']
            }
        
        # OAuth groups stats  
        if self.metrics['oauth_groups_requests'] > 0:
            stats['oauth_groups'] = {
                'requests': self.metrics['oauth_groups_requests'],
                'success_rate': self.metrics['oauth_groups_success'] / self.metrics['oauth_groups_requests'],
                'avg_response_time_ms': self.metrics['oauth_groups_total_time'] / self.metrics['oauth_groups_requests']
            }
        
        # Response time percentiles
        if self.metrics['response_times']:
            sorted_times = sorted(self.metrics['response_times'])
            count = len(sorted_times)
            stats['response_times'] = {
                'p50': sorted_times[int(count * 0.5)],
                'p95': sorted_times[int(count * 0.95)],
                'p99': sorted_times[int(count * 0.99)],
                'count': count
            }
        
        return stats


# 성능 메트릭 인스턴스
performance_metrics = PerformanceMetrics()

def validate_bearer_token(token: str, request_id: Optional[str] = None) -> str:
    """
    Bearer 토큰 검증 및 정규화
    
    Args:
        token: 검증할 토큰 문자열
        request_id: 요청 ID (오류 추적용)
        
    Returns:
        str: 검증된 토큰 문자열
        
    Raises:
        AuthenticationException: 토큰이 유효하지 않은 경우
    """
    if not token:
        raise ErrorFactory.create_auth_error(
            "AUTH_004", request_id,
            additional_details={"issue": "token_missing"}
        )
    
    if not isinstance(token, str):
        raise ErrorFactory.create_validation_error(
            "VALID_001", request_id,
            additional_details={"field": "token", "expected_type": "string", "actual_type": type(token).__name__}
        )
    
    # Remove any extra whitespace
    token = token.strip()
    
    if not token:
        raise ErrorFactory.create_auth_error(
            "AUTH_004", request_id,
            additional_details={"issue": "token_empty_after_strip"}
        )
    
    # Basic token format validation (should not be empty or too short)
    if len(token) < 10:
        raise ErrorFactory.create_auth_error(
            "AUTH_001", request_id,
            additional_details={"issue": "token_too_short", "length": len(token)}
        )
    
    return token

def create_oauth_headers(token: str, request_id: Optional[str] = None) -> Dict[str, str]:
    """
    OAuth API 호출용 HTTP 헤더 생성
    
    Args:
        token: Bearer 토큰
        request_id: 요청 ID (오류 추적용)
        
    Returns:
        dict: 헤더 딕셔너리
        
    Raises:
        AuthenticationException: 토큰이 유효하지 않은 경우
    """
    validated_token = validate_bearer_token(token, request_id)
    
    # Ensure we're creating a proper string header value
    auth_header = f"Bearer {validated_token}"
    
    # Double-check the header value is a proper string
    if isinstance(auth_header, bytes):
        raise ErrorFactory.create_system_error(
            "SYS_001", request_id,
            additional_details={"issue": "header_encoding_error", "type": "bytes_instead_of_string"}
        )
    
    return {
        "Authorization": auth_header,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }


class AuthenticationError(HTTPException):
    """레거시 인증 관련 예외 (하위 호환성을 위해 유지)"""
    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )

class AuthorizationError(HTTPException):
    """권한 관련 예외"""
    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )

async def _verify_token_with_auth_server_internal(token: str, request_id: Optional[str] = None) -> Dict[str, Any]:
    """
    MAX Platform OAuth 서버에서 토큰 검증 (내부 구현)
    
    Args:
        token: OAuth 토큰 문자열
        request_id: 요청 ID (오류 추적용)
        
    Returns:
        dict: 사용자 정보 딕셔너리
        
    Raises:
        AuthenticationException: 토큰 검증 실패시
    """
    # Optimized timeout for <200ms target (5 seconds max for auth calls)
    timeout_config = httpx.Timeout(5.0, read=5.0, write=5.0, connect=2.0)
    
    # Connection pooling limits for performance
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
    
    async with httpx.AsyncClient(
        timeout=timeout_config,
        limits=limits,
        http2=True  # Enable HTTP/2 for better performance
    ) as client:
        try:
            # Performance monitoring
            start_time = time.time()
            
            # Create properly formatted headers
            headers = create_oauth_headers(token, request_id)
            
            # OAuth userinfo 엔드포인트 호출 (새로운 /auth/* 경로로 업데이트)
            oauth_response = await client.get(
                f"{settings.AUTH_SERVER_URL}/auth/userinfo",
                headers=headers
            )
            
            # Log performance metrics
            duration_ms = (time.time() - start_time) * 1000
            if duration_ms > 200:
                logger.warning(f"OAuth verification took {duration_ms:.1f}ms (target: <200ms)")
            else:
                logger.debug(f"OAuth verification completed in {duration_ms:.1f}ms")
            
            # Record metrics
            performance_metrics.record_oauth_verify(duration_ms, True)
            
            if oauth_response.status_code == 200:
                oauth_user_data = oauth_response.json()
                logger.info(f"OAuth user authenticated: {oauth_user_data.get('display_name', oauth_user_data.get('email', 'unknown'))}")
                
                # OAuth 응답 로깅 (디버깅용)
                logger.debug(f"OAuth 응답 전체: {json.dumps(oauth_user_data, default=str)}")
                
                # Safe group processing
                groups = []
                group_uuids = []
                oauth_groups = oauth_user_data.get("groups", [])
                logger.info(f"OAuth 응답의 그룹 정보 (원본): {oauth_groups}")
                
                # OAuth 응답에서 group_id, group_name 필드도 확인 (단일 그룹 정보)
                single_group_id = oauth_user_data.get("group_id")
                single_group_name = oauth_user_data.get("group_name")
                
                if single_group_id and single_group_name:
                    logger.info(f"OAuth 응답에 단일 그룹 정보 발견: {single_group_name} ({single_group_id})")
                    try:
                        group_uuid = uuid.UUID(str(single_group_id))
                        group_uuids.append(group_uuid)
                        if single_group_name not in oauth_groups:
                            groups.append(single_group_name)
                        logger.info(f"단일 그룹 UUID 추출 성공: {single_group_name} -> {group_uuid}")
                    except ValueError:
                        logger.warning(f"단일 그룹 ID '{single_group_id}'는 유효한 UUID가 아님")
                
                for g in oauth_groups:
                    if isinstance(g, dict):
                        # 그룹이 dict 형태인 경우 - name과 id/uuid 모두 추출
                        group_name = g.get("name", g.get("display_name", str(g)))
                        groups.append(group_name)
                        
                        # UUID 추출 시도
                        group_id = g.get("id") or g.get("uuid") or g.get("group_id")
                        if group_id:
                            try:
                                group_uuid = uuid.UUID(str(group_id))
                                group_uuids.append(group_uuid)
                                logger.debug(f"그룹 '{group_name}'의 UUID 추출 성공: {group_uuid}")
                            except ValueError:
                                logger.warning(f"그룹 '{group_name}'의 ID '{group_id}'는 유효한 UUID가 아님")
                    else:
                        groups.append(str(g))
                
                # OAuth 서버의 is_admin 값 확인
                oauth_is_admin = oauth_user_data.get("is_admin", False)
                logger.info(f"🔐 OAuth 서버의 is_admin 값: {oauth_is_admin} (타입: {type(oauth_is_admin).__name__})")
                
                # OAuth 사용자 정보를 내부 형식으로 변환 (OIDC 표준 claims 매핑)
                user_data = {
                    # OIDC 표준 claims
                    "sub": oauth_user_data.get("sub") or oauth_user_data.get("id") or oauth_user_data.get("user_id"),
                    "name": oauth_user_data.get("name") or oauth_user_data.get("display_name") or oauth_user_data.get("real_name"),
                    "given_name": oauth_user_data.get("given_name"),
                    "family_name": oauth_user_data.get("family_name"),
                    "email": oauth_user_data.get("email"),
                    "email_verified": oauth_user_data.get("email_verified", True),
                    "locale": oauth_user_data.get("locale", "ko-KR"),
                    "zoneinfo": oauth_user_data.get("zoneinfo", "Asia/Seoul"),
                    "updated_at": oauth_user_data.get("updated_at"),
                    
                    # 레거시 호환성을 위한 기존 필드
                    "user_id": oauth_user_data.get("sub") or oauth_user_data.get("id") or oauth_user_data.get("user_id"),
                    "username": oauth_user_data.get("name") or oauth_user_data.get("display_name") or oauth_user_data.get("username"),
                    "full_name": oauth_user_data.get("name") or oauth_user_data.get("real_name") or oauth_user_data.get("full_name"),
                    "is_active": True,
                    "is_admin": oauth_is_admin,  # OAuth 서버의 값을 먼저 사용
                    "role": "admin" if oauth_is_admin else "user",  # OAuth is_admin에 따라 role 설정
                    "groups": groups,
                    "group_uuids": group_uuids,  # OAuth에서 직접 추출한 그룹 UUID
                    "auth_type": "oauth",
                    "permissions": oauth_user_data.get("permissions", []),
                    "scopes": oauth_user_data.get("scopes", []),
                    "oauth_is_admin": oauth_is_admin  # Store OAuth server's value separately
                }
                
                logger.info(f"👤 사용자 정보 변환 완료 (OIDC 표준 claims 포함):")
                logger.info(f"  - sub: {user_data.get('sub')}")
                logger.info(f"  - name: {user_data.get('name')}")
                logger.info(f"  - email: {user_data.get('email')}")
                logger.info(f"  - email_verified: {user_data.get('email_verified')}")
                logger.info(f"  - is_admin (OAuth): {oauth_is_admin}")
                logger.info(f"  - groups: {groups}")
                logger.info(f"  - group_uuids: {group_uuids}")
                logger.info(f"  - locale: {user_data.get('locale')}")
                logger.info(f"  - zoneinfo: {user_data.get('zoneinfo')}")
                
                # Use MaxLab's admin override configuration
                from .admin_override import admin_override
                admin_before = user_data["is_admin"]
                if admin_override.is_admin(user_data):
                    user_data["is_admin"] = True
                    user_data["role"] = "admin"
                    logger.info(f"✅ User {user_data.get('email')} granted admin privileges by MaxLab override")
                else:
                    logger.info(f"ℹ️ User {user_data.get('email')} - Admin override check: is_admin={admin_before} -> {user_data['is_admin']}")
                
                return user_data
            
            elif oauth_response.status_code == 401:
                logger.error("OAuth authentication failed - Invalid or expired token")
                from .error_integration import error_integrator
                raise error_integrator.convert_oauth_server_error(
                    401, oauth_response.text, request_id=request_id
                )
            else:
                logger.error(f"OAuth service returned status {oauth_response.status_code}: {oauth_response.text}")
                from .error_integration import error_integrator
                raise error_integrator.convert_oauth_server_error(
                    oauth_response.status_code, oauth_response.text, request_id=request_id
                )
                
        except httpx.TimeoutException as e:
            duration_ms = (time.time() - start_time) * 1000
            performance_metrics.record_oauth_verify(duration_ms, False)
            logger.error(f"OAuth server timeout: {e}")
            raise ErrorFactory.create_connection_error(
                "CONN_002", request_id,
                additional_details={"timeout_duration": duration_ms, "error_detail": str(e)}
            )
        except httpx.ConnectError as e:
            duration_ms = (time.time() - start_time) * 1000
            performance_metrics.record_oauth_verify(duration_ms, False)
            logger.error(f"OAuth server connection failed: {e}")
            raise ErrorFactory.create_connection_error(
                "CONN_001", request_id,
                additional_details={"connection_error": str(e), "duration_ms": duration_ms}
            )
        except httpx.HTTPStatusError as e:
            duration_ms = (time.time() - start_time) * 1000
            performance_metrics.record_oauth_verify(duration_ms, False)
            logger.error(f"OAuth HTTP error: {e.response.status_code}")
            from .error_integration import error_integrator
            raise error_integrator.convert_oauth_server_error(
                e.response.status_code, e.response.text, request_id=request_id
            )
        except httpx.InvalidURL as e:
            duration_ms = (time.time() - start_time) * 1000
            performance_metrics.record_oauth_verify(duration_ms, False)
            logger.error(f"Invalid OAuth server URL: {e}")
            raise ErrorFactory.create_config_error(
                "CONFIG_002", request_id,
                additional_details={"invalid_url": str(e), "duration_ms": duration_ms}
            )
        except (ValueError, KeyError) as e:
            duration_ms = (time.time() - start_time) * 1000
            performance_metrics.record_oauth_verify(duration_ms, False)
            logger.error(f"Malformed OAuth response: {e}")
            raise ErrorFactory.create_validation_error(
                "VALID_002", request_id,
                additional_details={"parse_error": str(e), "duration_ms": duration_ms}
            )
        except httpx.RequestError as e:
            duration_ms = (time.time() - start_time) * 1000
            performance_metrics.record_oauth_verify(duration_ms, False)
            logger.error(f"OAuth request error: {e}")
            raise ErrorFactory.create_connection_error(
                "CONN_001", request_id,
                additional_details={"request_error": str(e), "duration_ms": duration_ms}
            )


# Circuit Breaker를 적용한 공개 함수
verify_token_with_auth_server = oauth_circuit_breaker.execute_with_breaker(_verify_token_with_auth_server_internal)

async def _get_user_groups_from_auth_server_internal(token: str, request_id: Optional[str] = None) -> List[str]:
    """
    OAuth 서버에서 사용자 그룹 정보 조회 (내부 구현)
    
    Args:
        token: OAuth 토큰 문자열
        request_id: 요청 ID (오류 추적용)
        
    Returns:
        List[str]: 사용자가 속한 그룹 목록
        
    Raises:
        AuthenticationException: 그룹 조회 실패시
    """
    # Optimized timeout for <200ms target (5 seconds max for auth calls)
    timeout_config = httpx.Timeout(5.0, read=5.0, write=5.0, connect=2.0)
    
    # Connection pooling limits for performance
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
    
    async with httpx.AsyncClient(
        timeout=timeout_config,
        limits=limits,
        http2=True  # Enable HTTP/2 for better performance
    ) as client:
        try:
            # Performance monitoring
            start_time = time.time()
            
            # Create properly formatted headers
            headers = create_oauth_headers(token, request_id)
            
            # OAuth userinfo 엔드포인트 호출 (새로운 /auth/* 경로로 업데이트)
            oauth_response = await client.get(
                f"{settings.AUTH_SERVER_URL}/auth/userinfo",
                headers=headers
            )
            
            # Log performance metrics
            duration_ms = (time.time() - start_time) * 1000
            if duration_ms > 200:
                logger.warning(f"OAuth groups retrieval took {duration_ms:.1f}ms (target: <200ms)")
            else:
                logger.debug(f"OAuth groups retrieval completed in {duration_ms:.1f}ms")
            
            # Record metrics
            performance_metrics.record_oauth_groups(duration_ms, True)
            
            if oauth_response.status_code == 200:
                oauth_user_data = oauth_response.json()
                # OAuth에서 그룹 정보 추출
                groups = []
                oauth_groups = oauth_user_data.get("groups", [])
                for group in oauth_groups:
                    if isinstance(group, dict):
                        groups.append(group.get("name", group.get("display_name", str(group))))
                    else:
                        groups.append(str(group))
                        
                logger.info(f"OAuth user groups retrieved: {groups}")
                return groups
            
            elif oauth_response.status_code == 401:
                logger.error("Failed to retrieve user groups - Invalid token")
                from .error_integration import error_integrator
                raise error_integrator.convert_oauth_server_error(
                    401, "Group retrieval failed - invalid token", request_id=request_id
                )
            else:
                logger.error(f"Failed to retrieve user groups: {oauth_response.status_code}")
                from .error_integration import error_integrator
                raise error_integrator.convert_oauth_server_error(
                    oauth_response.status_code, "Group information unavailable", request_id=request_id
                )
                
        except httpx.TimeoutException as e:
            logger.error(f"OAuth server timeout for groups: {e}")
            raise ErrorFactory.create_connection_error(
                "CONN_002", request_id,
                additional_details={"service": "groups", "error_detail": str(e)}
            )
        except httpx.ConnectError as e:
            logger.error(f"OAuth server connection failed for groups: {e}")
            raise ErrorFactory.create_connection_error(
                "CONN_001", request_id,
                additional_details={"service": "groups", "connection_error": str(e)}
            )
        except httpx.HTTPStatusError as e:
            logger.error(f"OAuth groups HTTP error: {e.response.status_code}")
            from .error_integration import error_integrator
            raise error_integrator.convert_oauth_server_error(
                e.response.status_code, e.response.text, request_id=request_id
            )
        except httpx.InvalidURL as e:
            logger.error(f"Invalid OAuth server URL for groups: {e}")
            raise ErrorFactory.create_config_error(
                "CONFIG_002", request_id,
                additional_details={"service": "groups", "invalid_url": str(e)}
            )
        except (ValueError, KeyError) as e:
            logger.error(f"Malformed OAuth groups response: {e}")
            raise ErrorFactory.create_validation_error(
                "VALID_002", request_id,
                additional_details={"service": "groups", "parse_error": str(e)}
            )
        except httpx.RequestError as e:
            logger.error(f"OAuth groups request error: {e}")
            raise ErrorFactory.create_connection_error(
                "CONN_001", request_id,
                additional_details={"service": "groups", "request_error": str(e)}
            )


# Circuit Breaker를 적용한 공개 함수
get_user_groups_from_auth_server = oauth_circuit_breaker.execute_with_breaker(_get_user_groups_from_auth_server_internal)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """
    현재 사용자 정보 획득 (UUID 기반)
    FastAPI 의존성 주입으로 사용됩니다.
    
    Args:
        credentials: HTTP Bearer 토큰
        
    Returns:
        dict: 사용자 정보 딕셔너리 (UUID 기반)
        
    Raises:
        AuthenticationError: 인증 실패시
    """
    # Generate request ID for error tracking
    request_id = str(uuid.uuid4())
    
    # Validate Bearer token format
    token = validate_bearer_token(credentials.credentials, request_id)
    
    # Check token blacklist first
    try:
        from ..services.token_blacklist import get_token_blacklist
        blacklist_service = get_token_blacklist()
        
        if blacklist_service and blacklist_service.is_token_blacklisted(token):
            logger.warning("Access attempted with blacklisted token")
            raise ErrorFactory.create_auth_error(
                "AUTH_005", request_id,
                additional_details={"issue": "token_blacklisted"}
            )
    except ImportError:
        # Token blacklist service not available, continue
        pass
    except Exception as e:
        logger.error(f"Error checking token blacklist: {e}")
        # Continue with normal verification if blacklist check fails
        pass
    
    user_data = await verify_token_with_auth_server(token, request_id=request_id)
    
    # 토큰 추가 (추후 API 호출시 사용)
    user_data["token"] = token
    
    # Session management integration - skipped in base function
    # Use get_current_user_with_session for endpoints that need session management
    
    # UUID 기반 정보 추가
    user_data = await enrich_user_data_with_uuids(user_data)
    
    return user_data


async def enrich_user_data_with_uuids(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    사용자 정보에 UUID 기반 정보 추가
    
    Args:
        user_data: 기존 사용자 정보
        
    Returns:
        dict: UUID 정보가 추가된 사용자 정보
    """
    from ..services.user_mapping import user_mapping_service
    from ..services.group_mapping import group_mapping_service
    
    logger.info(f"🔄 UUID 정보 추가 시작 - 사용자: {user_data.get('email')}")
    logger.info(f"  - 입력 is_admin: {user_data.get('is_admin')}")
    logger.info(f"  - 입력 groups: {user_data.get('groups')}")
    logger.info(f"  - 입력 group_uuids: {user_data.get('group_uuids')}")
    
    try:
        # 1. 사용자 UUID 확인/추가
        user_uuid = user_data.get("user_uuid")
        if not user_uuid:
            # 이메일 또는 사용자 ID로 UUID 조회 (사용자 토큰 사용)
            user_identifier = user_data.get("email") or user_data.get("user_id") or user_data.get("username")
            if user_identifier:
                user_token = user_data.get("token")  # 사용자 토큰 사용
                if user_token:
                    user_uuid = await user_mapping_service.get_user_uuid_by_identifier(user_identifier, user_token)
                    if user_uuid:
                        user_data["user_uuid"] = user_uuid
                        logger.debug(f"사용자 UUID 매핑: {user_identifier} -> {user_uuid}")
                    else:
                        logger.warning(f"사용자 UUID 매핑 실패: {user_identifier}")
                else:
                    logger.warning(f"사용자 토큰이 없어 UUID 매핑 불가: {user_identifier}")
        
        # 2. 그룹 UUID 목록 추가
        # 이미 group_uuids가 있으면 (OAuth에서 직접 가져온 경우) 그대로 사용
        if "group_uuids" in user_data and user_data["group_uuids"]:
            logger.info(f"OAuth에서 직접 가져온 그룹 UUID 사용: {user_data['group_uuids']}")
        else:
            # group_uuids가 없으면 그룹 이름을 UUID로 매핑 시도
            group_names = user_data.get("groups", [])
            if group_names:
                try:
                    user_token = user_data.get("token")  # 사용자 토큰 사용
                    if user_token:
                        logger.info(f"그룹 UUID 매핑 시작: {group_names}")
                        # 그룹명을 UUID로 매핑 (사용자 토큰 사용)
                        group_mapping = await group_mapping_service.map_legacy_groups_to_uuid(group_names, user_token)
                        group_uuids = [uuid for uuid in group_mapping.values() if uuid is not None]
                        user_data["group_uuids"] = group_uuids
                        
                        logger.info(f"그룹 UUID 매핑 완료: {group_names} -> {group_uuids}")
                        
                        # 매핑되지 않은 그룹 로그
                        unmapped_groups = [name for name, uuid in group_mapping.items() if uuid is None]
                        if unmapped_groups:
                            logger.warning(f"UUID로 매핑되지 않은 그룹: {unmapped_groups}")
                            # 매핑 실패한 그룹에 대한 상세 로그
                            for group_name in unmapped_groups:
                                logger.warning(f"그룹 '{group_name}' UUID 매핑 실패 - 외부 인증 서버에서 찾을 수 없음")
                    else:
                        logger.warning(f"사용자 토큰이 없어 그룹 UUID 매핑 불가: {group_names}")
                        user_data["group_uuids"] = []
                        
                except Exception as e:
                    logger.error(f"그룹 UUID 매핑 실패: {e}")
                    user_data["group_uuids"] = []
            else:
                user_data["group_uuids"] = []
        
        # 3. 레거시 호환성을 위한 정보 유지
        # (기존 코드에서 사용하는 필드들 유지)
        
        logger.info(f"✅ UUID 정보 추가 완료 - 사용자: {user_data.get('email')}")
        logger.info(f"  - 최종 is_admin: {user_data.get('is_admin')}")
        logger.info(f"  - 최종 group_uuids: {user_data.get('group_uuids')}")
        
        return user_data
        
    except Exception as e:
        logger.error(f"사용자 UUID 정보 추가 실패: {e}")
        # 실패해도 기존 사용자 정보는 반환
        user_data["user_uuid"] = None
        user_data["group_uuids"] = []
        return user_data

async def get_current_user_with_session(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    request: Request = None
) -> Dict[str, Any]:
    """
    현재 사용자 정보 획득 with session management
    This version includes session management for endpoints that need it.
    
    Args:
        credentials: HTTP Bearer 토큰
        request: FastAPI Request object for session management
        
    Returns:
        dict: 사용자 정보 딕셔너리 with session_id
    """
    # Get base user data
    user_data = await get_current_user(credentials)
    
    # Session management integration - create/sync session with JWT
    if request:
        try:
            from ..services.async_session_manager import async_session_manager
            token = user_data.get("token")
            session_data = await async_session_manager.sync_session_with_jwt(
                token, user_data, request
            )
            if session_data:
                user_data["session_id"] = session_data.session_id
                logger.debug(f"Session synced with JWT for user {user_data.get('email')}: {session_data.session_id[:8]}...")
            else:
                logger.warning(f"Failed to sync session with JWT for user {user_data.get('email')}")
        except Exception as e:
            logger.error(f"Session management error (non-critical): {e}")
            # Continue without session - this is not critical for JWT authentication
    
    return user_data


async def get_current_active_user(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    활성 사용자 확인
    
    Args:
        current_user: 현재 사용자 정보
        
    Returns:
        dict: 활성 사용자 정보
        
    Raises:
        AuthenticationError: 비활성 사용자인 경우
    """
    if not current_user.get("is_active", True):
        request_id = str(uuid.uuid4())
        raise ErrorFactory.create_auth_error(
            "AUTH_006", request_id,
            additional_details={"user_id": current_user.get("user_id"), "reason": "inactive_user"}
        )
    return current_user

def require_admin(current_user: Dict[str, Any] = Depends(get_current_active_user)) -> Dict[str, Any]:
    """
    관리자 권한 확인 (OAuth 및 전통적인 인증 모두 지원)
    localhost:8000에서 제공하는 is_admin 정보를 우선 사용
    
    Args:
        current_user: 현재 사용자 정보
        
    Returns:
        dict: 관리자 사용자 정보
        
    Raises:
        AuthorizationError: 관리자가 아닌 경우
    """
    # OAuth 및 전통적인 인증 모두 지원하는 관리자 권한 체크
    is_admin = (
        current_user.get("is_admin", False) or 
        current_user.get("role") == "admin" or
        "admin" in current_user.get("groups", []) or
        "administrators" in current_user.get("groups", [])
    )
    
    if not is_admin:
        user_identifier = (
            current_user.get("username") or 
            current_user.get("email") or 
            current_user.get("user_id") or 
            "unknown"
        )
        auth_type = current_user.get("auth_type", "unknown")
        logger.warning(f"Non-admin user {user_identifier} (auth: {auth_type}) attempted admin action")
        request_id = str(uuid.uuid4())
        raise ErrorFactory.create_permission_error(
            "PERM_001", request_id,
            additional_details={
                "user_identifier": user_identifier,
                "auth_type": auth_type,
                "required_privilege": "admin"
            }
        )
    
    logger.info(f"Admin access granted to {current_user.get('username', current_user.get('email', 'unknown'))}")
    return current_user

def require_groups(required_groups: List[str]):
    """
    특정 그룹 멤버십 확인 데코레이터 팩토리
    
    Args:
        required_groups: 필수 그룹 목록
        
    Returns:
        function: 그룹 확인 의존성 함수
    """
    def check_groups(current_user: Dict[str, Any] = Depends(get_current_active_user)) -> Dict[str, Any]:
        user_groups = current_user.get("groups", [])
        
        # 관리자는 모든 그룹에 접근 가능
        if current_user.get("role") == "admin":
            return current_user
            
        # 필수 그룹 중 하나라도 포함되어 있는지 확인
        if not any(group in user_groups for group in required_groups):
            logger.warning(f"User {current_user.get('username')} lacks required groups: {required_groups}")
            request_id = str(uuid.uuid4())
            raise ErrorFactory.create_permission_error(
                "PERM_002", request_id,
                additional_details={
                    "user_groups": user_groups,
                    "required_groups": required_groups,
                    "username": current_user.get("username")
                }
            )
            
        return current_user
    
    return check_groups

# 토큰 유틸리티 함수들
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    액세스 토큰 생성 (내부용)
    
    Args:
        data: 토큰에 포함할 데이터
        expires_delta: 만료 시간
        
    Returns:
        str: JWT 토큰
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Dict[str, Any]:
    """
    JWT 토큰 검증 (내부용)
    
    Args:
        token: JWT 토큰
        
    Returns:
        dict: 토큰 페이로드
        
    Raises:
        AuthenticationError: 토큰 검증 실패시
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        request_id = str(uuid.uuid4())
        raise ErrorFactory.create_auth_error(
            "AUTH_002", request_id,
            additional_details={"issue": "jwt_expired"}
        )
    except jwt.JWTError:
        request_id = str(uuid.uuid4())
        raise ErrorFactory.create_auth_error(
            "AUTH_001", request_id,
            additional_details={"issue": "jwt_invalid"}
        )


# 워크스페이스 권한 체크
class WorkspacePermissionChecker:
    """워크스페이스 권한 확인 도우미 클래스 (UUID 기반)"""
    
    def __init__(self, required_permission: str = "read"):
        self.required_permission = required_permission
    
    async def __call__(
        self,
        workspace_id: uuid.UUID,
        current_user: Dict[str, Any] = Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, Any]:
        """워크스페이스 접근 권한 확인 (UUID 기반)"""
        
        # 관리자는 모든 워크스페이스 접근 가능
        is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
        if is_admin:
            logger.info(f"관리자 권한으로 워크스페이스 {workspace_id} 접근 허용: {current_user.get('email')}")
            current_user["workspace_permission"] = {
                "has_permission": True,
                "user_permission_level": "admin",
                "granted_groups": ["admin"],
                "granted_users": [str(current_user.get("user_uuid", ""))],
                "admin_access": True
            }
            return current_user
        
        # Import here to avoid circular imports
        from ..crud.workspace import workspace_group_crud
        
        # UUID 기반 사용자 정보 추출
        user_uuid = current_user.get("user_uuid")
        user_group_uuids = current_user.get("group_uuids", [])
        
        # 레거시 호환성 (UUID가 없는 경우)
        user_id = current_user.get("user_id", current_user.get("id"))
        user_groups = current_user.get("groups", [])
        
        if not user_uuid and not user_id:
            logger.error("사용자 식별자가 없습니다.")
            request_id = str(uuid.uuid4())
            raise ErrorFactory.create_validation_error(
                "VALID_003", request_id,
                additional_details={"issue": "missing_user_identifier"}
            )
        
        # Check workspace permissions (UUID 우선, 레거시 fallback)
        permission_result = await workspace_group_crud.check_permission(
            db=db,
            workspace_id=workspace_id,
            user_uuid=user_uuid,
            user_group_uuids=user_group_uuids,
            required_permission=self.required_permission,
            # 레거시 호환성
            user_id=user_id,
            user_groups=user_groups
        )
        
        if not permission_result["has_permission"]:
            logger.warning(f"워크스페이스 {workspace_id} 접근 권한 부족: "
                          f"사용자 {user_uuid or user_id}, 필요 권한: {self.required_permission}, "
                          f"보유 권한: {permission_result.get('user_permission_level')}")
            request_id = str(uuid.uuid4())
            raise ErrorFactory.create_permission_error(
                "PERM_003", request_id,
                additional_details={
                    "workspace_id": str(workspace_id),
                    "user_uuid": str(user_uuid) if user_uuid else None,
                    "user_id": user_id,
                    "required_permission": self.required_permission,
                    "current_permission": permission_result.get('user_permission_level', 'none')
                }
            )
        
        # Add permission info to current_user
        current_user["workspace_permission"] = permission_result
        
        logger.info(f"워크스페이스 {workspace_id} 접근 허용: 사용자 {user_uuid or user_id}, "
                   f"권한 레벨: {permission_result.get('user_permission_level')}")
        
        return current_user


def require_workspace_permission(permission: str = "read"):
    """워크스페이스 권한 확인 의존성 팩토리"""
    return WorkspacePermissionChecker(permission)


# Encryption/Decryption for sensitive data
_encryption_key: Optional[bytes] = None


def get_or_create_encryption_key() -> bytes:
    """Get or create encryption key for sensitive data"""
    global _encryption_key
    
    if _encryption_key:
        return _encryption_key
    
    # Try to get from environment
    key_str = os.getenv("ENCRYPTION_KEY")
    
    if not key_str:
        # Try to load from .env file directly
        env_path = os.path.join(os.path.dirname(__file__), "../../.env")
        if os.path.exists(env_path):
            try:
                # Read existing .env file
                with open(env_path, "r") as f:
                    lines = f.readlines()
                
                # Check if ENCRYPTION_KEY already exists
                for i, line in enumerate(lines):
                    if line.strip().startswith("ENCRYPTION_KEY="):
                        key_str = line.split("=", 1)[1].strip()
                        logger.info(f"Found existing encryption key in .env file")
                        break
                
                if not key_str:
                    # Generate new key
                    key = Fernet.generate_key()
                    key_str = key.decode()
                    
                    # Add to .env file (not append, but modify in place)
                    lines.append(f"\n# Auto-generated encryption key for sensitive data\n")
                    lines.append(f"ENCRYPTION_KEY={key_str}\n")
                    
                    # Write back to file
                    with open(env_path, "w") as f:
                        f.writelines(lines)
                    logger.info("Generated new encryption key and saved to .env")
                    
            except Exception as e:
                logger.error(f"Error handling .env file: {e}")
                # Generate key but don't save if file operations fail
                key = Fernet.generate_key()
                key_str = key.decode()
                logger.warning("Using temporary encryption key due to file error")
        else:
            # No .env file exists, generate key
            key = Fernet.generate_key()
            key_str = key.decode()
            logger.warning(".env file not found, using temporary encryption key")
    
    # Convert to bytes if needed
    if isinstance(key_str, str):
        _encryption_key = key_str.encode()
    else:
        _encryption_key = key_str
    
    return _encryption_key


def encrypt_connection_string(value: Optional[str]) -> Optional[str]:
    """Encrypt a connection string or API key"""
    if not value:
        return None
    
    try:
        key = get_or_create_encryption_key()
        f = Fernet(key)
        encrypted = f.encrypt(value.encode())
        # Return as base64 string for easy storage
        return base64.b64encode(encrypted).decode()
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        # In case of error, return original value (not recommended for production)
        return value


def decrypt_connection_string(encrypted_value: Optional[str]) -> Optional[str]:
    """Decrypt a connection string or API key"""
    if not encrypted_value:
        return None
    
    try:
        key = get_or_create_encryption_key()
        if not key:
            logger.error("❌ No encryption key available for decryption")
            return None
            
        f = Fernet(key)
        # Decode from base64 first
        encrypted_bytes = base64.b64decode(encrypted_value.encode())
        decrypted = f.decrypt(encrypted_bytes)
        return decrypted.decode()
    except InvalidToken as e:
        logger.error(f"❌ Decryption failed - Invalid token or wrong encryption key: {str(e)[:100]}")
    except Exception as e:
        logger.error(f"❌ Decryption failed for connection string: {e}")
        # For public endpoints, we need to be more strict about encryption failures
        # Check if it looks like an encrypted value (base64 encoded)
        try:
            # If it's base64 encoded, it's likely encrypted but decryption failed
            base64.b64decode(encrypted_value.encode())
            logger.error(f"Connection string appears encrypted but decryption failed: {str(e)[:100]}")
            return None  # Return None to indicate failure rather than corrupted data
        except:
            # If base64 decode fails, it might be plain text (backward compatibility)
            logger.warning(f"Connection string appears to be plain text, using as-is for backward compatibility")
            return encrypted_value