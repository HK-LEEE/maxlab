"""
User Session Management Router
Provides endpoints for managing user sessions and logout operations
"""

from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timezone
import logging
import uuid

from ..core.security import get_current_user, get_current_user_with_session
from ..services.async_session_manager import async_session_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user/sessions", tags=["user_sessions"])


class DeviceInfo(BaseModel):
    device_type: Literal["desktop", "mobile", "tablet"]
    browser: str
    os: str


class LocationInfo(BaseModel):
    country: str
    city: str


class SessionInfo(BaseModel):
    session_id: str
    client_id: str
    client_name: str
    created_at: datetime
    last_used_at: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    device_info: Optional[DeviceInfo] = None
    location: Optional[LocationInfo] = None
    is_current_session: bool
    is_suspicious: bool


class ActiveSessionsResponse(BaseModel):
    current_session: SessionInfo
    other_sessions: List[SessionInfo]
    total_sessions: int
    suspicious_sessions: int


class LogoutRequest(BaseModel):
    logout_type: Literal["current", "all"]
    reason: str = "User requested logout"


class LogoutResponse(BaseModel):
    message: str
    logout_type: Literal["current", "all"]
    sessions_terminated: int
    tokens_revoked: int


class LogoutSessionsRequest(BaseModel):
    session_ids: List[str]
    reason: str = "User selected specific sessions"


class LogoutSessionsResponse(BaseModel):
    message: str
    sessions_terminated: int
    tokens_revoked: int


def parse_user_agent(user_agent: str) -> DeviceInfo:
    """Parse user agent string to extract device information"""
    # Simple mock implementation
    device_type = "desktop"
    browser = "Chrome"
    os = "Windows 10"
    
    if "Mobile" in user_agent:
        device_type = "mobile"
    elif "Tablet" in user_agent:
        device_type = "tablet"
        
    if "Firefox" in user_agent:
        browser = "Firefox"
    elif "Safari" in user_agent and "Chrome" not in user_agent:
        browser = "Safari"
    elif "Edge" in user_agent:
        browser = "Edge"
        
    if "Mac OS" in user_agent:
        os = "macOS"
    elif "Linux" in user_agent:
        os = "Linux"
    elif "Android" in user_agent:
        os = "Android"
    elif "iOS" in user_agent or "iPhone" in user_agent:
        os = "iOS"
        
    return DeviceInfo(device_type=device_type, browser=browser, os=os)


@router.get("/active", response_model=ActiveSessionsResponse)
async def get_active_sessions(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user_with_session)
):
    """
    Get all active sessions for the current user.
    Returns information about the current session and other active sessions.
    """
    try:
        user_id = current_user.get('user_id') or current_user.get('id') or current_user.get('email')
        logger.info(f"Fetching active sessions for user: {user_id}")
        
        if not user_id:
            logger.error("No user_id found in current_user")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID not found in authentication token"
            )
        
        # Get current session info
        current_session_id = current_user.get("session_id") or request.cookies.get("maxlab_session")
        logger.debug(f"Current session ID: {current_session_id}")
        
        # Get all user sessions from async session manager
        try:
            user_sessions = await async_session_manager.get_user_sessions(user_id)
            logger.debug(f"Found {len(user_sessions)} existing sessions for user {user_id}")
        except Exception as e:
            logger.error(f"Error getting user sessions: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve user sessions: {str(e)}"
            )
        
        # If no sessions found, this means the user doesn't have any database sessions
        # This is normal for fresh JWT authentication - the session will be created on next request
        if not user_sessions:
            logger.info(f"No database sessions found for user {user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active sessions found. Please refresh the page to initialize session."
            )
        
        current_session = None
        other_sessions = []
        suspicious_count = 0
        
        # Process each session with enhanced error handling
        for session_data in user_sessions:
            try:
                # Parse device info from user agent
                device_info = parse_user_agent(session_data.user_agent or "Unknown")
                
                # Create session info
                session_info = SessionInfo(
                    session_id=session_data.session_id,
                    client_id="maxlab-web",  # Could be enhanced to detect client type
                    client_name=f"MAX Lab {device_info.device_type.title()}",
                    created_at=session_data.created_at,
                    last_used_at=session_data.last_accessed,
                    ip_address=session_data.ip_address or "Unknown",
                    user_agent=session_data.user_agent or "Unknown",
                    device_info=device_info,
                    location=LocationInfo(
                        country="대한민국",  # Could be enhanced with IP geolocation
                        city="서울"
                    ),
                    is_current_session=(session_data.session_id == current_session_id),
                    is_suspicious=False  # Could be enhanced with security analysis
                )
                
                if session_info.is_suspicious:
                    suspicious_count += 1
                
                if session_info.is_current_session:
                    current_session = session_info
                else:
                    other_sessions.append(session_info)
                    
            except Exception as e:
                logger.error(f"Error processing session {session_data.session_id}: {e}")
                # Continue processing other sessions instead of failing completely
                continue
        
        # If no current session found, use the most recent one
        if not current_session and user_sessions:
            most_recent = max(user_sessions, key=lambda s: s.last_accessed)
            # Update the session info to mark as current
            for session_info in other_sessions:
                if session_info.session_id == most_recent.session_id:
                    session_info.is_current_session = True
                    current_session = session_info
                    other_sessions.remove(session_info)
                    break
        
        if not current_session:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not identify current session"
            )
        
        return ActiveSessionsResponse(
            current_session=current_session,
            other_sessions=other_sessions,
            total_sessions=len(user_sessions),
            suspicious_sessions=suspicious_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching active sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch active sessions"
        )


@router.post("/logout", response_model=LogoutResponse)
async def logout_sessions(
    request: LogoutRequest,
    http_request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user_with_session)
):
    """
    Logout user sessions based on the specified type.
    - current: Logout only the current session
    - all: Logout all sessions across all devices
    """
    try:
        user_id = current_user.get('user_id') or current_user.get('id') or current_user.get('email')
        logger.info(f"Logout request from user {user_id}: {request.logout_type}")
        
        sessions_terminated = 0
        tokens_revoked = 0
        
        if request.logout_type == "current":
            # Get current session ID
            current_session_id = current_user.get("session_id") or http_request.cookies.get("maxlab_session")
            if current_session_id:
                # Invalidate current session
                if await async_session_manager.invalidate_session(current_session_id):
                    sessions_terminated = 1
                    tokens_revoked = 2  # Access token + refresh token
                    logger.info(f"Invalidated current session {current_session_id} for user {user_id}")
                else:
                    logger.warning(f"Failed to invalidate current session {current_session_id} for user {user_id}")
            
            message = "Successfully logged out from current session"
            
        else:  # all sessions
            # Terminate all user sessions
            sessions_terminated = await async_session_manager.invalidate_all_user_sessions(user_id)
            tokens_revoked = sessions_terminated * 2  # 2 tokens per session
            
            logger.info(f"Invalidated {sessions_terminated} sessions for user {user_id}")
            message = "Successfully logged out from all sessions"
        
        return LogoutResponse(
            message=message,
            logout_type=request.logout_type,
            sessions_terminated=sessions_terminated,
            tokens_revoked=tokens_revoked
        )
        
    except Exception as e:
        logger.error(f"Error during logout: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process logout request"
        )


@router.post("/logout-sessions", response_model=LogoutSessionsResponse)
async def logout_specific_sessions(
    request: LogoutSessionsRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Logout specific sessions by their IDs.
    This allows users to selectively terminate suspicious or unused sessions.
    """
    try:
        user_id = current_user.get('user_id') or current_user.get('id') or current_user.get('email')
        logger.info(f"Specific session logout request from user {user_id}: {len(request.session_ids)} sessions")
        
        sessions_terminated = 0
        tokens_revoked = 0
        
        # Get user's sessions to validate ownership
        user_sessions = await async_session_manager.get_user_sessions(user_id)
        user_session_ids = {session.session_id for session in user_sessions}
        
        # Validate and terminate each session
        for session_id in request.session_ids:
            if session_id not in user_session_ids:
                logger.warning(f"User {user_id} attempted to terminate session {session_id} they don't own")
                continue
                
            if await async_session_manager.invalidate_session(session_id):
                sessions_terminated += 1
                tokens_revoked += 2  # 2 tokens per session
                logger.info(f"Terminated session {session_id} for user {user_id}")
            else:
                logger.warning(f"Failed to terminate session {session_id} for user {user_id}")
        
        return LogoutSessionsResponse(
            message=f"Successfully terminated {sessions_terminated} sessions",
            sessions_terminated=sessions_terminated,
            tokens_revoked=tokens_revoked
        )
        
    except Exception as e:
        logger.error(f"Error during specific session logout: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to logout specific sessions"
        )