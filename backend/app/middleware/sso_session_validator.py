"""
SSO Session Validator
Validates sessions with the auth server for cross-domain SSO synchronization
"""
import httpx
import asyncio
import hashlib
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import logging
import json
import os

from ..core.config import settings

logger = logging.getLogger(__name__)

class SSOSessionValidator:
    """
    Validates sessions with the central auth server (max.dwchem.co.kr)
    Includes caching for performance optimization
    """
    
    def __init__(self):
        self.auth_server_url = os.getenv("AUTH_SERVER_URL", "https://max.dwchem.co.kr")
        self.service_key = os.getenv("INTER_SERVICE_KEY", "default-service-key-change-in-production")
        self.cache_ttl = 300  # 5 minutes cache
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._client: Optional[httpx.AsyncClient] = None
        
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(5.0),
                verify=not settings.DEBUG  # Skip SSL verification in debug mode
            )
        return self._client
    
    def _get_cache_key(self, session_id: str, user_id: str) -> str:
        """Generate cache key for session validation"""
        return f"session_valid:{user_id}:{session_id}"
    
    def _is_cache_valid(self, cache_entry: Dict[str, Any]) -> bool:
        """Check if cache entry is still valid"""
        if not cache_entry:
            return False
        
        cached_at = cache_entry.get("cached_at")
        if not cached_at:
            return False
        
        # Check if cache has expired
        cache_age = (datetime.utcnow() - cached_at).total_seconds()
        return cache_age < self.cache_ttl
    
    async def validate_session(
        self, 
        session_id: str, 
        user_id: str,
        token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validate session with auth server
        
        Args:
            session_id: Session ID to validate
            user_id: User ID associated with the session
            token: Optional JWT token for additional validation
            
        Returns:
            Dictionary with validation result:
            - valid: bool indicating if session is valid
            - reason: Optional reason for invalid session
            - from_cache: bool indicating if result is from cache
        """
        # Check cache first
        cache_key = self._get_cache_key(session_id, user_id)
        cached_result = self._cache.get(cache_key)
        
        if cached_result and self._is_cache_valid(cached_result):
            logger.debug(f"Session validation cache hit for {session_id[:8]}...")
            return {
                "valid": cached_result["valid"],
                "reason": cached_result.get("reason"),
                "from_cache": True
            }
        
        # Validate with auth server
        try:
            client = await self._get_client()
            
            # Prepare request data
            request_data = {
                "session_id": session_id,
                "user_id": user_id
            }
            
            # Add token hash if provided
            if token:
                token_hash = hashlib.sha256(token.encode()).hexdigest()
                request_data["token_hash"] = token_hash
            
            logger.info(f"Validating session {session_id[:8]}... with auth server")
            
            # Make validation request
            response = await client.post(
                f"{self.auth_server_url}/api/session/validate",
                json=request_data,
                headers={
                    "X-Service-Key": self.service_key,
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                is_valid = result.get("valid", False)
                reason = result.get("reason")
                
                # Cache the result
                self._cache[cache_key] = {
                    "valid": is_valid,
                    "reason": reason,
                    "cached_at": datetime.utcnow()
                }
                
                logger.info(f"Session validation result: valid={is_valid}, reason={reason}")
                
                return {
                    "valid": is_valid,
                    "reason": reason,
                    "from_cache": False
                }
            else:
                logger.warning(f"Auth server validation failed with status {response.status_code}")
                # On auth server error, assume session is valid but don't cache
                return {
                    "valid": True,
                    "reason": "auth_server_error",
                    "from_cache": False
                }
                
        except httpx.TimeoutException:
            logger.warning("Auth server validation timeout")
            # On timeout, assume session is valid but don't cache
            return {
                "valid": True,
                "reason": "timeout",
                "from_cache": False
            }
        except Exception as e:
            logger.error(f"Error validating session with auth server: {e}")
            # On error, assume session is valid but don't cache
            return {
                "valid": True,
                "reason": "error",
                "from_cache": False
            }
    
    async def invalidate_session(self, session_id: str, user_id: str) -> bool:
        """
        Notify auth server about session invalidation
        
        Args:
            session_id: Session ID to invalidate
            user_id: User ID associated with the session
            
        Returns:
            bool indicating if invalidation was successful
        """
        try:
            client = await self._get_client()
            
            logger.info(f"Invalidating session {session_id[:8]}... on auth server")
            
            response = await client.post(
                f"{self.auth_server_url}/api/session/invalidate",
                json={
                    "session_id": session_id,
                    "user_id": user_id
                },
                headers={
                    "X-Service-Key": self.service_key,
                    "Content-Type": "application/json"
                }
            )
            
            # Clear cache for this session
            cache_key = self._get_cache_key(session_id, user_id)
            if cache_key in self._cache:
                del self._cache[cache_key]
            
            if response.status_code == 200:
                logger.info(f"Session {session_id[:8]}... invalidated on auth server")
                return True
            else:
                logger.warning(f"Failed to invalidate session on auth server: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Error invalidating session on auth server: {e}")
            return False
    
    def clear_cache(self, user_id: Optional[str] = None):
        """
        Clear validation cache
        
        Args:
            user_id: Optional user ID to clear cache for specific user only
        """
        if user_id:
            # Clear cache for specific user
            keys_to_remove = [
                key for key in self._cache.keys() 
                if f":{user_id}:" in key
            ]
            for key in keys_to_remove:
                del self._cache[key]
            logger.info(f"Cleared session cache for user {user_id}")
        else:
            # Clear all cache
            self._cache.clear()
            logger.info("Cleared all session validation cache")
    
    async def cleanup(self):
        """Cleanup resources"""
        if self._client:
            await self._client.aclose()
            self._client = None

# Global instance
sso_validator = SSOSessionValidator()

async def validate_sso_session(
    session_id: str, 
    user_id: str,
    token: Optional[str] = None
) -> bool:
    """
    Convenience function to validate session with SSO
    
    Args:
        session_id: Session ID to validate
        user_id: User ID associated with the session
        token: Optional JWT token for additional validation
        
    Returns:
        bool indicating if session is valid
    """
    result = await sso_validator.validate_session(session_id, user_id, token)
    return result.get("valid", False)

async def invalidate_sso_session(session_id: str, user_id: str) -> bool:
    """
    Convenience function to invalidate session with SSO
    
    Args:
        session_id: Session ID to invalidate
        user_id: User ID associated with the session
        
    Returns:
        bool indicating if invalidation was successful
    """
    return await sso_validator.invalidate_session(session_id, user_id)

def clear_sso_cache(user_id: Optional[str] = None):
    """
    Convenience function to clear SSO validation cache
    
    Args:
        user_id: Optional user ID to clear cache for specific user only
    """
    sso_validator.clear_cache(user_id)