"""
워크스페이스 API 테스트
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.models.workspace import Workspace, WorkspaceType, OwnerType
from app.crud.workspace import workspace_crud


@pytest.mark.asyncio
class TestWorkspaceAPI:
    """워크스페이스 API 테스트"""
    
    async def test_create_workspace(
        self, 
        client: AsyncClient, 
        admin_auth_headers: dict,
        mock_admin_user: dict
    ):
        """워크스페이스 생성 테스트"""
        workspace_data = {
            "name": "Test Workspace",
            "description": "Test description",
            "workspace_type": WorkspaceType.PERSONAL.value,
            "owner_type": OwnerType.USER.value,
            "owner_id": mock_admin_user["user_id"]
        }
        
        response = await client.post(
            "/api/v1/workspaces/",
            json=workspace_data,
            headers=admin_auth_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == workspace_data["name"]
        assert data["workspace_type"] == workspace_data["workspace_type"]
        assert data["owner_id"] == workspace_data["owner_id"]
    
    async def test_list_workspaces(
        self, 
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict,
        mock_user: dict
    ):
        """워크스페이스 목록 조회 테스트"""
        # 테스트 워크스페이스 생성
        workspace = Workspace(
            name="Test Workspace",
            slug="test-workspace",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id=mock_user["user_id"],
            created_by=mock_user["user_id"]
        )
        db_session.add(workspace)
        await db_session.commit()
        
        response = await client.get(
            "/api/v1/workspaces/",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "workspaces" in data
        assert data["total"] >= 1
    
    async def test_get_workspace_detail(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict,
        mock_user: dict
    ):
        """워크스페이스 상세 조회 테스트"""
        # 테스트 워크스페이스 생성
        workspace = Workspace(
            name="Test Workspace",
            slug="test-workspace",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id=mock_user["user_id"],
            created_by=mock_user["user_id"]
        )
        db_session.add(workspace)
        await db_session.commit()
        await db_session.refresh(workspace)
        
        response = await client.get(
            f"/api/v1/workspaces/{workspace.id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(workspace.id)
        assert data["name"] == workspace.name
    
    async def test_update_workspace(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_auth_headers: dict,
        mock_admin_user: dict
    ):
        """워크스페이스 수정 테스트"""
        # 테스트 워크스페이스 생성
        workspace = Workspace(
            name="Old Name",
            slug="old-name",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id=mock_admin_user["user_id"],
            created_by=mock_admin_user["user_id"]
        )
        db_session.add(workspace)
        await db_session.commit()
        await db_session.refresh(workspace)
        
        update_data = {
            "name": "New Name",
            "description": "Updated description"
        }
        
        response = await client.put(
            f"/api/v1/workspaces/{workspace.id}",
            json=update_data,
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["description"] == update_data["description"]
    
    async def test_delete_workspace(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_auth_headers: dict,
        mock_admin_user: dict
    ):
        """워크스페이스 삭제 테스트"""
        # 테스트 워크스페이스 생성
        workspace = Workspace(
            name="To Delete",
            slug="to-delete",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id=mock_admin_user["user_id"],
            created_by=mock_admin_user["user_id"]
        )
        db_session.add(workspace)
        await db_session.commit()
        await db_session.refresh(workspace)
        
        response = await client.delete(
            f"/api/v1/workspaces/{workspace.id}",
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200
        
        # 소프트 삭제 확인
        deleted_workspace = await workspace_crud.get(db_session, str(workspace.id))
        assert deleted_workspace is not None
        assert deleted_workspace.is_active is False
    
    async def test_workspace_tree(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        auth_headers: dict,
        mock_user: dict
    ):
        """워크스페이스 트리 구조 조회 테스트"""
        # 부모 폴더 생성
        parent = Workspace(
            name="Parent Folder",
            slug="parent-folder",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id=mock_user["user_id"],
            is_folder=True,
            created_by=mock_user["user_id"]
        )
        db_session.add(parent)
        await db_session.commit()
        await db_session.refresh(parent)
        
        # 자식 워크스페이스 생성
        child = Workspace(
            name="Child Workspace",
            slug="child-workspace",
            workspace_type=WorkspaceType.PERSONAL,
            owner_type=OwnerType.USER,
            owner_id=mock_user["user_id"],
            parent_id=parent.id,
            path=f"/{parent.name}/",
            created_by=mock_user["user_id"]
        )
        db_session.add(child)
        await db_session.commit()
        
        response = await client.get(
            "/api/v1/workspaces/tree",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "workspaces" in data
        assert len(data["workspaces"]) > 0
        
        # 트리 구조 확인
        parent_node = next((w for w in data["workspaces"] if w["id"] == str(parent.id)), None)
        assert parent_node is not None
        assert parent_node["is_folder"] is True