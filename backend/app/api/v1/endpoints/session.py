"""
Session Management API Endpoints
Provides session management, monitoring, and security features
"""

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Request, Response, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime
import logging

from ....services.session_manager import session_manager, SessionData
from ....middleware.session_middleware import (
    get_current_session, require_session, create_session, 
    regenerate_session, logout_session, logout_all_user_sessions
)
from ....core.auth import get_current_user, get_current_admin_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models
class SessionInfo(BaseModel):
    session_id: str
    user_id: str
    created_at: datetime
    last_accessed: datetime
    expires_at: datetime
    ip_address: str
    user_agent: str
    is_active: bool
    time_remaining_seconds: int

class SessionCreateRequest(BaseModel):
    remember_me: bool = False

class SessionStats(BaseModel):
    total_active_sessions: int
    total_users_with_sessions: int
    sessions_expiring_soon: int
    average_sessions_per_user: float
    max_sessions_per_user: int
    session_lifetime_seconds: int

class SessionListResponse(BaseModel):
    sessions: List[SessionInfo]
    total_count: int

@router.get("/current", response_model=Optional[SessionInfo])
async def get_current_session_info(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get current session information"""
    
    session = get_current_session(request)
    if not session:
        return None
    
    # Calculate time remaining
    now = datetime.utcnow()
    time_remaining = max(0, int((session.expires_at - now).total_seconds()))
    
    return SessionInfo(
        session_id=session.session_id[:8] + "...",  # Partial ID for security
        user_id=session.user_id,
        created_at=session.created_at,
        last_accessed=session.last_accessed,
        expires_at=session.expires_at,
        ip_address=session.ip_address,
        user_agent=session.user_agent[:100] + "..." if len(session.user_agent) > 100 else session.user_agent,
        is_active=session.is_active,
        time_remaining_seconds=time_remaining
    )

@router.post("/regenerate", response_model=SessionInfo)
async def regenerate_session_id(
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user)
):
    """Regenerate session ID for security (prevents session fixation)"""
    
    new_session = regenerate_session(request, response)
    if not new_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to regenerate session"
        )
    
    # Calculate time remaining
    now = datetime.utcnow()
    time_remaining = max(0, int((new_session.expires_at - now).total_seconds()))
    
    logger.info(f"Regenerated session for user {current_user['user_id']}")
    
    return SessionInfo(
        session_id=new_session.session_id[:8] + "...",
        user_id=new_session.user_id,
        created_at=new_session.created_at,
        last_accessed=new_session.last_accessed,
        expires_at=new_session.expires_at,
        ip_address=new_session.ip_address,
        user_agent=new_session.user_agent[:100] + "..." if len(new_session.user_agent) > 100 else new_session.user_agent,
        is_active=new_session.is_active,
        time_remaining_seconds=time_remaining
    )

@router.post("/logout")
async def logout_current_session(
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user)
):
    """Logout current session"""
    
    success = logout_session(request, response)
    
    if success:
        logger.info(f"User {current_user['user_id']} logged out current session")
        return {"message": "Session logged out successfully", "success": True}
    else:
        return {"message": "No active session to logout", "success": False}

@router.post("/logout-all")
async def logout_all_sessions(
    current_user: dict = Depends(get_current_user)
):
    """Logout all sessions for current user"""
    
    user_id = current_user["user_id"]
    logout_count = logout_all_user_sessions(user_id)
    
    logger.info(f"User {user_id} logged out all sessions ({logout_count} sessions)")
    
    return {
        "message": f"Logged out {logout_count} sessions",
        "logout_count": logout_count,
        "success": True
    }

@router.get("/list", response_model=SessionListResponse)
async def get_user_sessions(
    current_user: dict = Depends(get_current_user)
):
    """Get all active sessions for current user"""
    
    user_id = current_user["user_id"]
    sessions = session_manager.get_user_sessions(user_id)
    
    # Convert to response format
    session_infos = []
    now = datetime.utcnow()
    
    for session in sessions:
        time_remaining = max(0, int((session.expires_at - now).total_seconds()))
        
        session_infos.append(SessionInfo(
            session_id=session.session_id[:8] + "...",
            user_id=session.user_id,
            created_at=session.created_at,
            last_accessed=session.last_accessed,
            expires_at=session.expires_at,
            ip_address=session.ip_address,
            user_agent=session.user_agent[:100] + "..." if len(session.user_agent) > 100 else session.user_agent,
            is_active=session.is_active,
            time_remaining_seconds=time_remaining
        ))
    
    return SessionListResponse(
        sessions=session_infos,
        total_count=len(session_infos)
    )

@router.get("/stats", response_model=SessionStats)
async def get_session_stats(
    admin_user: dict = Depends(get_current_admin_user)
):
    """Get session statistics (admin only)"""
    
    stats = session_manager.get_session_stats()
    
    return SessionStats(**stats)

@router.post("/cleanup")
async def cleanup_expired_sessions(
    admin_user: dict = Depends(get_current_admin_user)
):
    """Manually trigger cleanup of expired sessions (admin only)"""
    
    cleaned_count = session_manager.cleanup_expired_sessions()
    
    logger.info(f"Admin {admin_user['user_id']} triggered session cleanup: {cleaned_count} sessions removed")
    
    return {
        "message": f"Cleaned up {cleaned_count} expired sessions",
        "cleaned_count": cleaned_count,
        "success": True
    }

@router.post("/admin/logout-user/{user_id}")
async def admin_logout_user_sessions(
    user_id: str,
    admin_user: dict = Depends(get_current_admin_user)
):
    """Logout all sessions for a specific user (admin only)"""
    
    logout_count = logout_all_user_sessions(user_id)
    
    logger.warning(f"Admin {admin_user['user_id']} logged out all sessions for user {user_id} ({logout_count} sessions)")
    
    return {
        "message": f"Logged out {logout_count} sessions for user {user_id}",
        "user_id": user_id,
        "logout_count": logout_count,
        "success": True
    }

@router.get("/admin/all-sessions")
async def admin_get_all_sessions(
    admin_user: dict = Depends(get_current_admin_user),
    limit: int = 100
):
    """Get all active sessions (admin only)"""
    
    all_sessions = []
    session_count = 0
    now = datetime.utcnow()
    
    # Get sessions from session manager
    for session_id, session in session_manager.active_sessions.items():
        if session_count >= limit:
            break
        
        time_remaining = max(0, int((session.expires_at - now).total_seconds()))
        
        all_sessions.append({
            "session_id": session.session_id[:8] + "...",
            "user_id": session.user_id,
            "created_at": session.created_at,
            "last_accessed": session.last_accessed,
            "expires_at": session.expires_at,
            "ip_address": session.ip_address,
            "user_agent": session.user_agent[:50] + "..." if len(session.user_agent) > 50 else session.user_agent,
            "is_active": session.is_active,
            "time_remaining_seconds": time_remaining
        })
        
        session_count += 1
    
    return {
        "sessions": all_sessions,
        "total_shown": len(all_sessions),
        "total_active": len(session_manager.active_sessions),
        "limit": limit
    }

@router.get("/security-info")
async def get_session_security_info(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get session security information for current session"""
    
    session = get_current_session(request)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active session found"
        )
    
    # Get current request info
    current_ip = request.headers.get("x-forwarded-for", 
                                   request.headers.get("x-real-ip", 
                                                     getattr(request.client, 'host', 'unknown')))
    current_user_agent = request.headers.get("user-agent", "")
    
    # Calculate session age
    now = datetime.utcnow()
    session_age_seconds = int((now - session.created_at).total_seconds())
    time_since_last_access = int((now - session.last_accessed).total_seconds())
    
    return {
        "session_security": {
            "session_age_seconds": session_age_seconds,
            "time_since_last_access_seconds": time_since_last_access,
            "ip_address_match": session.ip_address == current_ip,
            "user_agent_match": session.user_agent == current_user_agent,
            "session_ip": session.ip_address,
            "current_ip": current_ip,
            "created_at": session.created_at,
            "last_accessed": session.last_accessed,
            "expires_at": session.expires_at
        },
        "security_recommendations": self._get_security_recommendations(session, current_ip, current_user_agent)
    }

def _get_security_recommendations(session: SessionData, current_ip: str, current_user_agent: str) -> List[str]:
    """Get security recommendations based on session analysis"""
    recommendations = []
    
    if session.ip_address != current_ip:
        recommendations.append("IP address has changed since login. Consider regenerating session if this is unexpected.")
    
    if session.user_agent != current_user_agent:
        recommendations.append("Browser/device has changed since login. Consider regenerating session if this is unexpected.")
    
    # Check session age
    now = datetime.utcnow()
    session_age_hours = (now - session.created_at).total_seconds() / 3600
    
    if session_age_hours > 12:
        recommendations.append("Session is more than 12 hours old. Consider logging out and back in for security.")
    
    if not recommendations:
        recommendations.append("Session appears secure. No immediate security concerns detected.")
    
    return recommendations