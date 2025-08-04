"""
Session Database Model
Proper persistent session storage using SQLAlchemy
"""

from sqlalchemy import Column, String, DateTime, Boolean, JSON, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from ..core.database import Base


class UserSession(Base):
    """User session database model"""
    __tablename__ = "user_sessions"
    
    # Primary key
    session_id = Column(String(64), primary_key=True, index=True)
    
    # User identification
    user_id = Column(String(255), nullable=False, index=True)
    user_email = Column(String(255), nullable=True, index=True)
    
    # Session metadata
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_accessed = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    
    # Session state
    is_active = Column(Boolean, nullable=False, default=True)
    
    # Client information
    ip_address = Column(String(45), nullable=True)  # IPv6 compatible
    user_agent = Column(Text, nullable=True)
    
    # Session data (encrypted JSON)
    session_data = Column(JSON, nullable=True, default=dict)
    
    # JWT token reference (for session-token synchronization)
    jwt_token_id = Column(String(255), nullable=True, index=True)  # jti claim from JWT
    
    # Security flags
    is_suspicious = Column(Boolean, nullable=False, default=False)
    login_method = Column(String(50), nullable=True)  # oauth, password, etc.
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_user_sessions_user_active', 'user_id', 'is_active'),
        Index('idx_user_sessions_expires', 'expires_at'),
        Index('idx_user_sessions_jwt', 'jwt_token_id'),
        Index('idx_user_sessions_last_accessed', 'last_accessed'),
    )
    
    def __repr__(self):
        return f"<UserSession(session_id='{self.session_id[:8]}...', user_id='{self.user_id}', active={self.is_active})>"
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'session_id': self.session_id,
            'user_id': self.user_id,
            'user_email': self.user_email,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_accessed': self.last_accessed.isoformat() if self.last_accessed else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_active': self.is_active,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'is_suspicious': self.is_suspicious,
            'login_method': self.login_method
        }
    
    def is_expired(self) -> bool:
        """Check if session is expired"""
        return datetime.utcnow() > self.expires_at
    
    def update_last_accessed(self):
        """Update last accessed time"""
        self.last_accessed = datetime.utcnow()