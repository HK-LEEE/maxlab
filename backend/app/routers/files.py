"""
MAX Lab 파일 관리 API 라우터
파일 업로드, 다운로드, 관리 기능을 제공합니다.
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import logging
import uuid
import secrets
from pathlib import Path

from ..core.database import get_db
from ..core.security import get_current_active_user, require_admin
from ..crud.file import file_crud
from ..crud.workspace import workspace_crud
from ..schemas.file import (
    FileCreate, FileUpdate, FileDetail, FileListResponse,
    DirectoryCreate, FileShareCreate, FileShareResponse,
    FileMoveRequest, FileCopyRequest, StorageStats
)
from ..routers.workspaces import require_workspace_permission

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Files"])


@router.post("/workspaces/{workspace_id}/files/upload", response_model=FileDetail)
async def upload_file(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    parent_id: Optional[uuid.UUID] = Query(None),
    description: Optional[str] = Query(None),
    is_public: bool = Query(False),
    current_user: Dict[str, Any] = Depends(require_workspace_permission("write")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스에 파일 업로드"""
    
    # 파일 크기 제한 (100MB)
    max_size = 100 * 1024 * 1024
    file_size = 0
    
    # 파일 크기 확인
    file.file.seek(0, 2)  # 파일 끝으로 이동
    file_size = file.file.tell()
    file.file.seek(0)  # 파일 처음으로 되돌리기
    
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {max_size/1024/1024}MB"
        )
    
    # 파일 생성 데이터
    file_data = FileCreate(
        workspace_id=workspace_id,
        name=file.filename,
        parent_id=parent_id,
        description=description,
        is_public=is_public
    )
    
    try:
        # 파일 업로드
        db_file = await file_crud.upload_file(
            db=db,
            workspace_id=str(workspace_id),
            file_data=file_data,
            file_content=file.file,
            filename=file.filename,
            file_size=file_size,
            uploader_id=current_user.get("user_id", current_user.get("id"))
        )
        
        return db_file
        
    except Exception as e:
        logger.error(f"Failed to upload file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file"
        )


@router.post("/workspaces/{workspace_id}/files/directory", response_model=FileDetail)
async def create_directory(
    workspace_id: uuid.UUID,
    dir_data: DirectoryCreate,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("write")),
    db: AsyncSession = Depends(get_db)
):
    """디렉토리 생성"""
    
    try:
        directory = await file_crud.create_directory(
            db=db,
            workspace_id=str(workspace_id),
            dir_data=dir_data,
            creator_id=current_user.get("user_id", current_user.get("id"))
        )
        return directory
        
    except Exception as e:
        logger.error(f"Failed to create directory: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create directory"
        )


@router.get("/workspaces/{workspace_id}/files", response_model=FileListResponse)
async def list_files(
    workspace_id: uuid.UUID,
    parent_id: Optional[uuid.UUID] = Query(None),
    include_deleted: bool = Query(False),
    current_user: Dict[str, Any] = Depends(require_workspace_permission("read")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 파일 목록 조회"""
    
    files = await file_crud.list_files(
        db=db,
        workspace_id=str(workspace_id),
        parent_id=str(parent_id) if parent_id else None,
        include_deleted=include_deleted
    )
    
    # Breadcrumb path 생성
    path = []
    if parent_id:
        current = await file_crud.get(db, str(parent_id))
        while current:
            path.insert(0, {
                "id": str(current.id),
                "name": current.name,
                "is_directory": current.is_directory
            })
            if current.parent_id:
                current = await file_crud.get(db, str(current.parent_id))
            else:
                break
    
    return FileListResponse(
        files=files,
        total=len(files),
        path=path
    )


@router.get("/files/{file_id}", response_model=FileDetail)
async def get_file_info(
    file_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """파일 정보 조회"""
    
    file = await file_crud.get(db, str(file_id))
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # 권한 확인
    _ = Depends(require_workspace_permission("read"))
    
    return file


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """파일 다운로드"""
    
    file = await file_crud.get(db, str(file_id))
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    if file.is_directory:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot download directory"
        )
    
    # 권한 확인
    _ = Depends(require_workspace_permission("read"))
    
    # 파일 경로 가져오기
    file_path = await file_crud.get_file_path(db, str(file_id))
    if not file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk"
        )
    
    return FileResponse(
        path=file_path,
        filename=file.original_name,
        media_type=file.mime_type
    )


@router.put("/files/{file_id}", response_model=FileDetail)
async def update_file(
    file_id: uuid.UUID,
    file_update: FileUpdate,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """파일 정보 수정"""
    
    file = await file_crud.get(db, str(file_id))
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # 권한 확인
    _ = Depends(require_workspace_permission("write"))
    
    updated_file = await file_crud.update(
        db=db,
        file_id=str(file_id),
        file_update=file_update,
        updater_id=current_user.get("user_id", current_user.get("id"))
    )
    
    return updated_file


@router.post("/files/{file_id}/move", response_model=FileDetail)
async def move_file(
    file_id: uuid.UUID,
    move_request: FileMoveRequest,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """파일/디렉토리 이동"""
    
    file = await file_crud.get(db, str(file_id))
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # 권한 확인
    _ = Depends(require_workspace_permission("write"))
    
    moved_file = await file_crud.move(
        db=db,
        file_id=str(file_id),
        move_request=move_request,
        mover_id=current_user.get("user_id", current_user.get("id"))
    )
    
    return moved_file


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: uuid.UUID,
    permanent: bool = Query(False),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """파일 삭제"""
    
    file = await file_crud.get(db, str(file_id))
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # 권한 확인
    _ = Depends(require_workspace_permission("write"))
    
    success = await file_crud.delete(
        db=db,
        file_id=str(file_id),
        permanent=permanent
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file"
        )
    
    return {"message": "File deleted successfully"}


@router.get("/workspaces/{workspace_id}/storage/stats", response_model=StorageStats)
async def get_storage_stats(
    workspace_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("read")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 스토리지 통계"""
    
    stats = await file_crud.get_storage_stats(db, str(workspace_id))
    return StorageStats(**stats)


@router.post("/files/{file_id}/share", response_model=FileShareResponse)
async def create_file_share(
    file_id: uuid.UUID,
    share_data: FileShareCreate,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """파일 공유 링크 생성"""
    
    file = await file_crud.get(db, str(file_id))
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # 권한 확인
    _ = Depends(require_workspace_permission("write"))
    
    # 공유 토큰 생성
    share_token = secrets.token_urlsafe(32)
    
    # TODO: FileShare CRUD 구현 및 공유 링크 생성
    
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="File sharing not implemented yet"
    )