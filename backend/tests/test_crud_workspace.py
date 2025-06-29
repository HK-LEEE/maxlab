"""
워크스페이스 CRUD 유닛 테스트
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.crud.workspace import workspace_crud
from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate
from app.models.workspace import WorkspaceType, OwnerType


@pytest.mark.asyncio
@pytest.mark.unit
class TestWorkspaceCRUD:
    """워크스페이스 CRUD 테스트"""
    
    async def test_create_workspace(self, db_session: AsyncSession):
        """워크스페이스 생성 테스트"""
        workspace_data = WorkspaceCreate(
            name="Test Workspace",
            description="Test Description",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id="user123"
        )
        
        workspace = await workspace_crud.create(
            db=db_session,
            obj_in=workspace_data,
            creator_id="user123"
        )
        
        assert workspace.name == workspace_data.name
        assert workspace.slug == "test-workspace"
        assert workspace.workspace_type == WorkspaceType.PERSONAL
        assert workspace.owner_id == "user123"
        assert workspace.created_by == "user123"
    
    async def test_create_workspace_with_duplicate_slug(self, db_session: AsyncSession):
        """중복 slug 처리 테스트"""
        # 첫 번째 워크스페이스
        workspace_data1 = WorkspaceCreate(
            name="Test Workspace",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id="user123"
        )
        workspace1 = await workspace_crud.create(
            db=db_session,
            obj_in=workspace_data1,
            creator_id="user123"
        )
        
        # 같은 이름의 두 번째 워크스페이스
        workspace_data2 = WorkspaceCreate(
            name="Test Workspace",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id="user123"
        )
        workspace2 = await workspace_crud.create(
            db=db_session,
            obj_in=workspace_data2,
            creator_id="user123"
        )
        
        assert workspace1.slug == "test-workspace"
        assert workspace2.slug == "test-workspace-1"
    
    async def test_get_workspace(self, db_session: AsyncSession):
        """워크스페이스 조회 테스트"""
        # 워크스페이스 생성
        workspace_data = WorkspaceCreate(
            name="Get Test",
            workspace_type=WorkspaceType.GROUP,
            owner_type=OwnerType.GROUP,
            owner_id="group123"
        )
        created = await workspace_crud.create(
            db=db_session,
            obj_in=workspace_data,
            creator_id="user123"
        )
        
        # 조회
        fetched = await workspace_crud.get(db_session, str(created.id))
        
        assert fetched is not None
        assert fetched.id == created.id
        assert fetched.name == "Get Test"
    
    async def test_update_workspace(self, db_session: AsyncSession):
        """워크스페이스 수정 테스트"""
        # 워크스페이스 생성
        workspace_data = WorkspaceCreate(
            name="Original Name",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id="user123"
        )
        workspace = await workspace_crud.create(
            db=db_session,
            obj_in=workspace_data,
            creator_id="user123"
        )
        
        # 수정
        update_data = WorkspaceUpdate(
            name="Updated Name",
            description="Updated Description"
        )
        updated = await workspace_crud.update(
            db=db_session,
            db_obj=workspace,
            obj_in=update_data,
            updater_id="user456"
        )
        
        assert updated.name == "Updated Name"
        assert updated.description == "Updated Description"
        assert updated.updated_by == "user456"
    
    async def test_soft_delete_workspace(self, db_session: AsyncSession):
        """워크스페이스 소프트 삭제 테스트"""
        # 워크스페이스 생성
        workspace_data = WorkspaceCreate(
            name="To Delete",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id="user123"
        )
        workspace = await workspace_crud.create(
            db=db_session,
            obj_in=workspace_data,
            creator_id="user123"
        )
        
        # 소프트 삭제
        deleted = await workspace_crud.soft_delete(
            db=db_session,
            workspace_id=str(workspace.id),
            deleter_id="user123"
        )
        
        assert deleted is True
        
        # 삭제된 워크스페이스 확인
        result = await workspace_crud.get(db_session, str(workspace.id))
        assert result is not None
        assert result.is_active is False
    
    async def test_list_workspaces_with_permissions(self, db_session: AsyncSession):
        """권한 기반 워크스페이스 목록 조회 테스트"""
        # 여러 워크스페이스 생성
        for i in range(3):
            workspace_data = WorkspaceCreate(
                name=f"Workspace {i}",
                workspace_type=WorkspaceType.PERSONAL,
                owner_type=OwnerType.USER,
                owner_id=f"user{i}"
            )
            await workspace_crud.create(
                db=db_session,
                obj_in=workspace_data,
                creator_id=f"user{i}"
            )
        
        # 일반 사용자로 조회 (권한 없음)
        workspaces = await workspace_crud.get_multi(
            db=db_session,
            skip=0,
            limit=10,
            active_only=True,
            user_groups=[],
            is_admin=False
        )
        assert len(workspaces) == 0
        
        # 관리자로 조회 (모든 워크스페이스)
        admin_workspaces = await workspace_crud.get_multi(
            db=db_session,
            skip=0,
            limit=10,
            active_only=True,
            user_groups=[],
            is_admin=True
        )
        assert len(admin_workspaces) == 3
    
    async def test_workspace_tree_structure(self, db_session: AsyncSession):
        """워크스페이스 트리 구조 테스트"""
        # 부모 폴더 생성
        parent_data = WorkspaceCreate(
            name="Parent Folder",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id="user123",
            is_folder=True
        )
        parent = await workspace_crud.create(
            db=db_session,
            obj_in=parent_data,
            creator_id="user123"
        )
        
        # 자식 워크스페이스 생성
        child_data = WorkspaceCreate(
            name="Child Workspace",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id="user123",
            parent_id=parent.id
        )
        child = await workspace_crud.create(
            db=db_session,
            obj_in=child_data,
            creator_id="user123"
        )
        
        # 트리 조회
        tree = await workspace_crud.get_workspace_tree(
            db=db_session,
            user_groups=[],
            is_admin=True,
            parent_id=None
        )
        
        assert len(tree) == 1  # 최상위는 부모 폴더만
        assert tree[0].id == parent.id
        assert tree[0].is_folder is True