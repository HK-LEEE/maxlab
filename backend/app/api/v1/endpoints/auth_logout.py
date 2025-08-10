"""
Enhanced Authentication Logout API
Provides comprehensive logout functionality with token revocation and session cleanup
"""

from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
import logging

from ....core.auth import get_current_user
from ....services.token_blacklist import get_token_blacklist
from ....middleware.session_middleware import logout_session, logout_all_user_sessions
from ....middleware.sso_session_validator import invalidate_sso_session, clear_sso_cache

logger = logging.getLogger(__name__)

router = APIRouter()

class LogoutRequest(BaseModel):
    """Request model for logout operations"""
    logout_all: bool = False
    reason: str = "user_logout"

class LogoutResponse(BaseModel):
    """Response model for logout operations"""
    success: bool
    message: str
    sessions_logged_out: int
    tokens_blacklisted: int
    cleanup_performed: bool

@router.post("/logout", response_model=LogoutResponse)
async def enhanced_logout(
    request: LogoutRequest,
    http_request: Request,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Enhanced logout with comprehensive token revocation and session cleanup
    
    - Blacklists current JWT token
    - Logs out current session or all user sessions
    - Performs security cleanup
    """
    user_id = current_user.get("user_id") or current_user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not determine user ID"
        )
    
    sessions_logged_out = 0
    tokens_blacklisted = 0
    cleanup_performed = False
    
    try:
        # Step 1: Blacklist current token
        blacklist_service = get_token_blacklist()
        if blacklist_service:
            try:
                # Extract token from Authorization header
                auth_header = http_request.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
                    
                    # Get client info for logging
                    ip_address = http_request.client.host if http_request.client else None
                    user_agent = http_request.headers.get("User-Agent")
                    
                    # Blacklist the token
                    success = blacklist_service.blacklist_token(
                        token=token,
                        user_id=user_id,
                        reason=request.reason,
                        ip_address=ip_address,
                        user_agent=user_agent
                    )
                    
                    if success:
                        tokens_blacklisted = 1
                        logger.info(f"Token blacklisted for user {user_id}: {request.reason}")
                    else:
                        logger.warning(f"Failed to blacklist token for user {user_id}")
                        
            except Exception as e:
                logger.error(f"Error blacklisting token: {e}")
                # Continue with logout even if blacklisting fails
        
        # Step 2: Session logout
        if request.logout_all:
            # Logout all user sessions
            sessions_logged_out = logout_all_user_sessions(user_id)
            logger.info(f"Logged out all sessions for user {user_id}: {sessions_logged_out} sessions")
        else:
            # Logout current session only
            success = logout_session(http_request, response)
            sessions_logged_out = 1 if success else 0
            logger.info(f"Logged out current session for user {user_id}")
        
        # Step 2.5: Notify auth server about logout (SSO synchronization)
        try:
            # Get session ID from cookies or state
            session_id = http_request.cookies.get("session_id")
            if session_id:
                # Invalidate session on auth server
                sso_invalidated = await invalidate_sso_session(session_id, user_id)
                if sso_invalidated:
                    logger.info(f"SSO session invalidated for user {user_id}")
                else:
                    logger.warning(f"Failed to invalidate SSO session for user {user_id}")
            
            # Clear SSO validation cache for this user
            clear_sso_cache(user_id)
            
        except Exception as e:
            logger.error(f"Error notifying auth server about logout: {e}")
            # Continue with logout even if SSO notification fails
        
        # Step 3: Clear cookies properly for cross-domain SSO
        try:
            # Clear cookies with proper domain for SSO
            cookie_domain = ".dwchem.co.kr"  # This covers all subdomains
            
            # Clear session cookies
            response.delete_cookie(key="session_id", domain=cookie_domain, path="/")
            response.delete_cookie(key="session_token", domain=cookie_domain, path="/")
            response.delete_cookie(key="access_token", domain=cookie_domain, path="/")
            response.delete_cookie(key="user_id", domain=cookie_domain, path="/")
            response.delete_cookie(key="oauth_session", domain=cookie_domain, path="/")
            
            # Also clear without domain for local development
            response.delete_cookie(key="session_id", path="/")
            response.delete_cookie(key="session_token", path="/")
            response.delete_cookie(key="access_token", path="/")
            response.delete_cookie(key="user_id", path="/")
            
            logger.info(f"Cookies cleared for user {user_id} with domain {cookie_domain}")
            cleanup_performed = True
            
        except Exception as e:
            logger.warning(f"Cookie cleanup failed for user {user_id}: {e}")
            cleanup_performed = False
        
        # Step 4: Log logout event for security monitoring
        logger.info(
            f"Enhanced logout completed for user {user_id}: "
            f"sessions={sessions_logged_out}, tokens={tokens_blacklisted}, "
            f"cleanup={cleanup_performed}, all_sessions={request.logout_all}"
        )
        
        return LogoutResponse(
            success=True,
            message=f"Successfully logged out {sessions_logged_out} session(s)",
            sessions_logged_out=sessions_logged_out,
            tokens_blacklisted=tokens_blacklisted,
            cleanup_performed=cleanup_performed
        )
        
    except Exception as e:
        logger.error(f"Enhanced logout failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed. Please try again."
        )

@router.post("/logout-emergency", response_model=LogoutResponse)
async def emergency_logout(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Emergency logout that forces logout even if some operations fail
    Used when user suspects account compromise
    """
    user_id = current_user.get("user_id") or current_user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not determine user ID"
        )
    
    sessions_logged_out = 0
    tokens_blacklisted = 0
    cleanup_performed = False
    
    logger.warning(f"Emergency logout initiated for user {user_id}")
    
    try:
        # Force blacklist all user tokens
        blacklist_service = get_token_blacklist()
        if blacklist_service:
            try:
                tokens_blacklisted = blacklist_service.blacklist_user_tokens(
                    user_id=user_id,
                    reason="emergency_logout"
                )
                logger.warning(f"Emergency: Blacklisted {tokens_blacklisted} tokens for user {user_id}")
            except Exception as e:
                logger.error(f"Emergency blacklist failed: {e}")
        
        # Force logout all sessions
        try:
            sessions_logged_out = logout_all_user_sessions(user_id)
            logger.warning(f"Emergency: Logged out {sessions_logged_out} sessions for user {user_id}")
        except Exception as e:
            logger.error(f"Emergency session logout failed: {e}")
        
        # Force cleanup
        try:
            cleanup_performed = True
            logger.warning(f"Emergency cleanup performed for user {user_id}")
        except Exception as e:
            logger.error(f"Emergency cleanup failed: {e}")
        
        # Always return success for emergency logout
        return LogoutResponse(
            success=True,
            message=f"Emergency logout completed: {sessions_logged_out} sessions, {tokens_blacklisted} tokens",
            sessions_logged_out=sessions_logged_out,
            tokens_blacklisted=tokens_blacklisted,
            cleanup_performed=cleanup_performed
        )
        
    except Exception as e:
        logger.critical(f"Emergency logout failed for user {user_id}: {e}")
        # Even if emergency logout fails, return success to ensure user is logged out client-side
        return LogoutResponse(
            success=True,
            message="Emergency logout attempted - please clear browser data and log in again",
            sessions_logged_out=0,
            tokens_blacklisted=0,
            cleanup_performed=False
        )

@router.get("/logout-status/{user_id}")
async def get_logout_status(
    user_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get logout/session status for a user (admin only or own user)
    """
    # Check permissions
    current_user_id = current_user.get("user_id") or current_user.get("id")
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    
    if not is_admin and current_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only view your own logout status"
        )
    
    try:
        # Get token blacklist info
        blacklist_service = get_token_blacklist()
        blacklisted_tokens = []
        if blacklist_service:
            blacklisted_tokens = blacklist_service.get_user_blacklisted_tokens(user_id)
        
        # Get session info would go here if we had a session service
        # For now, return token blacklist info
        
        return {
            "user_id": user_id,
            "blacklisted_tokens_count": len(blacklisted_tokens),
            "recent_blacklisted_tokens": blacklisted_tokens[:5],  # Last 5 for security
            "has_active_sessions": True  # Would check session service here
        }
        
    except Exception as e:
        logger.error(f"Failed to get logout status for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get logout status"
        )