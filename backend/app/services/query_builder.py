"""
최적화된 쿼리 빌더
워크스페이스 필터링을 위한 성능 최적화된 쿼리 생성
"""
import uuid
from typing import List, Optional, Dict, Any, Union
from enum import Enum
import logging
from sqlalchemy import select, and_, or_, exists, func, join, outerjoin
from sqlalchemy.orm import Query, selectinload, joinedload, contains_eager
from sqlalchemy.sql import Select

from ..models.workspace import Workspace, WorkspaceUser, WorkspaceGroup, MVPModule

logger = logging.getLogger(__name__)


class QueryOptimizationLevel(str, Enum):
    """쿼리 최적화 레벨"""
    MINIMAL = "minimal"  # 기본 쿼리
    STANDARD = "standard"  # 표준 최적화
    AGGRESSIVE = "aggressive"  # 공격적 최적화


class JoinStrategy(str, Enum):
    """조인 전략"""
    NONE = "none"  # 조인 없음
    LAZY = "lazy"  # 지연 로딩
    EAGER = "eager"  # 즉시 로딩
    SELECTIVE = "selective"  # 선택적 로딩


class OptimizedQueryBuilder:
    """최적화된 쿼리 빌더"""
    
    def __init__(self, optimization_level: QueryOptimizationLevel = QueryOptimizationLevel.STANDARD):
        self.optimization_level = optimization_level
        self._query_stats = {
            "queries_built": 0,
            "exists_used": 0,
            "joins_used": 0,
            "subqueries_used": 0
        }
    
    def build_workspace_filter_query(
        self,
        base_query: Optional[Select] = None,
        user_uuid: Optional[uuid.UUID] = None,
        group_uuids: Optional[List[uuid.UUID]] = None,
        is_admin: bool = False,
        active_only: bool = True,
        include_counts: bool = False,
        join_strategy: JoinStrategy = JoinStrategy.NONE
    ) -> Select:
        """
        워크스페이스 필터링 쿼리 생성
        
        Args:
            base_query: 기본 쿼리 (없으면 새로 생성)
            user_uuid: 사용자 UUID
            group_uuids: 그룹 UUID 목록
            is_admin: 관리자 여부
            active_only: 활성 워크스페이스만 조회
            include_counts: 카운트 정보 포함 여부
            join_strategy: 조인 전략
            
        Returns:
            Select: 최적화된 쿼리
        """
        self._query_stats["queries_built"] += 1
        
        # 기본 쿼리 생성
        if base_query is None:
            query = select(Workspace)
        else:
            query = base_query
        
        # 활성 워크스페이스 필터
        if active_only:
            query = query.where(Workspace.is_active == True)
        
        # 관리자는 모든 워크스페이스 조회 가능
        if is_admin:
            logger.debug("관리자 권한으로 전체 워크스페이스 조회")
            return self._apply_join_strategy(query, join_strategy)
        
        # 권한 기반 필터링
        permission_conditions = self._build_permission_conditions(
            user_uuid, group_uuids
        )
        
        if permission_conditions:
            query = query.where(or_(*permission_conditions))
        else:
            # 권한이 없는 경우 빈 결과
            query = query.where(False)
        
        # 조인 전략 적용
        query = self._apply_join_strategy(query, join_strategy)
        
        # 카운트 정보 포함
        if include_counts:
            query = self._add_count_columns(query)
        
        return query
    
    def _build_permission_conditions(
        self,
        user_uuid: Optional[uuid.UUID],
        group_uuids: Optional[List[uuid.UUID]]
    ) -> List[Any]:
        """권한 조건 생성"""
        conditions = []
        
        # 1. 소유자 조건
        if user_uuid:
            conditions.append(Workspace.owner_id == str(user_uuid))
        
        # 2. 사용자 권한 조건 (EXISTS 사용)
        if user_uuid and self.optimization_level != QueryOptimizationLevel.MINIMAL:
            user_exists = exists().where(
                and_(
                    WorkspaceUser.workspace_id == Workspace.id,
                    or_(
                        WorkspaceUser.user_id_uuid == user_uuid,
                        WorkspaceUser.user_id == str(user_uuid)
                    )
                )
            )
            conditions.append(user_exists)
            self._query_stats["exists_used"] += 1
        elif user_uuid:
            # 최소 최적화 레벨에서는 IN 서브쿼리 사용
            user_subquery = select(WorkspaceUser.workspace_id).where(
                or_(
                    WorkspaceUser.user_id_uuid == user_uuid,
                    WorkspaceUser.user_id == str(user_uuid)
                )
            )
            conditions.append(Workspace.id.in_(user_subquery))
            self._query_stats["subqueries_used"] += 1
        
        # 3. 그룹 권한 조건 (EXISTS 사용)
        if group_uuids and self.optimization_level != QueryOptimizationLevel.MINIMAL:
            group_exists = exists().where(
                and_(
                    WorkspaceGroup.workspace_id == Workspace.id,
                    or_(
                        WorkspaceGroup.group_id_uuid.in_(group_uuids),
                        WorkspaceGroup.group_name.in_([str(g) for g in group_uuids])
                    )
                )
            )
            conditions.append(group_exists)
            self._query_stats["exists_used"] += 1
        elif group_uuids:
            # 최소 최적화 레벨에서는 IN 서브쿼리 사용
            group_subquery = select(WorkspaceGroup.workspace_id).where(
                or_(
                    WorkspaceGroup.group_id_uuid.in_(group_uuids),
                    WorkspaceGroup.group_name.in_([str(g) for g in group_uuids])
                )
            )
            conditions.append(Workspace.id.in_(group_subquery))
            self._query_stats["subqueries_used"] += 1
        
        return conditions
    
    def _apply_join_strategy(self, query: Select, strategy: JoinStrategy) -> Select:
        """조인 전략 적용"""
        if strategy == JoinStrategy.NONE:
            return query
        
        if strategy == JoinStrategy.EAGER:
            # 모든 관련 데이터 즉시 로딩
            query = query.options(
                joinedload(Workspace.workspace_users),
                joinedload(Workspace.workspace_groups),
                joinedload(Workspace.mvp_modules)
            )
            self._query_stats["joins_used"] += 3
        elif strategy == JoinStrategy.SELECTIVE:
            # 선택적으로 필요한 데이터만 로딩
            query = query.options(
                selectinload(Workspace.workspace_groups),
                selectinload(Workspace.mvp_modules)
            )
            self._query_stats["joins_used"] += 2
        
        return query
    
    def _add_count_columns(self, query: Select) -> Select:
        """카운트 컬럼 추가"""
        if self.optimization_level == QueryOptimizationLevel.AGGRESSIVE:
            # 공격적 최적화: 서브쿼리로 카운트
            user_count_subq = (
                select(func.count(WorkspaceUser.id))
                .where(WorkspaceUser.workspace_id == Workspace.id)
                .scalar_subquery()
            )
            group_count_subq = (
                select(func.count(WorkspaceGroup.id))
                .where(WorkspaceGroup.workspace_id == Workspace.id)
                .scalar_subquery()
            )
            module_count_subq = (
                select(func.count(MVPModule.id))
                .where(MVPModule.workspace_id == Workspace.id)
                .scalar_subquery()
            )
            
            query = query.add_columns(
                user_count_subq.label("user_count"),
                group_count_subq.label("group_count"),
                module_count_subq.label("module_count")
            )
            self._query_stats["subqueries_used"] += 3
        
        return query
    
    def build_permission_check_query(
        self,
        workspace_id: uuid.UUID,
        user_uuid: Optional[uuid.UUID],
        group_uuids: Optional[List[uuid.UUID]],
        required_permission: str = "read"
    ) -> Select:
        """
        권한 확인 쿼리 생성
        
        Args:
            workspace_id: 워크스페이스 ID
            user_uuid: 사용자 UUID
            group_uuids: 그룹 UUID 목록
            required_permission: 필요한 권한 레벨
            
        Returns:
            Select: 권한 확인 쿼리
        """
        # 통합 쿼리로 모든 권한 정보를 한 번에 조회
        query = select(
            Workspace.id,
            Workspace.owner_id,
            WorkspaceUser.permission_level.label("user_permission"),
            WorkspaceGroup.permission_level.label("group_permission"),
            WorkspaceGroup.group_display_name
        ).select_from(Workspace)
        
        # LEFT JOIN으로 사용자 권한 확인
        if user_uuid:
            query = query.outerjoin(
                WorkspaceUser,
                and_(
                    WorkspaceUser.workspace_id == Workspace.id,
                    or_(
                        WorkspaceUser.user_id_uuid == user_uuid,
                        WorkspaceUser.user_id == str(user_uuid)
                    )
                )
            )
        
        # LEFT JOIN으로 그룹 권한 확인
        if group_uuids:
            query = query.outerjoin(
                WorkspaceGroup,
                and_(
                    WorkspaceGroup.workspace_id == Workspace.id,
                    or_(
                        WorkspaceGroup.group_id_uuid.in_(group_uuids),
                        WorkspaceGroup.group_name.in_([str(g) for g in group_uuids])
                    )
                )
            )
        
        query = query.where(Workspace.id == workspace_id)
        
        return query
    
    def build_bulk_permission_query(
        self,
        workspace_ids: List[uuid.UUID],
        user_uuid: Optional[uuid.UUID],
        group_uuids: Optional[List[uuid.UUID]]
    ) -> Select:
        """
        대량 권한 확인 쿼리 생성
        
        Args:
            workspace_ids: 워크스페이스 ID 목록
            user_uuid: 사용자 UUID
            group_uuids: 그룹 UUID 목록
            
        Returns:
            Select: 대량 권한 확인 쿼리
        """
        # CTE (Common Table Expression) 사용하여 성능 최적화
        workspace_cte = (
            select(Workspace.id, Workspace.owner_id)
            .where(Workspace.id.in_(workspace_ids))
            .cte("workspace_cte")
        )
        
        # 각 권한 타입별로 UNION ALL 사용
        queries = []
        
        # 소유자 권한
        if user_uuid:
            owner_query = select(
                workspace_cte.c.id.label("workspace_id"),
                func.literal("owner").label("permission_type"),
                func.literal("admin").label("permission_level")
            ).where(workspace_cte.c.owner_id == str(user_uuid))
            queries.append(owner_query)
        
        # 사용자 권한
        if user_uuid:
            user_query = select(
                WorkspaceUser.workspace_id,
                func.literal("user").label("permission_type"),
                WorkspaceUser.permission_level
            ).where(
                and_(
                    WorkspaceUser.workspace_id.in_(workspace_ids),
                    or_(
                        WorkspaceUser.user_id_uuid == user_uuid,
                        WorkspaceUser.user_id == str(user_uuid)
                    )
                )
            )
            queries.append(user_query)
        
        # 그룹 권한
        if group_uuids:
            group_query = select(
                WorkspaceGroup.workspace_id,
                func.literal("group").label("permission_type"),
                WorkspaceGroup.permission_level
            ).where(
                and_(
                    WorkspaceGroup.workspace_id.in_(workspace_ids),
                    or_(
                        WorkspaceGroup.group_id_uuid.in_(group_uuids),
                        WorkspaceGroup.group_name.in_([str(g) for g in group_uuids])
                    )
                )
            )
            queries.append(group_query)
        
        if queries:
            return queries[0].union_all(*queries[1:]) if len(queries) > 1 else queries[0]
        else:
            # 권한이 없는 경우 빈 쿼리
            return select(
                func.literal(None).label("workspace_id"),
                func.literal(None).label("permission_type"),
                func.literal(None).label("permission_level")
            ).where(False)
    
    def get_query_stats(self) -> Dict[str, int]:
        """쿼리 통계 반환"""
        return self._query_stats.copy()
    
    def reset_stats(self):
        """통계 초기화"""
        self._query_stats = {
            "queries_built": 0,
            "exists_used": 0,
            "joins_used": 0,
            "subqueries_used": 0
        }


# 최적화 레벨별 빌더 인스턴스
minimal_query_builder = OptimizedQueryBuilder(QueryOptimizationLevel.MINIMAL)
standard_query_builder = OptimizedQueryBuilder(QueryOptimizationLevel.STANDARD)
aggressive_query_builder = OptimizedQueryBuilder(QueryOptimizationLevel.AGGRESSIVE)