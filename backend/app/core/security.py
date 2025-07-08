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
from cryptography.fernet import Fernet
import os
import base64

from .config import settings
from .database import get_db

logger = logging.getLogger(__name__)

# HTTP Bearer 토큰 스키마
security = HTTPBearer()

def decode_jwt_token_locally(token: str) -> Dict[str, Any]:
    """
    JWT 토큰을 로컬에서 디코딩 (검증 없이 - fallback 용도)
    인증 서버와 통신할 수 없을 때 사용
    
    Args:
        token: JWT 토큰 문자열
        
    Returns:
        dict: 사용자 정보 딕셔너리
        
    Raises:
        AuthenticationError: 토큰 디코딩 실패시
    """
    try:
        # JWT 토큰을 검증 없이 디코딩 (verify=False)
        # 주의: 이는 fallback 용도로만 사용해야 함
        payload = jwt.decode(token, options={"verify_signature": False})
        
        logger.info(f"Local JWT decode successful for user: {payload.get('email', payload.get('sub', 'unknown'))}")
        
        # payload에서 사용자 정보 추출
        user_data = {
            "user_id": payload.get("sub") or payload.get("user_id") or payload.get("email"),
            "username": payload.get("email") or payload.get("sub"),
            "email": payload.get("email"),
            "full_name": payload.get("full_name") or payload.get("email"),
            "is_active": True,
            "is_admin": payload.get("is_admin", False),
            "role": "admin" if payload.get("is_admin", False) else "user",
            "groups": payload.get("groups", [payload.get("group_name", "")]) if payload.get("group_name") else [],
            "auth_type": "jwt_local",
            "permissions": [],
            "scopes": []
        }
        
        # 관리자 권한 체크 (role_name 필드 확인)
        if payload.get("role_name") == "admin" or payload.get("is_admin"):
            user_data["is_admin"] = True
            user_data["role"] = "admin"
        
        return user_data
        
    except jwt.DecodeError as e:
        logger.error(f"JWT decode error: {e}")
        raise AuthenticationError("Invalid JWT token format")
    except Exception as e:
        logger.error(f"Unexpected error during JWT decode: {e}")
        raise AuthenticationError("Token processing failed")

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
    OAuth 2.0 토큰을 우선적으로 지원하며, 전통적인 JWT 토큰도 지원
    
    Args:
        token: JWT 또는 OAuth 토큰 문자열
        
    Returns:
        dict: 사용자 정보 딕셔너리
        
    Raises:
        AuthenticationError: 토큰 검증 실패시
    """
    async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
        try:
            # 우선 OAuth userinfo 엔드포인트 시도 (SSO 전용)
            oauth_response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/oauth/userinfo",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if oauth_response.status_code == 200:
                oauth_user_data = oauth_response.json()
                logger.info(f"OAuth SSO user authenticated: {oauth_user_data.get('display_name', oauth_user_data.get('email', 'unknown'))}")
                
                # Safe group processing
                groups = []
                for g in oauth_user_data.get("groups", []):
                    if isinstance(g, dict):
                        groups.append(g.get("name", g.get("display_name", str(g))))
                    else:
                        groups.append(str(g))
                
                # OAuth 사용자 정보를 내부 형식으로 변환
                user_data = {
                    "user_id": oauth_user_data.get("sub") or oauth_user_data.get("id") or oauth_user_data.get("user_id"),
                    "username": oauth_user_data.get("display_name") or oauth_user_data.get("username"),
                    "email": oauth_user_data.get("email"),
                    "full_name": oauth_user_data.get("real_name") or oauth_user_data.get("full_name"),
                    "is_active": True,
                    "is_admin": oauth_user_data.get("is_admin", False),
                    "role": "admin" if oauth_user_data.get("is_admin", False) else "user",
                    "groups": groups,
                    "auth_type": "oauth",
                    "permissions": oauth_user_data.get("permissions", []),
                    "scopes": oauth_user_data.get("scopes", [])
                }
                
                # 관리자 권한 향상된 체크 (localhost:8000에서 제공하는 정보 기준)
                if oauth_user_data.get("is_admin") or oauth_user_data.get("role") == "admin":
                    user_data["is_admin"] = True
                    user_data["role"] = "admin"
                
                return user_data
            
            elif oauth_response.status_code != 401:
                # OAuth 엔드포인트에서 401이 아닌 다른 오류가 발생한 경우
                logger.error(f"OAuth userinfo endpoint returned status {oauth_response.status_code}: {oauth_response.text}")
                raise AuthenticationError("OAuth authentication service error")
            
            # OAuth 인증 실패 시 기존 인증 방식으로 fallback (하위 호환성)
            logger.debug("OAuth authentication failed, trying traditional auth as fallback")
            
            # 기존 인증 서버의 /api/auth/me 엔드포인트 호출
            response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if response.status_code == 200:
                user_data = response.json()
                user_data["auth_type"] = "traditional"
                
                # 관리자 권한 정규화
                if user_data.get("is_admin") or user_data.get("role") == "admin":
                    user_data["is_admin"] = True
                    user_data["role"] = "admin"
                
                logger.info(f"Traditional user authenticated: {user_data.get('username', 'unknown')}")
                return user_data
            elif response.status_code == 401:
                logger.warning("Auth server returned 401, trying local JWT decode as final fallback")
                # JWT 토큰 로컬 디코딩 시도 (최종 fallback)
                return decode_jwt_token_locally(token)
            else:
                logger.error(f"Traditional auth server returned status {response.status_code}: {response.text}")
                # JWT 토큰 로컬 디코딩 시도 (최종 fallback)
                return decode_jwt_token_locally(token)
                
        except httpx.RequestError as e:
            logger.error(f"Failed to connect to auth server (localhost:8000): {e}")
            # 네트워크 오류 시 JWT 토큰 로컬 디코딩 시도
            logger.info("Attempting local JWT decode as fallback due to network error")
            return decode_jwt_token_locally(token)

async def get_user_groups_from_auth_server(token: str) -> List[str]:
    """
    외부 인증 서버에서 사용자 그룹 정보 조회
    OAuth와 기존 인증 방식 모두 지원
    
    Args:
        token: JWT 또는 OAuth 토큰 문자열
        
    Returns:
        List[str]: 사용자가 속한 그룹 목록
    """
    async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
        try:
            # 먼저 OAuth userinfo 시도
            oauth_response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/oauth/userinfo",
                headers={"Authorization": f"Bearer {token}"}
            )
            
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
            
            # OAuth 실패 시 기존 방식으로 fallback
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
                    
                logger.info(f"Traditional user groups retrieved: {groups}")
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
        raise AuthorizationError("Admin privileges required")
    
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
        # Generate new key
        key = Fernet.generate_key()
        key_str = key.decode()
        
        # Save to .env file
        env_path = os.path.join(os.path.dirname(__file__), "../../.env")
        try:
            with open(env_path, "a") as f:
                f.write(f"\n# Auto-generated encryption key for sensitive data\n")
                f.write(f"ENCRYPTION_KEY={key_str}\n")
            logger.info("Generated new encryption key and saved to .env")
        except Exception as e:
            logger.warning(f"Could not save encryption key to .env: {e}")
    
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
        f = Fernet(key)
        # Decode from base64 first
        encrypted_bytes = base64.b64decode(encrypted_value.encode())
        decrypted = f.decrypt(encrypted_bytes)
        return decrypted.decode()
    except Exception as e:
        logger.warning(f"Decryption failed, returning original value: {e}")
        # If decryption fails, assume it's not encrypted (for backward compatibility)
        return encrypted_value