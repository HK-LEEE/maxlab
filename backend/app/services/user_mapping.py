"""
사용자 매핑 서비스
외부 인증 시스템의 사용자 정보를 UUID 기반으로 매핑하고 캐싱하는 서비스
"""
import uuid
import hashlib
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from ..core.config import settings
from ..core.security import verify_token_with_auth_server

logger = logging.getLogger(__name__)


class UserMappingService:
    """사용자 UUID 매핑 및 캐싱 서비스"""
    
    def __init__(self):
        self.cache = {}  # 메모리 캐시 (실제로는 Redis 등 사용 권장)
        self.cache_ttl = settings.USER_MAPPING_CACHE_TTL
    
    async def get_user_uuid_by_email(self, email: str) -> Optional[uuid.UUID]:
        """이메일을 통해 사용자 UUID 조회"""
        try:
            # 1. 캐시 확인
            cache_key = f"user_email:{email}"
            if cache_key in self.cache:
                cached_data = self.cache[cache_key]
                if datetime.now() < cached_data['expires']:
                    return cached_data['uuid']
            
            # 2. 외부 인증 서버에서 사용자 정보 조회
            user_uuid = await self._fetch_user_uuid_from_auth_server(email)
            
            if user_uuid:
                # 3. 캐시에 저장
                self.cache[cache_key] = {
                    'uuid': user_uuid,
                    'expires': datetime.now() + timedelta(seconds=self.cache_ttl)
                }
                return user_uuid
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get user UUID for email {email}: {e}")
            return None
    
    async def get_user_info_by_uuid(self, user_uuid: uuid.UUID) -> Optional[Dict[str, Any]]:
        """UUID를 통해 사용자 정보 조회"""
        try:
            # 1. 캐시 확인
            cache_key = f"user_uuid:{str(user_uuid)}"
            if cache_key in self.cache:
                cached_data = self.cache[cache_key]
                if datetime.now() < cached_data['expires']:
                    return cached_data['info']
            
            # 2. 외부 인증 서버에서 사용자 정보 조회
            user_info = await self._fetch_user_info_from_auth_server(user_uuid)
            
            if user_info:
                # 3. 캐시에 저장
                self.cache[cache_key] = {
                    'info': user_info,
                    'expires': datetime.now() + timedelta(seconds=self.cache_ttl)
                }
                return user_info
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get user info for UUID {user_uuid}: {e}")
            return None
    
    async def get_user_uuid_by_identifier(self, identifier: str) -> Optional[uuid.UUID]:
        """식별자(이메일 또는 사용자명)를 통해 UUID 조회"""
        try:
            # 이메일 형식인지 확인
            if '@' in identifier:
                return await self.get_user_uuid_by_email(identifier)
            else:
                # 사용자명으로 조회
                return await self._fetch_user_uuid_by_username(identifier)
                
        except Exception as e:
            logger.error(f"Failed to get user UUID for identifier {identifier}: {e}")
            return None
    
    async def map_legacy_users_to_uuid(self, user_identifiers: List[str]) -> Dict[str, Optional[uuid.UUID]]:
        """레거시 사용자 식별자들을 일괄 UUID로 매핑"""
        mapping = {}
        
        for identifier in user_identifiers:
            try:
                user_uuid = await self.get_user_uuid_by_identifier(identifier)
                mapping[identifier] = user_uuid
                
                if user_uuid is None:
                    logger.warning(f"Could not map user identifier '{identifier}' to UUID")
                    
            except Exception as e:
                logger.error(f"Error mapping user '{identifier}': {e}")
                mapping[identifier] = None
        
        return mapping
    
    async def _fetch_user_uuid_from_auth_server(self, email: str) -> Optional[uuid.UUID]:
        """외부 인증 서버에서 이메일로 사용자 UUID 조회"""
        try:
            async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
                # OAuth userinfo API 또는 사용자 검색 API 사용
                response = await client.get(
                    settings.full_auth_users_search_url,
                    params={"email": email},
                    headers={"Authorization": f"Bearer {await self._get_service_token()}"}
                )
                
                if response.status_code == 200:
                    users = response.json()
                    if users and len(users) > 0:
                        user_data = users[0]
                        # 사용자 ID를 UUID로 변환
                        user_id = user_data.get('id') or user_data.get('user_id') or user_data.get('sub')
                        if user_id:
                            return uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
                
                return None
                
        except Exception as e:
            logger.error(f"Failed to fetch user UUID from auth server for email {email}: {e}")
            return None
    
    async def _fetch_user_info_from_auth_server(self, user_uuid: uuid.UUID) -> Optional[Dict[str, Any]]:
        """외부 인증 서버에서 UUID로 사용자 정보 조회"""
        try:
            async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
                response = await client.get(
                    f"{settings.get_auth_server_url().rstrip('/')}/api/users/{str(user_uuid)}",
                    headers={"Authorization": f"Bearer {await self._get_service_token()}"}
                )
                
                if response.status_code == 200:
                    user_data = response.json()
                    return {
                        'user_id': user_uuid,
                        'email': user_data.get('email'),
                        'display_name': user_data.get('display_name') or user_data.get('username'),
                        'full_name': user_data.get('full_name') or user_data.get('real_name'),
                        'is_active': user_data.get('is_active', True),
                        'updated_at': datetime.now()
                    }
                
                return None
                
        except Exception as e:
            logger.error(f"Failed to fetch user info from auth server for UUID {user_uuid}: {e}")
            return None
    
    async def _fetch_user_uuid_by_username(self, username: str) -> Optional[uuid.UUID]:
        """사용자명으로 UUID 조회"""
        try:
            async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
                response = await client.get(
                    settings.full_auth_users_search_url,
                    params={"username": username},
                    headers={"Authorization": f"Bearer {await self._get_service_token()}"}
                )
                
                if response.status_code == 200:
                    users = response.json()
                    if users and len(users) > 0:
                        user_data = users[0]
                        user_id = user_data.get('id') or user_data.get('user_id') or user_data.get('sub')
                        if user_id:
                            return uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
                
                return None
                
        except Exception as e:
            logger.error(f"Failed to fetch user UUID by username {username}: {e}")
            return None
    
    async def _get_service_token(self) -> str:
        """서비스 간 통신용 토큰 획득"""
        # 실제로는 서비스 계정 토큰 또는 클라이언트 자격 증명 플로우 사용
        return settings.SERVICE_TOKEN
    
    def generate_deterministic_uuid(self, identifier: str, namespace: str = None) -> uuid.UUID:
        """식별자 기반 결정적 UUID 생성 (마이그레이션용)"""
        if not settings.ENABLE_DETERMINISTIC_UUID_GENERATION:
            raise ValueError("Deterministic UUID generation is disabled")
        
        # 네임스페이스 설정에서 가져오기
        namespace = namespace or settings.UUID_NAMESPACE_USERS
        
        # UUID5를 사용하여 결정적 UUID 생성
        namespace_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, namespace)
        return uuid.uuid5(namespace_uuid, identifier)
    
    def clear_cache(self):
        """캐시 초기화"""
        self.cache.clear()
        logger.info("User mapping cache cleared")


# 싱글톤 인스턴스
user_mapping_service = UserMappingService()