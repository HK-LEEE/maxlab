"""
워크스페이스 리포지토리
데이터 액세스 레이어 구현
"""
import uuid
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, and_, or_, func
from sqlalchemy.orm import selectinload, joinedload

from ..models.workspace import Workspace, WorkspaceUser, WorkspaceGroup, MVPModule
from ..schemas.workspace import WorkspaceCreate, WorkspaceUpdate
from ..services.permission_service import PermissionService, PermissionContext, PermissionLevel
from ..services.query_builder import OptimizedQueryBuilder, QueryOptimizationLevel, JoinStrategy

logger = logging.getLogger(__name__)


class WorkspaceRepository:
    """워크스페이스 데이터 액세스 리포지토리"""
    
    def __init__(
        self, 
        permission_service: PermissionService,
        query_builder: OptimizedQueryBuilder
    ):
        self.permission_service = permission_service
        self.query_builder = query_builder
        self._operation_stats = {
            "reads": 0,
            "writes": 0,
            "deletes": 0,
            "permission_checks": 0
        }
    
    async def get_workspace_list(
        self,
        db: AsyncSession,
        user_context: PermissionContext,
        skip: int = 0,
        limit: int = 100,
        active_only: bool = True,
        include_details: bool = False
    ) -> Tuple[List[Workspace], int]:
        """
        워크스페이스 목록 조회
        
        Args:
            db: 데이터베이스 세션
            user_context: 사용자 권한 컨텍스트
            skip: 건너뛸 항목 수
            limit: 조회할 최대 항목 수
            active_only: 활성 워크스페이스만 조회
            include_details: 상세 정보 포함 여부
            
        Returns:
            Tuple[List[Workspace], int]: 워크스페이스 목록과 전체 개수
        """
        self._operation_stats["reads"] += 1
        
        # 조인 전략 결정
        join_strategy = JoinStrategy.SELECTIVE if include_details else JoinStrategy.NONE
        
        # 필터링된 쿼리 생성
        query = self.query_builder.build_workspace_filter_query(
            user_uuid=user_context.user_uuid,
            group_uuids=user_context.group_uuids,
            is_admin=user_context.is_system_admin,
            active_only=active_only,
            join_strategy=join_strategy
        )
        
        # 정렬 및 페이징
        query = query.order_by(Workspace.created_at.desc())
        paginated_query = query.offset(skip).limit(limit)
        
        # 실행
        result = await db.execute(paginated_query)
        workspaces = result.scalars().unique().all()
        
        # 전체 개수 조회
        count_query = self.query_builder.build_workspace_filter_query(
            user_uuid=user_context.user_uuid,
            group_uuids=user_context.group_uuids,
            is_admin=user_context.is_system_admin,
            active_only=active_only
        )
        count_query = select(func.count()).select_from(count_query.subquery())
        count_result = await db.execute(count_query)
        total_count = count_result.scalar() or 0
        
        logger.info(f"워크스페이스 목록 조회: {len(workspaces)}개 반환, 전체 {total_count}개")
        
        return workspaces, total_count
    
    async def get_workspace_by_id(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        user_context: PermissionContext,
        include_details: bool = True
    ) -> Optional[Workspace]:
        """
        워크스페이스 단일 조회
        
        Args:
            db: 데이터베이스 세션
            workspace_id: 워크스페이스 ID
            user_context: 사용자 권한 컨텍스트
            include_details: 상세 정보 포함 여부
            
        Returns:
            Optional[Workspace]: 워크스페이스 또는 None
        """
        self._operation_stats["reads"] += 1
        self._operation_stats["permission_checks"] += 1
        
        # 권한 확인
        permission_result = await self.permission_service.check_workspace_permission(
            db, workspace_id, user_context
        )
        
        if not permission_result.has_permission:
            logger.warning(f"워크스페이스 {workspace_id} 접근 권한 없음: {user_context.user_uuid}")
            return None
        
        # 쿼리 생성
        query = select(Workspace).where(Workspace.id == workspace_id)
        
        if include_details:
            query = query.options(
                selectinload(Workspace.workspace_users),
                selectinload(Workspace.workspace_groups),
                selectinload(Workspace.mvp_modules)
            )
        
        # 실행
        result = await db.execute(query)
        workspace = result.scalar_one_or_none()
        
        return workspace
    
    async def create_workspace(
        self,
        db: AsyncSession,
        workspace_data: WorkspaceCreate,
        creator_id: str,
        user_context: PermissionContext
    ) -> Workspace:
        """
        워크스페이스 생성
        
        Args:
            db: 데이터베이스 세션
            workspace_data: 워크스페이스 생성 데이터
            creator_id: 생성자 ID
            user_context: 사용자 권한 컨텍스트
            
        Returns:
            Workspace: 생성된 워크스페이스
        """
        self._operation_stats["writes"] += 1
        
        # 시스템 관리자만 워크스페이스 생성 가능
        if not user_context.is_system_admin:
            raise PermissionError("Only system administrators can create workspaces")
        
        # 워크스페이스 생성
        workspace = Workspace(
            name=workspace_data.name,
            slug=workspace_data.slug or self._generate_slug(workspace_data.name),
            description=workspace_data.description,
            workspace_type=workspace_data.workspace_type,
            owner_type=workspace_data.owner_type,
            owner_id=workspace_data.owner_id,
            parent_id=workspace_data.parent_id,
            path=workspace_data.path or "/",
            is_folder=workspace_data.is_folder,
            settings=workspace_data.settings or {},
            created_by=creator_id,
            updated_by=creator_id
        )
        
        db.add(workspace)
        await db.flush()
        
        # 권한 추가
        await self._add_workspace_permissions(
            db, workspace.id, workspace_data, creator_id
        )
        
        await db.commit()
        await db.refresh(workspace)
        
        # 캐시 무효화
        self.permission_service.invalidate_workspace_cache(workspace.id)
        
        logger.info(f"워크스페이스 생성: {workspace.id} ({workspace.name})")
        
        return workspace
    
    async def update_workspace(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        workspace_data: WorkspaceUpdate,
        updater_id: str,
        user_context: PermissionContext
    ) -> Optional[Workspace]:
        """
        워크스페이스 수정
        
        Args:
            db: 데이터베이스 세션
            workspace_id: 워크스페이스 ID
            workspace_data: 워크스페이스 수정 데이터
            updater_id: 수정자 ID
            user_context: 사용자 권한 컨텍스트
            
        Returns:
            Optional[Workspace]: 수정된 워크스페이스 또는 None
        """
        self._operation_stats["writes"] += 1
        self._operation_stats["permission_checks"] += 1
        
        # 관리자 권한 확인
        admin_context = PermissionContext(
            user_uuid=user_context.user_uuid,
            group_uuids=user_context.group_uuids,
            is_system_admin=user_context.is_system_admin,
            required_level=PermissionLevel.ADMIN
        )
        
        permission_result = await self.permission_service.check_workspace_permission(
            db, workspace_id, admin_context
        )
        
        if not permission_result.has_permission:
            logger.warning(f"워크스페이스 {workspace_id} 수정 권한 없음: {user_context.user_uuid}")
            return None
        
        # 워크스페이스 조회
        workspace = await db.get(Workspace, workspace_id)
        if not workspace:
            return None
        
        # 업데이트
        update_data = workspace_data.model_dump(exclude_unset=True)
        update_data["updated_by"] = updater_id
        update_data["updated_at"] = datetime.now()
        
        stmt = update(Workspace).where(Workspace.id == workspace_id).values(**update_data)
        await db.execute(stmt)
        await db.commit()
        
        # 수정된 워크스페이스 조회
        await db.refresh(workspace)
        
        # 캐시 무효화
        self.permission_service.invalidate_workspace_cache(workspace_id)
        
        logger.info(f"워크스페이스 수정: {workspace_id}")
        
        return workspace
    
    async def delete_workspace(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        user_context: PermissionContext,
        hard_delete: bool = False
    ) -> bool:
        """
        워크스페이스 삭제
        
        Args:
            db: 데이터베이스 세션
            workspace_id: 워크스페이스 ID
            user_context: 사용자 권한 컨텍스트
            hard_delete: 완전 삭제 여부
            
        Returns:
            bool: 삭제 성공 여부
        """
        self._operation_stats["deletes"] += 1
        
        # 시스템 관리자만 삭제 가능
        if not user_context.is_system_admin:
            logger.warning(f"워크스페이스 {workspace_id} 삭제 권한 없음: {user_context.user_uuid}")
            return False
        
        if hard_delete:
            # 완전 삭제
            stmt = delete(Workspace).where(Workspace.id == workspace_id)
            result = await db.execute(stmt)
        else:
            # 소프트 삭제
            stmt = update(Workspace).where(Workspace.id == workspace_id).values(
                is_active=False,
                updated_by=str(user_context.user_uuid),
                updated_at=datetime.now()
            )
            result = await db.execute(stmt)
        
        await db.commit()
        
        # 캐시 무효화
        self.permission_service.invalidate_workspace_cache(workspace_id)
        
        success = result.rowcount > 0
        if success:
            logger.info(f"워크스페이스 {'완전' if hard_delete else '소프트'} 삭제: {workspace_id}")
        
        return success
    
    async def get_workspace_permissions(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        user_context: PermissionContext
    ) -> Dict[str, Any]:
        """
        워크스페이스 권한 정보 조회
        
        Args:
            db: 데이터베이스 세션
            workspace_id: 워크스페이스 ID
            user_context: 사용자 권한 컨텍스트
            
        Returns:
            Dict[str, Any]: 권한 정보
        """
        self._operation_stats["reads"] += 1
        self._operation_stats["permission_checks"] += 1
        
        # 권한 확인 (최소 읽기 권한 필요)
        permission_result = await self.permission_service.check_workspace_permission(
            db, workspace_id, user_context
        )
        
        if not permission_result.has_permission:
            return {"error": "Access denied"}
        
        # 사용자 권한 조회
        user_stmt = select(WorkspaceUser).where(
            WorkspaceUser.workspace_id == workspace_id
        )
        user_result = await db.execute(user_stmt)
        users = user_result.scalars().all()
        
        # 그룹 권한 조회
        group_stmt = select(WorkspaceGroup).where(
            WorkspaceGroup.workspace_id == workspace_id
        )
        group_result = await db.execute(group_stmt)
        groups = group_result.scalars().all()
        
        return {
            "workspace_id": str(workspace_id),
            "current_user_permission": permission_result.permission_level,
            "users": [
                {
                    "user_id": str(u.user_id_uuid) if u.user_id_uuid else u.user_id,
                    "permission_level": u.permission_level,
                    "display_name": u.user_display_name
                }
                for u in users
            ],
            "groups": [
                {
                    "group_id": str(g.group_id_uuid) if g.group_id_uuid else g.group_name,
                    "permission_level": g.permission_level,
                    "display_name": g.group_display_name
                }
                for g in groups
            ]
        }
    
    async def add_user_permission(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        user_uuid: uuid.UUID,
        permission_level: str,
        creator_id: str,
        user_context: PermissionContext
    ) -> WorkspaceUser:
        """
        워크스페이스에 사용자 권한 추가
        
        Args:
            db: 데이터베이스 세션
            workspace_id: 워크스페이스 ID
            user_uuid: 사용자 UUID
            permission_level: 권한 레벨
            creator_id: 생성자 ID
            user_context: 사용자 권한 컨텍스트
            
        Returns:
            WorkspaceUser: 생성된 권한
        """
        self._operation_stats["writes"] += 1
        self._operation_stats["permission_checks"] += 1
        
        # 관리자 권한 확인
        admin_context = PermissionContext(
            user_uuid=user_context.user_uuid,
            group_uuids=user_context.group_uuids,
            is_system_admin=user_context.is_system_admin,
            required_level=PermissionLevel.ADMIN
        )
        
        permission_result = await self.permission_service.check_workspace_permission(
            db, workspace_id, admin_context
        )
        
        if not permission_result.has_permission:
            raise PermissionError("Admin permission required to add user permissions")
        
        # 권한 추가
        workspace_user = WorkspaceUser(
            workspace_id=workspace_id,
            user_id=str(user_uuid),
            user_id_uuid=user_uuid,
            permission_level=permission_level,
            created_by=creator_id
        )
        
        db.add(workspace_user)
        await db.commit()
        await db.refresh(workspace_user)
        
        # 캐시 무효화
        self.permission_service.invalidate_workspace_cache(workspace_id)
        
        logger.info(f"사용자 권한 추가: workspace={workspace_id}, user={user_uuid}")
        
        return workspace_user
    
    async def add_group_permission(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        group_uuid: uuid.UUID,
        permission_level: str,
        creator_id: str,
        user_context: PermissionContext,
        group_display_name: Optional[str] = None
    ) -> WorkspaceGroup:
        """
        워크스페이스에 그룹 권한 추가
        
        Args:
            db: 데이터베이스 세션
            workspace_id: 워크스페이스 ID
            group_uuid: 그룹 UUID
            permission_level: 권한 레벨
            creator_id: 생성자 ID
            user_context: 사용자 권한 컨텍스트
            group_display_name: 그룹 표시명
            
        Returns:
            WorkspaceGroup: 생성된 권한
        """
        self._operation_stats["writes"] += 1
        self._operation_stats["permission_checks"] += 1
        
        # 관리자 권한 확인
        admin_context = PermissionContext(
            user_uuid=user_context.user_uuid,
            group_uuids=user_context.group_uuids,
            is_system_admin=user_context.is_system_admin,
            required_level=PermissionLevel.ADMIN
        )
        
        permission_result = await self.permission_service.check_workspace_permission(
            db, workspace_id, admin_context
        )
        
        if not permission_result.has_permission:
            raise PermissionError("Admin permission required to add group permissions")
        
        # 권한 추가
        workspace_group = WorkspaceGroup(
            workspace_id=workspace_id,
            group_name=str(group_uuid),
            group_id_uuid=group_uuid,
            group_display_name=group_display_name or str(group_uuid),
            permission_level=permission_level,
            created_by=creator_id
        )
        
        db.add(workspace_group)
        await db.commit()
        await db.refresh(workspace_group)
        
        # 캐시 무효화
        self.permission_service.invalidate_workspace_cache(workspace_id)
        
        logger.info(f"그룹 권한 추가: workspace={workspace_id}, group={group_uuid}")
        
        return workspace_group
    
    async def _add_workspace_permissions(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        workspace_data: WorkspaceCreate,
        creator_id: str
    ):
        """워크스페이스 권한 추가 (내부용)"""
        # 사용자 권한 추가
        if workspace_data.selected_users:
            for user_uuid in workspace_data.selected_users:
                workspace_user = WorkspaceUser(
                    workspace_id=workspace_id,
                    user_id=str(user_uuid),
                    user_id_uuid=user_uuid,
                    permission_level='read',
                    created_by=creator_id
                )
                db.add(workspace_user)
        
        # 그룹 권한 추가
        if workspace_data.selected_groups:
            for group_uuid in workspace_data.selected_groups:
                workspace_group = WorkspaceGroup(
                    workspace_id=workspace_id,
                    group_name=str(group_uuid),
                    group_id_uuid=group_uuid,
                    permission_level='read',
                    created_by=creator_id
                )
                db.add(workspace_group)
    
    def _generate_slug(self, name: str) -> str:
        """슬러그 생성"""
        import re
        slug = re.sub(r'[^a-zA-Z0-9\s-]', '', name)
        slug = re.sub(r'\s+', '-', slug.strip())
        slug = slug.lower()
        return slug[:100]
    
    def get_operation_stats(self) -> Dict[str, int]:
        """작업 통계 반환"""
        return self._operation_stats.copy()
    
    def reset_stats(self):
        """통계 초기화"""
        self._operation_stats = {
            "reads": 0,
            "writes": 0,
            "deletes": 0,
            "permission_checks": 0
        }