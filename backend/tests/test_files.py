"""
파일 관리 API 테스트
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
import io
import uuid

from app.models.workspace import Workspace, WorkspaceType, OwnerType
from app.models.file import WorkspaceFile
from app.crud.file import file_crud


@pytest.mark.asyncio
class TestFileAPI:
    """파일 API 테스트"""
    
    @pytest.fixture
    async def test_workspace(
        self,
        db_session: AsyncSession,
        mock_user: dict
    ) -> Workspace:
        """테스트용 워크스페이스 생성"""
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
        return workspace
    
    async def test_upload_file(
        self,
        client: AsyncClient,
        test_workspace: Workspace,
        auth_headers: dict
    ):
        """파일 업로드 테스트"""
        file_content = b"Test file content"
        files = {
            "file": ("test.txt", io.BytesIO(file_content), "text/plain")
        }
        
        response = await client.post(
            f"/api/v1/workspaces/{test_workspace.id}/files/upload",
            files=files,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "test.txt"
        assert data["file_size"] == len(file_content)
        assert data["mime_type"] == "text/plain"
    
    async def test_create_directory(
        self,
        client: AsyncClient,
        test_workspace: Workspace,
        auth_headers: dict
    ):
        """디렉토리 생성 테스트"""
        dir_data = {
            "name": "Test Directory",
            "description": "Test directory description"
        }
        
        response = await client.post(
            f"/api/v1/workspaces/{test_workspace.id}/files/directory",
            json=dir_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == dir_data["name"]
        assert data["is_directory"] is True
        assert data["mime_type"] == "inode/directory"
    
    async def test_list_files(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_workspace: Workspace,
        auth_headers: dict
    ):
        """파일 목록 조회 테스트"""
        # 테스트 파일 생성
        test_file = WorkspaceFile(
            workspace_id=test_workspace.id,
            name="test.txt",
            original_name="test.txt",
            file_path="/",
            file_size=1024,
            mime_type="text/plain",
            uploaded_by="test_user"
        )
        db_session.add(test_file)
        
        # 테스트 디렉토리 생성
        test_dir = WorkspaceFile(
            workspace_id=test_workspace.id,
            name="Test Dir",
            original_name="Test Dir",
            file_path="/",
            file_size=0,
            mime_type="inode/directory",
            is_directory=True,
            uploaded_by="test_user"
        )
        db_session.add(test_dir)
        await db_session.commit()
        
        response = await client.get(
            f"/api/v1/workspaces/{test_workspace.id}/files",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "files" in data
        assert len(data["files"]) == 2
        
        # 디렉토리가 먼저 나오는지 확인
        assert data["files"][0]["is_directory"] is True
        assert data["files"][1]["is_directory"] is False
    
    async def test_download_file(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_workspace: Workspace,
        auth_headers: dict
    ):
        """파일 다운로드 테스트"""
        # 테스트 파일 생성
        test_file = WorkspaceFile(
            workspace_id=test_workspace.id,
            name="download.txt",
            original_name="download.txt",
            file_path="/",
            file_size=100,
            mime_type="text/plain",
            uploaded_by="test_user"
        )
        db_session.add(test_file)
        await db_session.commit()
        await db_session.refresh(test_file)
        
        # 실제 파일 생성 (테스트용)
        file_path = file_crud._get_file_path(str(test_workspace.id), str(test_file.id))
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("Test content")
        
        response = await client.get(
            f"/api/v1/files/{test_file.id}/download",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/plain; charset=utf-8"
    
    async def test_move_file(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_workspace: Workspace,
        auth_headers: dict
    ):
        """파일 이동 테스트"""
        # 디렉토리 생성
        target_dir = WorkspaceFile(
            workspace_id=test_workspace.id,
            name="Target Dir",
            original_name="Target Dir",
            file_path="/",
            file_size=0,
            mime_type="inode/directory",
            is_directory=True,
            uploaded_by="test_user"
        )
        db_session.add(target_dir)
        
        # 파일 생성
        test_file = WorkspaceFile(
            workspace_id=test_workspace.id,
            name="move.txt",
            original_name="move.txt",
            file_path="/",
            file_size=100,
            mime_type="text/plain",
            uploaded_by="test_user"
        )
        db_session.add(test_file)
        await db_session.commit()
        await db_session.refresh(target_dir)
        await db_session.refresh(test_file)
        
        move_data = {
            "target_parent_id": str(target_dir.id)
        }
        
        response = await client.post(
            f"/api/v1/files/{test_file.id}/move",
            json=move_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["parent_id"] == str(target_dir.id)
        assert data["file_path"] == f"/{target_dir.name}"
    
    async def test_delete_file(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_workspace: Workspace,
        auth_headers: dict
    ):
        """파일 삭제 테스트"""
        # 테스트 파일 생성
        test_file = WorkspaceFile(
            workspace_id=test_workspace.id,
            name="delete.txt",
            original_name="delete.txt",
            file_path="/",
            file_size=100,
            mime_type="text/plain",
            uploaded_by="test_user"
        )
        db_session.add(test_file)
        await db_session.commit()
        await db_session.refresh(test_file)
        
        # 소프트 삭제
        response = await client.delete(
            f"/api/v1/files/{test_file.id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        
        # 삭제 확인
        deleted_file = await file_crud.get(db_session, str(test_file.id))
        assert deleted_file is None  # is_deleted=True인 파일은 조회되지 않음
    
    async def test_storage_stats(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_workspace: Workspace,
        auth_headers: dict
    ):
        """스토리지 통계 조회 테스트"""
        # 테스트 파일들 생성
        for i in range(3):
            file = WorkspaceFile(
                workspace_id=test_workspace.id,
                name=f"file{i}.txt",
                original_name=f"file{i}.txt",
                file_path="/",
                file_size=1024 * (i + 1),
                mime_type="text/plain",
                uploaded_by="test_user"
            )
            db_session.add(file)
        
        # 디렉토리 생성
        dir = WorkspaceFile(
            workspace_id=test_workspace.id,
            name="dir",
            original_name="dir",
            file_path="/",
            file_size=0,
            mime_type="inode/directory",
            is_directory=True,
            uploaded_by="test_user"
        )
        db_session.add(dir)
        await db_session.commit()
        
        response = await client.get(
            f"/api/v1/workspaces/{test_workspace.id}/storage/stats",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["file_count"] == 3
        assert data["directory_count"] == 1
        assert data["total_size"] == 1024 + 2048 + 3072  # 6144
        assert "text/plain" in data["by_type"]
        assert data["by_type"]["text/plain"]["count"] == 3