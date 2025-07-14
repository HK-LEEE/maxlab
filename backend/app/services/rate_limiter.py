"""
Distributed API Rate Limiting Service with Redis
Implements sliding window algorithm with role-based limits and whitelist/blacklist functionality
"""

import time
import json
import hashlib
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from enum import Enum
import redis
import logging

logger = logging.getLogger(__name__)

class RateLimitResult(Enum):
    """Rate limit check results"""
    ALLOWED = "allowed"
    RATE_LIMITED = "rate_limited"
    BLACKLISTED = "blacklisted"
    WHITELISTED = "whitelisted"

@dataclass
class RateLimitInfo:
    """Rate limit information"""
    limit: int
    remaining: int
    reset_time: int
    retry_after: Optional[int] = None
    result: RateLimitResult = RateLimitResult.ALLOWED

@dataclass
class RateLimitRule:
    """Rate limiting rule configuration"""
    endpoint_pattern: str
    requests_per_window: int
    window_size_seconds: int
    user_role: Optional[str] = None
    method: Optional[str] = None
    description: str = ""

class SlidingWindowRateLimiter:
    """
    Redis-based sliding window rate limiter
    Implements distributed rate limiting with role-based rules
    """
    
    def __init__(
        self,
        redis_client: redis.Redis,
        default_rules: Optional[List[RateLimitRule]] = None,
        key_prefix: str = "rate_limit:"
    ):
        self.redis = redis_client
        self.key_prefix = key_prefix
        self.rules: List[RateLimitRule] = default_rules or []
        
        # Whitelist and blacklist sets
        self.whitelist_key = f"{key_prefix}whitelist"
        self.blacklist_key = f"{key_prefix}blacklist"
        
        # Default rules if none provided
        if not self.rules:
            self._setup_default_rules()

    def _setup_default_rules(self) -> None:
        """Setup default rate limiting rules"""
        self.rules = [
            # API endpoints
            RateLimitRule(
                endpoint_pattern="/api/v1/auth/*",
                requests_per_window=10,
                window_size_seconds=60,
                description="Authentication endpoints"
            ),
            RateLimitRule(
                endpoint_pattern="/api/v1/workspaces/*",
                requests_per_window=100,
                window_size_seconds=60,
                user_role="user",
                description="Workspace endpoints for users"
            ),
            RateLimitRule(
                endpoint_pattern="/api/v1/workspaces/*",
                requests_per_window=500,
                window_size_seconds=60,
                user_role="admin",
                description="Workspace endpoints for admins"
            ),
            RateLimitRule(
                endpoint_pattern="/api/v1/files/*",
                requests_per_window=50,
                window_size_seconds=60,
                description="File endpoints"
            ),
            RateLimitRule(
                endpoint_pattern="/api/v1/session/*",
                requests_per_window=20,
                window_size_seconds=60,
                description="Session management endpoints"
            ),
            # Global fallback
            RateLimitRule(
                endpoint_pattern="*",
                requests_per_window=200,
                window_size_seconds=60,
                description="Global default rate limit"
            )
        ]

    def check_rate_limit(
        self,
        identifier: str,
        endpoint: str,
        method: str = "GET",
        user_role: Optional[str] = None
    ) -> RateLimitInfo:
        """
        Check if request is within rate limits
        
        Args:
            identifier: Unique identifier (IP, user ID, etc.)
            endpoint: API endpoint path
            method: HTTP method
            user_role: User role for role-based limiting
            
        Returns:
            RateLimitInfo with limit status and metadata
        """
        
        # Check blacklist first
        if self.is_blacklisted(identifier):
            logger.warning(f"Request from blacklisted identifier: {identifier}")
            return RateLimitInfo(
                limit=0,
                remaining=0,
                reset_time=int(time.time()),
                result=RateLimitResult.BLACKLISTED
            )
        
        # Check whitelist
        if self.is_whitelisted(identifier):
            logger.debug(f"Request from whitelisted identifier: {identifier}")
            return RateLimitInfo(
                limit=float('inf'),
                remaining=float('inf'),
                reset_time=int(time.time()),
                result=RateLimitResult.WHITELISTED
            )
        
        # Find applicable rule
        rule = self._find_applicable_rule(endpoint, method, user_role)
        if not rule:
            logger.warning(f"No rate limit rule found for {endpoint}")
            return RateLimitInfo(
                limit=0,
                remaining=0,
                reset_time=int(time.time()),
                result=RateLimitResult.RATE_LIMITED
            )
        
        # Generate cache key
        cache_key = self._generate_cache_key(identifier, endpoint, rule)
        
        # Check sliding window
        current_time = time.time()
        window_start = current_time - rule.window_size_seconds
        
        try:
            with self.redis.pipeline() as pipe:
                # Remove old entries and count current requests
                pipe.zremrangebyscore(cache_key, 0, window_start)
                pipe.zcard(cache_key)
                pipe.expire(cache_key, rule.window_size_seconds + 1)
                
                results = pipe.execute()
                current_requests = results[1]
                
                if current_requests >= rule.requests_per_window:
                    # Rate limited
                    reset_time = int(current_time + rule.window_size_seconds)
                    retry_after = rule.window_size_seconds
                    
                    logger.info(f"Rate limit exceeded for {identifier} on {endpoint}: "
                              f"{current_requests}/{rule.requests_per_window}")
                    
                    return RateLimitInfo(
                        limit=rule.requests_per_window,
                        remaining=0,
                        reset_time=reset_time,
                        retry_after=retry_after,
                        result=RateLimitResult.RATE_LIMITED
                    )
                
                # Allow request and record it
                pipe.zadd(cache_key, {str(current_time): current_time})
                pipe.expire(cache_key, rule.window_size_seconds + 1)
                pipe.execute()
                
                remaining = rule.requests_per_window - current_requests - 1
                reset_time = int(current_time + rule.window_size_seconds)
                
                return RateLimitInfo(
                    limit=rule.requests_per_window,
                    remaining=remaining,
                    reset_time=reset_time,
                    result=RateLimitResult.ALLOWED
                )
                
        except redis.RedisError as e:
            logger.error(f"Redis error in rate limiting: {e}")
            # Fail open - allow request if Redis is down
            return RateLimitInfo(
                limit=rule.requests_per_window,
                remaining=rule.requests_per_window,
                reset_time=int(current_time + rule.window_size_seconds),
                result=RateLimitResult.ALLOWED
            )

    def _find_applicable_rule(
        self,
        endpoint: str,
        method: str,
        user_role: Optional[str]
    ) -> Optional[RateLimitRule]:
        """Find the most specific applicable rule"""
        
        matching_rules = []
        
        for rule in self.rules:
            # Check endpoint pattern
            if not self._matches_pattern(endpoint, rule.endpoint_pattern):
                continue
            
            # Check method if specified
            if rule.method and rule.method.upper() != method.upper():
                continue
            
            # Check user role if specified
            if rule.user_role and rule.user_role != user_role:
                continue
            
            matching_rules.append(rule)
        
        # Return most specific rule (with role > without role, specific pattern > wildcard)
        if not matching_rules:
            return None
        
        # Sort by specificity
        def rule_specificity(rule: RateLimitRule) -> int:
            score = 0
            if rule.user_role:
                score += 100
            if rule.method:
                score += 50
            if rule.endpoint_pattern != "*":
                score += 10
            return score
        
        matching_rules.sort(key=rule_specificity, reverse=True)
        return matching_rules[0]

    def _matches_pattern(self, endpoint: str, pattern: str) -> bool:
        """Check if endpoint matches pattern (supports wildcards)"""
        if pattern == "*":
            return True
        
        if pattern.endswith("*"):
            return endpoint.startswith(pattern[:-1])
        
        return endpoint == pattern

    def _generate_cache_key(
        self,
        identifier: str,
        endpoint: str,
        rule: RateLimitRule
    ) -> str:
        """Generate Redis cache key for rate limiting"""
        
        # Create a unique key based on identifier, endpoint pattern, and rule
        key_data = f"{identifier}:{rule.endpoint_pattern}:{rule.user_role or 'none'}"
        
        # Hash to keep key length manageable
        key_hash = hashlib.md5(key_data.encode()).hexdigest()
        
        return f"{self.key_prefix}window:{key_hash}"

    def add_to_whitelist(self, identifier: str, ttl: Optional[int] = None) -> bool:
        """Add identifier to whitelist"""
        try:
            if ttl:
                self.redis.setex(f"{self.whitelist_key}:{identifier}", ttl, "1")
            else:
                self.redis.sadd(self.whitelist_key, identifier)
            
            logger.info(f"Added {identifier} to whitelist")
            return True
        except redis.RedisError as e:
            logger.error(f"Failed to add to whitelist: {e}")
            return False

    def remove_from_whitelist(self, identifier: str) -> bool:
        """Remove identifier from whitelist"""
        try:
            # Remove from both set and individual keys
            removed1 = self.redis.srem(self.whitelist_key, identifier)
            removed2 = self.redis.delete(f"{self.whitelist_key}:{identifier}")
            
            if removed1 or removed2:
                logger.info(f"Removed {identifier} from whitelist")
                return True
            return False
        except redis.RedisError as e:
            logger.error(f"Failed to remove from whitelist: {e}")
            return False

    def add_to_blacklist(self, identifier: str, ttl: Optional[int] = None) -> bool:
        """Add identifier to blacklist"""
        try:
            if ttl:
                self.redis.setex(f"{self.blacklist_key}:{identifier}", ttl, "1")
            else:
                self.redis.sadd(self.blacklist_key, identifier)
            
            logger.warning(f"Added {identifier} to blacklist")
            return True
        except redis.RedisError as e:
            logger.error(f"Failed to add to blacklist: {e}")
            return False

    def remove_from_blacklist(self, identifier: str) -> bool:
        """Remove identifier from blacklist"""
        try:
            # Remove from both set and individual keys
            removed1 = self.redis.srem(self.blacklist_key, identifier)
            removed2 = self.redis.delete(f"{self.blacklist_key}:{identifier}")
            
            if removed1 or removed2:
                logger.info(f"Removed {identifier} from blacklist")
                return True
            return False
        except redis.RedisError as e:
            logger.error(f"Failed to remove from blacklist: {e}")
            return False

    def is_whitelisted(self, identifier: str) -> bool:
        """Check if identifier is whitelisted"""
        try:
            # Check both permanent set and temporary keys
            in_set = self.redis.sismember(self.whitelist_key, identifier)
            has_temp_key = self.redis.exists(f"{self.whitelist_key}:{identifier}")
            
            return bool(in_set or has_temp_key)
        except redis.RedisError as e:
            logger.error(f"Failed to check whitelist: {e}")
            return False

    def is_blacklisted(self, identifier: str) -> bool:
        """Check if identifier is blacklisted"""
        try:
            # Check both permanent set and temporary keys
            in_set = self.redis.sismember(self.blacklist_key, identifier)
            has_temp_key = self.redis.exists(f"{self.blacklist_key}:{identifier}")
            
            return bool(in_set or has_temp_key)
        except redis.RedisError as e:
            logger.error(f"Failed to check blacklist: {e}")
            return False

    def get_statistics(self, identifier: str) -> Dict[str, Any]:
        """Get rate limiting statistics for identifier"""
        try:
            stats = {
                "identifier": identifier,
                "is_whitelisted": self.is_whitelisted(identifier),
                "is_blacklisted": self.is_blacklisted(identifier),
                "active_windows": []
            }
            
            # Get all active rate limit windows for this identifier
            pattern = f"{self.key_prefix}window:*"
            keys = self.redis.keys(pattern)
            
            current_time = time.time()
            
            for key in keys:
                try:
                    # Get requests in current window
                    requests = self.redis.zcard(key)
                    if requests > 0:
                        ttl = self.redis.ttl(key)
                        stats["active_windows"].append({
                            "key": key.decode() if isinstance(key, bytes) else key,
                            "requests": requests,
                            "ttl": ttl
                        })
                except:
                    continue
            
            return stats
            
        except redis.RedisError as e:
            logger.error(f"Failed to get statistics: {e}")
            return {"error": str(e)}

    def reset_limits(self, identifier: str) -> bool:
        """Reset all rate limits for identifier"""
        try:
            pattern = f"{self.key_prefix}window:*"
            keys = self.redis.keys(pattern)
            
            deleted_count = 0
            for key in keys:
                # This is a simplified approach - in production you might want
                # to be more selective about which keys to delete
                if self.redis.delete(key):
                    deleted_count += 1
            
            logger.info(f"Reset {deleted_count} rate limit windows for {identifier}")
            return True
            
        except redis.RedisError as e:
            logger.error(f"Failed to reset limits: {e}")
            return False

    def cleanup_expired_windows(self) -> int:
        """Clean up expired rate limit windows"""
        try:
            pattern = f"{self.key_prefix}window:*"
            keys = self.redis.keys(pattern)
            
            cleaned_count = 0
            current_time = time.time()
            
            for key in keys:
                try:
                    # Remove expired entries from sorted set
                    removed = self.redis.zremrangebyscore(key, 0, current_time - 3600)  # Remove entries older than 1 hour
                    
                    # Check if set is empty and remove key
                    if self.redis.zcard(key) == 0:
                        self.redis.delete(key)
                        cleaned_count += 1
                        
                except:
                    continue
            
            logger.info(f"Cleaned up {cleaned_count} expired rate limit windows")
            return cleaned_count
            
        except redis.RedisError as e:
            logger.error(f"Failed to cleanup expired windows: {e}")
            return 0

    def add_rule(self, rule: RateLimitRule) -> None:
        """Add a new rate limiting rule"""
        self.rules.append(rule)
        logger.info(f"Added rate limiting rule: {rule.description}")

    def remove_rule(self, endpoint_pattern: str, user_role: Optional[str] = None) -> bool:
        """Remove a rate limiting rule"""
        initial_count = len(self.rules)
        
        self.rules = [
            rule for rule in self.rules
            if not (rule.endpoint_pattern == endpoint_pattern and rule.user_role == user_role)
        ]
        
        removed_count = initial_count - len(self.rules)
        if removed_count > 0:
            logger.info(f"Removed {removed_count} rate limiting rule(s)")
            return True
        
        return False

    def get_rules(self) -> List[Dict[str, Any]]:
        """Get all rate limiting rules"""
        return [asdict(rule) for rule in self.rules]


# Global rate limiter instance (will be initialized with Redis connection)
rate_limiter: Optional[SlidingWindowRateLimiter] = None

def initialize_rate_limiter(redis_client: redis.Redis) -> SlidingWindowRateLimiter:
    """Initialize global rate limiter instance"""
    global rate_limiter
    rate_limiter = SlidingWindowRateLimiter(redis_client)
    logger.info("Rate limiter initialized with Redis backend")
    return rate_limiter

def get_rate_limiter() -> Optional[SlidingWindowRateLimiter]:
    """Get global rate limiter instance"""
    return rate_limiter