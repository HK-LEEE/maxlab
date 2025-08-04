"""
Async Session Management Service
Proper async integration for JWT authentication with database-backed sessions
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from fastapi import Request

from .db_session_storage import DatabaseSessionStorage
from .session_manager import SessionData, SessionConfig
from .auth_session_service import AuthSessionService

logger = logging.getLogger(__name__)


class AsyncSessionManager:
    """Async session manager for JWT authentication integration"""
    
    def __init__(self):
        self.storage = DatabaseSessionStorage()
        self.storage_backend = self.storage  # For compatibility with AuthSessionService
        self.config = SessionConfig()
        self.auth_session_service = AuthSessionService(self)
        
    async def create_session_from_jwt(
        self, 
        jwt_token: str, 
        user_data: Dict[str, Any],
        request: Request
    ) -> Optional[SessionData]:
        """Create session from JWT token after successful authentication"""
        return await self.auth_session_service.create_session_from_jwt(
            jwt_token, user_data, request
        )
    
    async def sync_session_with_jwt(
        self, 
        jwt_token: str, 
        user_data: Dict[str, Any],
        request: Request
    ) -> Optional[SessionData]:
        """Synchronize session with JWT token"""
        return await self.auth_session_service.sync_session_with_jwt(
            jwt_token, user_data, request
        )
    
    async def get_session(self, session_id: str) -> Optional[SessionData]:
        """Retrieve session by ID"""
        return await self.storage.get_session(session_id)
    
    async def get_user_sessions(self, user_id: str) -> List[SessionData]:
        """Get all active sessions for a user"""
        return await self.storage.get_user_sessions(user_id)
    
    async def invalidate_session(self, session_id: str) -> bool:
        """Invalidate a specific session"""
        return await self.storage.delete_session(session_id)
    
    async def invalidate_all_user_sessions(self, user_id: str) -> int:
        """Invalidate all sessions for a user"""
        return await self.storage.delete_user_sessions(user_id)
    
    async def invalidate_session_by_jwt(self, jwt_token: str) -> bool:
        """Invalidate session associated with JWT token"""
        return await self.auth_session_service.invalidate_session_by_jwt(jwt_token)
    
    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions"""
        return await self.storage.cleanup_expired_sessions()
    
    def create_session(
        self, 
        user_id: str, 
        ip_address: str, 
        user_agent: str,
        remember_me: bool = False
    ) -> SessionData:
        """Create a new session (sync interface for compatibility)"""
        import secrets
        from datetime import datetime, timedelta
        
        # Generate cryptographically secure session ID
        session_id = secrets.token_urlsafe(32)
        
        # Calculate expiration time
        lifetime = (
            self.config.remember_me_lifetime if remember_me 
            else self.config.session_lifetime
        )
        
        now = datetime.utcnow()
        expires_at = now + timedelta(seconds=lifetime)
        
        # Create session data
        session_data = SessionData(
            session_id=session_id,
            user_id=user_id,
            created_at=now,
            last_accessed=now,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
            is_active=True,
            data={}
        )
        
        return session_data


# Global async session manager instance
async_session_manager = AsyncSessionManager()