"""
보안 및 인증 시스템
외부 인증 서버(localhost:8000)에서 발급된 JWT 토큰을 검증하고,
사용자 정보 및 권한을 관리합니다.
"""
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import jwt
from typing import Optional, Dict, Any, List
import logging
from datetime import datetime, timedelta
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_db

logger = logging.getLogger(__name__)

# HTTP Bearer 토큰 스키마
security = HTTPBearer()

class AuthenticationError(HTTPException):
    """인증 관련 예외"""
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

async def verify_token_with_auth_server(token: str) -> Dict[str, Any]:
    """
    외부 인증 서버 (localhost:8000)에서 토큰 검증
    
    Args:
        token: JWT 토큰 문자열
        
    Returns:
        dict: 사용자 정보 딕셔너리
        
    Raises:
        AuthenticationError: 토큰 검증 실패시
    """
    async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
        try:
            # 외부 인증 서버의 /api/auth/me 엔드포인트 호출
            response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if response.status_code == 200:
                user_data = response.json()
                logger.info(f"User authenticated: {user_data.get('username', 'unknown')}")
                return user_data
            elif response.status_code == 401:
                logger.warning("Invalid token provided")
                raise AuthenticationError("Invalid or expired token")
            else:
                logger.error(f"Auth server returned status {response.status_code}")
                raise AuthenticationError("Authentication service error")
                
        except httpx.RequestError as e:
            logger.error(f"Failed to connect to auth server: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable"
            )

async def get_user_groups_from_auth_server(token: str) -> List[str]:
    """
    외부 인증 서버에서 사용자 그룹 정보 조회
    
    Args:
        token: JWT 토큰 문자열
        
    Returns:
        List[str]: 사용자가 속한 그룹 목록
    """
    async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
        try:
            # Try to get user info which includes groups
            response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if response.status_code == 200:
                user_data = response.json()
                # Extract groups from user data - could be in different formats
                groups = user_data.get("groups", [])
                if not groups:
                    groups = user_data.get("group_names", [])
                if not groups:
                    groups = user_data.get("user_groups", [])
                    
                logger.info(f"User groups retrieved from user info: {groups}")
                return groups
            else:
                logger.warning(f"Failed to retrieve user info for groups: {response.status_code}")
                return []
                
        except httpx.RequestError as e:
            logger.error(f"Failed to get user groups: {e}")
            return []

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """
    현재 사용자 정보 획득
    FastAPI 의존성 주입으로 사용됩니다.
    
    Args:
        credentials: HTTP Bearer 토큰
        
    Returns:
        dict: 사용자 정보 딕셔너리
        
    Raises:
        AuthenticationError: 인증 실패시
    """
    token = credentials.credentials
    user_data = await verify_token_with_auth_server(token)
    
    # 사용자 그룹 정보 추가 조회
    groups = await get_user_groups_from_auth_server(token)
    user_data["groups"] = groups
    user_data["token"] = token  # 추후 API 호출시 사용
    
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
        raise AuthenticationError("Inactive user")
    return current_user

def require_admin(current_user: Dict[str, Any] = Depends(get_current_active_user)) -> Dict[str, Any]:
    """
    관리자 권한 확인
    
    Args:
        current_user: 현재 사용자 정보
        
    Returns:
        dict: 관리자 사용자 정보
        
    Raises:
        AuthorizationError: 관리자가 아닌 경우
    """
    # Check both is_admin and role fields for backward compatibility
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    
    if not is_admin:
        logger.warning(f"Non-admin user {current_user.get('username', current_user.get('email'))} attempted admin action")
        raise AuthorizationError("Admin privileges required")
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
            raise AuthorizationError(f"Must be member of one of these groups: {required_groups}")
            
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
        raise AuthenticationError("Token has expired")
    except jwt.JWTError:
        raise AuthenticationError("Could not validate credentials")


# 워크스페이스 권한 체크
class WorkspacePermissionChecker:
    """워크스페이스 권한 확인 도우미 클래스"""
    
    def __init__(self, required_permission: str = "read"):
        self.required_permission = required_permission
    
    async def __call__(
        self,
        workspace_id: uuid.UUID,
        current_user: Dict[str, Any] = Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, Any]:
        """워크스페이스 접근 권한 확인"""
        
        # 관리자는 모든 워크스페이스 접근 가능
        is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
        if is_admin:
            return current_user
        
        # Import here to avoid circular imports
        from ..crud.workspace import workspace_group_crud
        
        # Get user information
        user_id = current_user.get("user_id", current_user.get("id"))
        user_groups = current_user.get("groups", [])
        
        # Check workspace permissions
        permission_result = await workspace_group_crud.check_permission(
            db=db,
            workspace_id=workspace_id,
            user_id=user_id,
            user_groups=user_groups,
            required_permission=self.required_permission
        )
        
        if not permission_result["has_permission"]:
            raise AuthorizationError(
                f"Insufficient permission for workspace. Required: {self.required_permission}"
            )
        
        # Add permission info to current_user
        current_user["workspace_permission"] = permission_result
        
        return current_user


def require_workspace_permission(permission: str = "read"):
    """워크스페이스 권한 확인 의존성 팩토리"""
    return WorkspacePermissionChecker(permission)