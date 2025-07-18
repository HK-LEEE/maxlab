"""
MAX Lab MVP 플랫폼 워크스페이스 모델
동적 MVP 페이지 관리를 위한 데이터베이스 모델입니다.
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Index, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum
from typing import Optional


class WorkspaceType(str, enum.Enum):
    """워크스페이스 타입"""
    PERSONAL = "PERSONAL"
    GROUP = "GROUP"


class OwnerType(str, enum.Enum):
    """소유자 타입"""
    USER = "USER"
    GROUP = "GROUP"


class Workspace(Base):
    """
    워크스페이스 테이블
    각 워크스페이스는 독립적인 MVP 환경을 제공합니다.
    """
    __tablename__ = "workspaces"
    
    # UUID4 기본 키
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # 기본 정보
    name = Column(String(255), nullable=False, index=True, comment="워크스페이스 이름")
    slug = Column(String(100), unique=True, nullable=False, index=True, comment="URL 친화적 이름")
    description = Column(Text, nullable=True, comment="워크스페이스 설명")
    
    # 워크스페이스 타입 및 소유권
    workspace_type = Column(Enum(WorkspaceType), default=WorkspaceType.PERSONAL, nullable=False, comment="워크스페이스 타입")
    owner_type = Column(Enum(OwnerType), default=OwnerType.USER, nullable=False, comment="소유자 타입")
    owner_id = Column(String(255), nullable=False, comment="소유자 ID (사용자 ID 또는 그룹 ID)")
    
    # 폴더 구조
    parent_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, comment="부모 워크스페이스 ID")
    path = Column(String(1000), nullable=False, default="/", comment="전체 경로")
    is_folder = Column(Boolean, default=False, nullable=False, comment="폴더 여부")
    
    # 상태 및 설정
    is_active = Column(Boolean, default=True, nullable=False, comment="활성화 상태")
    settings = Column(JSON, default=dict, comment="워크스페이스 설정 JSON")
    
    # 메타데이터
    created_by = Column(String(255), nullable=False, comment="생성자")
    updated_by = Column(String(255), nullable=True, comment="최종 수정자")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="생성일시")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="수정일시")
    
    # 관계 설정
    workspace_users = relationship("WorkspaceUser", back_populates="workspace", cascade="all, delete-orphan")
    workspace_groups = relationship("WorkspaceGroup", back_populates="workspace", cascade="all, delete-orphan")
    mvp_modules = relationship("MVPModule", back_populates="workspace", cascade="all, delete-orphan")
    parent = relationship("Workspace", remote_side=[id], backref="children")
    
    # 인덱스 설정
    __table_args__ = (
        Index('idx_workspace_active', 'is_active'),
        Index('idx_workspace_created_by', 'created_by'),
        Index('idx_workspace_created_at', 'created_at'),
        Index('idx_workspace_type', 'workspace_type'),
        Index('idx_workspace_owner', 'owner_type', 'owner_id'),
        Index('idx_workspace_parent', 'parent_id'),
        Index('idx_workspace_path', 'path'),
        Index('idx_workspace_folder', 'is_folder'),
    )


class WorkspaceUser(Base):
    """
    워크스페이스 사용자 권한 테이블
    사용자별 워크스페이스 접근 권한을 관리합니다.
    UUID 기반 사용자 식별로 외부 인증 시스템과 연동합니다.
    """
    __tablename__ = "workspace_users"
    
    # UUID4 기본 키
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # 외래 키
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    
    # 사용자 정보 - 과도기 스키마 (기존 String + 새로운 UUID)
    user_id = Column(String(255), nullable=False, comment="사용자 식별자 (레거시, 마이그레이션 후 제거)")  # 기존 필드
    user_id_uuid = Column(UUID(as_uuid=True), nullable=True, comment="사용자 UUID (새로운 필드)")  # 새로운 필드
    user_email = Column(String(255), nullable=True, comment="사용자 이메일 (캐싱용)")
    user_display_name = Column(String(255), nullable=True, comment="사용자 표시명 (캐싱용)")
    permission_level = Column(String(50), default="read", nullable=False, comment="권한 레벨 (read/write/admin)")
    
    # 캐싱 정보
    user_info_updated_at = Column(DateTime(timezone=True), nullable=True, comment="사용자 정보 마지막 업데이트")
    
    # 메타데이터
    created_by = Column(String(255), nullable=False, comment="생성자")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="생성일시")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="수정일시")
    
    # 관계 설정
    workspace = relationship("Workspace", back_populates="workspace_users")
    
    # 과도기 호환성을 위한 속성들
    @property
    def user_uuid(self) -> Optional[uuid.UUID]:
        """사용자 UUID 반환 (새로운 필드 우선, 레거시 fallback)"""
        if self.user_id_uuid:
            return self.user_id_uuid
        # 레거시 문자열에서 UUID 추출 시도
        try:
            return uuid.UUID(self.user_id) if self.user_id and len(self.user_id) == 36 else None
        except (ValueError, TypeError):
            return None
    
    @user_uuid.setter 
    def user_uuid(self, value: Optional[uuid.UUID]):
        """사용자 UUID 설정"""
        self.user_id_uuid = value
        if value:
            self.user_id = str(value)  # 레거시 호환성
    
    # 인덱스 및 제약조건 (과도기 스키마)
    __table_args__ = (
        Index('idx_workspace_user_workspace', 'workspace_id'),
        Index('idx_workspace_user_user_legacy', 'user_id'),  # 기존 레거시 인덱스
        Index('idx_workspace_user_user_uuid', 'user_id_uuid'),  # 새로운 UUID 인덱스
        Index('idx_workspace_user_email', 'user_email'),
        Index('idx_workspace_user_permission', 'permission_level'),
        Index('idx_workspace_user_unique_legacy', 'workspace_id', 'user_id'),  # 기존 제약조건 (unique 제거)
        Index('idx_workspace_user_unique_uuid', 'workspace_id', 'user_id_uuid'),  # 새로운 UUID 제약조건
        Index('idx_workspace_user_updated', 'user_info_updated_at'),
    )


class WorkspaceGroup(Base):
    """
    워크스페이스 그룹 권한 테이블
    그룹별 워크스페이스 접근 권한을 관리합니다.
    UUID 기반 그룹 식별로 외부 그룹 시스템과 연동합니다.
    """
    __tablename__ = "workspace_groups"
    
    # UUID4 기본 키
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # 외래 키
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    
    # 그룹 정보 - 과도기 스키마 (기존 String + 새로운 UUID)
    group_name = Column(String(255), nullable=False, comment="그룹명 (레거시, 마이그레이션 후 제거)")  # 기존 필드
    group_id_uuid = Column(UUID(as_uuid=True), nullable=True, comment="그룹 UUID (새로운 필드)")  # 새로운 필드
    group_display_name = Column(String(255), nullable=True, comment="그룹 표시명 (캐싱용)")
    permission_level = Column(String(50), default="read", nullable=False, comment="권한 레벨 (read/write/admin)")
    
    # 캐싱 정보
    group_info_updated_at = Column(DateTime(timezone=True), nullable=True, comment="그룹 정보 마지막 업데이트")
    
    # 메타데이터
    created_by = Column(String(255), nullable=False, comment="생성자")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="생성일시")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="수정일시")
    
    # 관계 설정
    workspace = relationship("Workspace", back_populates="workspace_groups")
    
    # 과도기 호환성을 위한 속성들
    @property
    def group_uuid(self) -> Optional[uuid.UUID]:
        """그룹 UUID 반환 (새로운 필드 우선, 레거시 fallback)"""
        if self.group_id_uuid:
            return self.group_id_uuid
        # 레거시: group_name이 UUID 형식인지 확인
        try:
            return uuid.UUID(self.group_name) if self.group_name and len(self.group_name) == 36 else None
        except (ValueError, TypeError):
            return None
    
    @group_uuid.setter
    def group_uuid(self, value: Optional[uuid.UUID]):
        """그룹 UUID 설정"""
        self.group_id_uuid = value
        if value:
            self.group_name = str(value)  # 레거시 호환성 (임시)
    
    # 인덱스 및 제약조건 (과도기 스키마)
    __table_args__ = (
        Index('idx_workspace_group_workspace', 'workspace_id'),
        Index('idx_workspace_group_name_legacy', 'group_name'),  # 기존 레거시 인덱스
        Index('idx_workspace_group_uuid', 'group_id_uuid'),  # 새로운 UUID 인덱스
        Index('idx_workspace_group_permission', 'permission_level'),
        Index('idx_workspace_group_unique_legacy', 'workspace_id', 'group_name'),  # 기존 제약조건
        Index('idx_workspace_group_unique_uuid', 'workspace_id', 'group_id_uuid'),  # 새로운 UUID 제약조건
        Index('idx_workspace_group_updated', 'group_info_updated_at'),
    )


class MVPModule(Base):
    """
    MVP 모듈 테이블
    워크스페이스별 활성화된 MVP 모듈을 관리합니다.
    """
    __tablename__ = "mvp_modules"
    
    # UUID4 기본 키
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # 외래 키
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    
    # 모듈 정보
    module_name = Column(String(255), nullable=False, comment="모듈명 (디렉토리명)")
    display_name = Column(String(255), nullable=False, comment="표시명")
    description = Column(Text, nullable=True, comment="모듈 설명")
    version = Column(String(50), default="1.0.0", comment="모듈 버전")
    
    # 모듈 타입 및 경로
    module_type = Column(String(50), default="custom", comment="모듈 타입 (dashboard, analytics, report, custom)")
    route_path = Column(String(255), nullable=False, comment="라우트 경로")
    module_path = Column(String(500), nullable=True, comment="파일 시스템 경로")
    
    # 상태 및 설정
    is_active = Column(Boolean, default=True, nullable=False, comment="활성화 상태")
    is_installed = Column(Boolean, default=False, nullable=False, comment="설치 상태")
    config = Column(JSON, default=dict, comment="모듈 설정 JSON")
    
    # UI 설정
    sort_order = Column(Integer, default=0, comment="정렬 순서")
    icon = Column(String(100), nullable=True, comment="아이콘")
    color = Column(String(20), nullable=True, comment="테마 색상")
    template = Column(String(50), default="default", comment="사용된 템플릿")
    
    # 권한 설정
    permissions = Column(JSON, default=dict, comment="모듈별 권한 설정")
    
    # 메타데이터
    created_by = Column(String(255), nullable=False, comment="생성자")
    updated_by = Column(String(255), nullable=True, comment="최종 수정자")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="생성일시")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="수정일시")
    
    # 관계 설정
    workspace = relationship("Workspace", back_populates="mvp_modules")
    module_logs = relationship("MVPModuleLog", back_populates="module", cascade="all, delete-orphan")
    
    # 인덱스 및 제약조건
    __table_args__ = (
        Index('idx_mvp_module_workspace', 'workspace_id'),
        Index('idx_mvp_module_name', 'module_name'),
        Index('idx_mvp_module_active', 'is_active'),
        Index('idx_mvp_module_installed', 'is_installed'),
        Index('idx_mvp_module_unique', 'workspace_id', 'module_name', unique=True),
    )


class MVPModuleLog(Base):
    """
    MVP 모듈 로그 테이블
    모듈의 활동 및 상태 변경 이력을 기록합니다.
    """
    __tablename__ = "mvp_module_logs"
    
    # UUID4 기본 키
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # 외래 키
    module_id = Column(UUID(as_uuid=True), ForeignKey("mvp_modules.id", ondelete="CASCADE"), nullable=False)
    
    # 로그 정보
    action = Column(String(100), nullable=False, comment="액션 타입 (install/uninstall/activate/deactivate/configure)")
    message = Column(Text, nullable=True, comment="로그 메시지")
    details = Column(JSON, nullable=True, comment="상세 정보 JSON")
    
    # 메타데이터
    created_by = Column(String(255), nullable=False, comment="액션 수행자")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="생성일시")
    
    # 관계 설정
    module = relationship("MVPModule", back_populates="module_logs")
    
    # 인덱스 설정
    __table_args__ = (
        Index('idx_mvp_module_log_module', 'module_id'),
        Index('idx_mvp_module_log_action', 'action'),
        Index('idx_mvp_module_log_created_at', 'created_at'),
    )