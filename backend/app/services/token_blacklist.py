"""
JWT Token Blacklist Service
Redis-based token blacklisting for OAuth 2.0 integration
"""

import json
import time
import hashlib
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
import redis

logger = logging.getLogger(__name__)

@dataclass
class BlacklistEntry:
    """Blacklisted token information"""
    token_hash: str
    user_id: str
    reason: str
    blacklisted_at: int
    expires_at: Optional[int] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

class TokenBlacklistService:
    """
    Redis-based token blacklist service
    Integrates with OAuth 2.0 server for token validation
    """
    
    def __init__(
        self,
        redis_client: redis.Redis,
        key_prefix: str = "token_blacklist:",
        default_expiry: int = 86400 * 7  # 7 days
    ):
        self.redis = redis_client
        self.key_prefix = key_prefix
        self.default_expiry = default_expiry
        
        # Keys for different blacklist categories
        self.blacklist_key = f"{key_prefix}tokens"
        self.user_tokens_key = f"{key_prefix}user_tokens"
        self.revoked_sessions_key = f"{key_prefix}revoked_sessions"
    
    def _hash_token(self, token: str) -> str:
        """Create secure hash of token for storage"""
        return hashlib.sha256(token.encode()).hexdigest()
    
    def blacklist_token(
        self,
        token: str,
        user_id: str,
        reason: str = "revoked",
        expires_at: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """
        Add token to blacklist
        
        Args:
            token: JWT token to blacklist
            user_id: User ID associated with token
            reason: Reason for blacklisting
            expires_at: When the token naturally expires
            ip_address: IP address of the request
            user_agent: User agent of the request
            
        Returns:
            bool: True if successfully blacklisted
        """
        try:
            token_hash = self._hash_token(token)
            current_time = int(time.time())
            
            # Calculate TTL - use token expiry or default
            if expires_at:
                ttl = max(expires_at - current_time, 3600)  # At least 1 hour
            else:
                ttl = self.default_expiry
            
            # Create blacklist entry
            entry = BlacklistEntry(
                token_hash=token_hash,
                user_id=user_id,
                reason=reason,
                blacklisted_at=current_time,
                expires_at=expires_at,
                ip_address=ip_address,
                user_agent=user_agent
            )
            
            # Store in Redis with pipeline for atomicity
            with self.redis.pipeline() as pipe:
                # Main blacklist entry
                pipe.setex(
                    f"{self.blacklist_key}:{token_hash}",
                    ttl,
                    json.dumps(asdict(entry))
                )
                
                # User token tracking
                pipe.sadd(f"{self.user_tokens_key}:{user_id}", token_hash)
                pipe.expire(f"{self.user_tokens_key}:{user_id}", ttl)
                
                # Execute all operations
                pipe.execute()
            
            logger.info(f"Token blacklisted: user={user_id}, reason={reason}, ttl={ttl}")
            return True
            
        except redis.RedisError as e:
            logger.error(f"Failed to blacklist token: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error blacklisting token: {e}")
            return False
    
    def is_token_blacklisted(self, token: str) -> bool:
        """
        Check if token is blacklisted
        
        Args:
            token: JWT token to check
            
        Returns:
            bool: True if token is blacklisted
        """
        try:
            token_hash = self._hash_token(token)
            exists = self.redis.exists(f"{self.blacklist_key}:{token_hash}")
            
            if exists:
                logger.debug(f"Token found in blacklist: {token_hash[:8]}...")
                return True
            return False
            
        except redis.RedisError as e:
            logger.error(f"Failed to check token blacklist: {e}")
            # Fail open - don't block valid tokens due to Redis issues
            return False
        except Exception as e:
            logger.error(f"Unexpected error checking blacklist: {e}")
            return False
    
    def get_blacklist_entry(self, token: str) -> Optional[BlacklistEntry]:
        """
        Get blacklist entry details for a token
        
        Args:
            token: JWT token to lookup
            
        Returns:
            BlacklistEntry or None if not found
        """
        try:
            token_hash = self._hash_token(token)
            entry_data = self.redis.get(f"{self.blacklist_key}:{token_hash}")
            
            if entry_data:
                entry_dict = json.loads(entry_data)
                return BlacklistEntry(**entry_dict)
            return None
            
        except (redis.RedisError, json.JSONDecodeError) as e:
            logger.error(f"Failed to get blacklist entry: {e}")
            return None
    
    def blacklist_user_tokens(
        self,
        user_id: str,
        reason: str = "user_logout_all"
    ) -> int:
        """
        Blacklist all tokens for a specific user
        
        Args:
            user_id: User ID whose tokens to blacklist
            reason: Reason for blacklisting
            
        Returns:
            int: Number of tokens blacklisted
        """
        try:
            user_tokens_key = f"{self.user_tokens_key}:{user_id}"
            token_hashes = self.redis.smembers(user_tokens_key)
            
            if not token_hashes:
                return 0
            
            current_time = int(time.time())
            blacklisted_count = 0
            
            # Create blacklist entries for all user tokens
            with self.redis.pipeline() as pipe:
                for token_hash in token_hashes:
                    if isinstance(token_hash, bytes):
                        token_hash = token_hash.decode()
                    
                    # Create blacklist entry
                    entry = BlacklistEntry(
                        token_hash=token_hash,
                        user_id=user_id,
                        reason=reason,
                        blacklisted_at=current_time
                    )
                    
                    pipe.setex(
                        f"{self.blacklist_key}:{token_hash}",
                        self.default_expiry,
                        json.dumps(asdict(entry))
                    )
                    blacklisted_count += 1
                
                # Clear user token set
                pipe.delete(user_tokens_key)
                pipe.execute()
            
            logger.info(f"Blacklisted {blacklisted_count} tokens for user {user_id}")
            return blacklisted_count
            
        except redis.RedisError as e:
            logger.error(f"Failed to blacklist user tokens: {e}")
            return 0
    
    def remove_from_blacklist(self, token: str) -> bool:
        """
        Remove token from blacklist (unblock)
        
        Args:
            token: JWT token to unblock
            
        Returns:
            bool: True if successfully removed
        """
        try:
            token_hash = self._hash_token(token)
            removed = self.redis.delete(f"{self.blacklist_key}:{token_hash}")
            
            if removed:
                logger.info(f"Token removed from blacklist: {token_hash[:8]}...")
                return True
            return False
            
        except redis.RedisError as e:
            logger.error(f"Failed to remove token from blacklist: {e}")
            return False
    
    def get_user_blacklisted_tokens(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all blacklisted tokens for a user
        
        Args:
            user_id: User ID to lookup
            
        Returns:
            List of blacklist entries
        """
        try:
            user_tokens_key = f"{self.user_tokens_key}:{user_id}"
            token_hashes = self.redis.smembers(user_tokens_key)
            
            entries = []
            for token_hash in token_hashes:
                if isinstance(token_hash, bytes):
                    token_hash = token_hash.decode()
                
                entry_data = self.redis.get(f"{self.blacklist_key}:{token_hash}")
                if entry_data:
                    try:
                        entry_dict = json.loads(entry_data)
                        entries.append(entry_dict)
                    except json.JSONDecodeError:
                        continue
            
            return entries
            
        except redis.RedisError as e:
            logger.error(f"Failed to get user blacklisted tokens: {e}")
            return []
    
    def cleanup_expired_entries(self) -> int:
        """
        Clean up expired blacklist entries
        
        Returns:
            int: Number of entries cleaned up
        """
        try:
            pattern = f"{self.blacklist_key}:*"
            keys = self.redis.keys(pattern)
            
            cleaned_count = 0
            current_time = int(time.time())
            
            for key in keys:
                try:
                    entry_data = self.redis.get(key)
                    if entry_data:
                        entry_dict = json.loads(entry_data)
                        expires_at = entry_dict.get('expires_at')
                        
                        # Remove if token has naturally expired
                        if expires_at and current_time > expires_at:
                            self.redis.delete(key)
                            cleaned_count += 1
                except (json.JSONDecodeError, KeyError):
                    # Remove malformed entries
                    self.redis.delete(key)
                    cleaned_count += 1
            
            logger.info(f"Cleaned up {cleaned_count} expired blacklist entries")
            return cleaned_count
            
        except redis.RedisError as e:
            logger.error(f"Failed to cleanup expired entries: {e}")
            return 0
    
    def get_blacklist_stats(self) -> Dict[str, Any]:
        """
        Get blacklist statistics
        
        Returns:
            Dict with blacklist statistics
        """
        try:
            pattern = f"{self.blacklist_key}:*"
            total_blacklisted = len(self.redis.keys(pattern))
            
            # Count by reason
            reason_counts = {}
            keys = self.redis.keys(pattern)
            
            for key in keys[:1000]:  # Limit to avoid performance issues
                try:
                    entry_data = self.redis.get(key)
                    if entry_data:
                        entry_dict = json.loads(entry_data)
                        reason = entry_dict.get('reason', 'unknown')
                        reason_counts[reason] = reason_counts.get(reason, 0) + 1
                except (json.JSONDecodeError, KeyError):
                    continue
            
            return {
                "total_blacklisted_tokens": total_blacklisted,
                "blacklist_by_reason": reason_counts,
                "redis_connected": True,
                "timestamp": int(time.time())
            }
            
        except redis.RedisError as e:
            logger.error(f"Failed to get blacklist stats: {e}")
            return {
                "error": str(e),
                "redis_connected": False,
                "timestamp": int(time.time())
            }


# Global instance (will be initialized with Redis connection)
token_blacklist: Optional[TokenBlacklistService] = None

def initialize_token_blacklist(redis_client: redis.Redis) -> TokenBlacklistService:
    """Initialize global token blacklist instance"""
    global token_blacklist
    token_blacklist = TokenBlacklistService(redis_client)
    logger.info("Token blacklist service initialized with Redis backend")
    return token_blacklist

def get_token_blacklist() -> Optional[TokenBlacklistService]:
    """Get global token blacklist instance"""
    return token_blacklist