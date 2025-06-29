"""
MAX Lab 파일 관련 Pydantic 스키마
파일 업로드/다운로드 및 관리를 위한 스키마입니다.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


# File Schemas
class FileBase(BaseModel):
    """파일 기본 스키마"""
    name: str = Field(..., min_length=1, max_length=255, description="파일명")
    description: Optional[str] = Field(None, max_length=2000, description="파일 설명")
    parent_id: Optional[uuid.UUID] = Field(None, description="부모 디렉토리 ID")
    is_public: bool = Field(default=False, description="공개 여부")
    file_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="파일 메타데이터")


class FileCreate(FileBase):
    """파일 생성 스키마 (메타데이터만)"""
    workspace_id: uuid.UUID


class FileUpdate(BaseModel):
    """파일 수정 스키마"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    parent_id: Optional[uuid.UUID] = None
    is_public: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None


class FileInDBBase(FileBase):
    """데이터베이스 파일 기본 스키마"""
    id: uuid.UUID
    workspace_id: uuid.UUID
    original_name: str
    file_path: str
    file_size: int
    mime_type: str
    file_hash: Optional[str]
    is_directory: bool
    file_extension: Optional[str]
    is_deleted: bool
    version: int
    version_of: Optional[uuid.UUID]
    uploaded_by: str
    uploaded_at: datetime
    modified_by: Optional[str]
    modified_at: Optional[datetime]
    
    model_config = ConfigDict(from_attributes=True)


class File(FileInDBBase):
    """파일 응답 스키마"""
    pass


class FileDetail(FileInDBBase):
    """파일 상세 정보 스키마"""
    children: List["File"] = []
    versions: List["File"] = []
    share_count: int = 0


class DirectoryCreate(BaseModel):
    """디렉토리 생성 스키마"""
    name: str = Field(..., min_length=1, max_length=255, description="디렉토리명")
    parent_id: Optional[uuid.UUID] = Field(None, description="부모 디렉토리 ID")
    description: Optional[str] = Field(None, max_length=2000, description="설명")


# File Share Schemas
class FileShareBase(BaseModel):
    """파일 공유 기본 스키마"""
    share_type: str = Field(default="view", description="공유 타입 (view/download)")
    password: Optional[str] = Field(None, description="비밀번호")
    expires_at: Optional[datetime] = Field(None, description="만료일시")
    max_downloads: Optional[int] = Field(None, ge=1, description="최대 다운로드 횟수")


class FileShareCreate(FileShareBase):
    """파일 공유 생성 스키마"""
    file_id: uuid.UUID


class FileShareResponse(BaseModel):
    """파일 공유 응답 스키마"""
    id: uuid.UUID
    file_id: uuid.UUID
    share_token: str
    share_type: str
    expires_at: Optional[datetime]
    max_downloads: Optional[int]
    download_count: int
    created_at: datetime
    share_url: str
    
    model_config = ConfigDict(from_attributes=True)


# File Operation Schemas
class FileMoveRequest(BaseModel):
    """파일 이동 요청 스키마"""
    target_parent_id: Optional[uuid.UUID] = Field(None, description="대상 부모 디렉토리 ID")


class FileCopyRequest(BaseModel):
    """파일 복사 요청 스키마"""
    target_parent_id: Optional[uuid.UUID] = Field(None, description="대상 부모 디렉토리 ID")
    new_name: Optional[str] = Field(None, min_length=1, max_length=255, description="새 파일명")


class FileUploadResponse(BaseModel):
    """파일 업로드 응답 스키마"""
    file: File
    upload_url: Optional[str] = None
    

# List Response Schemas
class FileListResponse(BaseModel):
    """파일 목록 응답 스키마"""
    files: List[File]
    total: int
    path: List[Dict[str, Any]] = []  # Breadcrumb path


class FileTreeResponse(BaseModel):
    """파일 트리 응답 스키마"""
    files: List[File]
    total: int


# Storage Stats
class StorageStats(BaseModel):
    """스토리지 통계 스키마"""
    total_size: int
    file_count: int
    directory_count: int
    by_type: Dict[str, Dict[str, int]] = {}  # {mime_type: {count, size}}


# Forward reference resolution
FileDetail.model_rebuild()