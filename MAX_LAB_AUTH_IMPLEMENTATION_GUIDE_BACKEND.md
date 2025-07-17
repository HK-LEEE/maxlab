# MAX Lab 인증 시스템 구현 가이드 - Backend
## FastAPI 기반 OAuth 2.0 + JWT 토큰 관리 시스템

---

## Backend 구현

### 1. 핵심 보안 모듈

**파일: `backend/app/core/security.py`**

```python
import jwt
import httpx
import redis
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging

logger = logging.getLogger(__name__)

class SecurityManager:
    def __init__(self, redis_client: redis.Redis, external_auth_url: str):
        self.redis_client = redis_client
        self.external_auth_url = external_auth_url
        self.security = HTTPBearer(auto_error=False)
    
    async def verify_token(self, credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())) -> Dict[str, Any]:
        """
        다층 토큰 검증 시스템
        1. 토큰 블랙리스트 확인
        2. 외부 인증 서버 검증 (우선)
        3. 전통적인 인증 엔드포인트 (대체)
        4. 로컬 JWT 디코딩 (최종 대체)
        """
        if not credentials:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        token = credentials.credentials
        
        try:
            # 1. 토큰 블랙리스트 확인
            if await self.is_token_blacklisted(token):
                logger.warning(f"Blacklisted token access attempt")
                raise HTTPException(status_code=401, detail="Token has been revoked")
            
            # 2. 외부 인증 서버 검증 시도 (OAuth userinfo 엔드포인트)
            user_data = await self.verify_with_oauth_userinfo(token)
            if user_data:
                logger.info(f"Token verified via OAuth userinfo: user_id={user_data.get('sub')}")
                return self.normalize_user_data(user_data, "oauth_userinfo")
            
            # 3. 전통적인 인증 엔드포인트 시도
            user_data = await self.verify_with_traditional_auth(token)
            if user_data:
                logger.info(f"Token verified via traditional auth: user_id={user_data.get('user_id')}")
                return self.normalize_user_data(user_data, "traditional_auth")
            
            # 4. 로컬 JWT 디코딩 (최종 대체)
            user_data = await self.verify_with_local_jwt(token)
            if user_data:
                logger.warning(f"Token verified via local fallback: user_id={user_data.get('sub')}")
                return self.normalize_user_data(user_data, "local_jwt")
            
            # 모든 검증 실패
            logger.error("All token verification methods failed")
            raise HTTPException(status_code=401, detail="Invalid token")
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Token verification error: {e}")
            raise HTTPException(status_code=401, detail="Token verification failed")
    
    async def verify_with_oauth_userinfo(self, token: str) -> Optional[Dict[str, Any]]:
        """OAuth 2.0 userinfo 엔드포인트로 토큰 검증"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.external_auth_url}/oauth/userinfo",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.debug(f"OAuth userinfo verification failed: {response.status_code}")
                    return None
                    
        except Exception as e:
            logger.debug(f"OAuth userinfo verification error: {e}")
            return None
    
    async def verify_with_traditional_auth(self, token: str) -> Optional[Dict[str, Any]]:
        """전통적인 인증 엔드포인트로 토큰 검증"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.external_auth_url}/api/v1/auth/me",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.debug(f"Traditional auth verification failed: {response.status_code}")
                    return None
                    
        except Exception as e:
            logger.debug(f"Traditional auth verification error: {e}")
            return None
    
    async def verify_with_local_jwt(self, token: str) -> Optional[Dict[str, Any]]:
        """로컬 JWT 디코딩 (서명 검증 없이)"""
        try:
            # 서명 검증 없이 페이로드만 디코딩
            payload = jwt.decode(token, options={"verify_signature": False})
            
            # 기본적인 만료 시간 확인
            if 'exp' in payload:
                exp_timestamp = payload['exp']
                if datetime.fromtimestamp(exp_timestamp, tz=timezone.utc) < datetime.now(timezone.utc):
                    logger.debug("Local JWT verification failed: token expired")
                    return None
            
            return payload
            
        except Exception as e:
            logger.debug(f"Local JWT verification error: {e}")
            return None
    
    def normalize_user_data(self, user_data: Dict[str, Any], source: str) -> Dict[str, Any]:
        """다양한 소스의 사용자 데이터를 표준 형식으로 정규화"""
        normalized = {
            "user_id": None,
            "email": None,
            "name": None,
            "avatar": None,
            "roles": [],
            "permissions": [],
            "groups": [],
            "verification_source": source,
            "verified_at": datetime.now(timezone.utc).isoformat()
        }
        
        # OAuth userinfo 형식
        if source == "oauth_userinfo":
            normalized.update({
                "user_id": user_data.get("sub"),
                "email": user_data.get("email"),
                "name": user_data.get("name") or user_data.get("preferred_username"),
                "avatar": user_data.get("picture"),
                "roles": user_data.get("roles", []),
                "permissions": user_data.get("permissions", []),
                "groups": user_data.get("groups", [])
            })
        
        # 전통적인 인증 형식
        elif source == "traditional_auth":
            normalized.update({
                "user_id": user_data.get("user_id") or user_data.get("id"),
                "email": user_data.get("email"),
                "name": user_data.get("name") or user_data.get("username"),
                "avatar": user_data.get("avatar_url"),
                "roles": user_data.get("roles", []),
                "permissions": user_data.get("permissions", []),
                "groups": user_data.get("groups", [])
            })
        
        # 로컬 JWT 형식
        elif source == "local_jwt":
            normalized.update({
                "user_id": user_data.get("sub") or user_data.get("user_id"),
                "email": user_data.get("email"),
                "name": user_data.get("name") or user_data.get("preferred_username"),
                "avatar": user_data.get("picture"),
                "roles": user_data.get("roles", []),
                "permissions": user_data.get("permissions", []),
                "groups": user_data.get("groups", [])
            })
        
        return normalized
    
    async def is_token_blacklisted(self, token: str) -> bool:
        """토큰 블랙리스트 확인"""
        try:
            # JWT에서 jti (JWT ID) 추출
            payload = jwt.decode(token, options={"verify_signature": False})
            jti = payload.get("jti")
            
            if jti:
                # Redis에서 블랙리스트 확인
                return bool(self.redis_client.get(f"blacklist:{jti}"))
            
            return False
        except Exception:
            # 토큰 파싱 실패 시 블랙리스트되지 않은 것으로 간주
            return False
    
    async def check_admin_permission(self, current_user: Dict[str, Any]) -> bool:
        """관리자 권한 확인"""
        user_roles = current_user.get("roles", [])
        return "admin" in user_roles or "administrator" in user_roles
    
    async def check_group_permission(self, current_user: Dict[str, Any], required_group: str) -> bool:
        """그룹 권한 확인"""
        user_groups = current_user.get("groups", [])
        return required_group in user_groups
    
    async def check_workspace_permission(self, current_user: Dict[str, Any], workspace_id: str) -> bool:
        """워크스페이스 권한 확인"""
        # 관리자는 모든 워크스페이스 접근 가능
        if await self.check_admin_permission(current_user):
            return True
        
        # 사용자별 워크스페이스 권한 확인 로직
        user_workspaces = current_user.get("workspaces", [])
        return workspace_id in user_workspaces

# 전역 보안 관리자 인스턴스
security_manager = None

def get_security_manager() -> SecurityManager:
    global security_manager
    if security_manager is None:
        import redis
        from app.core.config import settings
        
        redis_client = redis.Redis.from_url(settings.REDIS_URL)
        security_manager = SecurityManager(redis_client, settings.EXTERNAL_AUTH_URL)
    
    return security_manager

# 의존성 함수들
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
    security_mgr: SecurityManager = Depends(get_security_manager)
) -> Dict[str, Any]:
    """현재 사용자 정보 조회"""
    return await security_mgr.verify_token(credentials)

async def require_admin(
    current_user: Dict[str, Any] = Depends(get_current_user),
    security_mgr: SecurityManager = Depends(get_security_manager)
) -> Dict[str, Any]:
    """관리자 권한 필요"""
    if not await security_mgr.check_admin_permission(current_user):
        raise HTTPException(status_code=403, detail="Admin permission required")
    return current_user

def require_group(group_name: str):
    """특정 그룹 권한 필요"""
    async def check_group(
        current_user: Dict[str, Any] = Depends(get_current_user),
        security_mgr: SecurityManager = Depends(get_security_manager)
    ) -> Dict[str, Any]:
        if not await security_mgr.check_group_permission(current_user, group_name):
            raise HTTPException(status_code=403, detail=f"Group '{group_name}' permission required")
        return current_user
    return check_group

def require_workspace_access(workspace_id: str):
    """워크스페이스 접근 권한 필요"""
    async def check_workspace(
        current_user: Dict[str, Any] = Depends(get_current_user),
        security_mgr: SecurityManager = Depends(get_security_manager)
    ) -> Dict[str, Any]:
        if not await security_mgr.check_workspace_permission(current_user, workspace_id):
            raise HTTPException(status_code=403, detail=f"Workspace '{workspace_id}' access denied")
        return current_user
    return check_workspace
```

### 2. 토큰 블랙리스트 서비스

**파일: `backend/app/services/token_blacklist.py`**

```python
import redis
import jwt
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Set, Dict, Any

logger = logging.getLogger(__name__)

class TokenBlacklistService:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.blacklist_prefix = "blacklist:"
        self.user_tokens_prefix = "user_tokens:"
    
    async def add_token_to_blacklist(self, token: str, reason: str = "logout") -> bool:
        """토큰을 블랙리스트에 추가"""
        try:
            # JWT에서 정보 추출
            payload = jwt.decode(token, options={"verify_signature": False})
            jti = payload.get("jti")
            exp = payload.get("exp")
            user_id = payload.get("sub") or payload.get("user_id")
            
            if not jti:
                logger.warning("Token has no JTI, cannot blacklist")
                return False
            
            # 만료 시간까지의 TTL 계산
            if exp:
                exp_datetime = datetime.fromtimestamp(exp, tz=timezone.utc)
                ttl = int((exp_datetime - datetime.now(timezone.utc)).total_seconds())
                
                if ttl <= 0:
                    logger.debug("Token already expired, no need to blacklist")
                    return True
            else:
                # 기본 TTL (24시간)
                ttl = 24 * 60 * 60
            
            # Redis에 블랙리스트 항목 추가
            blacklist_key = f"{self.blacklist_prefix}{jti}"
            blacklist_data = {
                "reason": reason,
                "blacklisted_at": datetime.now(timezone.utc).isoformat(),
                "user_id": user_id,
                "exp": exp
            }
            
            # JSON으로 직렬화하여 저장
            import json
            self.redis.setex(blacklist_key, ttl, json.dumps(blacklist_data))
            
            logger.info(f"Token blacklisted: jti={jti}, user_id={user_id}, reason={reason}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to blacklist token: {e}")
            return False
    
    async def is_token_blacklisted(self, token: str) -> bool:
        """토큰이 블랙리스트에 있는지 확인"""
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            jti = payload.get("jti")
            
            if not jti:
                return False
            
            blacklist_key = f"{self.blacklist_prefix}{jti}"
            return bool(self.redis.get(blacklist_key))
            
        except Exception as e:
            logger.debug(f"Error checking blacklist: {e}")
            return False
    
    async def blacklist_user_tokens(self, user_id: str, reason: str = "logout_all") -> int:
        """사용자의 모든 토큰을 블랙리스트에 추가"""
        try:
            # 사용자 토큰 목록 조회
            user_tokens_key = f"{self.user_tokens_prefix}{user_id}"
            token_jtis = self.redis.smembers(user_tokens_key)
            
            blacklisted_count = 0
            for jti_bytes in token_jtis:
                jti = jti_bytes.decode('utf-8')
                
                # 블랙리스트에 추가
                blacklist_key = f"{self.blacklist_prefix}{jti}"
                blacklist_data = {
                    "reason": reason,
                    "blacklisted_at": datetime.now(timezone.utc).isoformat(),
                    "user_id": user_id
                }
                
                import json
                # 기본 TTL (24시간)
                self.redis.setex(blacklist_key, 24 * 60 * 60, json.dumps(blacklist_data))
                blacklisted_count += 1
            
            # 사용자 토큰 목록 정리
            self.redis.delete(user_tokens_key)
            
            logger.info(f"Blacklisted {blacklisted_count} tokens for user {user_id}")
            return blacklisted_count
            
        except Exception as e:
            logger.error(f"Failed to blacklist user tokens: {e}")
            return 0
    
    async def track_user_token(self, user_id: str, jti: str, exp: Optional[int] = None) -> None:
        """사용자 토큰 추적"""
        try:
            user_tokens_key = f"{self.user_tokens_prefix}{user_id}"
            
            # 토큰 JTI를 사용자 세트에 추가
            self.redis.sadd(user_tokens_key, jti)
            
            # 세트 만료 시간 설정 (토큰 만료 시간 기준)
            if exp:
                exp_datetime = datetime.fromtimestamp(exp, tz=timezone.utc)
                ttl = int((exp_datetime - datetime.now(timezone.utc)).total_seconds())
                if ttl > 0:
                    self.redis.expire(user_tokens_key, ttl)
            else:
                # 기본 만료 시간 (7일)
                self.redis.expire(user_tokens_key, 7 * 24 * 60 * 60)
                
        except Exception as e:
            logger.error(f"Failed to track user token: {e}")
    
    async def get_blacklisted_tokens(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """블랙리스트된 토큰 목록 조회 (디버깅용)"""
        try:
            pattern = f"{self.blacklist_prefix}*"
            keys = self.redis.keys(pattern)
            
            tokens = {}
            for key in keys:
                jti = key.decode('utf-8').replace(self.blacklist_prefix, '')
                data = self.redis.get(key)
                
                if data:
                    import json
                    token_info = json.loads(data)
                    
                    # 특정 사용자 필터링
                    if user_id and token_info.get("user_id") != user_id:
                        continue
                    
                    tokens[jti] = token_info
            
            return tokens
            
        except Exception as e:
            logger.error(f"Failed to get blacklisted tokens: {e}")
            return {}
    
    async def cleanup_expired_tokens(self) -> int:
        """만료된 블랙리스트 토큰 정리"""
        try:
            pattern = f"{self.blacklist_prefix}*"
            keys = self.redis.keys(pattern)
            
            cleaned_count = 0
            for key in keys:
                ttl = self.redis.ttl(key)
                if ttl == -1:  # TTL이 설정되지 않은 경우
                    self.redis.delete(key)
                    cleaned_count += 1
            
            logger.info(f"Cleaned up {cleaned_count} expired blacklist entries")
            return cleaned_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup expired tokens: {e}")
            return 0

# 전역 블랙리스트 서비스 인스턴스
blacklist_service = None

def get_blacklist_service() -> TokenBlacklistService:
    global blacklist_service
    if blacklist_service is None:
        import redis
        from app.core.config import settings
        
        redis_client = redis.Redis.from_url(settings.REDIS_URL)
        blacklist_service = TokenBlacklistService(redis_client)
    
    return blacklist_service
```

### 3. 세션 관리 서비스

**파일: `backend/app/services/session_manager.py`**

```python
import secrets
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from cryptography.fernet import Fernet
import redis
import logging

logger = logging.getLogger(__name__)

class SessionManager:
    def __init__(self, redis_client: redis.Redis, encryption_key: Optional[str] = None):
        self.redis = redis_client
        self.session_prefix = "session:"
        self.user_sessions_prefix = "user_sessions:"
        
        # 암호화 키 설정
        if encryption_key:
            self.fernet = Fernet(encryption_key.encode())
        else:
            # 새 키 생성 (프로덕션에서는 고정된 키 사용 필요)
            key = Fernet.generate_key()
            self.fernet = Fernet(key)
            logger.warning("Using auto-generated encryption key. Use fixed key in production.")
    
    async def create_session(self, user_id: str, user_data: Dict[str, Any], 
                           ip_address: str, user_agent: str) -> str:
        """새 세션 생성"""
        try:
            # 세션 ID 생성
            session_id = self.generate_session_id()
            
            # 세션 데이터 구성
            session_data = {
                "user_id": user_id,
                "user_data": user_data,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_accessed": datetime.now(timezone.utc).isoformat(),
                "access_count": 1
            }
            
            # 데이터 암호화
            encrypted_data = self.encrypt_session_data(session_data)
            
            # Redis에 저장 (기본 1시간 TTL)
            session_key = f"{self.session_prefix}{session_id}"
            ttl = 60 * 60  # 1시간
            
            self.redis.setex(session_key, ttl, encrypted_data)
            
            # 사용자별 세션 추적
            await self.track_user_session(user_id, session_id)
            
            logger.info(f"Session created: session_id={session_id}, user_id={user_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"Failed to create session: {e}")
            raise
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """세션 데이터 조회"""
        try:
            session_key = f"{self.session_prefix}{session_id}"
            encrypted_data = self.redis.get(session_key)
            
            if not encrypted_data:
                return None
            
            # 복호화
            session_data = self.decrypt_session_data(encrypted_data)
            
            # 접근 시간 업데이트
            await self.update_session_access(session_id, session_data)
            
            return session_data
            
        except Exception as e:
            logger.error(f"Failed to get session: {e}")
            return None
    
    async def update_session_access(self, session_id: str, session_data: Dict[str, Any]) -> None:
        """세션 접근 시간 업데이트"""
        try:
            session_data["last_accessed"] = datetime.now(timezone.utc).isoformat()
            session_data["access_count"] = session_data.get("access_count", 0) + 1
            
            # 다시 암호화하여 저장
            encrypted_data = self.encrypt_session_data(session_data)
            session_key = f"{self.session_prefix}{session_id}"
            
            # TTL 연장 (1시간)
            self.redis.setex(session_key, 60 * 60, encrypted_data)
            
        except Exception as e:
            logger.error(f"Failed to update session access: {e}")
    
    async def invalidate_session(self, session_id: str) -> bool:
        """세션 무효화"""
        try:
            # 세션 데이터 조회 (사용자 ID 추출용)
            session_data = await self.get_session(session_id)
            
            # Redis에서 세션 삭제
            session_key = f"{self.session_prefix}{session_id}"
            deleted = self.redis.delete(session_key)
            
            # 사용자 세션 추적에서 제거
            if session_data:
                user_id = session_data.get("user_id")
                if user_id:
                    await self.untrack_user_session(user_id, session_id)
            
            logger.info(f"Session invalidated: session_id={session_id}")
            return bool(deleted)
            
        except Exception as e:
            logger.error(f"Failed to invalidate session: {e}")
            return False
    
    async def invalidate_user_sessions(self, user_id: str) -> int:
        """사용자의 모든 세션 무효화"""
        try:
            # 사용자 세션 목록 조회
            user_sessions_key = f"{self.user_sessions_prefix}{user_id}"
            session_ids = self.redis.smembers(user_sessions_key)
            
            invalidated_count = 0
            for session_id_bytes in session_ids:
                session_id = session_id_bytes.decode('utf-8')
                
                # 개별 세션 무효화
                session_key = f"{self.session_prefix}{session_id}"
                if self.redis.delete(session_key):
                    invalidated_count += 1
            
            # 사용자 세션 추적 정리
            self.redis.delete(user_sessions_key)
            
            logger.info(f"Invalidated {invalidated_count} sessions for user {user_id}")
            return invalidated_count
            
        except Exception as e:
            logger.error(f"Failed to invalidate user sessions: {e}")
            return 0
    
    async def rotate_session_id(self, old_session_id: str) -> Optional[str]:
        """세션 ID 회전 (세션 고정 공격 방지)"""
        try:
            # 기존 세션 데이터 조회
            session_data = await self.get_session(old_session_id)
            if not session_data:
                return None
            
            # 새 세션 ID 생성
            new_session_id = self.generate_session_id()
            
            # 새 세션으로 데이터 복사
            encrypted_data = self.encrypt_session_data(session_data)
            new_session_key = f"{self.session_prefix}{new_session_id}"
            self.redis.setex(new_session_key, 60 * 60, encrypted_data)
            
            # 사용자 세션 추적 업데이트
            user_id = session_data.get("user_id")
            if user_id:
                await self.untrack_user_session(user_id, old_session_id)
                await self.track_user_session(user_id, new_session_id)
            
            # 기존 세션 삭제
            old_session_key = f"{self.session_prefix}{old_session_id}"
            self.redis.delete(old_session_key)
            
            logger.info(f"Session ID rotated: {old_session_id} -> {new_session_id}")
            return new_session_id
            
        except Exception as e:
            logger.error(f"Failed to rotate session ID: {e}")
            return None
    
    async def get_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """사용자의 활성 세션 목록 조회"""
        try:
            user_sessions_key = f"{self.user_sessions_prefix}{user_id}"
            session_ids = self.redis.smembers(user_sessions_key)
            
            sessions = []
            for session_id_bytes in session_ids:
                session_id = session_id_bytes.decode('utf-8')
                session_data = await self.get_session(session_id)
                
                if session_data:
                    sessions.append({
                        "session_id": session_id,
                        "ip_address": session_data.get("ip_address"),
                        "user_agent": session_data.get("user_agent"),
                        "created_at": session_data.get("created_at"),
                        "last_accessed": session_data.get("last_accessed"),
                        "access_count": session_data.get("access_count", 0)
                    })
            
            return sessions
            
        except Exception as e:
            logger.error(f"Failed to get user sessions: {e}")
            return []
    
    async def track_user_session(self, user_id: str, session_id: str) -> None:
        """사용자 세션 추적에 추가"""
        try:
            user_sessions_key = f"{self.user_sessions_prefix}{user_id}"
            self.redis.sadd(user_sessions_key, session_id)
            
            # 세션 추적 만료 시간 설정 (24시간)
            self.redis.expire(user_sessions_key, 24 * 60 * 60)
            
        except Exception as e:
            logger.error(f"Failed to track user session: {e}")
    
    async def untrack_user_session(self, user_id: str, session_id: str) -> None:
        """사용자 세션 추적에서 제거"""
        try:
            user_sessions_key = f"{self.user_sessions_prefix}{user_id}"
            self.redis.srem(user_sessions_key, session_id)
            
        except Exception as e:
            logger.error(f"Failed to untrack user session: {e}")
    
    def generate_session_id(self) -> str:
        """안전한 세션 ID 생성"""
        # 256비트 랜덤 데이터를 SHA-256으로 해시
        random_data = secrets.token_bytes(32)
        return hashlib.sha256(random_data).hexdigest()
    
    def encrypt_session_data(self, data: Dict[str, Any]) -> bytes:
        """세션 데이터 암호화"""
        json_data = json.dumps(data, ensure_ascii=False)
        return self.fernet.encrypt(json_data.encode('utf-8'))
    
    def decrypt_session_data(self, encrypted_data: bytes) -> Dict[str, Any]:
        """세션 데이터 복호화"""
        decrypted_data = self.fernet.decrypt(encrypted_data)
        return json.loads(decrypted_data.decode('utf-8'))

# 전역 세션 관리자 인스턴스
session_manager = None

def get_session_manager() -> SessionManager:
    global session_manager
    if session_manager is None:
        import redis
        from app.core.config import settings
        
        redis_client = redis.Redis.from_url(settings.REDIS_URL)
        session_manager = SessionManager(redis_client, settings.SESSION_ENCRYPTION_KEY)
    
    return session_manager
```

### 4. 인증 프록시 서비스

**파일: `backend/app/services/auth_proxy.py`**

```python
import httpx
import logging
from typing import Dict, Any, Optional
from fastapi import HTTPException

logger = logging.getLogger(__name__)

class AuthProxyService:
    def __init__(self, external_auth_url: str, timeout: float = 30.0):
        self.external_auth_url = external_auth_url
        self.timeout = timeout
    
    async def proxy_oauth_authorize(self, params: Dict[str, str]) -> Dict[str, Any]:
        """OAuth 인증 요청 프록시"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.external_auth_url}/oauth/authorize",
                    params=params
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"OAuth authorize proxy failed: {response.status_code}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail="OAuth authorization failed"
                    )
                    
        except httpx.TimeoutException:
            logger.error("OAuth authorize proxy timeout")
            raise HTTPException(status_code=504, detail="OAuth server timeout")
        except Exception as e:
            logger.error(f"OAuth authorize proxy error: {e}")
            raise HTTPException(status_code=502, detail="OAuth server error")
    
    async def proxy_token_exchange(self, data: Dict[str, str]) -> Dict[str, Any]:
        """토큰 교환 요청 프록시"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.external_auth_url}/oauth/token",
                    data=data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Token exchange proxy failed: {response.status_code}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail="Token exchange failed"
                    )
                    
        except httpx.TimeoutException:
            logger.error("Token exchange proxy timeout")
            raise HTTPException(status_code=504, detail="OAuth server timeout")
        except Exception as e:
            logger.error(f"Token exchange proxy error: {e}")
            raise HTTPException(status_code=502, detail="OAuth server error")
    
    async def proxy_userinfo(self, access_token: str) -> Dict[str, Any]:
        """사용자 정보 요청 프록시"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.external_auth_url}/oauth/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Userinfo proxy failed: {response.status_code}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail="Failed to get user info"
                    )
                    
        except httpx.TimeoutException:
            logger.error("Userinfo proxy timeout")
            raise HTTPException(status_code=504, detail="OAuth server timeout")
        except Exception as e:
            logger.error(f"Userinfo proxy error: {e}")
            raise HTTPException(status_code=502, detail="OAuth server error")
    
    async def proxy_token_revocation(self, token: str, token_type: str = "refresh_token") -> bool:
        """토큰 폐기 요청 프록시"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.external_auth_url}/oauth/revoke",
                    data={
                        "token": token,
                        "token_type_hint": token_type
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                
                # RFC 7009에 따르면 200 또는 204가 성공
                return response.status_code in [200, 204]
                
        except Exception as e:
            logger.error(f"Token revocation proxy error: {e}")
            return False
    
    async def check_server_health(self) -> Dict[str, Any]:
        """인증 서버 상태 확인"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.external_auth_url}/health")
                
                return {
                    "status": "healthy" if response.status_code == 200 else "unhealthy",
                    "status_code": response.status_code,
                    "response_time": response.elapsed.total_seconds()
                }
                
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return {
                "status": "unhealthy",
                "error": str(e),
                "response_time": None
            }

# 전역 프록시 서비스 인스턴스
auth_proxy_service = None

def get_auth_proxy_service() -> AuthProxyService:
    global auth_proxy_service
    if auth_proxy_service is None:
        from app.core.config import settings
        auth_proxy_service = AuthProxyService(settings.EXTERNAL_AUTH_URL)
    
    return auth_proxy_service
```

### 5. 인증 라우터

**파일: `backend/app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging

from app.core.security import get_current_user, get_security_manager
from app.services.auth_proxy import get_auth_proxy_service, AuthProxyService
from app.services.session_manager import get_session_manager, SessionManager
from app.services.token_blacklist import get_blacklist_service, TokenBlacklistService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/oauth", tags=["OAuth 2.0"])

class TokenRequest(BaseModel):
    grant_type: str
    code: Optional[str] = None
    redirect_uri: Optional[str] = None
    code_verifier: Optional[str] = None
    refresh_token: Optional[str] = None
    client_id: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    scope: Optional[str] = None

@router.get("/authorize")
async def oauth_authorize(
    request: Request,
    auth_proxy: AuthProxyService = Depends(get_auth_proxy_service)
):
    """OAuth 2.0 인증 시작 엔드포인트"""
    try:
        # 쿼리 파라미터 추출
        params = dict(request.query_params)
        
        logger.info(f"OAuth authorize request: client_id={params.get('client_id')}")
        
        # 외부 인증 서버로 프록시
        result = await auth_proxy.proxy_oauth_authorize(params)
        
        # 인증 URL로 리다이렉트
        if "authorization_url" in result:
            return RedirectResponse(url=result["authorization_url"])
        else:
            return result
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth authorize error: {e}")
        raise HTTPException(status_code=500, detail="OAuth authorization failed")

@router.post("/token", response_model=TokenResponse)
async def oauth_token(
    token_request: TokenRequest,
    request: Request,
    auth_proxy: AuthProxyService = Depends(get_auth_proxy_service),
    session_manager: SessionManager = Depends(get_session_manager),
    blacklist_service: TokenBlacklistService = Depends(get_blacklist_service)
):
    """OAuth 2.0 토큰 교환/갱신 엔드포인트"""
    try:
        # 요청 데이터 변환
        token_data = token_request.dict(exclude_none=True)
        
        logger.info(f"Token request: grant_type={token_data.get('grant_type')}")
        
        # 외부 인증 서버로 프록시
        result = await auth_proxy.proxy_token_exchange(token_data)
        
        # 새 토큰인 경우 세션 생성
        if token_request.grant_type == "authorization_code":
            # 사용자 정보 조회
            access_token = result["access_token"]
            user_info = await auth_proxy.proxy_userinfo(access_token)
            
            # 세션 생성
            await session_manager.create_session(
                user_id=user_info.get("sub"),
                user_data=user_info,
                ip_address=request.client.host,
                user_agent=request.headers.get("user-agent", "")
            )
            
            logger.info(f"New session created for user: {user_info.get('sub')}")
        
        # 토큰 추적 (블랙리스트용)
        if "refresh_token" in result:
            import jwt
            try:
                payload = jwt.decode(result["access_token"], options={"verify_signature": False})
                user_id = payload.get("sub")
                jti = payload.get("jti")
                exp = payload.get("exp")
                
                if user_id and jti:
                    await blacklist_service.track_user_token(user_id, jti, exp)
            except Exception as e:
                logger.warning(f"Failed to track token: {e}")
        
        return TokenResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token exchange error: {e}")
        raise HTTPException(status_code=500, detail="Token exchange failed")

@router.get("/userinfo")
async def oauth_userinfo(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """OAuth 2.0 사용자 정보 엔드포인트"""
    try:
        return {
            "sub": current_user["user_id"],
            "email": current_user["email"],
            "name": current_user["name"],
            "picture": current_user.get("avatar"),
            "roles": current_user.get("roles", []),
            "permissions": current_user.get("permissions", []),
            "groups": current_user.get("groups", []),
            "verified_at": current_user.get("verified_at")
        }
        
    except Exception as e:
        logger.error(f"Userinfo error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get user info")

@router.post("/revoke")
async def oauth_revoke(
    request: Request,
    auth_proxy: AuthProxyService = Depends(get_auth_proxy_service),
    blacklist_service: TokenBlacklistService = Depends(get_blacklist_service)
):
    """OAuth 2.0 토큰 폐기 엔드포인트"""
    try:
        form_data = await request.form()
        token = form_data.get("token")
        token_type = form_data.get("token_type_hint", "refresh_token")
        
        if not token:
            raise HTTPException(status_code=400, detail="Token is required")
        
        # 로컬 블랙리스트에 추가
        await blacklist_service.add_token_to_blacklist(token, "revoked")
        
        # 외부 서버에도 폐기 요청
        await auth_proxy.proxy_token_revocation(token, token_type)
        
        logger.info(f"Token revoked: type={token_type}")
        return {"status": "success"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token revocation error: {e}")
        raise HTTPException(status_code=500, detail="Token revocation failed")

@router.post("/token/validate")
async def validate_token(
    request: Request,
    blacklist_service: TokenBlacklistService = Depends(get_blacklist_service)
):
    """토큰 유효성 검증 엔드포인트"""
    try:
        data = await request.json()
        token = data.get("refresh_token") or data.get("access_token")
        
        if not token:
            raise HTTPException(status_code=400, detail="Token is required")
        
        # 블랙리스트 확인
        is_blacklisted = await blacklist_service.is_token_blacklisted(token)
        
        if is_blacklisted:
            return {"valid": False, "reason": "Token is blacklisted"}
        
        # 추가 검증 로직 (필요시)
        # ...
        
        return {"valid": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise HTTPException(status_code=500, detail="Token validation failed")
```

### 6. 강화된 로그아웃 라우터

**파일: `backend/app/routers/auth_logout.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging

from app.core.security import get_current_user
from app.services.session_manager import get_session_manager, SessionManager
from app.services.token_blacklist import get_blacklist_service, TokenBlacklistService
from app.services.auth_proxy import get_auth_proxy_service, AuthProxyService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None
    logout_all_devices: bool = False

@router.post("/logout")
async def enhanced_logout(
    logout_request: LogoutRequest,
    request: Request,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_user),
    session_manager: SessionManager = Depends(get_session_manager),
    blacklist_service: TokenBlacklistService = Depends(get_blacklist_service),
    auth_proxy: AuthProxyService = Depends(get_auth_proxy_service)
):
    """강화된 로그아웃 엔드포인트"""
    try:
        user_id = current_user["user_id"]
        logger.info(f"Logout request: user_id={user_id}, logout_all={logout_request.logout_all_devices}")
        
        # 1. 현재 액세스 토큰 블랙리스트에 추가
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            access_token = auth_header[7:]
            await blacklist_service.add_token_to_blacklist(access_token, "logout")
        
        # 2. 리프레시 토큰 처리
        if logout_request.refresh_token:
            # 블랙리스트에 추가
            await blacklist_service.add_token_to_blacklist(logout_request.refresh_token, "logout")
            
            # 외부 서버에 폐기 요청
            try:
                await auth_proxy.proxy_token_revocation(logout_request.refresh_token, "refresh_token")
            except Exception as e:
                logger.warning(f"External token revocation failed: {e}")
        
        # 3. 모든 디바이스 로그아웃 처리
        if logout_request.logout_all_devices:
            # 사용자의 모든 토큰 블랙리스트에 추가
            blacklisted_count = await blacklist_service.blacklist_user_tokens(user_id, "logout_all")
            
            # 모든 세션 무효화
            invalidated_sessions = await session_manager.invalidate_user_sessions(user_id)
            
            logger.info(f"Logout all devices: user_id={user_id}, tokens_blacklisted={blacklisted_count}, sessions_invalidated={invalidated_sessions}")
        else:
            # 현재 세션만 무효화 (세션 ID가 있는 경우)
            session_id = request.headers.get("X-Session-ID")
            if session_id:
                await session_manager.invalidate_session(session_id)
        
        # 4. 응답 쿠키 정리
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        response.delete_cookie("session_id", path="/")
        
        # 5. 보안 헤더 설정
        response.headers["Clear-Site-Data"] = '"cache", "cookies", "storage"'
        
        return {
            "status": "success",
            "message": "Successfully logged out",
            "logout_all_devices": logout_request.logout_all_devices,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Logout error: {e}")
        raise HTTPException(status_code=500, detail="Logout failed")

@router.post("/logout/all")
async def logout_all_devices(
    request: Request,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_user),
    session_manager: SessionManager = Depends(get_session_manager),
    blacklist_service: TokenBlacklistService = Depends(get_blacklist_service)
):
    """모든 디바이스에서 로그아웃"""
    try:
        user_id = current_user["user_id"]
        logger.info(f"Logout all devices: user_id={user_id}")
        
        # 사용자의 모든 토큰 블랙리스트에 추가
        blacklisted_count = await blacklist_service.blacklist_user_tokens(user_id, "logout_all")
        
        # 모든 세션 무효화
        invalidated_sessions = await session_manager.invalidate_user_sessions(user_id)
        
        # 응답 쿠키 정리
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        response.delete_cookie("session_id", path="/")
        response.headers["Clear-Site-Data"] = '"cache", "cookies", "storage"'
        
        return {
            "status": "success",
            "message": "Successfully logged out from all devices",
            "tokens_blacklisted": blacklisted_count,
            "sessions_invalidated": invalidated_sessions,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Logout all devices error: {e}")
        raise HTTPException(status_code=500, detail="Failed to logout from all devices")

@router.get("/sessions")
async def get_user_sessions(
    current_user: Dict[str, Any] = Depends(get_current_user),
    session_manager: SessionManager = Depends(get_session_manager)
):
    """사용자의 활성 세션 목록 조회"""
    try:
        user_id = current_user["user_id"]
        sessions = await session_manager.get_user_sessions(user_id)
        
        return {
            "user_id": user_id,
            "active_sessions": len(sessions),
            "sessions": sessions
        }
        
    except Exception as e:
        logger.error(f"Get user sessions error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get user sessions")

@router.delete("/sessions/{session_id}")
async def terminate_session(
    session_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    session_manager: SessionManager = Depends(get_session_manager)
):
    """특정 세션 종료"""
    try:
        user_id = current_user["user_id"]
        
        # 세션 소유자 확인
        session_data = await session_manager.get_session(session_id)
        if not session_data or session_data.get("user_id") != user_id:
            raise HTTPException(status_code=404, detail="Session not found or not owned by user")
        
        # 세션 무효화
        success = await session_manager.invalidate_session(session_id)
        
        if success:
            return {"status": "success", "message": "Session terminated"}
        else:
            raise HTTPException(status_code=500, detail="Failed to terminate session")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Terminate session error: {e}")
        raise HTTPException(status_code=500, detail="Failed to terminate session")
```

---

## 설정 및 배포

### 1. 환경 변수 설정

**파일: `.env`**

```bash
# 애플리케이션 설정
APP_NAME=MaxLab Platform
DEBUG=false
ENVIRONMENT=production

# 데이터베이스
DATABASE_URL=postgresql://user:password@localhost/maxlab
REDIS_URL=redis://localhost:6379/0

# 외부 인증 서버
EXTERNAL_AUTH_URL=http://localhost:8000

# 보안 키
SECRET_KEY=your-super-secret-key-here
SESSION_ENCRYPTION_KEY=your-session-encryption-key-here

# JWT 설정 (옵션 - 로컬 fallback용)
JWT_SECRET_KEY=your-jwt-secret-key
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=15

# CORS 설정
CORS_ORIGINS=["http://localhost:3000", "https://yourdomain.com"]

# 로깅
LOG_LEVEL=INFO
```

### 2. 의존성 설치

**파일: `requirements.txt`**

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
redis==5.0.1
httpx==0.25.2
pydantic==2.5.0
pydantic-settings==2.1.0
python-jose[cryptography]==3.3.0
cryptography==41.0.8
python-multipart==0.0.6
```

### 3. Docker 설정

**파일: `Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**파일: `docker-compose.yml`**

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/maxlab
      - REDIS_URL=redis://redis:6379/0
      - EXTERNAL_AUTH_URL=http://auth-server:8000
    depends_on:
      - db
      - redis
      - auth-server
    
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: maxlab
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    
  auth-server:
    image: your-auth-server:latest
    ports:
      - "8000:8000"

volumes:
  postgres_data:
  redis_data:
```

이 가이드를 통해 MAX Lab과 동일한 수준의 인증 시스템을 구현할 수 있습니다! 🚀