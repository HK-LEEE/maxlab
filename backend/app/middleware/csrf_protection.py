"""
CSRF Protection Middleware for FastAPI
Implements comprehensive CSRF protection with token validation and double-submit cookie pattern
"""

import secrets
import hmac
import hashlib
from typing import Optional, Set
from fastapi import Request, HTTPException, status
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import logging

logger = logging.getLogger(__name__)

class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """
    CSRF Protection Middleware implementing:
    - Token generation and validation
    - Double-submit cookie pattern
    - Secure token storage
    - SameSite cookie configuration
    """
    
    def __init__(
        self,
        app: ASGIApp,
        secret_key: str,
        token_length: int = 32,
        cookie_name: str = "csrf_token",
        header_name: str = "X-CSRF-Token",
        cookie_samesite: str = "strict",
        cookie_secure: bool = True,
        exempt_methods: Optional[Set[str]] = None,
        exempt_paths: Optional[Set[str]] = None
    ):
        super().__init__(app)
        self.secret_key = secret_key.encode() if isinstance(secret_key, str) else secret_key
        self.token_length = token_length
        self.cookie_name = cookie_name
        self.header_name = header_name
        self.cookie_samesite = cookie_samesite
        self.cookie_secure = cookie_secure
        
        # Default exempt methods (safe methods that don't need CSRF protection)
        self.exempt_methods = exempt_methods or {"GET", "HEAD", "OPTIONS", "TRACE"}
        
        # Default exempt paths
        self.exempt_paths = exempt_paths or {
            "/docs", "/redoc", "/openapi.json", "/favicon.ico",
            "/api/health", "/api/ping"
        }

    async def dispatch(self, request: Request, call_next):
        """Process request with CSRF protection"""
        
        # Skip CSRF protection for exempt methods
        if request.method in self.exempt_methods:
            response = await call_next(request)
            return self._add_csrf_cookie_if_needed(request, response)
        
        # Skip CSRF protection for exempt paths
        if any(request.url.path.startswith(path) for path in self.exempt_paths):
            response = await call_next(request)
            return self._add_csrf_cookie_if_needed(request, response)
        
        # Validate CSRF token for state-changing requests
        try:
            self._validate_csrf_token(request)
        except HTTPException as e:
            logger.warning(f"CSRF validation failed for {request.method} {request.url.path}: {e.detail}")
            raise e
        
        # Process request
        response = await call_next(request)
        
        # Add CSRF cookie to response if needed
        return self._add_csrf_cookie_if_needed(request, response)

    def _validate_csrf_token(self, request: Request) -> None:
        """Validate CSRF token using double-submit cookie pattern"""
        
        # Get token from header
        header_token = request.headers.get(self.header_name)
        if not header_token:
            # Try to get from form data or JSON body
            header_token = self._extract_token_from_body(request)
        
        if not header_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token missing from request"
            )
        
        # Get token from cookie
        cookie_token = request.cookies.get(self.cookie_name)
        if not cookie_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF cookie missing"
            )
        
        # Validate tokens match (double-submit pattern)
        if not self._constant_time_compare(header_token, cookie_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token mismatch"
            )
        
        # Validate token signature (additional security)
        if not self._validate_token_signature(header_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token signature invalid"
            )
        
        logger.debug(f"CSRF token validated for {request.method} {request.url.path}")

    def _extract_token_from_body(self, request: Request) -> Optional[str]:
        """Extract CSRF token from request body (form data or JSON)"""
        try:
            # This is a simplified extraction - in practice, you might need
            # to parse the body based on content type
            # For now, we'll rely on the header method
            return None
        except Exception:
            return None

    def _constant_time_compare(self, a: str, b: str) -> bool:
        """Constant-time string comparison to prevent timing attacks"""
        return hmac.compare_digest(a.encode(), b.encode())

    def _validate_token_signature(self, token: str) -> bool:
        """Validate token signature to ensure it was generated by us"""
        try:
            if len(token) < self.token_length:
                return False
            
            # Extract token and signature
            token_part = token[:self.token_length]
            signature_part = token[self.token_length:]
            
            # Generate expected signature
            expected_signature = self._generate_signature(token_part)
            
            # Compare signatures
            return self._constant_time_compare(signature_part, expected_signature)
        except Exception as e:
            logger.error(f"Error validating token signature: {e}")
            return False

    def _generate_signature(self, token: str) -> str:
        """Generate HMAC signature for token"""
        return hmac.new(
            self.secret_key,
            token.encode(),
            hashlib.sha256
        ).hexdigest()[:16]  # Use first 16 chars of hex digest

    def _generate_csrf_token(self) -> str:
        """Generate a new CSRF token with signature"""
        # Generate random token
        token = secrets.token_hex(self.token_length // 2)  # hex gives 2 chars per byte
        
        # Add signature
        signature = self._generate_signature(token)
        
        return token + signature

    def _add_csrf_cookie_if_needed(self, request: Request, response: Response) -> Response:
        """Add CSRF cookie to response if not present or invalid"""
        
        current_cookie = request.cookies.get(self.cookie_name)
        
        # Generate new token if cookie doesn't exist or is invalid
        if not current_cookie or not self._validate_token_signature(current_cookie):
            new_token = self._generate_csrf_token()
            
            # Set cookie with security attributes
            response.set_cookie(
                key=self.cookie_name,
                value=new_token,
                max_age=3600,  # 1 hour
                httponly=False,  # Must be False for double-submit pattern
                secure=self.cookie_secure,
                samesite=self.cookie_samesite,
                path="/"
            )
            
            logger.debug(f"New CSRF token generated and set in cookie")
        
        return response

    def get_csrf_token(self, request: Request) -> str:
        """Get current CSRF token or generate new one"""
        current_token = request.cookies.get(self.cookie_name)
        
        if current_token and self._validate_token_signature(current_token):
            return current_token
        
        return self._generate_csrf_token()


class CSRFConfig:
    """CSRF Configuration class for easier management"""
    
    def __init__(
        self,
        secret_key: str,
        token_length: int = 32,
        cookie_name: str = "csrf_token",
        header_name: str = "X-CSRF-Token",
        cookie_samesite: str = "strict",
        cookie_secure: bool = True,
        exempt_methods: Optional[Set[str]] = None,
        exempt_paths: Optional[Set[str]] = None
    ):
        self.secret_key = secret_key
        self.token_length = token_length
        self.cookie_name = cookie_name
        self.header_name = header_name
        self.cookie_samesite = cookie_samesite
        self.cookie_secure = cookie_secure
        self.exempt_methods = exempt_methods or {"GET", "HEAD", "OPTIONS", "TRACE"}
        self.exempt_paths = exempt_paths or {
            "/docs", "/redoc", "/openapi.json", "/favicon.ico",
            "/api/health", "/api/ping", "/api/oauth/", "/api/auth/"
        }

    def create_middleware(self, app: ASGIApp) -> CSRFProtectionMiddleware:
        """Create CSRF middleware with this configuration"""
        return CSRFProtectionMiddleware(
            app=app,
            secret_key=self.secret_key,
            token_length=self.token_length,
            cookie_name=self.cookie_name,
            header_name=self.header_name,
            cookie_samesite=self.cookie_samesite,
            cookie_secure=self.cookie_secure,
            exempt_methods=self.exempt_methods,
            exempt_paths=self.exempt_paths
        )


# Utility functions for FastAPI dependency injection
def get_csrf_token_from_request(request: Request) -> Optional[str]:
    """Extract CSRF token from request headers or cookies"""
    # Try header first
    token = request.headers.get("X-CSRF-Token")
    if token:
        return token
    
    # Fallback to cookie
    return request.cookies.get("csrf_token")


def validate_csrf_token_dependency(request: Request) -> bool:
    """FastAPI dependency for manual CSRF validation"""
    if request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
        return True
    
    token = get_csrf_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token required"
        )
    
    return True