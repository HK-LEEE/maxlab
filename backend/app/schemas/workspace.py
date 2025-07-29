"""
MAX Lab MVP 플랫폼 워크스페이스 관련 Pydantic 스키마
API 요청/응답 데이터 검증 및 시리얼라이제이션을 위한 스키마입니다.
"""
from pydantic import BaseModel, Field, ConfigDict, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import re
from enum import Enum


# Enums
class WorkspaceType(str, Enum):
    """워크스페이스 타입"""
    PERSONAL = "PERSONAL"
    GROUP = "GROUP"
    PUBLIC = "PUBLIC"


class OwnerType(str, Enum):
    """소유자 타입"""
    USER = "USER"
    GROUP = "GROUP"


# Base Schemas
class WorkspaceBase(BaseModel):
    """워크스페이스 기본 스키마"""
    name: str = Field(..., min_length=1, max_length=255, description="워크스페이스 이름")
    slug: Optional[str] = Field(None, min_length=1, max_length=100, description="URL 친화적 이름")
    description: Optional[str] = Field(None, max_length=2000, description="워크스페이스 설명")
    workspace_type: WorkspaceType = Field(default=WorkspaceType.PERSONAL, description="워크스페이스 타입")
    owner_type: OwnerType = Field(default=OwnerType.USER, description="소유자 타입")
    owner_id: str = Field(..., min_length=1, max_length=255, description="소유자 ID")
    parent_id: Optional[uuid.UUID] = Field(None, description="부모 워크스페이스 ID")
    is_folder: bool = Field(default=False, description="폴더 여부")
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict, description="워크스페이스 설정")
    
    @validator('slug')
    def validate_slug(cls, v):
        if v:
            # 영문, 숫자, 하이픈, 언더스코어만 허용
            if not re.match(r'^[a-zA-Z0-9_-]+$', v):
                raise ValueError('Slug can only contain letters, numbers, hyphens, and underscores')
        return v

class WorkspaceCreate(WorkspaceBase):
    """워크스페이스 생성 스키마"""
    # Permission fields
    permission_mode: Optional[str] = Field(None, description="권한 모드 (user/group)")
    selected_users: Optional[List[uuid.UUID]] = Field(default_factory=list, description="선택된 사용자 UUID 목록")
    selected_groups: Optional[List[uuid.UUID]] = Field(default_factory=list, description="선택된 그룹 UUID 목록")

class WorkspaceUpdate(BaseModel):
    """워크스페이스 수정 스키마"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    is_active: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None
    
    @validator('slug')
    def validate_slug(cls, v):
        if v:
            if not re.match(r'^[a-zA-Z0-9_-]+$', v):
                raise ValueError('Slug can only contain letters, numbers, hyphens, and underscores')
        return v

class WorkspaceInDBBase(WorkspaceBase):
    """데이터베이스 워크스페이스 기본 스키마"""
    id: uuid.UUID
    is_active: bool
    workspace_type: WorkspaceType
    owner_type: OwnerType
    owner_id: str
    parent_id: Optional[uuid.UUID]
    path: str
    is_folder: bool
    created_by: str
    updated_by: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    
    model_config = ConfigDict(from_attributes=True)

class Workspace(WorkspaceInDBBase):
    """워크스페이스 응답 스키마"""
    pass

class WorkspaceDetail(WorkspaceInDBBase):
    """워크스페이스 상세 정보 스키마"""
    workspace_groups: List["WorkspaceGroup"] = []
    mvp_modules: List["MVPModule"] = []
    children: List["Workspace"] = []

# WorkspaceGroup Schemas
class WorkspaceGroupBase(BaseModel):
    """워크스페이스 그룹 기본 스키마"""
    group_id: uuid.UUID = Field(..., description="그룹 UUID")
    group_display_name: Optional[str] = Field(None, max_length=255, description="그룹 표시명")
    permission_level: str = Field(default="read", description="권한 레벨")
    
    @validator('permission_level')
    def validate_permission_level(cls, v):
        allowed_permissions = ['read', 'write', 'admin']
        if v not in allowed_permissions:
            raise ValueError(f'Permission level must be one of: {allowed_permissions}')
        return v

class WorkspaceGroupCreate(WorkspaceGroupBase):
    """워크스페이스 그룹 생성 스키마"""
    workspace_id: uuid.UUID

class WorkspaceGroupUpdate(BaseModel):
    """워크스페이스 그룹 수정 스키마"""
    group_display_name: Optional[str] = Field(None, max_length=255)
    permission_level: Optional[str] = None
    
    @validator('permission_level')
    def validate_permission_level(cls, v):
        if v:
            allowed_permissions = ['read', 'write', 'admin']
            if v not in allowed_permissions:
                raise ValueError(f'Permission level must be one of: {allowed_permissions}')
        return v

class WorkspaceGroupInDBBase(BaseModel):
    """데이터베이스 워크스페이스 그룹 기본 스키마"""
    id: uuid.UUID
    workspace_id: uuid.UUID
    group_id: uuid.UUID = Field(..., description="그룹 UUID")
    group_display_name: Optional[str] = Field(None, description="그룹 표시명")
    permission_level: str = Field(default="read", description="권한 레벨")
    group_info_updated_at: Optional[datetime] = Field(None, description="그룹 정보 업데이트 시간")
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime]
    
    # Legacy compatibility fields (to be removed after migration)
    group_name: Optional[str] = Field(None, description="레거시 그룹명 (deprecated)")
    group_id_uuid: Optional[uuid.UUID] = Field(None, description="레거시 UUID 필드 (deprecated)")
    
    model_config = ConfigDict(from_attributes=True)
    
    @validator('group_id', pre=True, always=True)
    def set_group_id(cls, v, values):
        """Handle legacy field mapping during transition"""
        # If group_id is provided, use it
        if v:
            return v
        # Otherwise, try to use group_id_uuid (legacy field)
        if 'group_id_uuid' in values and values['group_id_uuid']:
            return values['group_id_uuid']
        # Last resort: try to parse group_name as UUID
        if 'group_name' in values and values['group_name']:
            try:
                return uuid.UUID(values['group_name'])
            except ValueError:
                pass
        return v

class WorkspaceGroup(WorkspaceGroupInDBBase):
    """워크스페이스 그룹 응답 스키마"""
    pass

# WorkspaceUser Schemas
class WorkspaceUserBase(BaseModel):
    """워크스페이스 사용자 기본 스키마"""
    user_id: uuid.UUID = Field(..., description="사용자 UUID")
    user_display_name: Optional[str] = Field(None, max_length=255, description="사용자 표시명")
    user_email: Optional[str] = Field(None, max_length=255, description="사용자 이메일")
    permission_level: str = Field(default="read", description="권한 레벨")
    
    @validator('permission_level')
    def validate_permission_level(cls, v):
        allowed_permissions = ['read', 'write', 'admin']
        if v not in allowed_permissions:
            raise ValueError(f'Permission level must be one of: {allowed_permissions}')
        return v

class WorkspaceUserCreate(WorkspaceUserBase):
    """워크스페이스 사용자 생성 스키마"""
    workspace_id: uuid.UUID

class WorkspaceUserUpdate(BaseModel):
    """워크스페이스 사용자 수정 스키마"""
    user_display_name: Optional[str] = Field(None, max_length=255)
    permission_level: Optional[str] = None
    
    @validator('permission_level')
    def validate_permission_level(cls, v):
        if v:
            allowed_permissions = ['read', 'write', 'admin']
            if v not in allowed_permissions:
                raise ValueError(f'Permission level must be one of: {allowed_permissions}')
        return v

class WorkspaceUserInDBBase(BaseModel):
    """데이터베이스 워크스페이스 사용자 기본 스키마"""
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID = Field(..., description="사용자 UUID")
    user_display_name: Optional[str] = Field(None, description="사용자 표시명")
    user_email: Optional[str] = Field(None, description="사용자 이메일")
    permission_level: str = Field(default="read", description="권한 레벨")
    user_info_updated_at: Optional[datetime] = Field(None, description="사용자 정보 업데이트 시간")
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime]
    
    # Legacy compatibility field (to be removed after migration)
    user_id_uuid: Optional[uuid.UUID] = Field(None, description="레거시 UUID 필드 (deprecated)")
    
    model_config = ConfigDict(from_attributes=True)
    
    @validator('user_id', pre=True, always=True)
    def set_user_id(cls, v, values):
        """Handle legacy field mapping during transition"""
        # If user_id is provided as UUID, use it
        if v:
            return v
        # Otherwise, try to use user_id_uuid (legacy field)
        if 'user_id_uuid' in values and values['user_id_uuid']:
            return values['user_id_uuid']
        return v

class WorkspaceUser(WorkspaceUserInDBBase):
    """워크스페이스 사용자 응답 스키마"""
    pass

# MVPModule Schemas
class MVPModuleBase(BaseModel):
    """MVP 모듈 기본 스키마"""
    module_name: str = Field(..., min_length=1, max_length=255, description="모듈명")
    display_name: str = Field(..., min_length=1, max_length=255, description="표시명")
    description: Optional[str] = Field(None, max_length=2000, description="모듈 설명")
    version: str = Field(default="1.0.0", max_length=50, description="모듈 버전")
    module_type: str = Field(default="custom", description="모듈 타입 (dashboard, analytics, report, custom)")
    route_path: str = Field(..., description="라우트 경로")
    config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="모듈 설정")
    sort_order: int = Field(default=0, description="정렬 순서")
    icon: Optional[str] = Field(None, max_length=100, description="아이콘")
    color: Optional[str] = Field(None, max_length=20, description="테마 색상")
    template: str = Field(default="default", description="사용된 템플릿")
    permissions: Dict[str, List[str]] = Field(default_factory=lambda: {"view": ["*"], "edit": ["admin"], "delete": ["admin"]})
    
    @validator('module_name')
    def validate_module_name(cls, v):
        # 모듈명은 파이썬 모듈명 규칙을 따름
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', v):
            raise ValueError('Module name must be a valid Python module name')
        return v
    
    @validator('module_type')
    def validate_module_type(cls, v):
        allowed_types = ['dashboard', 'analytics', 'report', 'custom']
        if v not in allowed_types:
            raise ValueError(f'Module type must be one of: {allowed_types}')
        return v

class MVPModuleCreate(MVPModuleBase):
    """MVP 모듈 생성 스키마"""
    workspace_id: uuid.UUID

class MVPModuleUpdate(BaseModel):
    """MVP 모듈 수정 스키마"""
    display_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    version: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None
    sort_order: Optional[int] = None
    icon: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=20)

class MVPModuleInDBBase(MVPModuleBase):
    """데이터베이스 MVP 모듈 기본 스키마"""
    id: uuid.UUID
    workspace_id: uuid.UUID
    module_path: Optional[str]
    is_active: bool
    is_installed: bool
    created_by: str
    updated_by: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    
    model_config = ConfigDict(from_attributes=True)

class MVPModule(MVPModuleInDBBase):
    """MVP 모듈 응답 스키마"""
    pass

# List Response Schemas
class WorkspaceListResponse(BaseModel):
    """워크스페이스 목록 응답 스키마"""
    workspaces: List[Workspace]
    total: int
    skip: int
    limit: int

class MVPModuleListResponse(BaseModel):
    """MVP 모듈 목록 응답 스키마"""
    modules: List[MVPModule]
    total: int
    skip: int
    limit: int

# Permission Check Schemas
class PermissionCheckRequest(BaseModel):
    """권한 확인 요청 스키마"""
    workspace_id: uuid.UUID
    required_permission: str = Field(default="read")
    
    @validator('required_permission')
    def validate_required_permission(cls, v):
        allowed_permissions = ['read', 'write', 'admin']
        if v not in allowed_permissions:
            raise ValueError(f'Required permission must be one of: {allowed_permissions}')
        return v

class PermissionCheckResponse(BaseModel):
    """권한 확인 응답 스키마"""
    has_permission: bool
    user_permission_level: Optional[str]
    granted_groups: List[str] = []

# Stats Schemas
class WorkspaceStats(BaseModel):
    """워크스페이스 통계 스키마"""
    total_workspaces: int
    active_workspaces: int
    total_mvp_modules: int
    active_mvp_modules: int
    user_accessible_workspaces: int

# Module Management Schemas
class AvailableModule(BaseModel):
    """설치 가능한 모듈 정보 스키마"""
    module_name: str
    display_name: str
    description: str
    version: str
    is_installed: bool
    compatible_versions: List[str] = []

class ModuleInstallRequest(BaseModel):
    """모듈 설치 요청 스키마"""
    workspace_id: uuid.UUID
    module_name: str
    display_name: Optional[str] = None
    initial_config: Optional[Dict[str, Any]] = None

# Tree Structure Schemas
class WorkspaceTree(Workspace):
    """워크스페이스 트리 구조 스키마"""
    children: List["WorkspaceTree"] = []


class WorkspaceTreeResponse(BaseModel):
    """워크스페이스 트리 응답 스키마"""
    workspaces: List[WorkspaceTree]
    total: int


# Forward reference resolution
WorkspaceDetail.model_rebuild()
WorkspaceTree.model_rebuild()