"""
Secure Session Middleware for FastAPI
Handles session creation, validation, and security features
"""

from typing import Optional, Dict, Any
from fastapi import Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import logging
from datetime import datetime
import asyncio

from ..services.session_manager import session_manager, SessionConfig, SessionData
from .sso_session_validator import validate_sso_session, invalidate_sso_session

logger = logging.getLogger(__name__)

class SecureSessionMiddleware(BaseHTTPMiddleware):
    """
    Secure session middleware with:
    - Session fixation protection
    - Secure cookie configuration
    - Session hijacking protection
    - Concurrent session limiting
    """
    
    def __init__(
        self,
        app: ASGIApp,
        config: SessionConfig,
        exempt_paths: Optional[set] = None
    ):
        super().__init__(app)
        self.config = config
        self.exempt_paths = exempt_paths or {
            "/docs", "/redoc", "/openapi.json", "/favicon.ico",
            "/api/v1/health", "/api/v1/csrf/", "/static/",
            "/api/v1/auth/", "/api/oauth/"
        }

    async def dispatch(self, request: Request, call_next):
        """Process request with session handling"""
        
        # Skip session handling for exempt paths
        if self._is_exempt_path(request.url.path):
            return await call_next(request)
        
        # Get session from request
        session_data = self._get_session_from_request(request)
        
        # Add session to request state
        request.state.session = session_data
        request.state.session_manager = session_manager
        
        # Validate session security
        if session_data:
            security_check = await self._validate_session_security(request, session_data)
            if not security_check["valid"]:
                logger.warning(f"Session security validation failed: {security_check['reason']}")
                
                # Invalidate suspicious session
                session_manager.invalidate_session(session_data.session_id)
                request.state.session = None
                
                # Return security error for suspicious activity
                if security_check["suspicious"]:
                    return JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={
                            "detail": "Session security violation detected",
                            "error_code": "SESSION_SECURITY_VIOLATION"
                        }
                    )
        
        # Process request
        response = await call_next(request)
        
        # Handle session in response
        return self._handle_session_response(request, response)

    def _get_session_from_request(self, request: Request) -> Optional[SessionData]:
        """Extract and validate session from request"""
        
        # Get session ID from cookie
        encrypted_session_id = request.cookies.get(self.config.cookie_name)
        if not encrypted_session_id:
            return None
        
        # Decrypt session ID
        session_id = session_manager.decrypt_session_cookie(encrypted_session_id)
        if not session_id:
            return None
        
        # Get session data
        session_data = session_manager.get_session(session_id)
        if not session_data:
            return None
        
        return session_data

    async def _validate_session_security(self, request: Request, session: SessionData) -> Dict[str, Any]:
        """Validate session security characteristics including SSO validation"""
        
        # Get request info
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        
        # Check IP address consistency (basic session hijacking protection)
        if session.ip_address != client_ip:
            logger.warning(f"IP address mismatch for session {session.session_id[:8]}...: "
                         f"expected {session.ip_address}, got {client_ip}")
            return {
                "valid": False,
                "reason": "ip_address_mismatch",
                "suspicious": True
            }
        
        # Check User-Agent consistency (basic session hijacking protection)
        if session.user_agent != user_agent:
            logger.warning(f"User-Agent mismatch for session {session.session_id[:8]}...: "
                         f"expected {session.user_agent[:50]}..., got {user_agent[:50]}...")
            return {
                "valid": False,
                "reason": "user_agent_mismatch",
                "suspicious": True
            }
        
        # Check session age (prevent indefinite sessions)
        now = datetime.utcnow()
        session_age = (now - session.created_at).total_seconds()
        max_session_age = 24 * 3600  # 24 hours maximum
        
        if session_age > max_session_age:
            return {
                "valid": False,
                "reason": "session_too_old",
                "suspicious": False
            }
        
        # SSO Session Validation - Check with auth server every 5 minutes
        # This ensures that if user logs out from auth server, the session is invalidated here too
        try:
            # Only validate with SSO if session is older than 5 minutes since last check
            last_sso_check = getattr(session, 'last_sso_validation', None)
            should_validate = False
            
            if last_sso_check is None:
                should_validate = True
            else:
                time_since_check = (now - last_sso_check).total_seconds()
                if time_since_check > 300:  # 5 minutes
                    should_validate = True
            
            if should_validate:
                # Extract token from request if available
                token = None
                auth_header = request.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
                
                # Validate with SSO
                user_id = session.user_id or session.data.get("user_id") if hasattr(session, 'data') else None
                if user_id:
                    is_valid = await validate_sso_session(
                        session_id=session.session_id,
                        user_id=user_id,
                        token=token
                    )
                    
                    if not is_valid:
                        logger.warning(f"SSO validation failed for session {session.session_id[:8]}...")
                        return {
                            "valid": False,
                            "reason": "sso_validation_failed",
                            "suspicious": False
                        }
                    
                    # Update last SSO validation time
                    session.last_sso_validation = now
                    logger.debug(f"SSO validation successful for session {session.session_id[:8]}...")
                
        except Exception as e:
            logger.error(f"Error during SSO validation: {e}")
            # On SSO validation error, continue with local validation only
            # This ensures the system remains functional even if auth server is down
        
        return {"valid": True, "reason": "valid"}

    def _handle_session_response(self, request: Request, response: Response) -> Response:
        """Handle session data in response"""
        
        # Get session from request state
        session_data = getattr(request.state, 'session', None)
        
        # Check if session was created or updated during request
        new_session = getattr(request.state, 'new_session', None)
        regenerated_session = getattr(request.state, 'regenerated_session', None)
        
        if new_session:
            # Set secure session cookie for new session
            self._set_session_cookie(response, new_session)
            logger.info(f"Set new session cookie: {new_session.session_id[:8]}...")
            
        elif regenerated_session:
            # Set secure session cookie for regenerated session
            self._set_session_cookie(response, regenerated_session)
            logger.info(f"Set regenerated session cookie: {regenerated_session.session_id[:8]}...")
            
        elif hasattr(request.state, 'clear_session') and request.state.clear_session:
            # Clear session cookie
            self._clear_session_cookie(response)
            logger.info("Cleared session cookie")
        
        return response

    def _set_session_cookie(self, response: Response, session: SessionData) -> None:
        """Set secure session cookie"""
        
        # Encrypt session ID
        encrypted_session_id = session_manager.encrypt_session_cookie(session.session_id)
        
        # Calculate max age
        now = datetime.utcnow()
        max_age = int((session.expires_at - now).total_seconds())
        
        # Set cookie with security attributes
        response.set_cookie(
            key=self.config.cookie_name,
            value=encrypted_session_id,
            max_age=max_age,
            expires=session.expires_at,
            path="/",
            domain=None,  # Set to your domain in production
            secure=self.config.secure_cookies,
            httponly=self.config.httponly_cookies,
            samesite=self.config.samesite_policy
        )

    def _clear_session_cookie(self, response: Response) -> None:
        """Clear session cookie"""
        response.delete_cookie(
            key=self.config.cookie_name,
            path="/",
            domain=None,  # Set to your domain in production
            secure=self.config.secure_cookies,
            httponly=self.config.httponly_cookies,
            samesite=self.config.samesite_policy
        )

    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address considering proxies"""
        
        # Check for forwarded headers (behind reverse proxy)
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            # Take the first IP if multiple are present
            return forwarded_for.split(",")[0].strip()
        
        # Check for real IP header
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        
        # Fallback to direct client IP
        if hasattr(request.client, 'host'):
            return request.client.host
        
        return "unknown"

    def _is_exempt_path(self, path: str) -> bool:
        """Check if path is exempt from session handling"""
        return any(path.startswith(exempt_path) for exempt_path in self.exempt_paths)


# Session utility functions for use in FastAPI dependencies
def get_current_session(request: Request) -> Optional[SessionData]:
    """Get current session from request state"""
    return getattr(request.state, 'session', None)

def require_session(request: Request) -> SessionData:
    """Require valid session (raises HTTPException if not found)"""
    session = get_current_session(request)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid session required"
        )
    return session

def create_session(
    request: Request, 
    response: Response, 
    user_id: str, 
    remember_me: bool = False
) -> SessionData:
    """Create new session and set cookie"""
    
    # Get request info
    client_ip = request.headers.get("x-forwarded-for", 
                                  request.headers.get("x-real-ip", 
                                                    getattr(request.client, 'host', 'unknown')))
    user_agent = request.headers.get("user-agent", "")
    
    # Create session
    session = session_manager.create_session(
        user_id=user_id,
        ip_address=client_ip,
        user_agent=user_agent,
        remember_me=remember_me
    )
    
    # Mark for cookie setting in middleware
    request.state.new_session = session
    
    return session

def regenerate_session(request: Request, response: Response) -> Optional[SessionData]:
    """Regenerate session ID for fixation protection"""
    
    current_session = get_current_session(request)
    if not current_session:
        return None
    
    # Regenerate session
    new_session = session_manager.regenerate_session_id(current_session.session_id)
    if not new_session:
        return None
    
    # Mark for cookie update in middleware
    request.state.regenerated_session = new_session
    request.state.session = new_session
    
    return new_session

def logout_session(request: Request, response: Response) -> bool:
    """Logout current session"""
    
    current_session = get_current_session(request)
    if not current_session:
        return False
    
    # Invalidate session
    success = session_manager.invalidate_session(current_session.session_id)
    
    # Mark for cookie clearing in middleware
    request.state.clear_session = True
    request.state.session = None
    
    return success

def logout_all_user_sessions(user_id: str) -> int:
    """Logout all sessions for a user"""
    return session_manager.invalidate_all_user_sessions(user_id)

def get_session_manager():
    """Get session manager instance for dependency injection"""
    return session_manager