"""
MAX Lab MVP 플랫폼 워크스페이스 관련 CRUD 로직
데이터베이스와의 모든 워크스페이스 관련 상호작용을 처리합니다.
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, update, delete
from sqlalchemy.orm import selectinload
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
            
            # Add user permissions if specified
            if obj_in.permission_mode == 'user' and obj_in.selected_users:
                for user_id in obj_in.selected_users:
                    workspace_user = WorkspaceUser(
                        workspace_id=db_obj.id,
                        user_id=user_id,
                        permission_level='read',
                        created_by=creator_id
                    )
                    db.add(workspace_user)
            
            # Add group permissions if specified
            if obj_in.permission_mode == 'group' and obj_in.selected_groups:
                for group_name in obj_in.selected_groups:
                    workspace_group = WorkspaceGroup(
                        workspace_id=db_obj.id,
                        group_name=group_name,
                        permission_level='read',
                        created_by=creator_id
                    )
                    db.add(workspace_group)
            
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
        """워크스페이스 상세 정보 조회 (그룹, 모듈 포함)"""
        stmt = select(Workspace).options(
            selectinload(Workspace.workspace_groups),
            selectinload(Workspace.mvp_modules)
        ).where(Workspace.id == workspace_id)
        
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_multi(
        self, 
        db: AsyncSession, 
        skip: int = 0, 
        limit: int = 1000,
        active_only: bool = True,
        user_id: Optional[str] = None,
        user_groups: Optional[List[str]] = None,
        is_admin: bool = False
    ) -> List[Workspace]:
        """워크스페이스 목록 조회"""
        stmt = select(Workspace)
        
        # 활성 워크스페이스만 조회
        if active_only:
            stmt = stmt.where(Workspace.is_active == True)
        
        # 관리자가 아닌 경우 접근 권한이 있는 워크스페이스만 조회
        if not is_admin:
            # Build permission conditions
            permission_conditions = []
            
            # Check user-based permissions
            if user_id:
                user_subquery = select(WorkspaceUser.workspace_id).where(
                    WorkspaceUser.user_id == user_id
                )
                permission_conditions.append(Workspace.id.in_(user_subquery))
            
            # Check group-based permissions
            if user_groups:
                group_subquery = select(WorkspaceGroup.workspace_id).where(
                    WorkspaceGroup.group_name.in_(user_groups)
                )
                permission_conditions.append(Workspace.id.in_(group_subquery))
            
            # Apply OR condition if we have any permission conditions
            if permission_conditions:
                stmt = stmt.where(or_(*permission_conditions))
            else:
                # No permissions - return empty result
                stmt = stmt.where(False)
        
        stmt = stmt.offset(skip).limit(limit).order_by(Workspace.created_at.desc())
        
        result = await db.execute(stmt)
        return result.scalars().all()
    
    async def count(
        self, 
        db: AsyncSession, 
        active_only: bool = True,
        user_id: Optional[str] = None,
        user_groups: Optional[List[str]] = None,
        is_admin: bool = False
    ) -> int:
        """워크스페이스 개수 조회"""
        stmt = select(func.count(Workspace.id))
        
        if active_only:
            stmt = stmt.where(Workspace.is_active == True)
        
        if not is_admin:
            permission_conditions = []
            
            # Check user-based permissions
            if user_id:
                user_subquery = select(WorkspaceUser.workspace_id).where(
                    WorkspaceUser.user_id == user_id
                )
                permission_conditions.append(Workspace.id.in_(user_subquery))
            
            # Check group-based permissions
            if user_groups:
                group_subquery = select(WorkspaceGroup.workspace_id).where(
                    WorkspaceGroup.group_name.in_(user_groups)
                )
                permission_conditions.append(Workspace.id.in_(group_subquery))
            
            # Apply OR condition if we have any permission conditions
            if permission_conditions:
                stmt = stmt.where(or_(*permission_conditions))
            else:
                stmt = stmt.where(False)
        
        result = await db.execute(stmt)
        return result.scalar()
    
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
        user_id: Optional[str] = None,
        user_groups: Optional[List[str]] = None, 
        required_permission: str = "read"
    ) -> Dict[str, Any]:
        """사용자 권한 확인 (사용자 개별 권한 및 그룹 권한 모두 확인)"""
        permission_hierarchy = {"read": 1, "write": 2, "admin": 3}
        required_level = permission_hierarchy.get(required_permission, 1)
        
        max_permission_level = 0
        user_permission_level = None
        granted_groups = []
        granted_users = []
        
        # Check user-based permissions
        if user_id:
            user_stmt = select(WorkspaceUser).where(
                and_(
                    WorkspaceUser.workspace_id == workspace_id,
                    WorkspaceUser.user_id == user_id
                )
            )
            user_result = await db.execute(user_stmt)
            workspace_user = user_result.scalar_one_or_none()
            
            if workspace_user:
                granted_users.append(user_id)
                level = permission_hierarchy.get(workspace_user.permission_level, 0)
                if level > max_permission_level:
                    max_permission_level = level
                    user_permission_level = workspace_user.permission_level
        
        # Check group-based permissions
        if user_groups:
            group_stmt = select(WorkspaceGroup).where(
                and_(
                    WorkspaceGroup.workspace_id == workspace_id,
                    WorkspaceGroup.group_name.in_(user_groups)
                )
            )
            group_result = await db.execute(group_stmt)
            workspace_groups = group_result.scalars().all()
            
            for wg in workspace_groups:
                granted_groups.append(wg.group_name)
                level = permission_hierarchy.get(wg.permission_level, 0)
                if level > max_permission_level:
                    max_permission_level = level
                    user_permission_level = wg.permission_level
        
        has_permission = max_permission_level >= required_level
        
        return {
            "has_permission": has_permission,
            "user_permission_level": user_permission_level,
            "granted_groups": granted_groups,
            "granted_users": granted_users
        }
    
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