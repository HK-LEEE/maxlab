"""
그룹 매핑 서비스
외부 그룹 시스템의 그룹 정보를 UUID 기반으로 매핑하고 캐싱하는 서비스
"""
import uuid
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import httpx

from ..core.config import settings

logger = logging.getLogger(__name__)


class GroupMappingService:
    """그룹 UUID 매핑 및 캐싱 서비스"""
    
    def __init__(self):
        self.cache = {}  # 메모리 캐시 (실제로는 Redis 등 사용 권장)
        self.cache_ttl = settings.GROUP_MAPPING_CACHE_TTL
    
    async def get_group_uuid_by_name(self, group_name: str, user_token: str) -> Optional[uuid.UUID]:
        """그룹명을 통해 그룹 UUID 조회 (사용자 토큰 사용)"""
        try:
            # 1. 캐시 확인
            cache_key = f"group_name:{group_name}"
            if cache_key in self.cache:
                cached_data = self.cache[cache_key]
                if datetime.now() < cached_data['expires']:
                    return cached_data['uuid']
            
            # 2. 외부 인증 서버에서 그룹 정보 조회 (사용자 토큰 사용)
            group_uuid = await self._fetch_group_uuid_from_auth_server(group_name, user_token)
            
            if group_uuid:
                # 3. 캐시에 저장
                self.cache[cache_key] = {
                    'uuid': group_uuid,
                    'expires': datetime.now() + timedelta(seconds=self.cache_ttl)
                }
                return group_uuid
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get group UUID for name {group_name}: {e}")
            return None
    
    async def get_group_info_by_uuid(self, group_uuid: uuid.UUID, user_token: str) -> Optional[Dict[str, Any]]:
        """UUID를 통해 그룹 정보 조회 (사용자 토큰 사용)"""
        try:
            # 1. 캐시 확인
            cache_key = f"group_uuid:{str(group_uuid)}"
            if cache_key in self.cache:
                cached_data = self.cache[cache_key]
                if datetime.now() < cached_data['expires']:
                    return cached_data['info']
            
            # 2. 외부 인증 서버에서 그룹 정보 조회
            group_info = await self._fetch_group_info_from_auth_server(group_uuid, user_token)
            
            if group_info:
                # 3. 캐시에 저장
                self.cache[cache_key] = {
                    'info': group_info,
                    'expires': datetime.now() + timedelta(seconds=self.cache_ttl)
                }
                return group_info
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get group info for UUID {group_uuid}: {e}")
            return None
    
    async def get_user_groups_by_uuid(self, user_uuid: uuid.UUID, user_token: str) -> List[uuid.UUID]:
        """사용자 UUID를 통해 소속 그룹 UUID 목록 조회 (사용자 토큰 사용)"""
        try:
            # 1. 캐시 확인
            cache_key = f"user_groups:{str(user_uuid)}"
            if cache_key in self.cache:
                cached_data = self.cache[cache_key]
                if datetime.now() < cached_data['expires']:
                    return cached_data['groups']
            
            # 2. 외부 인증 서버에서 사용자 그룹 조회
            group_uuids = await self._fetch_user_groups_from_auth_server(user_uuid, user_token)
            
            # 3. 캐시에 저장
            self.cache[cache_key] = {
                'groups': group_uuids,
                'expires': datetime.now() + timedelta(seconds=self.cache_ttl)
            }
            
            return group_uuids
            
        except Exception as e:
            logger.error(f"Failed to get user groups for UUID {user_uuid}: {e}")
            return []
    
    async def map_legacy_groups_to_uuid(self, group_names: List[str], user_token: str) -> Dict[str, Optional[uuid.UUID]]:
        """레거시 그룹명들을 일괄 UUID로 매핑 (사용자 토큰 사용)"""
        mapping = {}
        
        for group_name in group_names:
            try:
                group_uuid = await self.get_group_uuid_by_name(group_name, user_token)
                mapping[group_name] = group_uuid
                
                if group_uuid is None:
                    logger.warning(f"Could not map group name '{group_name}' to UUID")
                    
            except Exception as e:
                logger.error(f"Error mapping group '{group_name}': {e}")
                mapping[group_name] = None
        
        return mapping
    
    async def get_group_names_by_uuids(self, group_uuids: List[uuid.UUID], user_token: str) -> Dict[uuid.UUID, str]:
        """UUID 목록을 통해 그룹명 조회 (역매핑) (사용자 토큰 사용)"""
        mapping = {}
        
        for group_uuid in group_uuids:
            try:
                group_info = await self.get_group_info_by_uuid(group_uuid, user_token)
                if group_info:
                    mapping[group_uuid] = group_info.get('name', str(group_uuid))
                else:
                    mapping[group_uuid] = str(group_uuid)
                    
            except Exception as e:
                logger.error(f"Error getting group name for UUID {group_uuid}: {e}")
                mapping[group_uuid] = str(group_uuid)
        
        return mapping
    
    async def _fetch_group_uuid_from_auth_server(self, group_name: str, user_token: str) -> Optional[uuid.UUID]:
        """외부 인증 서버에서 그룹명으로 그룹 UUID 조회"""
        try:
            async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
                # 먼저 /api/groups/name/{group_name} 시도
                try:
                    response = await client.get(
                        f"{settings.AUTH_SERVER_URL}/api/groups/name/{group_name}",
                        headers={"Authorization": f"Bearer {user_token}"}
                    )
                    
                    if response.status_code == 200:
                        group_data = response.json()
                        group_id = group_data.get('id') or group_data.get('group_id')
                        if group_id:
                            return uuid.UUID(str(group_id)) if not isinstance(group_id, uuid.UUID) else group_id
                    elif response.status_code == 404:
                        logger.info(f"Group '{group_name}' not found in auth server")
                        return None
                    else:
                        logger.error(f"Auth server returned status {response.status_code} for group '{group_name}': {response.text}")
                        return None
                except Exception as e:
                    logger.debug(f"Group name endpoint failed, trying search endpoint: {e}")
                
                # 실패시 검색 API 사용
                try:
                    response = await client.get(
                        f"{settings.full_auth_groups_search_url}?name={group_name}",
                        headers={"Authorization": f"Bearer {user_token}"}
                    )
                    
                    if response.status_code == 200:
                        groups = response.json()
                        # 정확한 이름 매칭 찾기
                        for group in groups:
                            if group.get('name') == group_name:
                                group_id = group.get('id') or group.get('group_id')
                                if group_id:
                                    return uuid.UUID(str(group_id)) if not isinstance(group_id, uuid.UUID) else group_id
                        
                        logger.info(f"No exact match found for group '{group_name}' in search results")
                        return None
                except Exception as e:
                    logger.warning(f"Group search API also failed for '{group_name}': {e}")
                
                # 모든 방법이 실패한 경우
                logger.warning(f"Could not map group name '{group_name}' to UUID")
                return None
                
        except Exception as e:
            logger.error(f"Failed to fetch group UUID from auth server for name {group_name}: {e}")
            return None
    
    async def _fetch_group_info_from_auth_server(self, group_uuid: uuid.UUID, user_token: str) -> Optional[Dict[str, Any]]:
        """외부 인증 서버에서 UUID로 그룹 정보 조회 (사용자 토큰 사용)"""
        try:
            async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
                # 사용자 토큰으로 /api/groups/{group_id} API 호출
                response = await client.get(
                    f"{settings.AUTH_SERVER_URL}/api/groups/{str(group_uuid)}",
                    headers={"Authorization": f"Bearer {user_token}"}
                )
                
                if response.status_code == 200:
                    group_data = response.json()
                    return {
                        'group_id': group_uuid,
                        'name': group_data.get('name'),
                        'display_name': group_data.get('display_name', group_data.get('name')),  # display_name 사용
                        'description': group_data.get('description'),
                        'is_active': group_data.get('is_active', True),
                        'updated_at': datetime.now()
                    }
                
                return None
                
        except Exception as e:
            logger.error(f"Failed to fetch group info from auth server for UUID {group_uuid}: {e}")
            return None
    
    async def _fetch_user_groups_from_auth_server(self, user_uuid: uuid.UUID, user_token: str) -> List[uuid.UUID]:
        """외부 인증 서버에서 사용자 소속 그룹 UUID 목록 조회 (사용자 토큰 사용)"""
        try:
            async with httpx.AsyncClient(timeout=settings.AUTH_SERVER_TIMEOUT) as client:
                response = await client.get(
                    settings.get_user_groups_url(str(user_uuid)),
                    headers={"Authorization": f"Bearer {user_token}"}
                )
                
                if response.status_code == 200:
                    groups = response.json()
                    group_uuids = []
                    
                    for group_data in groups:
                        group_id = group_data.get('id') or group_data.get('group_id')
                        if group_id:
                            group_uuid = uuid.UUID(str(group_id)) if not isinstance(group_id, uuid.UUID) else group_id
                            group_uuids.append(group_uuid)
                    
                    return group_uuids
                
                return []
                
        except Exception as e:
            logger.error(f"Failed to fetch user groups from auth server for UUID {user_uuid}: {e}")
            return []
    
    
    def generate_deterministic_uuid(self, group_name: str, namespace: str = None) -> uuid.UUID:
        """그룹명 기반 결정적 UUID 생성 (마이그레이션용)"""
        if not settings.ENABLE_DETERMINISTIC_UUID_GENERATION:
            raise ValueError("Deterministic UUID generation is disabled")
        
        # 네임스페이스 설정에서 가져오기
        namespace = namespace or settings.UUID_NAMESPACE_GROUPS
        
        # UUID5를 사용하여 결정적 UUID 생성
        namespace_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, namespace)
        return uuid.uuid5(namespace_uuid, group_name)
    
    def clear_cache(self):
        """캐시 초기화"""
        self.cache.clear()
        logger.info("Group mapping cache cleared")


# 싱글톤 인스턴스
group_mapping_service = GroupMappingService()