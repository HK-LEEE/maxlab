"""
MAX Lab 파일 관련 CRUD 로직
파일 업로드, 다운로드 및 관리 기능을 제공합니다.
"""
from typing import List, Optional, Dict, Any, BinaryIO
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, update
from sqlalchemy.orm import selectinload
import os
import hashlib
import shutil
import uuid
import logging
import aiofiles
from pathlib import Path
import mimetypes

from ..models.file import WorkspaceFile, FileShare
from ..models.workspace import Workspace
from ..schemas.file import (
    FileCreate, FileUpdate, DirectoryCreate,
    FileShareCreate, FileMoveRequest, FileCopyRequest
)
from ..core.config import settings

logger = logging.getLogger(__name__)


class FileCRUD:
    """파일 CRUD 클래스"""
    
    def __init__(self):
        self.model = WorkspaceFile
        self.base_upload_path = Path(settings.UPLOAD_PATH) if hasattr(settings, 'UPLOAD_PATH') else Path("uploads")
        self.base_upload_path.mkdir(parents=True, exist_ok=True)
    
    def _get_file_path(self, workspace_id: str, file_id: str) -> Path:
        """파일 저장 경로 생성"""
        return self.base_upload_path / workspace_id / file_id
    
    async def _calculate_file_hash(self, file_path: Path) -> str:
        """파일 해시 계산 (SHA256)"""
        sha256_hash = hashlib.sha256()
        async with aiofiles.open(file_path, "rb") as f:
            while chunk := await f.read(8192):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()
    
    def _get_mime_type(self, filename: str) -> str:
        """파일 MIME 타입 추측"""
        mime_type, _ = mimetypes.guess_type(filename)
        return mime_type or "application/octet-stream"
    
    def _get_file_extension(self, filename: str) -> Optional[str]:
        """파일 확장자 추출"""
        parts = filename.split('.')
        return parts[-1].lower() if len(parts) > 1 else None
    
    async def create_directory(
        self,
        db: AsyncSession,
        workspace_id: str,
        dir_data: DirectoryCreate,
        creator_id: str
    ) -> WorkspaceFile:
        """디렉토리 생성"""
        try:
            # 경로 계산
            path = "/"
            if dir_data.parent_id:
                parent = await self.get(db, str(dir_data.parent_id))
                if parent and parent.workspace_id == uuid.UUID(workspace_id):
                    path = f"{parent.file_path}/{parent.name}"
            
            db_obj = WorkspaceFile(
                workspace_id=uuid.UUID(workspace_id),
                parent_id=dir_data.parent_id,
                name=dir_data.name,
                original_name=dir_data.name,
                file_path=path,
                file_size=0,
                mime_type="inode/directory",
                is_directory=True,
                uploaded_by=creator_id,
                description=dir_data.description
            )
            
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            
            logger.info(f"Directory created: {db_obj.id} in workspace {workspace_id}")
            return db_obj
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create directory: {e}")
            raise
    
    async def upload_file(
        self,
        db: AsyncSession,
        workspace_id: str,
        file_data: FileCreate,
        file_content: BinaryIO,
        filename: str,
        file_size: int,
        uploader_id: str
    ) -> WorkspaceFile:
        """파일 업로드"""
        try:
            file_id = str(uuid.uuid4())
            workspace_path = self._get_file_path(workspace_id, "")
            workspace_path.mkdir(parents=True, exist_ok=True)
            
            # 파일 저장
            file_path = self._get_file_path(workspace_id, file_id)
            
            # 동기 방식으로 파일 쓰기 (BinaryIO 처리)
            with open(file_path, "wb") as f:
                shutil.copyfileobj(file_content, f)
            
            # 파일 해시 계산
            file_hash = await self._calculate_file_hash(file_path)
            
            # 경로 계산
            parent_path = "/"
            if file_data.parent_id:
                parent = await self.get(db, str(file_data.parent_id))
                if parent and parent.workspace_id == uuid.UUID(workspace_id):
                    parent_path = f"{parent.file_path}/{parent.name}"
            
            # DB 저장
            db_obj = WorkspaceFile(
                id=uuid.UUID(file_id),
                workspace_id=uuid.UUID(workspace_id),
                parent_id=file_data.parent_id,
                name=file_data.name or filename,
                original_name=filename,
                file_path=parent_path,
                file_size=file_size,
                mime_type=self._get_mime_type(filename),
                file_hash=file_hash,
                file_extension=self._get_file_extension(filename),
                is_directory=False,
                is_public=file_data.is_public,
                description=file_data.description,
                file_metadata=file_data.file_metadata or {},
                uploaded_by=uploader_id
            )
            
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
            
            logger.info(f"File uploaded: {db_obj.id} ({filename}) to workspace {workspace_id}")
            return db_obj
            
        except Exception as e:
            # 파일 삭제
            if 'file_path' in locals() and file_path.exists():
                file_path.unlink()
            await db.rollback()
            logger.error(f"Failed to upload file: {e}")
            raise
    
    async def get(
        self,
        db: AsyncSession,
        file_id: str
    ) -> Optional[WorkspaceFile]:
        """파일 조회"""
        try:
            query = select(self.model).where(
                and_(
                    self.model.id == uuid.UUID(file_id),
                    self.model.is_deleted == False
                )
            )
            result = await db.execute(query)
            return result.scalar_one_or_none()
            
        except Exception as e:
            logger.error(f"Failed to get file {file_id}: {e}")
            raise
    
    async def get_file_path(
        self,
        db: AsyncSession,
        file_id: str
    ) -> Optional[Path]:
        """실제 파일 경로 반환"""
        file = await self.get(db, file_id)
        if file and not file.is_directory:
            file_path = self._get_file_path(str(file.workspace_id), str(file.id))
            if file_path.exists():
                return file_path
        return None
    
    async def list_files(
        self,
        db: AsyncSession,
        workspace_id: str,
        parent_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> List[WorkspaceFile]:
        """워크스페이스 파일 목록 조회"""
        try:
            query = select(self.model).where(
                self.model.workspace_id == uuid.UUID(workspace_id)
            )
            
            if parent_id:
                query = query.where(self.model.parent_id == uuid.UUID(parent_id))
            else:
                query = query.where(self.model.parent_id == None)
            
            if not include_deleted:
                query = query.where(self.model.is_deleted == False)
            
            query = query.order_by(
                self.model.is_directory.desc(),
                self.model.name
            )
            
            result = await db.execute(query)
            return result.scalars().all()
            
        except Exception as e:
            logger.error(f"Failed to list files: {e}")
            raise
    
    async def update(
        self,
        db: AsyncSession,
        file_id: str,
        file_update: FileUpdate,
        updater_id: str
    ) -> Optional[WorkspaceFile]:
        """파일 정보 수정"""
        try:
            file = await self.get(db, file_id)
            if not file:
                return None
            
            update_data = file_update.model_dump(exclude_unset=True)
            update_data["modified_by"] = updater_id
            
            for field, value in update_data.items():
                setattr(file, field, value)
            
            await db.commit()
            await db.refresh(file)
            
            logger.info(f"File updated: {file_id}")
            return file
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update file {file_id}: {e}")
            raise
    
    async def delete(
        self,
        db: AsyncSession,
        file_id: str,
        permanent: bool = False
    ) -> bool:
        """파일 삭제 (소프트 삭제 또는 영구 삭제)"""
        try:
            file = await self.get(db, file_id)
            if not file:
                return False
            
            if permanent:
                # 실제 파일 삭제
                if not file.is_directory:
                    file_path = self._get_file_path(str(file.workspace_id), str(file.id))
                    if file_path.exists():
                        file_path.unlink()
                
                # DB에서 삭제
                await db.delete(file)
            else:
                # 소프트 삭제
                file.is_deleted = True
            
            await db.commit()
            
            logger.info(f"File {'permanently' if permanent else 'soft'} deleted: {file_id}")
            return True
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete file {file_id}: {e}")
            raise
    
    async def move(
        self,
        db: AsyncSession,
        file_id: str,
        move_request: FileMoveRequest,
        mover_id: str
    ) -> Optional[WorkspaceFile]:
        """파일/디렉토리 이동"""
        try:
            file = await self.get(db, file_id)
            if not file:
                return None
            
            # 새 경로 계산
            new_path = "/"
            if move_request.target_parent_id:
                parent = await self.get(db, str(move_request.target_parent_id))
                if parent and parent.workspace_id == file.workspace_id:
                    new_path = f"{parent.file_path}/{parent.name}"
            
            file.parent_id = move_request.target_parent_id
            file.file_path = new_path
            file.modified_by = mover_id
            
            await db.commit()
            await db.refresh(file)
            
            logger.info(f"File moved: {file_id} to {new_path}")
            return file
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to move file {file_id}: {e}")
            raise
    
    async def get_storage_stats(
        self,
        db: AsyncSession,
        workspace_id: str
    ) -> Dict[str, Any]:
        """워크스페이스 스토리지 통계"""
        try:
            # 전체 통계
            total_query = select(
                func.sum(self.model.file_size).label("total_size"),
                func.count(self.model.id).label("total_count")
            ).where(
                and_(
                    self.model.workspace_id == uuid.UUID(workspace_id),
                    self.model.is_deleted == False
                )
            )
            
            total_result = await db.execute(total_query)
            total_data = total_result.one()
            
            # 파일/디렉토리 개수
            file_count_query = select(func.count(self.model.id)).where(
                and_(
                    self.model.workspace_id == uuid.UUID(workspace_id),
                    self.model.is_directory == False,
                    self.model.is_deleted == False
                )
            )
            file_count_result = await db.execute(file_count_query)
            file_count = file_count_result.scalar()
            
            dir_count_query = select(func.count(self.model.id)).where(
                and_(
                    self.model.workspace_id == uuid.UUID(workspace_id),
                    self.model.is_directory == True,
                    self.model.is_deleted == False
                )
            )
            dir_count_result = await db.execute(dir_count_query)
            dir_count = dir_count_result.scalar()
            
            # MIME 타입별 통계
            type_stats_query = select(
                self.model.mime_type,
                func.count(self.model.id).label("count"),
                func.sum(self.model.file_size).label("size")
            ).where(
                and_(
                    self.model.workspace_id == uuid.UUID(workspace_id),
                    self.model.is_deleted == False,
                    self.model.is_directory == False
                )
            ).group_by(self.model.mime_type)
            
            type_stats_result = await db.execute(type_stats_query)
            type_stats = {}
            for row in type_stats_result:
                type_stats[row.mime_type] = {
                    "count": row.count,
                    "size": row.size or 0
                }
            
            return {
                "total_size": total_data.total_size or 0,
                "file_count": file_count or 0,
                "directory_count": dir_count or 0,
                "by_type": type_stats
            }
            
        except Exception as e:
            logger.error(f"Failed to get storage stats: {e}")
            raise


# CRUD 인스턴스
file_crud = FileCRUD()