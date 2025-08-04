"""
Integrated Authentication and Session Service
Bridges JWT authentication with session management
"""

import jwt
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import Request
import logging

from .session_manager import SessionManager, SessionData
from .db_session_storage import DatabaseSessionStorage
from ..models.session import UserSession

logger = logging.getLogger(__name__)


class AuthSessionService:
    """Service that integrates JWT authentication with session management"""
    
    def __init__(self, session_manager: SessionManager):
        self.session_manager = session_manager
        
    async def create_session_from_jwt(
        self, 
        jwt_token: str, 
        user_data: Dict[str, Any],
        request: Request
    ) -> Optional[SessionData]:
        """
        Create session from JWT token after successful authentication
        This is the proper way to link JWT auth with session management
        """
        try:
            # Decode JWT to get token metadata (without verification - already verified)
            decoded_token = jwt.decode(jwt_token, options={"verify_signature": False})
            jwt_token_id = decoded_token.get('jti')  # JWT ID
            expires_at_timestamp = decoded_token.get('exp')
            
            if not jwt_token_id:
                logger.warning("JWT token missing 'jti' claim - cannot link with session")
                return None
                
            # Calculate session expiration based on JWT expiration
            if expires_at_timestamp:
                expires_at = datetime.utcfromtimestamp(expires_at_timestamp)
            else:
                # Fallback: 1 hour from now
                expires_at = datetime.utcnow() + timedelta(hours=1)
            
            # Extract user information
            user_id = user_data.get('user_id') or user_data.get('id') or user_data.get('sub')
            user_email = user_data.get('email')
            
            if not user_id:
                logger.error("Cannot create session - no user_id found in user_data")
                return None
            
            # Check if session already exists for this JWT token
            if hasattr(self.session_manager.storage_backend, 'get_session_by_jwt_id'):
                existing_session = await self.session_manager.storage_backend.get_session_by_jwt_id(jwt_token_id)
                if existing_session and existing_session.is_active:
                    logger.debug(f"Session already exists for JWT {jwt_token_id}")
                    return existing_session
            
            # Create new session
            session_data = self.session_manager.create_session(
                user_id=user_id,
                ip_address=request.client.host if request.client else "127.0.0.1",
                user_agent=request.headers.get("user-agent", "Unknown"),
                remember_me=False  # JWT tokens are typically short-lived
            )
            
            # Store JWT token ID in session data for linking
            session_data.data['jwt_token_id'] = jwt_token_id
            session_data.data['user_email'] = user_email
            session_data.data['login_method'] = 'oauth'
            
            # Update session expiration to match JWT expiration
            session_data.expires_at = expires_at
            
            # Store the updated session data
            if self.session_manager.storage_backend:
                await self.session_manager.storage_backend.store_session(session_data)
                
                # If using database storage, also update the JWT token ID
                if hasattr(self.session_manager.storage_backend, 'update_jwt_token_id'):
                    await self.session_manager.storage_backend.update_jwt_token_id(
                        session_data.session_id, 
                        jwt_token_id
                    )
            
            logger.info(f"Created session {session_data.session_id[:8]}... for JWT {jwt_token_id}")
            return session_data
            
        except Exception as e:
            logger.error(f"Failed to create session from JWT: {e}")
            return None
    
    async def invalidate_session_by_jwt(self, jwt_token: str) -> bool:
        """Invalidate session associated with JWT token"""
        try:
            # Decode JWT to get token ID
            decoded_token = jwt.decode(jwt_token, options={"verify_signature": False})
            jwt_token_id = decoded_token.get('jti')
            
            if not jwt_token_id:
                logger.warning("Cannot invalidate session - JWT missing 'jti' claim")
                return False
            
            # Find and invalidate session
            if hasattr(self.session_manager.storage_backend, 'get_session_by_jwt_id'):
                session = await self.session_manager.storage_backend.get_session_by_jwt_id(jwt_token_id)
                if session:
                    return self.session_manager.invalidate_session(session.session_id)
            
            logger.debug(f"No session found for JWT {jwt_token_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to invalidate session by JWT: {e}")
            return False
    
    async def sync_session_with_jwt(
        self, 
        jwt_token: str, 
        user_data: Dict[str, Any],
        request: Request
    ) -> Optional[SessionData]:
        """
        Synchronize session with JWT token
        Creates session if it doesn't exist, updates if it does
        """
        try:
            decoded_token = jwt.decode(jwt_token, options={"verify_signature": False})
            jwt_token_id = decoded_token.get('jti')
            
            if not jwt_token_id:
                logger.warning("Cannot sync session - JWT missing 'jti' claim")
                return None
            
            # Try to find existing session
            existing_session = None
            if hasattr(self.session_manager.storage_backend, 'get_session_by_jwt_id'):
                existing_session = await self.session_manager.storage_backend.get_session_by_jwt_id(jwt_token_id)
            
            if existing_session and existing_session.is_active:
                # Update existing session
                existing_session.last_accessed = datetime.utcnow()
                if self.session_manager.storage_backend:
                    await self.session_manager.storage_backend.store_session(existing_session)
                logger.debug(f"Updated existing session {existing_session.session_id[:8]}... for JWT {jwt_token_id}")
                return existing_session
            else:
                # Create new session
                return await self.create_session_from_jwt(jwt_token, user_data, request)
                
        except Exception as e:
            logger.error(f"Failed to sync session with JWT: {e}")
            return None