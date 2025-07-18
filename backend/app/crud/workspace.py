"""
MAX Lab MVP 플랫폼 워크스페이스 관련 CRUD 로직
데이터베이스와의 모든 워크스페이스 관련 상호작용을 처리합니다.
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, update, delete, exists
from sqlalchemy.orm import selectinload, joinedload
import logging
import re
import uuid

from ..models.workspace import Workspace, WorkspaceUser, WorkspaceGroup, MVPModule, MVPModuleLog
from ..schemas.workspace import (
    WorkspaceCreate, WorkspaceUpdate, 
    WorkspaceGroupCreate, WorkspaceGroupUpdate,
    MVPModuleCreate, MVPModuleUpdate
)

logger = logging.getLogger(__name__)


class WorkspaceCRUD:
    """워크스페이스 CRUD 클래스"""
    
    def __init__(self):
        self.model = Workspace
    
    def _generate_slug(self, name: str) -> str:
        """이름에서 slug 생성"""
        # 한글 및 특수문자를 제거하고 소문자로 변환
        slug = re.sub(r'[^a-zA-Z0-9\s-]', '', name)
        slug = re.sub(r'\s+', '-', slug.strip())
        slug = slug.lower()
        return slug[:100]  # 최대 길이 제한
    
    async def create(
        self, 
        db: AsyncSession, 
        obj_in: WorkspaceCreate, 
        creator_id: str
    ) -> Workspace:
        """워크스페이스 생성"""
        try:
            # slug 자동 생성 (없는 경우)
            slug = obj_in.slug or self._generate_slug(obj_in.name)
            
            # slug 중복 확인 및 수정
            original_slug = slug
            counter = 1
            while await self._is_slug_exists(db, slug):
                slug = f"{original_slug}-{counter}"
                counter += 1
            
            # 경로 계산
            path = "/"
            if obj_in.parent_id:
                parent = await self.get(db, str(obj_in.parent_id))
                if parent:
                    path = f"{parent.path}{parent.name}/"
            
            db_obj = Workspace(
                name=obj_in.name,
                slug=slug,
                description=obj_in.description,
                workspace_type=obj_in.workspace_type,
                owner_type=obj_in.owner_type,
                owner_id=obj_in.owner_id,
                parent_id=obj_in.parent_id,
                path=path,
                is_folder=obj_in.is_folder,
                settings=obj_in.settings or {},
                created_by=creator_id,
                updated_by=creator_id,
            )
            
            db.add(db_obj)
            await db.flush()  # Get the ID without committing
            
            # Add user permissions if specified (혼합 모드 지원)
            if obj_in.selected_users and len(obj_in.selected_users) > 0:
                from ..services.user_mapping import user_mapping_service
                
                for user_identifier in obj_in.selected_users:
                    # UUID로 변환 시도 (string이면 UUID로 매핑)
                    try:
                        user_uuid = uuid.UUID(user_identifier) if isinstance(user_identifier, str) and len(user_identifier) == 36 else None
                    except ValueError:
                        user_uuid = None
                    
                    if not user_uuid:
                        user_uuid = await user_mapping_service.get_user_uuid_by_identifier(user_identifier)
                    
                    if user_uuid:
                        workspace_user = WorkspaceUser(
                            workspace_id=db_obj.id,
                            user_id=str(user_uuid),  # 레거시 호환성
                            user_id_uuid=user_uuid,  # 새로운 UUID 필드
                            permission_level='read',
                            created_by=creator_id
                        )
                        db.add(workspace_user)
                    else:
                        logger.warning(f"Could not resolve user identifier '{user_identifier}' to UUID during workspace creation")
            
            # Add group permissions if specified (혼합 모드 지원)
            if obj_in.selected_groups and len(obj_in.selected_groups) > 0:
                from ..services.group_mapping import group_mapping_service
                
                for group_identifier in obj_in.selected_groups:
                    # UUID로 변환 시도 (string이면 UUID로 매핑)
                    try:
                        group_uuid = uuid.UUID(group_identifier) if isinstance(group_identifier, str) and len(group_identifier) == 36 else None
                    except ValueError:
                        group_uuid = None
                    
                    if not group_uuid:
                        group_uuid = await group_mapping_service.get_group_uuid_by_name(group_identifier)
                    
                    if group_uuid:
                        workspace_group = WorkspaceGroup(
                            workspace_id=db_obj.id,
                            group_name=str(group_uuid),  # 레거시 호환성 (임시)
                            group_id_uuid=group_uuid,    # 새로운 UUID 필드
                            permission_level='read',
                            created_by=creator_id
                        )
                        db.add(workspace_group)
                    else:
                        logger.warning(f"Could not resolve group identifier '{group_identifier}' to UUID during workspace creation")
            
            await db.commit()
            await db.refresh(db_obj)
            
            logger.info(f"Workspace created: {db_obj.id} ({db_obj.name}) by {creator_id}")
            return db_obj
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create workspace: {e}")
            raise
    
    async def _is_slug_exists(self, db: AsyncSession, slug: str) -> bool:
        """slug 존재 여부 확인"""
        stmt = select(func.count(Workspace.id)).where(Workspace.slug == slug)
        result = await db.execute(stmt)
        count = result.scalar()
        return count > 0
    
    async def get(self, db: AsyncSession, workspace_id: uuid.UUID) -> Optional[Workspace]:
        """워크스페이스 조회"""
        stmt = select(Workspace).where(Workspace.id == workspace_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_by_slug(self, db: AsyncSession, slug: str) -> Optional[Workspace]:
        """slug로 워크스페이스 조회"""
        stmt = select(Workspace).where(Workspace.slug == slug)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_with_details(self, db: AsyncSession, workspace_id: uuid.UUID) -> Optional[Workspace]:
        """워크스페이스 상세 정보 조회 (그룹, 모듈 포함) - 성능 최적화"""
        # joinedload 사용으로 N+1 쿼리 문제 해결 (소규모 관련 데이터의 경우)
        stmt = select(Workspace).options(
            joinedload(Workspace.workspace_groups),
            joinedload(Workspace.mvp_modules)
        ).where(Workspace.id == workspace_id)
        
        result = await db.execute(stmt)
        return result.unique().scalar_one_or_none()
    
    async def get_multi(
        self, 
        db: AsyncSession, 
        skip: int = 0, 
        limit: int = 1000,
        active_only: bool = True,
        # UUID 기반 파라미터
        user_uuid: Optional[uuid.UUID] = None,
        user_group_uuids: Optional[List[uuid.UUID]] = None,
        is_admin: bool = False,
        # 레거시 호환성 파라미터 (deprecated)
        user_id: Optional[str] = None,
        user_groups: Optional[List[str]] = None
    ) -> List[Workspace]:
        """
        워크스페이스 목록 조회 (UUID 기반)
        관리자가 아닌 사용자는 접근 권한이 있는 워크스페이스만 조회
        """
        from ..services.user_mapping import user_mapping_service
        from ..services.group_mapping import group_mapping_service
        
        stmt = select(Workspace)
        
        # 활성 워크스페이스만 조회
        if active_only:
            stmt = stmt.where(Workspace.is_active == True)
        
        # 관리자가 아닌 경우 접근 권한이 있는 워크스페이스만 조회
        if not is_admin:
            # 레거시 파라미터 처리 (String 기반 -> UUID 변환)
            if user_id and not user_uuid:
                try:
                    user_uuid = await user_mapping_service.get_user_uuid_by_identifier(user_id)
                    logger.warning(f"레거시 user_id 파라미터 사용 in get_multi: {user_id} -> {user_uuid}")
                except Exception as e:
                    logger.error(f"레거시 user_id 변환 실패 in get_multi: {e}")
            
            if user_groups and not user_group_uuids:
                try:
                    group_mapping = await group_mapping_service.map_legacy_groups_to_uuid(user_groups)
                    user_group_uuids = [uuid for uuid in group_mapping.values() if uuid is not None]
                    logger.warning(f"레거시 user_groups 파라미터 사용 in get_multi: {user_groups} -> {user_group_uuids}")
                except Exception as e:
                    logger.error(f"레거시 user_groups 변환 실패 in get_multi: {e}")
                    user_group_uuids = []
            
            # EXISTS를 사용하여 IN 서브쿼리보다 성능 향상
            permission_conditions = []
            
            # 1. 소유자 권한 확인 (UUID 우선, 레거시 fallback)
            if user_uuid:
                permission_conditions.append(Workspace.owner_id == str(user_uuid))
            elif user_id:
                permission_conditions.append(Workspace.owner_id == user_id)
            
            # 2. 사용자 기반 권한 확인 (EXISTS 사용, UUID 기반)
            if user_uuid:
                user_exists = exists().where(
                    and_(
                        WorkspaceUser.workspace_id == Workspace.id,
                        or_(
                            WorkspaceUser.user_id_uuid == user_uuid,  # 새로운 UUID 필드
                            WorkspaceUser.user_id == str(user_uuid)   # 레거시 호환성
                        )
                    )
                )
                permission_conditions.append(user_exists)
            
            # 3. 그룹 기반 권한 확인 (EXISTS 사용, UUID 기반)
            if user_group_uuids:
                group_exists = exists().where(
                    and_(
                        WorkspaceGroup.workspace_id == Workspace.id,
                        or_(
                            WorkspaceGroup.group_id_uuid.in_(user_group_uuids),  # 새로운 UUID 필드
                            WorkspaceGroup.group_name.in_([str(g) for g in user_group_uuids])  # 레거시 호환성
                        )
                    )
                )
                permission_conditions.append(group_exists)
            
            # 4. 레거시 그룹 권한 확인 (deprecated, but for compatibility)
            if user_groups and not user_group_uuids:
                legacy_group_exists = exists().where(
                    and_(
                        WorkspaceGroup.workspace_id == Workspace.id,
                        WorkspaceGroup.group_name.in_(user_groups)
                    )
                )
                permission_conditions.append(legacy_group_exists)
            
            # OR 조건 적용
            if permission_conditions:
                stmt = stmt.where(or_(*permission_conditions))
                logger.debug(f"워크스페이스 필터링 적용: 사용자 {user_uuid or user_id}, 그룹 {user_group_uuids or user_groups}")
            else:
                # 권한 없음 - 빈 결과 반환
                logger.warning("워크스페이스 접근 권한이 없는 사용자")
                stmt = stmt.where(False)
        
        stmt = stmt.offset(skip).limit(limit).order_by(Workspace.created_at.desc())
        
        result = await db.execute(stmt)
        workspaces = result.scalars().all()
        
        logger.info(f"워크스페이스 목록 조회 완료: {len(workspaces)}개 워크스페이스 반환")
        return workspaces
    
    async def count(
        self, 
        db: AsyncSession, 
        active_only: bool = True,
        # UUID 기반 파라미터
        user_uuid: Optional[uuid.UUID] = None,
        user_group_uuids: Optional[List[uuid.UUID]] = None,
        is_admin: bool = False,
        # 레거시 호환성 파라미터 (deprecated)
        user_id: Optional[str] = None,
        user_groups: Optional[List[str]] = None
    ) -> int:
        """
        워크스페이스 개수 조회 (UUID 기반)
        관리자가 아닌 사용자는 접근 권한이 있는 워크스페이스만 카운트
        """
        from ..services.user_mapping import user_mapping_service
        from ..services.group_mapping import group_mapping_service
        
        stmt = select(func.count(Workspace.id))
        
        if active_only:
            stmt = stmt.where(Workspace.is_active == True)
        
        if not is_admin:
            # 레거시 파라미터 처리 (String 기반 -> UUID 변환)
            if user_id and not user_uuid:
                try:
                    user_uuid = await user_mapping_service.get_user_uuid_by_identifier(user_id)
                    logger.warning(f"레거시 user_id 파라미터 사용 in count: {user_id} -> {user_uuid}")
                except Exception as e:
                    logger.error(f"레거시 user_id 변환 실패 in count: {e}")
            
            if user_groups and not user_group_uuids:
                try:
                    group_mapping = await group_mapping_service.map_legacy_groups_to_uuid(user_groups)
                    user_group_uuids = [uuid for uuid in group_mapping.values() if uuid is not None]
                    logger.warning(f"레거시 user_groups 파라미터 사용 in count: {user_groups} -> {user_group_uuids}")
                except Exception as e:
                    logger.error(f"레거시 user_groups 변환 실패 in count: {e}")
                    user_group_uuids = []
            
            permission_conditions = []
            
            # 1. 소유자 권한 확인
            if user_uuid:
                permission_conditions.append(Workspace.owner_id == str(user_uuid))
            elif user_id:
                permission_conditions.append(Workspace.owner_id == user_id)
            
            # 2. 사용자 기반 권한 확인 (UUID 기반)
            if user_uuid:
                user_subquery = select(WorkspaceUser.workspace_id).where(
                    or_(
                        WorkspaceUser.user_id_uuid == user_uuid,  # 새로운 UUID 필드
                        WorkspaceUser.user_id == str(user_uuid)   # 레거시 호환성
                    )
                )
                permission_conditions.append(Workspace.id.in_(user_subquery))
            
            # 3. 그룹 기반 권한 확인 (UUID 기반)
            if user_group_uuids:
                group_subquery = select(WorkspaceGroup.workspace_id).where(
                    or_(
                        WorkspaceGroup.group_id_uuid.in_(user_group_uuids),  # 새로운 UUID 필드
                        WorkspaceGroup.group_name.in_([str(g) for g in user_group_uuids])  # 레거시 호환성
                    )
                )
                permission_conditions.append(Workspace.id.in_(group_subquery))
            
            # 4. 레거시 그룹 권한 확인 (deprecated, but for compatibility)
            if user_groups and not user_group_uuids:
                legacy_group_subquery = select(WorkspaceGroup.workspace_id).where(
                    WorkspaceGroup.group_name.in_(user_groups)
                )
                permission_conditions.append(Workspace.id.in_(legacy_group_subquery))
            
            # Apply OR condition if we have any permission conditions
            if permission_conditions:
                stmt = stmt.where(or_(*permission_conditions))
                logger.debug(f"워크스페이스 카운트 필터링 적용: 사용자 {user_uuid or user_id}, 그룹 {user_group_uuids or user_groups}")
            else:
                logger.warning("워크스페이스 카운트: 접근 권한이 없는 사용자")
                stmt = stmt.where(False)
        
        result = await db.execute(stmt)
        count = result.scalar()
        
        logger.debug(f"워크스페이스 카운트 결과: {count}개")
        return count
    
    async def update(
        self, 
        db: AsyncSession, 
        workspace_id: uuid.UUID, 
        obj_in: WorkspaceUpdate,
        updater_id: str
    ) -> Optional[Workspace]:
        """워크스페이스 수정"""
        try:
            # 기존 워크스페이스 조회
            db_obj = await self.get(db, workspace_id)
            if not db_obj:
                return None
            
            # 수정할 데이터 준비
            update_data = obj_in.model_dump(exclude_unset=True)
            
            # slug 중복 확인
            if 'slug' in update_data and update_data['slug'] != db_obj.slug:
                if await self._is_slug_exists(db, update_data['slug']):
                    raise ValueError(f"Slug '{update_data['slug']}' already exists")
            
            # 수정자 정보 추가
            update_data['updated_by'] = updater_id
            
            # 업데이트 수행
            stmt = update(Workspace).where(Workspace.id == workspace_id).values(**update_data)
            await db.execute(stmt)
            await db.commit()
            
            # 수정된 객체 반환
            updated_obj = await self.get(db, workspace_id)
            logger.info(f"Workspace updated: {workspace_id} by {updater_id}")
            return updated_obj
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update workspace {workspace_id}: {e}")
            raise
    
    async def delete(self, db: AsyncSession, workspace_id: uuid.UUID) -> bool:
        """워크스페이스 삭제"""
        try:
            stmt = delete(Workspace).where(Workspace.id == workspace_id)
            result = await db.execute(stmt)
            await db.commit()
            
            deleted = result.rowcount > 0
            if deleted:
                logger.info(f"Workspace deleted: {workspace_id}")
            return deleted
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete workspace {workspace_id}: {e}")
            raise
    
    async def soft_delete(self, db: AsyncSession, workspace_id: uuid.UUID, deleter_id: str) -> bool:
        """워크스페이스 소프트 삭제 (비활성화)"""
        try:
            stmt = update(Workspace).where(Workspace.id == workspace_id).values(
                is_active=False,
                updated_by=deleter_id
            )
            result = await db.execute(stmt)
            await db.commit()
            
            deleted = result.rowcount > 0
            if deleted:
                logger.info(f"Workspace soft deleted: {workspace_id} by {deleter_id}")
            return deleted
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to soft delete workspace {workspace_id}: {e}")
            raise
    
    async def get_workspace_tree(
        self,
        db: AsyncSession,
        user_id: Optional[str] = None,
        user_groups: Optional[List[str]] = None,
        is_admin: bool = False,
        parent_id: Optional[str] = None
    ) -> List[Workspace]:
        """워크스페이스 트리 구조 조회"""
        try:
            # 기본 쿼리
            query = select(self.model).options(
                selectinload(self.model.children),
                selectinload(self.model.workspace_groups),
                selectinload(self.model.workspace_users)
            )
            
            # 최상위 노드만 조회 (parent_id가 None인 경우)
            if parent_id is None:
                query = query.where(self.model.parent_id == None)
            else:
                query = query.where(self.model.parent_id == uuid.UUID(parent_id))
            
            # 활성 워크스페이스만
            query = query.where(self.model.is_active == True)
            
            # 권한 필터링 (관리자가 아닌 경우)
            if not is_admin:
                permission_conditions = []
                
                # User-based permissions
                if user_id:
                    user_workspace_ids = select(WorkspaceUser.workspace_id).where(
                        WorkspaceUser.user_id == user_id
                    )
                    permission_conditions.append(self.model.id.in_(user_workspace_ids))
                
                # Group-based permissions
                if user_groups:
                    group_workspace_ids = select(WorkspaceGroup.workspace_id).where(
                        WorkspaceGroup.group_name.in_(user_groups)
                    )
                    permission_conditions.append(self.model.id.in_(group_workspace_ids))
                
                if permission_conditions:
                    query = query.where(or_(*permission_conditions))
                else:
                    query = query.where(False)
            
            # 정렬
            query = query.order_by(
                self.model.is_folder.desc(),  # 폴더가 먼저
                self.model.name
            )
            
            result = await db.execute(query)
            workspaces = result.scalars().unique().all()
            
            return workspaces
            
        except Exception as e:
            logger.error(f"Failed to get workspace tree: {str(e)}")
            raise


class WorkspaceUserCRUD:
    """워크스페이스 사용자 CRUD 클래스"""
    
    def __init__(self):
        self.model = WorkspaceUser
    
    async def create(
        self, 
        db: AsyncSession, 
        obj_in: Dict[str, Any], 
        created_by: str
    ) -> WorkspaceUser:
        """워크스페이스 사용자 생성"""
        try:
            db_obj = WorkspaceUser(
                workspace_id=obj_in['workspace_id'],
                user_id=obj_in['user_id'],
                user_display_name=obj_in.get('user_display_name'),
                permission_level=obj_in.get('permission_level', 'read'),
                created_by=created_by
            )
            
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            
            logger.info(f"Workspace user created: {db_obj.id} ({db_obj.user_id}) by {created_by}")
            return db_obj
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create workspace user: {e}")
            raise
    
    async def get_by_workspace(self, db: AsyncSession, workspace_id: uuid.UUID) -> List[WorkspaceUser]:
        """워크스페이스의 사용자 목록 조회"""
        stmt = select(WorkspaceUser).where(WorkspaceUser.workspace_id == workspace_id)
        result = await db.execute(stmt)
        return result.scalars().all()
    
    async def get_by_workspace_and_user(
        self, 
        db: AsyncSession, 
        workspace_id: uuid.UUID, 
        user_id: str
    ) -> Optional[WorkspaceUser]:
        """워크스페이스와 사용자로 조회"""
        stmt = select(WorkspaceUser).where(
            and_(
                WorkspaceUser.workspace_id == workspace_id,
                WorkspaceUser.user_id == user_id
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def delete(self, db: AsyncSession, user_id: uuid.UUID) -> bool:
        """워크스페이스 사용자 삭제"""
        try:
            stmt = delete(WorkspaceUser).where(WorkspaceUser.id == user_id)
            result = await db.execute(stmt)
            await db.commit()
            
            deleted = result.rowcount > 0
            if deleted:
                logger.info(f"Workspace user deleted: {user_id}")
            return deleted
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete workspace user {user_id}: {e}")
            raise


class WorkspaceGroupCRUD:
    """워크스페이스 그룹 CRUD 클래스"""
    
    def __init__(self):
        self.model = WorkspaceGroup
    
    async def create(
        self, 
        db: AsyncSession, 
        obj_in: WorkspaceGroupCreate, 
        created_by: str
    ) -> WorkspaceGroup:
        """워크스페이스 그룹 생성"""
        try:
            db_obj = WorkspaceGroup(
                workspace_id=obj_in.workspace_id,
                group_name=obj_in.group_name,
                group_display_name=obj_in.group_display_name,
                permission_level=obj_in.permission_level,
                created_by=created_by
            )
            
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            
            logger.info(f"Workspace group created: {db_obj.id} ({db_obj.group_name}) by {created_by}")
            return db_obj
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create workspace group: {e}")
            raise
    
    async def get_by_workspace(self, db: AsyncSession, workspace_id: uuid.UUID) -> List[WorkspaceGroup]:
        """워크스페이스의 그룹 목록 조회"""
        stmt = select(WorkspaceGroup).where(WorkspaceGroup.workspace_id == workspace_id)
        result = await db.execute(stmt)
        return result.scalars().all()
    
    async def get_by_workspace_and_group(
        self, 
        db: AsyncSession, 
        workspace_id: uuid.UUID, 
        group_name: str
    ) -> Optional[WorkspaceGroup]:
        """워크스페이스와 그룹으로 조회"""
        stmt = select(WorkspaceGroup).where(
            and_(
                WorkspaceGroup.workspace_id == workspace_id,
                WorkspaceGroup.group_name == group_name
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def check_permission(
        self, 
        db: AsyncSession, 
        workspace_id: uuid.UUID,
        user_uuid: Optional[uuid.UUID] = None,
        user_group_uuids: Optional[List[uuid.UUID]] = None, 
        required_permission: str = "read",
        # 레거시 지원을 위한 파라미터 (deprecated)
        user_id: Optional[str] = None,
        user_groups: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        사용자 권한 확인 (UUID 기반)
        사용자 개별 권한 및 그룹 권한을 모두 확인하여 최고 권한 레벨을 반환
        """
        from ..services.user_mapping import user_mapping_service
        from ..services.group_mapping import group_mapping_service
        
        permission_hierarchy = {"read": 1, "write": 2, "admin": 3}
        required_level = permission_hierarchy.get(required_permission, 1)
        
        max_permission_level = 0
        user_permission_level = None
        granted_groups = []
        granted_users = []
        
        # 레거시 파라미터 처리 (String 기반 -> UUID 변환)
        if user_id and not user_uuid:
            try:
                user_uuid = await user_mapping_service.get_user_uuid_by_identifier(user_id)
                logger.warning(f"레거시 user_id 파라미터 사용: {user_id} -> {user_uuid}")
            except Exception as e:
                logger.error(f"레거시 user_id 변환 실패: {e}")
        
        if user_groups and not user_group_uuids:
            try:
                group_mapping = await group_mapping_service.map_legacy_groups_to_uuid(user_groups)
                user_group_uuids = [uuid for uuid in group_mapping.values() if uuid is not None]
                logger.warning(f"레거시 user_groups 파라미터 사용: {user_groups} -> {user_group_uuids}")
            except Exception as e:
                logger.error(f"레거시 user_groups 변환 실패: {e}")
                user_group_uuids = []
        
        # 1. 사용자 기반 권한 확인 (UUID 기반)
        if user_uuid:
            user_stmt = select(WorkspaceUser).where(
                and_(
                    WorkspaceUser.workspace_id == workspace_id,
                    or_(
                        WorkspaceUser.user_id_uuid == user_uuid,  # 새로운 UUID 필드
                        WorkspaceUser.user_id == str(user_uuid)   # 레거시 호환성
                    )
                )
            )
            user_result = await db.execute(user_stmt)
            workspace_user = user_result.scalar_one_or_none()
            
            if workspace_user:
                granted_users.append(str(user_uuid))
                level = permission_hierarchy.get(workspace_user.permission_level, 0)
                if level > max_permission_level:
                    max_permission_level = level
                    user_permission_level = workspace_user.permission_level
                
                logger.debug(f"사용자 권한 확인: {user_uuid} -> {workspace_user.permission_level}")
        
        # 2. 그룹 기반 권한 확인 (UUID 기반)
        if user_group_uuids:
            group_stmt = select(WorkspaceGroup).where(
                and_(
                    WorkspaceGroup.workspace_id == workspace_id,
                    or_(
                        WorkspaceGroup.group_id_uuid.in_(user_group_uuids),  # 새로운 UUID 필드
                        WorkspaceGroup.group_name.in_([str(g) for g in user_group_uuids])  # 레거시 호환성
                    )
                )
            )
            group_result = await db.execute(group_stmt)
            workspace_groups = group_result.scalars().all()
            
            for wg in workspace_groups:
                # UUID 우선, 레거시 fallback
                group_id = wg.group_id_uuid or wg.group_name
                granted_groups.append(str(group_id))
                level = permission_hierarchy.get(wg.permission_level, 0)
                if level > max_permission_level:
                    max_permission_level = level
                    user_permission_level = wg.permission_level
                
                logger.debug(f"그룹 권한 확인: {group_id} -> {wg.permission_level}")
        
        has_permission = max_permission_level >= required_level
        
        result = {
            "has_permission": has_permission,
            "user_permission_level": user_permission_level,
            "granted_groups": granted_groups,
            "granted_users": granted_users,
            "max_permission_level": max_permission_level,
            "required_level": required_level
        }
        
        logger.info(f"권한 확인 결과 - 워크스페이스: {workspace_id}, 사용자: {user_uuid}, "
                   f"권한: {has_permission}, 레벨: {user_permission_level}")
        
        return result
    
    async def delete(self, db: AsyncSession, group_id: uuid.UUID) -> bool:
        """워크스페이스 그룹 삭제"""
        try:
            stmt = delete(WorkspaceGroup).where(WorkspaceGroup.id == group_id)
            result = await db.execute(stmt)
            await db.commit()
            
            deleted = result.rowcount > 0
            if deleted:
                logger.info(f"Workspace group deleted: {group_id}")
            return deleted
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete workspace group {group_id}: {e}")
            raise


class MVPModuleCRUD:
    """MVP 모듈 CRUD 클래스"""
    
    def __init__(self):
        self.model = MVPModule
    
    async def create(
        self, 
        db: AsyncSession, 
        obj_in: MVPModuleCreate, 
        created_by: str
    ) -> MVPModule:
        """MVP 모듈 생성"""
        try:
            db_obj = MVPModule(
                workspace_id=obj_in.workspace_id,
                module_name=obj_in.module_name,
                display_name=obj_in.display_name,
                description=obj_in.description,
                version=obj_in.version,
                config=obj_in.config or {},
                sort_order=obj_in.sort_order,
                icon=obj_in.icon,
                color=obj_in.color,
                created_by=created_by,
                updated_by=created_by
            )
            
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            
            logger.info(f"MVP module created: {db_obj.id} ({db_obj.module_name}) by {created_by}")
            return db_obj
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create MVP module: {e}")
            raise
    
    async def get_by_workspace(
        self, 
        db: AsyncSession, 
        workspace_id: uuid.UUID, 
        active_only: bool = True
    ) -> List[MVPModule]:
        """워크스페이스의 MVP 모듈 목록 조회"""
        stmt = select(MVPModule).where(MVPModule.workspace_id == workspace_id)
        
        if active_only:
            stmt = stmt.where(MVPModule.is_active == True)
        
        stmt = stmt.order_by(MVPModule.sort_order.asc(), MVPModule.created_at.asc())
        
        result = await db.execute(stmt)
        return result.scalars().all()
    
    async def get_active_modules(self, db: AsyncSession) -> List[MVPModule]:
        """모든 활성화된 MVP 모듈 조회"""
        stmt = select(MVPModule).where(
            and_(
                MVPModule.is_active == True,
                MVPModule.is_installed == True
            )
        ).order_by(MVPModule.workspace_id, MVPModule.sort_order)
        
        result = await db.execute(stmt)
        return result.scalars().all()
    
    async def update(
        self, 
        db: AsyncSession, 
        module_id: uuid.UUID, 
        obj_in: MVPModuleUpdate,
        updater_id: str
    ) -> Optional[MVPModule]:
        """MVP 모듈 수정"""
        try:
            # 기존 모듈 조회
            db_obj = await self.get(db, module_id)
            if not db_obj:
                return None
            
            # 수정할 데이터 준비
            update_data = obj_in.model_dump(exclude_unset=True)
            update_data['updated_by'] = updater_id
            
            # 업데이트 수행
            stmt = update(MVPModule).where(MVPModule.id == module_id).values(**update_data)
            await db.execute(stmt)
            await db.commit()
            
            # 수정된 객체 반환
            updated_obj = await self.get(db, module_id)
            logger.info(f"MVP module updated: {module_id} by {updater_id}")
            return updated_obj
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update MVP module {module_id}: {e}")
            raise
    
    async def get(self, db: AsyncSession, module_id: uuid.UUID) -> Optional[MVPModule]:
        """MVP 모듈 조회"""
        stmt = select(MVPModule).where(MVPModule.id == module_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()


# CRUD 인스턴스 생성
workspace_crud = WorkspaceCRUD()
workspace_user_crud = WorkspaceUserCRUD()
workspace_group_crud = WorkspaceGroupCRUD()
mvp_module_crud = MVPModuleCRUD()