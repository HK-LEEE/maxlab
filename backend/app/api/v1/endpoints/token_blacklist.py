"""
Token Blacklist Management API
Provides endpoints for managing JWT token blacklists
"""

import jwt
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
import logging

from ....services.token_blacklist import get_token_blacklist, BlacklistEntry
from ....core.auth import get_current_user, get_current_admin_user
from ....core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models
class BlacklistTokenRequest(BaseModel):
    """Request model for blacklisting a token"""
    token: Optional[str] = Field(None, description="Token to blacklist (if not provided, uses current user's token)")
    reason: str = Field("manual_revocation", description="Reason for blacklisting")
    user_id: Optional[str] = Field(None, description="User ID (auto-detected if not provided)")

class BlacklistTokenResponse(BaseModel):
    """Response model for blacklist operations"""
    success: bool
    message: str
    token_hash: Optional[str] = None
    blacklisted_count: Optional[int] = None

class TokenInfoResponse(BaseModel):
    """Response model for token information"""
    is_blacklisted: bool
    blacklist_entry: Optional[Dict[str, Any]] = None
    token_info: Optional[Dict[str, Any]] = None

class BlacklistStatsResponse(BaseModel):
    """Response model for blacklist statistics"""
    total_blacklisted_tokens: int
    blacklist_by_reason: Dict[str, int]
    redis_connected: bool
    timestamp: int


@router.post("/blacklist", response_model=BlacklistTokenResponse)
async def blacklist_token(
    request: BlacklistTokenRequest,
    http_request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Blacklist a JWT token
    
    - If no token provided, blacklists current user's token
    - Extracts user info from token automatically
    """
    blacklist_service = get_token_blacklist()
    if not blacklist_service:
        raise HTTPException(status_code=503, detail="Token blacklist service not available")
    
    try:
        # Use provided token or current user's token
        token_to_blacklist = request.token
        if not token_to_blacklist:
            # Extract from Authorization header
            auth_header = http_request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token_to_blacklist = auth_header[7:]
            else:
                raise HTTPException(status_code=400, detail="No token provided")
        
        # Extract user ID
        user_id = request.user_id or current_user.get("user_id") or current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=400, detail="Could not determine user ID")
        
        # Get client info
        ip_address = http_request.client.host if http_request and http_request.client else None
        user_agent = http_request.headers.get("User-Agent") if http_request else None
        
        # Try to extract expiry from token
        expires_at = None
        try:
            # Decode without verification to get expiry
            decoded = jwt.decode(token_to_blacklist, options={"verify_signature": False})
            expires_at = decoded.get("exp")
        except:
            pass  # Continue without expiry info
        
        # Blacklist the token
        success = blacklist_service.blacklist_token(
            token=token_to_blacklist,
            user_id=user_id,
            reason=request.reason,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        if success:
            logger.info(f"Token blacklisted for user {user_id}: {request.reason}")
            return BlacklistTokenResponse(
                success=True,
                message="Token successfully blacklisted",
                token_hash=blacklist_service._hash_token(token_to_blacklist)[:8]
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to blacklist token")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error blacklisting token: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/blacklist-user/{user_id}", response_model=BlacklistTokenResponse)
async def blacklist_user_tokens(
    user_id: str,
    reason: str = Query("admin_action", description="Reason for blacklisting"),
    current_admin: Dict[str, Any] = Depends(get_current_admin_user)
):
    """
    Blacklist all tokens for a specific user (admin only)
    """
    blacklist_service = get_token_blacklist()
    if not blacklist_service:
        raise HTTPException(status_code=503, detail="Token blacklist service not available")
    
    try:
        blacklisted_count = blacklist_service.blacklist_user_tokens(
            user_id=user_id,
            reason=reason
        )
        
        logger.warning(f"Admin {current_admin.get('user_id')} blacklisted {blacklisted_count} tokens for user {user_id}: {reason}")
        
        return BlacklistTokenResponse(
            success=True,
            message=f"Blacklisted {blacklisted_count} tokens for user",
            blacklisted_count=blacklisted_count
        )
        
    except Exception as e:
        logger.error(f"Error blacklisting user tokens: {e}")
        raise HTTPException(status_code=500, detail="Failed to blacklist user tokens")


@router.get("/check", response_model=TokenInfoResponse)
async def check_token_blacklist(
    http_request: Request,
    token: Optional[str] = Query(None, description="Token to check (uses current if not provided)"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Check if a token is blacklisted
    """
    blacklist_service = get_token_blacklist()
    if not blacklist_service:
        raise HTTPException(status_code=503, detail="Token blacklist service not available")
    
    try:
        # Use provided token or current user's token
        check_token = token
        if not check_token:
            auth_header = http_request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                check_token = auth_header[7:]
            else:
                raise HTTPException(status_code=400, detail="No token provided")
        
        # Check blacklist
        is_blacklisted = blacklist_service.is_token_blacklisted(check_token)
        blacklist_entry = None
        
        if is_blacklisted:
            entry = blacklist_service.get_blacklist_entry(check_token)
            if entry:
                blacklist_entry = {
                    "user_id": entry.user_id,
                    "reason": entry.reason,
                    "blacklisted_at": entry.blacklisted_at,
                    "expires_at": entry.expires_at
                }
        
        # Try to decode token info (without verification)
        token_info = None
        try:
            decoded = jwt.decode(check_token, options={"verify_signature": False})
            token_info = {
                "sub": decoded.get("sub"),
                "exp": decoded.get("exp"),
                "iat": decoded.get("iat"),
                "iss": decoded.get("iss")
            }
        except:
            pass
        
        return TokenInfoResponse(
            is_blacklisted=is_blacklisted,
            blacklist_entry=blacklist_entry,
            token_info=token_info
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking token blacklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to check token")


@router.delete("/unblock", response_model=BlacklistTokenResponse)
async def unblock_token(
    token: str = Query(..., description="Token to unblock"),
    current_admin: Dict[str, Any] = Depends(get_current_admin_user)
):
    """
    Remove token from blacklist (admin only)
    """
    blacklist_service = get_token_blacklist()
    if not blacklist_service:
        raise HTTPException(status_code=503, detail="Token blacklist service not available")
    
    try:
        success = blacklist_service.remove_from_blacklist(token)
        
        if success:
            logger.info(f"Admin {current_admin.get('user_id')} unblocked token")
            return BlacklistTokenResponse(
                success=True,
                message="Token successfully unblocked"
            )
        else:
            raise HTTPException(status_code=404, detail="Token not found in blacklist")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unblocking token: {e}")
        raise HTTPException(status_code=500, detail="Failed to unblock token")


@router.get("/user/{user_id}", response_model=List[Dict[str, Any]])
async def get_user_blacklisted_tokens(
    user_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get blacklisted tokens for a user
    
    - Users can only see their own tokens
    - Admins can see any user's tokens
    """
    blacklist_service = get_token_blacklist()
    if not blacklist_service:
        raise HTTPException(status_code=503, detail="Token blacklist service not available")
    
    # Check permissions
    current_user_id = current_user.get("user_id") or current_user.get("id")
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    
    if not is_admin and current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Can only view your own blacklisted tokens")
    
    try:
        tokens = blacklist_service.get_user_blacklisted_tokens(user_id)
        
        # Remove sensitive information for non-admin users
        if not is_admin:
            for token in tokens:
                token.pop('ip_address', None)
                token.pop('user_agent', None)
        
        return tokens
        
    except Exception as e:
        logger.error(f"Error getting user blacklisted tokens: {e}")
        raise HTTPException(status_code=500, detail="Failed to get blacklisted tokens")


@router.get("/stats", response_model=BlacklistStatsResponse)
async def get_blacklist_stats(
    current_admin: Dict[str, Any] = Depends(get_current_admin_user)
):
    """
    Get blacklist statistics (admin only)
    """
    blacklist_service = get_token_blacklist()
    if not blacklist_service:
        raise HTTPException(status_code=503, detail="Token blacklist service not available")
    
    try:
        stats = blacklist_service.get_blacklist_stats()
        return BlacklistStatsResponse(**stats)
        
    except Exception as e:
        logger.error(f"Error getting blacklist stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")


@router.post("/cleanup", response_model=Dict[str, Any])
async def cleanup_expired_entries(
    current_admin: Dict[str, Any] = Depends(get_current_admin_user)
):
    """
    Clean up expired blacklist entries (admin only)
    """
    blacklist_service = get_token_blacklist()
    if not blacklist_service:
        raise HTTPException(status_code=503, detail="Token blacklist service not available")
    
    try:
        cleaned_count = blacklist_service.cleanup_expired_entries()
        
        logger.info(f"Admin {current_admin.get('user_id')} cleaned up {cleaned_count} expired blacklist entries")
        
        return {
            "message": f"Cleaned up {cleaned_count} expired entries",
            "cleaned_count": cleaned_count
        }
        
    except Exception as e:
        logger.error(f"Error cleaning up blacklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to cleanup blacklist")