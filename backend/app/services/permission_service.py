"""
권한 관리 서비스
워크스페이스 권한 확인 및 필터링을 위한 중앙화된 로직
"""
import uuid
from typing import List, Optional, Dict, Any, Set, Tuple
from datetime import datetime, timedelta
import logging
from enum import Enum
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, exists
from sqlalchemy.orm import selectinload

from ..models.workspace import Workspace, WorkspaceUser, WorkspaceGroup
from ..core.config import settings
from .performance_monitor import performance_monitor

logger = logging.getLogger(__name__)


class PermissionLevel(str, Enum):
    """권한 레벨 정의"""
    READ = "read"
    WRITE = "write"
    ADMIN = "admin"
    

class PermissionType(str, Enum):
    """권한 타입 정의"""
    OWNER = "owner"
    USER = "user"
    GROUP = "group"
    ADMIN = "admin"


@dataclass
class PermissionContext:
    """권한 확인 컨텍스트"""
    user_uuid: Optional[uuid.UUID]
    group_uuids: List[uuid.UUID]
    is_system_admin: bool
    required_level: PermissionLevel
    # 레거시 호환성
    legacy_user_id: Optional[str] = None
    legacy_groups: Optional[List[str]] = None


@dataclass
class PermissionResult:
    """권한 확인 결과"""
    has_permission: bool
    permission_level: Optional[PermissionLevel]
    permission_type: Optional[PermissionType]
    granted_through: List[str]  # 권한이 부여된 경로 (user, group names)
    cached: bool = False
    cache_hit_rate: float = 0.0


class PermissionCache:
    """권한 캐시 관리"""
    
    def __init__(self, ttl_seconds: int = 300):
        self._cache: Dict[str, Tuple[PermissionResult, datetime]] = {}
        self._ttl = timedelta(seconds=ttl_seconds)
        self._hits = 0
        self._misses = 0
    
    def _generate_key(
        self, 
        workspace_id: uuid.UUID, 
        user_uuid: Optional[uuid.UUID],
        group_uuids: List[uuid.UUID]
    ) -> str:
        """캐시 키 생성"""
        group_str = ",".join(sorted(str(g) for g in group_uuids))
        return f"{workspace_id}:{user_uuid}:{group_str}"
    
    def get(
        self, 
        workspace_id: uuid.UUID, 
        user_uuid: Optional[uuid.UUID],
        group_uuids: List[uuid.UUID]
    ) -> Optional[PermissionResult]:
        """캐시에서 권한 조회"""
        key = self._generate_key(workspace_id, user_uuid, group_uuids)
        
        if key in self._cache:
            result, cached_at = self._cache[key]
            if datetime.now() - cached_at <= self._ttl:
                self._hits += 1
                result.cached = True
                result.cache_hit_rate = self._hits / (self._hits + self._misses)
                performance_monitor.monitor_cache_operation("hit")
                return result
            else:
                # 만료된 캐시 삭제
                del self._cache[key]
        
        self._misses += 1
        performance_monitor.monitor_cache_operation("miss")
        return None
    
    def set(
        self, 
        workspace_id: uuid.UUID, 
        user_uuid: Optional[uuid.UUID],
        group_uuids: List[uuid.UUID],
        result: PermissionResult
    ):
        """캐시에 권한 저장"""
        key = self._generate_key(workspace_id, user_uuid, group_uuids)
        self._cache[key] = (result, datetime.now())
        performance_monitor.monitor_cache_operation("set")
        
        # 캐시 크기 제한 (1000개)
        if len(self._cache) > 1000:
            # 가장 오래된 항목 삭제
            oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]
    
    def invalidate_workspace(self, workspace_id: uuid.UUID):
        """특정 워크스페이스의 캐시 무효화"""
        keys_to_delete = [
            key for key in self._cache.keys() 
            if key.startswith(f"{workspace_id}:")
        ]
        for key in keys_to_delete:
            del self._cache[key]
            performance_monitor.monitor_cache_operation("invalidate")
    
    def clear(self):
        """전체 캐시 초기화"""
        self._cache.clear()
        self._hits = 0
        self._misses = 0


class PermissionService:
    """권한 관리 서비스"""
    
    def __init__(self):
        self._cache = PermissionCache(ttl_seconds=settings.PERMISSION_CACHE_TTL)
        self._permission_hierarchy = {
            PermissionLevel.READ: 1,
            PermissionLevel.WRITE: 2,
            PermissionLevel.ADMIN: 3
        }
    
    async def check_workspace_permission(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        context: PermissionContext
    ) -> PermissionResult:
        """
        워크스페이스 권한 확인
        
        Args:
            db: 데이터베이스 세션
            workspace_id: 워크스페이스 ID
            context: 권한 확인 컨텍스트
            
        Returns:
            PermissionResult: 권한 확인 결과
        """
        async with performance_monitor.monitor_query("permission_check"):
            # 1. 시스템 관리자 체크
            if context.is_system_admin:
                return PermissionResult(
                    has_permission=True,
                    permission_level=PermissionLevel.ADMIN,
                    permission_type=PermissionType.ADMIN,
                    granted_through=["system_admin"]
                )
            
            # 2. 캐시 확인
            cached_result = self._cache.get(
                workspace_id, 
                context.user_uuid, 
                context.group_uuids
            )
            if cached_result:
                logger.debug(f"권한 캐시 히트: workspace={workspace_id}, user={context.user_uuid}")
                return cached_result
            
            # 3. 데이터베이스에서 권한 확인
            result = await self._check_permission_from_db(db, workspace_id, context)
            
            # 4. 캐시에 저장
            self._cache.set(
                workspace_id,
                context.user_uuid,
                context.group_uuids,
                result
            )
            
            return result
    
    async def _check_permission_from_db(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        context: PermissionContext
    ) -> PermissionResult:
        """데이터베이스에서 권한 확인"""
        granted_through = []
        max_permission_level = None
        permission_type = None
        
        # 1. 워크스페이스 소유자 확인
        workspace_stmt = select(Workspace).where(Workspace.id == workspace_id)
        workspace_result = await db.execute(workspace_stmt)
        workspace = workspace_result.scalar_one_or_none()
        
        if workspace and context.user_uuid and str(context.user_uuid) == workspace.owner_id:
            granted_through.append("workspace_owner")
            max_permission_level = PermissionLevel.ADMIN
            permission_type = PermissionType.OWNER
        
        # 2. 사용자 기반 권한 확인
        if context.user_uuid:
            user_permission = await self._check_user_permission(
                db, workspace_id, context.user_uuid, context.legacy_user_id
            )
            if user_permission:
                granted_through.append(f"user:{context.user_uuid}")
                if self._compare_permission_levels(user_permission, max_permission_level) > 0:
                    max_permission_level = user_permission
                    permission_type = PermissionType.USER
        
        # 3. 그룹 기반 권한 확인
        if context.group_uuids:
            group_permission, group_names = await self._check_group_permission(
                db, workspace_id, context.group_uuids, context.legacy_groups
            )
            if group_permission:
                granted_through.extend([f"group:{name}" for name in group_names])
                if self._compare_permission_levels(group_permission, max_permission_level) > 0:
                    max_permission_level = group_permission
                    permission_type = PermissionType.GROUP
        
        # 4. 권한 레벨 확인
        has_permission = False
        if max_permission_level:
            required_level_value = self._permission_hierarchy.get(context.required_level, 1)
            current_level_value = self._permission_hierarchy.get(max_permission_level, 0)
            has_permission = current_level_value >= required_level_value
        
        return PermissionResult(
            has_permission=has_permission,
            permission_level=max_permission_level,
            permission_type=permission_type,
            granted_through=granted_through
        )
    
    async def _check_user_permission(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        user_uuid: uuid.UUID,
        legacy_user_id: Optional[str] = None
    ) -> Optional[PermissionLevel]:
        """사용자 기반 권한 확인"""
        stmt = select(WorkspaceUser).where(
            and_(
                WorkspaceUser.workspace_id == workspace_id,
                or_(
                    WorkspaceUser.user_id_uuid == user_uuid,
                    WorkspaceUser.user_id == str(user_uuid)
                )
            )
        )
        
        # 레거시 호환성
        if legacy_user_id and not user_uuid:
            stmt = select(WorkspaceUser).where(
                and_(
                    WorkspaceUser.workspace_id == workspace_id,
                    WorkspaceUser.user_id == legacy_user_id
                )
            )
        
        result = await db.execute(stmt)
        workspace_user = result.scalar_one_or_none()
        
        if workspace_user:
            return PermissionLevel(workspace_user.permission_level)
        return None
    
    async def _check_group_permission(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        group_uuids: List[uuid.UUID],
        legacy_groups: Optional[List[str]] = None
    ) -> Tuple[Optional[PermissionLevel], List[str]]:
        """그룹 기반 권한 확인"""
        stmt = select(WorkspaceGroup).where(
            and_(
                WorkspaceGroup.workspace_id == workspace_id,
                or_(
                    WorkspaceGroup.group_id_uuid.in_(group_uuids),
                    WorkspaceGroup.group_name.in_([str(g) for g in group_uuids])
                )
            )
        )
        
        # 레거시 호환성
        if legacy_groups and not group_uuids:
            stmt = select(WorkspaceGroup).where(
                and_(
                    WorkspaceGroup.workspace_id == workspace_id,
                    WorkspaceGroup.group_name.in_(legacy_groups)
                )
            )
        
        result = await db.execute(stmt)
        workspace_groups = result.scalars().all()
        
        if not workspace_groups:
            return None, []
        
        # 최고 권한 레벨 찾기
        max_level = None
        group_names = []
        
        for wg in workspace_groups:
            level = PermissionLevel(wg.permission_level)
            group_names.append(wg.group_display_name or wg.group_name)
            
            if self._compare_permission_levels(level, max_level) > 0:
                max_level = level
        
        return max_level, group_names
    
    def _compare_permission_levels(
        self, 
        level1: Optional[PermissionLevel], 
        level2: Optional[PermissionLevel]
    ) -> int:
        """권한 레벨 비교"""
        value1 = self._permission_hierarchy.get(level1, 0) if level1 else 0
        value2 = self._permission_hierarchy.get(level2, 0) if level2 else 0
        return value1 - value2
    
    async def get_user_accessible_workspaces(
        self,
        db: AsyncSession,
        context: PermissionContext,
        workspace_ids: Optional[List[uuid.UUID]] = None
    ) -> Set[uuid.UUID]:
        """
        사용자가 접근 가능한 워크스페이스 ID 목록 조회
        
        Args:
            db: 데이터베이스 세션
            context: 권한 확인 컨텍스트
            workspace_ids: 확인할 워크스페이스 ID 목록 (None이면 전체)
            
        Returns:
            Set[uuid.UUID]: 접근 가능한 워크스페이스 ID 집합
        """
        # 시스템 관리자는 모든 워크스페이스 접근 가능
        if context.is_system_admin:
            if workspace_ids:
                return set(workspace_ids)
            else:
                stmt = select(Workspace.id).where(Workspace.is_active == True)
                result = await db.execute(stmt)
                return set(result.scalars().all())
        
        accessible_ids = set()
        
        # 1. 소유자로서 접근 가능한 워크스페이스
        if context.user_uuid:
            owner_stmt = select(Workspace.id).where(
                and_(
                    Workspace.owner_id == str(context.user_uuid),
                    Workspace.is_active == True
                )
            )
            if workspace_ids:
                owner_stmt = owner_stmt.where(Workspace.id.in_(workspace_ids))
            
            result = await db.execute(owner_stmt)
            accessible_ids.update(result.scalars().all())
        
        # 2. 사용자 권한으로 접근 가능한 워크스페이스
        if context.user_uuid:
            user_stmt = select(WorkspaceUser.workspace_id).where(
                or_(
                    WorkspaceUser.user_id_uuid == context.user_uuid,
                    WorkspaceUser.user_id == str(context.user_uuid)
                )
            )
            if workspace_ids:
                user_stmt = user_stmt.where(WorkspaceUser.workspace_id.in_(workspace_ids))
            
            result = await db.execute(user_stmt)
            accessible_ids.update(result.scalars().all())
        
        # 3. 그룹 권한으로 접근 가능한 워크스페이스
        if context.group_uuids:
            group_stmt = select(WorkspaceGroup.workspace_id).where(
                or_(
                    WorkspaceGroup.group_id_uuid.in_(context.group_uuids),
                    WorkspaceGroup.group_name.in_([str(g) for g in context.group_uuids])
                )
            )
            if workspace_ids:
                group_stmt = group_stmt.where(WorkspaceGroup.workspace_id.in_(workspace_ids))
            
            result = await db.execute(group_stmt)
            accessible_ids.update(result.scalars().all())
        
        return accessible_ids
    
    def invalidate_workspace_cache(self, workspace_id: uuid.UUID):
        """워크스페이스 캐시 무효화"""
        self._cache.invalidate_workspace(workspace_id)
        logger.info(f"워크스페이스 {workspace_id} 캐시 무효화")
    
    def clear_cache(self):
        """전체 캐시 초기화"""
        self._cache.clear()
        logger.info("권한 캐시 전체 초기화")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """캐시 통계 조회"""
        total_requests = self._cache._hits + self._cache._misses
        hit_rate = self._cache._hits / total_requests if total_requests > 0 else 0
        
        return {
            "total_requests": total_requests,
            "cache_hits": self._cache._hits,
            "cache_misses": self._cache._misses,
            "hit_rate": hit_rate,
            "cache_size": len(self._cache._cache)
        }


# 싱글톤 인스턴스
permission_service = PermissionService()