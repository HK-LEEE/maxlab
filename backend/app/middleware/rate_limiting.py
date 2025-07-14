"""
FastAPI Rate Limiting Middleware
Integrates with Redis-based sliding window rate limiter for API protection
"""

import time
import logging
from typing import Optional, Dict, Any, Set
from fastapi import Request, Response, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import redis

from ..services.rate_limiter import SlidingWindowRateLimiter, RateLimitResult, get_rate_limiter
from ..core.config import settings

logger = logging.getLogger(__name__)

class RateLimitingMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for API rate limiting
    Integrates with Redis-based sliding window rate limiter
    """
    
    def __init__(
        self,
        app,
        redis_client: Optional[redis.Redis] = None,
        exempt_paths: Optional[Set[str]] = None,
        identifier_extractors: Optional[Dict[str, callable]] = None,
        enable_rate_limit_headers: bool = True
    ):
        super().__init__(app)
        
        # Initialize rate limiter with Redis
        if redis_client:
            from ..services.rate_limiter import initialize_rate_limiter
            self.rate_limiter = initialize_rate_limiter(redis_client)
        else:
            self.rate_limiter = get_rate_limiter()
        
        self.exempt_paths = exempt_paths or {
            "/docs", "/redoc", "/openapi.json", "/favicon.ico",
            "/api/v1/health", "/api/v1/csrf/", "/static/"
        }
        
        self.enable_headers = enable_rate_limit_headers
        
        # Default identifier extractors
        self.identifier_extractors = identifier_extractors or {
            "ip": self._extract_ip_address,
            "user": self._extract_user_id,
            "session": self._extract_session_id
        }
    
    async def dispatch(self, request: Request, call_next):
        """Process request through rate limiting"""
        
        # Skip rate limiting for exempt paths
        if self._is_exempt_path(request.url.path):
            return await call_next(request)
        
        # Skip if rate limiter not available
        if not self.rate_limiter:
            logger.warning("Rate limiter not available, allowing request")
            return await call_next(request)
        
        try:
            # Extract identifier for rate limiting
            identifier = await self._extract_identifier(request)
            if not identifier:
                logger.warning("Could not extract identifier for rate limiting")
                return await call_next(request)
            
            # Extract user role
            user_role = await self._extract_user_role(request)
            
            # Check rate limits
            rate_limit_info = self.rate_limiter.check_rate_limit(
                identifier=identifier,
                endpoint=request.url.path,
                method=request.method,
                user_role=user_role
            )
            
            # Handle rate limiting results
            if rate_limit_info.result == RateLimitResult.BLACKLISTED:
                logger.warning(f"Blocked blacklisted identifier: {identifier}")
                return self._create_rate_limit_response(
                    "Access denied - identifier blacklisted",
                    status_code=403,
                    rate_limit_info=rate_limit_info
                )
            
            elif rate_limit_info.result == RateLimitResult.RATE_LIMITED:
                logger.info(f"Rate limited: {identifier} on {request.url.path}")
                return self._create_rate_limit_response(
                    "Rate limit exceeded. Please try again later.",
                    status_code=429,
                    rate_limit_info=rate_limit_info
                )
            
            # Process request
            response = await call_next(request)
            
            # Add rate limit headers to response
            if self.enable_headers:
                self._add_rate_limit_headers(response, rate_limit_info)
            
            return response
            
        except Exception as e:
            logger.error(f"Error in rate limiting middleware: {e}")
            # Fail open - allow request if rate limiting fails
            return await call_next(request)
    
    def _is_exempt_path(self, path: str) -> bool:
        """Check if path is exempt from rate limiting"""
        for exempt_path in self.exempt_paths:
            if exempt_path.endswith("*"):
                if path.startswith(exempt_path[:-1]):
                    return True
            elif path == exempt_path or path.startswith(exempt_path):
                return True
        return False
    
    async def _extract_identifier(self, request: Request) -> Optional[str]:
        """Extract identifier for rate limiting (prioritize user > session > IP)"""
        
        # Try user ID first (most specific)
        user_id = await self._extract_user_id(request)
        if user_id:
            return f"user:{user_id}"
        
        # Try session ID
        session_id = await self._extract_session_id(request)
        if session_id:
            return f"session:{session_id}"
        
        # Fall back to IP address
        ip_address = self._extract_ip_address(request)
        if ip_address:
            return f"ip:{ip_address}"
        
        return None
    
    def _extract_ip_address(self, request: Request) -> Optional[str]:
        """Extract client IP address"""
        # Check for forwarded headers first (for reverse proxy setups)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # Take the first IP in the chain
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        
        # Fall back to direct client IP
        if hasattr(request, "client") and request.client:
            return request.client.host
        
        return None
    
    async def _extract_user_id(self, request: Request) -> Optional[str]:
        """Extract user ID from session or JWT token"""
        try:
            # Check session first
            if hasattr(request.state, "session_data") and request.state.session_data:
                return request.state.session_data.get("user_id")
            
            # Check for Authorization header (JWT)
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                # Would need JWT decoding here - simplified for now
                return None
            
            return None
        except Exception as e:
            logger.debug(f"Could not extract user ID: {e}")
            return None
    
    async def _extract_session_id(self, request: Request) -> Optional[str]:
        """Extract session ID from cookies or headers"""
        try:
            # Check session state
            if hasattr(request.state, "session_data") and request.state.session_data:
                return request.state.session_data.get("session_id")
            
            # Check cookies
            session_cookie_name = getattr(settings, "SESSION_COOKIE_NAME", "maxlab_session")
            session_id = request.cookies.get(session_cookie_name)
            if session_id:
                return session_id
            
            return None
        except Exception as e:
            logger.debug(f"Could not extract session ID: {e}")
            return None
    
    async def _extract_user_role(self, request: Request) -> Optional[str]:
        """Extract user role for role-based rate limiting"""
        try:
            # Check session data
            if hasattr(request.state, "session_data") and request.state.session_data:
                return request.state.session_data.get("user_role")
            
            # Could also check JWT claims here
            return None
        except Exception as e:
            logger.debug(f"Could not extract user role: {e}")
            return None
    
    def _create_rate_limit_response(
        self,
        message: str,
        status_code: int,
        rate_limit_info
    ) -> JSONResponse:
        """Create rate limit exceeded response"""
        
        headers = {}
        
        if self.enable_headers:
            headers.update({
                "X-RateLimit-Limit": str(rate_limit_info.limit),
                "X-RateLimit-Remaining": str(rate_limit_info.remaining),
                "X-RateLimit-Reset": str(rate_limit_info.reset_time)
            })
            
            if rate_limit_info.retry_after:
                headers["Retry-After"] = str(rate_limit_info.retry_after)
        
        return JSONResponse(
            status_code=status_code,
            content={
                "error": "rate_limit_exceeded" if status_code == 429 else "access_denied",
                "message": message,
                "limit": rate_limit_info.limit,
                "remaining": rate_limit_info.remaining,
                "reset_time": rate_limit_info.reset_time,
                "retry_after": rate_limit_info.retry_after
            },
            headers=headers
        )
    
    def _add_rate_limit_headers(self, response: Response, rate_limit_info) -> None:
        """Add rate limit headers to successful responses"""
        if not self.enable_headers:
            return
        
        response.headers["X-RateLimit-Limit"] = str(rate_limit_info.limit)
        response.headers["X-RateLimit-Remaining"] = str(rate_limit_info.remaining)
        response.headers["X-RateLimit-Reset"] = str(rate_limit_info.reset_time)
        
        # Add result type for debugging
        response.headers["X-RateLimit-Result"] = rate_limit_info.result.value


class RateLimitingConfig:
    """Configuration for rate limiting middleware"""
    
    def __init__(
        self,
        redis_url: Optional[str] = None,
        redis_client: Optional[redis.Redis] = None,
        exempt_paths: Optional[Set[str]] = None,
        enable_headers: bool = True,
        fail_open: bool = True
    ):
        self.redis_url = redis_url
        self.redis_client = redis_client
        self.exempt_paths = exempt_paths
        self.enable_headers = enable_headers
        self.fail_open = fail_open
    
    def create_middleware(self, app) -> RateLimitingMiddleware:
        """Create configured rate limiting middleware"""
        
        # Initialize Redis client if needed
        redis_client = self.redis_client
        if not redis_client and self.redis_url:
            try:
                redis_client = redis.from_url(self.redis_url, decode_responses=True)
                logger.info(f"✅ Connected to Redis for rate limiting: {self.redis_url}")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                if not self.fail_open:
                    raise
        
        return RateLimitingMiddleware(
            app=app,
            redis_client=redis_client,
            exempt_paths=self.exempt_paths,
            enable_rate_limit_headers=self.enable_headers
        )


# Default configuration function for easy setup
def setup_rate_limiting(
    app,
    redis_url: Optional[str] = None,
    redis_client: Optional[redis.Redis] = None
) -> None:
    """Easy setup function for rate limiting middleware"""
    
    config = RateLimitingConfig(
        redis_url=redis_url or getattr(settings, "REDIS_URL", "redis://localhost:6379/0"),
        redis_client=redis_client,
        exempt_paths={
            "/docs", "/redoc", "/openapi.json", "/favicon.ico",
            "/api/v1/health", "/api/v1/csrf/", "/static/",
            "/api/v1/auth/", "/api/oauth/"
        }
    )
    
    middleware = config.create_middleware(app)
    app.add_middleware(RateLimitingMiddleware, **middleware.__dict__)
    
    logger.info("✅ Rate limiting middleware configured")