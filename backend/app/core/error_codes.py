"""
MAX Lab OAuth 인증 시스템 오류 코드 정의
구조화된 오류 코드 시스템으로 일관된 오류 처리 및 사용자 피드백을 제공합니다.
"""
from enum import Enum
from typing import Dict, Any, Optional
from dataclasses import dataclass


class ErrorCategory(Enum):
    """오류 카테고리 정의"""
    AUTHENTICATION = "AUTH"
    CONNECTION = "CONN" 
    CONFIGURATION = "CONFIG"
    AUTHORIZATION = "PERM"
    VALIDATION = "VALID"
    SYSTEM = "SYS"


class UserAction(Enum):
    """사용자에게 권장하는 액션"""
    LOGIN_REQUIRED = "login_required"           # 다시 로그인 필요
    RETRY_ALLOWED = "retry_allowed"             # 재시도 가능
    CONTACT_SUPPORT = "contact_support"         # 지원팀 문의
    NO_ACTION = "no_action"                     # 사용자 액션 불필요
    CHECK_CONFIGURATION = "check_configuration" # 설정 확인 필요
    WAIT_AND_RETRY = "wait_and_retry"           # 잠시 후 재시도


class ErrorSeverity(Enum):
    """오류 심각도"""
    LOW = "low"                # 정보성 오류
    MEDIUM = "medium"          # 일반적인 오류
    HIGH = "high"              # 중요한 오류
    CRITICAL = "critical"      # 치명적인 오류


@dataclass
class ErrorCodeDefinition:
    """오류 코드 정의 구조"""
    code: str
    category: ErrorCategory
    title: str
    description: str
    user_message: str
    user_action: UserAction
    severity: ErrorSeverity
    http_status: int
    technical_details: Optional[str] = None
    recovery_suggestions: Optional[str] = None


class MaxLabErrorCodes:
    """MAX Lab 오류 코드 레지스트리"""
    
    # ==========================================
    # AUTHENTICATION ERRORS (AUTH_001 - AUTH_099)
    # ==========================================
    
    AUTH_001 = ErrorCodeDefinition(
        code="AUTH_001",
        category=ErrorCategory.AUTHENTICATION,
        title="Invalid Token Format",
        description="The provided authentication token has an invalid format",
        user_message="Your session appears to be invalid. Please log in again.",
        user_action=UserAction.LOGIN_REQUIRED,
        severity=ErrorSeverity.MEDIUM,
        http_status=401,
        technical_details="Bearer token is malformed, empty, or contains invalid characters",
        recovery_suggestions="Ensure token is properly formatted and not corrupted"
    )
    
    AUTH_002 = ErrorCodeDefinition(
        code="AUTH_002",
        category=ErrorCategory.AUTHENTICATION,
        title="Expired Token",
        description="The authentication token has expired",
        user_message="Your session has expired. Please log in to continue.",
        user_action=UserAction.LOGIN_REQUIRED,
        severity=ErrorSeverity.MEDIUM,
        http_status=401,
        technical_details="Token timestamp validation failed - token is past expiration time",
        recovery_suggestions="Obtain a new token through authentication flow"
    )
    
    AUTH_003 = ErrorCodeDefinition(
        code="AUTH_003",
        category=ErrorCategory.AUTHENTICATION,
        title="Token Validation Failed",
        description="The authentication token could not be validated",
        user_message="We couldn't verify your session. Please log in again.",
        user_action=UserAction.LOGIN_REQUIRED,
        severity=ErrorSeverity.MEDIUM,
        http_status=401,
        technical_details="Token signature validation failed or token is not recognized by auth server",
        recovery_suggestions="Verify token was issued by correct authority and is not corrupted"
    )
    
    AUTH_004 = ErrorCodeDefinition(
        code="AUTH_004",
        category=ErrorCategory.AUTHENTICATION,
        title="Missing Authorization Header",
        description="No authorization header was provided in the request",
        user_message="Authentication is required to access this resource.",
        user_action=UserAction.LOGIN_REQUIRED,
        severity=ErrorSeverity.MEDIUM,
        http_status=401,
        technical_details="Request does not contain Authorization header or header is empty",
        recovery_suggestions="Include Bearer token in Authorization header"
    )
    
    AUTH_005 = ErrorCodeDefinition(
        code="AUTH_005",
        category=ErrorCategory.AUTHENTICATION,
        title="Token Revoked",
        description="The authentication token has been revoked or blacklisted",
        user_message="Your session has been terminated. Please log in again.",
        user_action=UserAction.LOGIN_REQUIRED,
        severity=ErrorSeverity.HIGH,
        http_status=401,
        technical_details="Token appears in blacklist or has been explicitly revoked",
        recovery_suggestions="Obtain a new token through authentication flow"
    )
    
    # ==========================================
    # AUTHORIZATION ERRORS (PERM_001 - PERM_099)
    # ==========================================
    
    PERM_001 = ErrorCodeDefinition(
        code="PERM_001",
        category=ErrorCategory.AUTHORIZATION,
        title="Insufficient Permissions",
        description="User does not have required permissions for this operation",
        user_message="You don't have permission to perform this action.",
        user_action=UserAction.CONTACT_SUPPORT,
        severity=ErrorSeverity.MEDIUM,
        http_status=403,
        technical_details="User role or group membership insufficient for requested operation",
        recovery_suggestions="Contact administrator to request appropriate permissions"
    )
    
    PERM_002 = ErrorCodeDefinition(
        code="PERM_002",
        category=ErrorCategory.AUTHORIZATION,
        title="Admin Privileges Required",
        description="Administrator privileges are required for this operation",
        user_message="Administrator privileges are required for this action.",
        user_action=UserAction.CONTACT_SUPPORT,
        severity=ErrorSeverity.MEDIUM,
        http_status=403,
        technical_details="Operation requires admin role but user is not an administrator",
        recovery_suggestions="Contact system administrator for access"
    )
    
    PERM_003 = ErrorCodeDefinition(
        code="PERM_003",
        category=ErrorCategory.AUTHORIZATION,
        title="Workspace Access Denied",
        description="User does not have access to the requested workspace",
        user_message="You don't have access to this workspace.",
        user_action=UserAction.CONTACT_SUPPORT,
        severity=ErrorSeverity.MEDIUM,
        http_status=403,
        technical_details="User not in workspace access list or required groups",
        recovery_suggestions="Request workspace access from workspace owner"
    )
    
    # ==========================================
    # CONNECTION ERRORS (CONN_001 - CONN_099)
    # ==========================================
    
    CONN_001 = ErrorCodeDefinition(
        code="CONN_001",
        category=ErrorCategory.CONNECTION,
        title="OAuth Server Unreachable",
        description="Cannot connect to the OAuth authentication server",
        user_message="We're having trouble connecting to our authentication service. Please try again in a moment.",
        user_action=UserAction.WAIT_AND_RETRY,
        severity=ErrorSeverity.HIGH,
        http_status=503,
        technical_details="HTTP connection to OAuth server failed - server may be down or network issue",
        recovery_suggestions="Check OAuth server status and network connectivity"
    )
    
    CONN_002 = ErrorCodeDefinition(
        code="CONN_002",
        category=ErrorCategory.CONNECTION,
        title="OAuth Server Timeout",
        description="Request to OAuth server timed out",
        user_message="The authentication service is taking longer than expected. Please try again.",
        user_action=UserAction.RETRY_ALLOWED,
        severity=ErrorSeverity.MEDIUM,
        http_status=504,
        technical_details="OAuth server did not respond within configured timeout period",
        recovery_suggestions="Check OAuth server performance and adjust timeout if needed"
    )
    
    CONN_003 = ErrorCodeDefinition(
        code="CONN_003",
        category=ErrorCategory.CONNECTION,
        title="Redis Connection Failed",
        description="Cannot connect to Redis cache server",
        user_message="Some features may be temporarily unavailable. Please try again later.",
        user_action=UserAction.RETRY_ALLOWED,
        severity=ErrorSeverity.MEDIUM,
        http_status=503,
        technical_details="Redis server connection failed - may affect session management",
        recovery_suggestions="Check Redis server status and connection configuration"
    )
    
    CONN_004 = ErrorCodeDefinition(
        code="CONN_004",
        category=ErrorCategory.CONNECTION,
        title="Circuit Breaker Open",
        description="Authentication service circuit breaker is open due to repeated failures",
        user_message="Authentication service is temporarily unavailable. Please try again later.",
        user_action=UserAction.WAIT_AND_RETRY,
        severity=ErrorSeverity.HIGH,
        http_status=503,
        technical_details="Circuit breaker activated due to high failure rate",
        recovery_suggestions="Wait for circuit breaker to reset or check service health"
    )
    
    # ==========================================
    # CONFIGURATION ERRORS (CONFIG_001 - CONFIG_099)
    # ==========================================
    
    CONFIG_001 = ErrorCodeDefinition(
        code="CONFIG_001",
        category=ErrorCategory.CONFIGURATION,
        title="Missing SERVICE_TOKEN",
        description="SERVICE_TOKEN environment variable is not configured",
        user_message="System configuration error. Please contact support.",
        user_action=UserAction.CONTACT_SUPPORT,
        severity=ErrorSeverity.CRITICAL,
        http_status=500,
        technical_details="SERVICE_TOKEN environment variable is missing or empty",
        recovery_suggestions="Set SERVICE_TOKEN environment variable with valid service token"
    )
    
    CONFIG_002 = ErrorCodeDefinition(
        code="CONFIG_002",
        category=ErrorCategory.CONFIGURATION,
        title="Invalid OAuth Configuration",
        description="OAuth server configuration is invalid or incomplete",
        user_message="System configuration error. Please contact support.",
        user_action=UserAction.CONTACT_SUPPORT,
        severity=ErrorSeverity.CRITICAL,
        http_status=500,
        technical_details="OAuth server URL is invalid or authentication configuration is incomplete",
        recovery_suggestions="Verify AUTH_SERVER_URL and related OAuth configuration"
    )
    
    CONFIG_003 = ErrorCodeDefinition(
        code="CONFIG_003",
        category=ErrorCategory.CONFIGURATION,
        title="Invalid SERVICE_TOKEN Format",
        description="SERVICE_TOKEN has invalid format or length",
        user_message="System configuration error. Please contact support.",
        user_action=UserAction.CONTACT_SUPPORT,
        severity=ErrorSeverity.HIGH,
        http_status=500,
        technical_details="SERVICE_TOKEN does not meet minimum length or format requirements",
        recovery_suggestions="Ensure SERVICE_TOKEN is properly formatted and meets security requirements"
    )
    
    # ==========================================
    # VALIDATION ERRORS (VALID_001 - VALID_099)
    # ==========================================
    
    VALID_001 = ErrorCodeDefinition(
        code="VALID_001",
        category=ErrorCategory.VALIDATION,
        title="Malformed OAuth Response",
        description="OAuth server returned an invalid or malformed response",
        user_message="We received an unexpected response from the authentication service. Please try again.",
        user_action=UserAction.RETRY_ALLOWED,
        severity=ErrorSeverity.MEDIUM,
        http_status=502,
        technical_details="OAuth server response does not match expected schema or contains invalid data",
        recovery_suggestions="Check OAuth server response format and API compatibility"
    )
    
    VALID_002 = ErrorCodeDefinition(
        code="VALID_002",
        category=ErrorCategory.VALIDATION,
        title="Invalid User Data",
        description="User information from OAuth server is incomplete or invalid",
        user_message="We couldn't process your user information. Please try logging in again.",
        user_action=UserAction.LOGIN_REQUIRED,
        severity=ErrorSeverity.MEDIUM,
        http_status=400,
        technical_details="Required user fields missing from OAuth response or contain invalid values",
        recovery_suggestions="Verify OAuth server provides all required user fields"
    )
    
    # ==========================================
    # SYSTEM ERRORS (SYS_001 - SYS_099)
    # ==========================================
    
    SYS_001 = ErrorCodeDefinition(
        code="SYS_001",
        category=ErrorCategory.SYSTEM,
        title="Internal Server Error",
        description="An unexpected internal error occurred",
        user_message="Something went wrong on our end. Please try again later.",
        user_action=UserAction.RETRY_ALLOWED,
        severity=ErrorSeverity.HIGH,
        http_status=500,
        technical_details="Unhandled exception or unexpected system state",
        recovery_suggestions="Check server logs for detailed error information"
    )
    
    SYS_002 = ErrorCodeDefinition(
        code="SYS_002",
        category=ErrorCategory.SYSTEM,
        title="Service Unavailable",
        description="The authentication service is temporarily unavailable",
        user_message="Our authentication service is temporarily unavailable. Please try again later.",
        user_action=UserAction.WAIT_AND_RETRY,
        severity=ErrorSeverity.HIGH,
        http_status=503,
        technical_details="Service is in maintenance mode or experiencing high load",
        recovery_suggestions="Wait for service to become available or check service status"
    )

    @classmethod
    def get_all_codes(cls) -> Dict[str, ErrorCodeDefinition]:
        """모든 오류 코드 정의 반환"""
        codes = {}
        for attr_name in dir(cls):
            attr = getattr(cls, attr_name)
            if isinstance(attr, ErrorCodeDefinition):
                codes[attr.code] = attr
        return codes
    
    @classmethod
    def get_by_code(cls, code: str) -> Optional[ErrorCodeDefinition]:
        """코드로 오류 정의 조회"""
        all_codes = cls.get_all_codes()
        return all_codes.get(code)
    
    @classmethod
    def get_by_category(cls, category: ErrorCategory) -> Dict[str, ErrorCodeDefinition]:
        """카테고리별 오류 코드 조회"""
        all_codes = cls.get_all_codes()
        return {code: definition for code, definition in all_codes.items() 
                if definition.category == category}


# 오류 코드 할당 전략 및 범위
ERROR_CODE_RANGES = {
    ErrorCategory.AUTHENTICATION: (1, 99),
    ErrorCategory.AUTHORIZATION: (1, 99), 
    ErrorCategory.CONNECTION: (1, 99),
    ErrorCategory.CONFIGURATION: (1, 99),
    ErrorCategory.VALIDATION: (1, 99),
    ErrorCategory.SYSTEM: (1, 99)
}

# 다음 사용 가능한 코드 번호 (새 오류 코드 추가시 참조)
NEXT_AVAILABLE_CODES = {
    ErrorCategory.AUTHENTICATION: 6,
    ErrorCategory.AUTHORIZATION: 4,
    ErrorCategory.CONNECTION: 5,
    ErrorCategory.CONFIGURATION: 4,
    ErrorCategory.VALIDATION: 3,
    ErrorCategory.SYSTEM: 3
}