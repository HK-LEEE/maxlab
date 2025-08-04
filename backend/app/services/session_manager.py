"""
Enhanced Session Management Service
Provides secure session handling with encryption, fixation protection, and concurrent session limiting
"""

import secrets
import json
import hashlib
import hmac
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import logging

logger = logging.getLogger(__name__)

@dataclass
class SessionData:
    """Session data structure"""
    session_id: str
    user_id: str
    created_at: datetime
    last_accessed: datetime
    expires_at: datetime
    ip_address: str
    user_agent: str
    is_active: bool = True
    data: Dict[str, Any] = None

    def __post_init__(self):
        if self.data is None:
            self.data = {}

@dataclass
class SessionConfig:
    """Session configuration"""
    session_lifetime: int = 3600  # 1 hour in seconds
    max_sessions_per_user: int = 5
    session_renewal_threshold: int = 300  # 5 minutes
    secure_cookies: bool = False  # Set to True in production
    httponly_cookies: bool = True
    samesite_policy: str = "strict"  # strict, lax, none
    encryption_key: str = "your-encryption-key-change-this"
    cookie_name: str = "maxlab_session"
    remember_me_lifetime: int = 86400 * 30  # 30 days

class SessionManager:
    """Enhanced session manager with security features"""
    
    def __init__(self, config: SessionConfig, storage_backend=None):
        self.config = config
        self.storage_backend = storage_backend or InMemorySessionStorage()
        
        # Initialize encryption
        self.cipher_suite = self._create_cipher_suite(config.encryption_key)
        
        # Session tracking
        self.active_sessions: Dict[str, SessionData] = {}
        self.user_sessions: Dict[str, List[str]] = {}  # user_id -> [session_ids]

    def _create_cipher_suite(self, password: str) -> Fernet:
        """Create encryption cipher suite from password"""
        password_bytes = password.encode()
        salt = b'stable_salt_for_sessions'  # In production, use random salt per session
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password_bytes))
        return Fernet(key)

    def create_session(
        self, 
        user_id: str, 
        ip_address: str, 
        user_agent: str,
        remember_me: bool = False
    ) -> SessionData:
        """Create a new secure session"""
        
        # Generate cryptographically secure session ID
        session_id = self._generate_session_id()
        
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
        
        # Check and enforce session limits
        self._enforce_session_limits(user_id)
        
        # Store session
        self.active_sessions[session_id] = session_data
        
        # Track user sessions
        if user_id not in self.user_sessions:
            self.user_sessions[user_id] = []
        self.user_sessions[user_id].append(session_id)
        
        # Persist to storage backend
        if self.storage_backend:
            if hasattr(self.storage_backend, 'store_session'):
                if asyncio.iscoroutinefunction(self.storage_backend.store_session):
                    # Handle async storage
                    asyncio.create_task(self.storage_backend.store_session(session_data))
                else:
                    # Handle sync storage
                    self.storage_backend.store_session(session_data)
        
        logger.info(f"Created new session for user {user_id}: {session_id[:8]}...")
        return session_data

    def get_session(self, session_id: str) -> Optional[SessionData]:
        """Retrieve and validate session"""
        if not session_id:
            return None
        
        # Check memory cache first
        session = self.active_sessions.get(session_id)
        
        # If not in memory, try storage backend (note: sync wrapper needed for async storage)
        if not session and self.storage_backend:
            if hasattr(self.storage_backend, 'get_session'):
                if asyncio.iscoroutinefunction(self.storage_backend.get_session):
                    # For async storage, we can't easily await here in sync context
                    # This will be handled by a separate async method
                    pass
                else:
                    session = self.storage_backend.get_session(session_id)
                    if session:
                        self.active_sessions[session_id] = session
        
        if not session:
            return None
        
        # Validate session
        if not self._is_session_valid(session):
            self.invalidate_session(session_id)
            return None
        
        # Update last accessed time
        session.last_accessed = datetime.utcnow()
        
        # Check if session needs renewal
        if self._should_renew_session(session):
            session = self._renew_session(session)
        
        # Update storage
        if self.storage_backend:
            self.storage_backend.store_session(session)
        
        return session

    def invalidate_session(self, session_id: str) -> bool:
        """Invalidate a specific session"""
        session = self.active_sessions.get(session_id)
        
        if session:
            # Remove from user sessions tracking
            user_sessions = self.user_sessions.get(session.user_id, [])
            if session_id in user_sessions:
                user_sessions.remove(session_id)
            
            # Mark as inactive and remove from memory
            session.is_active = False
            del self.active_sessions[session_id]
            
            # Remove from storage
            if self.storage_backend:
                self.storage_backend.delete_session(session_id)
            
            logger.info(f"Invalidated session: {session_id[:8]}...")
            return True
        
        return False

    def invalidate_all_user_sessions(self, user_id: str) -> int:
        """Invalidate all sessions for a user"""
        user_sessions = self.user_sessions.get(user_id, []).copy()
        invalidated_count = 0
        
        for session_id in user_sessions:
            if self.invalidate_session(session_id):
                invalidated_count += 1
        
        # Clear user sessions list
        if user_id in self.user_sessions:
            del self.user_sessions[user_id]
        
        logger.info(f"Invalidated {invalidated_count} sessions for user {user_id}")
        return invalidated_count

    def regenerate_session_id(self, old_session_id: str) -> Optional[SessionData]:
        """Regenerate session ID for fixation protection"""
        old_session = self.active_sessions.get(old_session_id)
        
        if not old_session:
            return None
        
        # Generate new session ID
        new_session_id = self._generate_session_id()
        
        # Create new session with same data but new ID
        new_session = SessionData(
            session_id=new_session_id,
            user_id=old_session.user_id,
            created_at=old_session.created_at,
            last_accessed=datetime.utcnow(),
            expires_at=old_session.expires_at,
            ip_address=old_session.ip_address,
            user_agent=old_session.user_agent,
            is_active=True,
            data=old_session.data.copy()
        )
        
        # Update tracking
        self.active_sessions[new_session_id] = new_session
        
        user_sessions = self.user_sessions.get(old_session.user_id, [])
        if old_session_id in user_sessions:
            user_sessions.remove(old_session_id)
        user_sessions.append(new_session_id)
        
        # Remove old session
        if old_session_id in self.active_sessions:
            del self.active_sessions[old_session_id]
        
        # Update storage
        if self.storage_backend:
            self.storage_backend.delete_session(old_session_id)
            self.storage_backend.store_session(new_session)
        
        logger.info(f"Regenerated session ID: {old_session_id[:8]}... -> {new_session_id[:8]}...")
        return new_session

    def set_session_data(self, session_id: str, key: str, value: Any) -> bool:
        """Set data in session"""
        session = self.active_sessions.get(session_id)
        if not session:
            return False
        
        session.data[key] = value
        session.last_accessed = datetime.utcnow()
        
        # Update storage
        if self.storage_backend:
            self.storage_backend.store_session(session)
        
        return True

    def get_session_data(self, session_id: str, key: str, default=None) -> Any:
        """Get data from session"""
        session = self.active_sessions.get(session_id)
        if not session:
            return default
        
        return session.data.get(key, default)

    def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions"""
        now = datetime.utcnow()
        expired_sessions = []
        
        for session_id, session in self.active_sessions.items():
            if session.expires_at < now or not session.is_active:
                expired_sessions.append(session_id)
        
        cleaned_count = 0
        for session_id in expired_sessions:
            if self.invalidate_session(session_id):
                cleaned_count += 1
        
        logger.info(f"Cleaned up {cleaned_count} expired sessions")
        return cleaned_count

    def get_user_sessions(self, user_id: str) -> List[SessionData]:
        """Get all active sessions for a user"""
        session_ids = self.user_sessions.get(user_id, [])
        sessions = []
        
        for session_id in session_ids.copy():  # Copy to avoid modification during iteration
            session = self.get_session(session_id)
            if session:
                sessions.append(session)
            else:
                # Remove invalid session from tracking
                session_ids.remove(session_id)
        
        return sessions

    def encrypt_session_cookie(self, session_id: str) -> str:
        """Encrypt session ID for cookie storage"""
        try:
            return self.cipher_suite.encrypt(session_id.encode()).decode()
        except Exception as e:
            logger.error(f"Failed to encrypt session cookie: {e}")
            return session_id  # Fallback to unencrypted

    def decrypt_session_cookie(self, encrypted_session: str) -> Optional[str]:
        """Decrypt session ID from cookie"""
        try:
            return self.cipher_suite.decrypt(encrypted_session.encode()).decode()
        except Exception as e:
            logger.debug(f"Failed to decrypt session cookie: {e}")
            return encrypted_session  # Try as unencrypted session ID

    def _generate_session_id(self) -> str:
        """Generate cryptographically secure session ID"""
        return secrets.token_urlsafe(32)

    def _is_session_valid(self, session: SessionData) -> bool:
        """Check if session is valid"""
        now = datetime.utcnow()
        
        # Check expiration
        if session.expires_at < now:
            return False
        
        # Check if active
        if not session.is_active:
            return False
        
        return True

    def _should_renew_session(self, session: SessionData) -> bool:
        """Check if session should be renewed"""
        now = datetime.utcnow()
        time_until_expiry = (session.expires_at - now).total_seconds()
        
        return time_until_expiry < self.config.session_renewal_threshold

    def _renew_session(self, session: SessionData) -> SessionData:
        """Renew session expiration"""
        now = datetime.utcnow()
        session.expires_at = now + timedelta(seconds=self.config.session_lifetime)
        session.last_accessed = now
        
        logger.debug(f"Renewed session: {session.session_id[:8]}...")
        return session

    def _enforce_session_limits(self, user_id: str) -> None:
        """Enforce maximum sessions per user"""
        user_sessions = self.user_sessions.get(user_id, [])
        
        if len(user_sessions) >= self.config.max_sessions_per_user:
            # Remove oldest sessions
            sessions_to_remove = len(user_sessions) - self.config.max_sessions_per_user + 1
            
            # Sort by last accessed time and remove oldest
            session_data_list = []
            for session_id in user_sessions:
                session = self.active_sessions.get(session_id)
                if session:
                    session_data_list.append(session)
            
            session_data_list.sort(key=lambda s: s.last_accessed)
            
            for i in range(sessions_to_remove):
                if i < len(session_data_list):
                    self.invalidate_session(session_data_list[i].session_id)

    def get_session_stats(self) -> Dict[str, Any]:
        """Get session statistics"""
        now = datetime.utcnow()
        active_count = len(self.active_sessions)
        
        # Count sessions by time remaining
        expiring_soon = 0  # < 5 minutes
        for session in self.active_sessions.values():
            time_remaining = (session.expires_at - now).total_seconds()
            if time_remaining < 300:  # 5 minutes
                expiring_soon += 1
        
        return {
            "total_active_sessions": active_count,
            "total_users_with_sessions": len(self.user_sessions),
            "sessions_expiring_soon": expiring_soon,
            "average_sessions_per_user": (
                active_count / len(self.user_sessions) 
                if self.user_sessions else 0
            ),
            "max_sessions_per_user": self.config.max_sessions_per_user,
            "session_lifetime_seconds": self.config.session_lifetime
        }


class InMemorySessionStorage:
    """In-memory session storage backend"""
    
    def __init__(self):
        self.sessions: Dict[str, SessionData] = {}

    def store_session(self, session: SessionData) -> bool:
        """Store session in memory"""
        try:
            self.sessions[session.session_id] = session
            return True
        except Exception as e:
            logger.error(f"Failed to store session in memory: {e}")
            return False

    def get_session(self, session_id: str) -> Optional[SessionData]:
        """Get session from memory"""
        return self.sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        """Delete session from memory"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False


# Global session manager instance with database-backed storage
session_config = SessionConfig()

# Initialize with database storage
try:
    from .db_session_storage import DatabaseSessionStorage
    database_storage = DatabaseSessionStorage()
    session_manager = SessionManager(session_config, storage_backend=database_storage)
    logger.info("SessionManager initialized with database-backed storage")
except ImportError as e:
    logger.warning(f"Failed to import DatabaseSessionStorage, falling back to in-memory: {e}")
    session_manager = SessionManager(session_config)  # fallback to in-memory
except Exception as e:
    logger.error(f"Failed to initialize database storage, falling back to in-memory: {e}")
    session_manager = SessionManager(session_config)  # fallback to in-memory