"""
Database-backed Session Storage Service
Replaces in-memory session storage with persistent PostgreSQL storage
"""

import secrets
import hashlib
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, and_, or_
import logging

from ..models.session import UserSession
from ..core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


class DatabaseSessionStorage:
    """Database-backed session storage implementation"""
    
    def __init__(self):
        self.encryption_key = None  # Will be set by SessionManager
        
    async def store_session(self, session_data) -> bool:
        """Store session in database"""
        try:
            async with AsyncSessionLocal() as db:
                # Check if session already exists
                existing = await db.get(UserSession, session_data.session_id)
                
                if existing:
                    # Update existing session
                    existing.last_accessed = session_data.last_accessed
                    existing.expires_at = session_data.expires_at
                    existing.is_active = session_data.is_active
                    existing.session_data = session_data.data or {}
                else:
                    # Create new session
                    db_session = UserSession(
                        session_id=session_data.session_id,
                        user_id=session_data.user_id,
                        created_at=session_data.created_at,
                        last_accessed=session_data.last_accessed,
                        expires_at=session_data.expires_at,
                        is_active=session_data.is_active,
                        ip_address=session_data.ip_address,
                        user_agent=session_data.user_agent,
                        session_data=session_data.data or {},
                        login_method='oauth'
                    )
                    db.add(db_session)
                    
                await db.commit()
                logger.debug(f"Session {session_data.session_id[:8]}... stored successfully")
                return True
                
        except Exception as e:
            logger.error(f"Failed to store session {session_data.session_id[:8]}...: {e}")
            return False
    
    async def get_session(self, session_id: str):
        """Retrieve session from database"""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(UserSession).where(
                        and_(
                            UserSession.session_id == session_id,
                            UserSession.is_active == True,
                            UserSession.expires_at > datetime.utcnow()
                        )
                    )
                )
                db_session = result.scalar_one_or_none()
                
                if not db_session:
                    return None
                
                # Update last accessed time
                db_session.update_last_accessed()
                await db.commit()
                
                # Convert to SessionData (import here to avoid circular import)
                from .session_manager import SessionData
                return SessionData(
                    session_id=db_session.session_id,
                    user_id=db_session.user_id,
                    created_at=db_session.created_at,
                    last_accessed=db_session.last_accessed,
                    expires_at=db_session.expires_at,
                    ip_address=db_session.ip_address,
                    user_agent=db_session.user_agent,
                    is_active=db_session.is_active,
                    data=db_session.session_data or {}
                )
                
        except Exception as e:
            logger.error(f"Failed to get session {session_id[:8]}...: {e}")
            return None
    
    async def get_user_sessions(self, user_id: str):
        """Get all active sessions for a user"""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(UserSession).where(
                        and_(
                            UserSession.user_id == user_id,
                            UserSession.is_active == True,
                            UserSession.expires_at > datetime.utcnow()
                        )
                    ).order_by(UserSession.last_accessed.desc())
                )
                db_sessions = result.scalars().all()
                
                # Import here to avoid circular import
                from .session_manager import SessionData
                sessions = []
                for db_session in db_sessions:
                    sessions.append(SessionData(
                        session_id=db_session.session_id,
                        user_id=db_session.user_id,
                        created_at=db_session.created_at,
                        last_accessed=db_session.last_accessed,
                        expires_at=db_session.expires_at,
                        ip_address=db_session.ip_address,
                        user_agent=db_session.user_agent,
                        is_active=db_session.is_active,
                        data=db_session.session_data or {}
                    ))
                    
                return sessions
                
        except Exception as e:
            logger.error(f"Failed to get user sessions for {user_id}: {e}")
            return []
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete session from database"""
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(
                    update(UserSession)
                    .where(UserSession.session_id == session_id)
                    .values(is_active=False)
                )
                await db.commit()
                logger.debug(f"Session {session_id[:8]}... deactivated")
                return True
                
        except Exception as e:
            logger.error(f"Failed to delete session {session_id[:8]}...: {e}")
            return False
    
    async def delete_user_sessions(self, user_id: str) -> int:
        """Delete all sessions for a user"""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    update(UserSession)
                    .where(
                        and_(
                            UserSession.user_id == user_id,
                            UserSession.is_active == True
                        )
                    )
                    .values(is_active=False)
                )
                affected_rows = result.rowcount
                await db.commit()
                logger.info(f"Deactivated {affected_rows} sessions for user {user_id}")
                return affected_rows
                
        except Exception as e:
            logger.error(f"Failed to delete user sessions for {user_id}: {e}")
            return 0
    
    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions"""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    update(UserSession)
                    .where(
                        or_(
                            UserSession.expires_at <= datetime.utcnow(),
                            UserSession.is_active == False
                        )
                    )
                    .values(is_active=False)
                )
                affected_rows = result.rowcount
                await db.commit()
                
                if affected_rows > 0:
                    logger.info(f"Cleaned up {affected_rows} expired sessions")
                    
                return affected_rows
                
        except Exception as e:
            logger.error(f"Failed to cleanup expired sessions: {e}")
            return 0
    
    async def get_session_by_jwt_id(self, jwt_token_id: str):
        """Get session by JWT token ID (jti claim)"""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(UserSession).where(
                        and_(
                            UserSession.jwt_token_id == jwt_token_id,
                            UserSession.is_active == True,
                            UserSession.expires_at > datetime.utcnow()
                        )
                    )
                )
                db_session = result.scalar_one_or_none()
                
                if not db_session:
                    return None
                
                # Import here to avoid circular import
                from .session_manager import SessionData
                return SessionData(
                    session_id=db_session.session_id,
                    user_id=db_session.user_id,
                    created_at=db_session.created_at,
                    last_accessed=db_session.last_accessed,
                    expires_at=db_session.expires_at,
                    ip_address=db_session.ip_address,
                    user_agent=db_session.user_agent,
                    is_active=db_session.is_active,
                    data=db_session.session_data or {}
                )
                
        except Exception as e:
            logger.error(f"Failed to get session by JWT ID {jwt_token_id}: {e}")
            return None