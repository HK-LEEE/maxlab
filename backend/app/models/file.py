"""
MAX Lab 파일 관리 모델
워크스페이스 내 파일 업로드 및 관리를 위한 모델입니다.
"""
from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey, JSON, Index, BigInteger, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class WorkspaceFile(Base):
    """
    워크스페이스 파일 테이블
    워크스페이스에 업로드된 파일들을 관리합니다.
    """
    __tablename__ = "workspace_files"
    
    # UUID4 기본 키
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # 외래 키
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("workspace_files.id", ondelete="CASCADE"), nullable=True)
    
    # 파일 정보
    name = Column(String(255), nullable=False, comment="파일명")
    original_name = Column(String(255), nullable=False, comment="원본 파일명")
    file_path = Column(String(1000), nullable=False, comment="저장 경로")
    file_size = Column(BigInteger, nullable=False, comment="파일 크기 (bytes)")
    mime_type = Column(String(255), nullable=False, comment="MIME 타입")
    file_hash = Column(String(64), nullable=True, comment="파일 해시 (SHA256)")
    
    # 파일 타입
    is_directory = Column(Boolean, default=False, nullable=False, comment="디렉토리 여부")
    file_extension = Column(String(50), nullable=True, comment="파일 확장자")
    
    # 메타데이터
    file_metadata = Column(JSON, default=dict, comment="파일 메타데이터")
    description = Column(Text, nullable=True, comment="파일 설명")
    
    # 상태
    is_deleted = Column(Boolean, default=False, nullable=False, comment="삭제 상태")
    is_public = Column(Boolean, default=False, nullable=False, comment="공개 여부")
    
    # 버전 관리
    version = Column(Integer, default=1, comment="파일 버전")
    version_of = Column(UUID(as_uuid=True), ForeignKey("workspace_files.id"), nullable=True, comment="원본 파일 ID")
    
    # 타임스탬프
    uploaded_by = Column(String(255), nullable=False, comment="업로드 사용자")
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), comment="업로드 일시")
    modified_by = Column(String(255), nullable=True, comment="최종 수정자")
    modified_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="수정일시")
    
    # 관계 설정
    workspace = relationship("Workspace", backref="files")
    parent = relationship("WorkspaceFile", 
                         foreign_keys=[parent_id],
                         remote_side=[id], 
                         backref="children")
    # Version relationship - self-referential
    original_file = relationship("WorkspaceFile",
                               foreign_keys=[version_of],
                               remote_side=[id],
                               backref="versions")
    
    # 인덱스 설정
    __table_args__ = (
        Index('idx_workspace_file_workspace', 'workspace_id'),
        Index('idx_workspace_file_parent', 'parent_id'),
        Index('idx_workspace_file_name', 'name'),
        Index('idx_workspace_file_mime_type', 'mime_type'),
        Index('idx_workspace_file_uploaded_at', 'uploaded_at'),
        Index('idx_workspace_file_is_deleted', 'is_deleted'),
        Index('idx_workspace_file_version_of', 'version_of'),
    )


class FileShare(Base):
    """
    파일 공유 테이블
    파일 공유 링크 및 권한을 관리합니다.
    """
    __tablename__ = "file_shares"
    
    # UUID4 기본 키
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # 외래 키
    file_id = Column(UUID(as_uuid=True), ForeignKey("workspace_files.id", ondelete="CASCADE"), nullable=False)
    
    # 공유 정보
    share_token = Column(String(255), unique=True, nullable=False, comment="공유 토큰")
    share_type = Column(String(50), default="view", comment="공유 타입 (view/download)")
    password = Column(String(255), nullable=True, comment="비밀번호 (해시)")
    
    # 유효기간
    expires_at = Column(DateTime(timezone=True), nullable=True, comment="만료일시")
    max_downloads = Column(Integer, nullable=True, comment="최대 다운로드 횟수")
    download_count = Column(Integer, default=0, comment="다운로드 횟수")
    
    # 생성 정보
    created_by = Column(String(255), nullable=False, comment="생성자")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="생성일시")
    last_accessed_at = Column(DateTime(timezone=True), nullable=True, comment="마지막 접근일시")
    
    # 관계 설정
    file = relationship("WorkspaceFile", backref="shares")
    
    # 인덱스 설정
    __table_args__ = (
        Index('idx_file_share_token', 'share_token'),
        Index('idx_file_share_file', 'file_id'),
        Index('idx_file_share_expires', 'expires_at'),
    )