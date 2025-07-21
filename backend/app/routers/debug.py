"""
Debug endpoints for testing permission issues
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
import logging

from ..core.database import get_db
from ..core.security import get_current_active_user
from ..crud.workspace import workspace_crud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/debug", tags=["Debug"])

@router.get("/user-info")
async def debug_user_info(
    current_user: Dict[str, Any] = Depends(get_current_active_user)
):
    """Get detailed current user information for debugging"""
    return {
        "user_id": current_user.get("user_id"),
        "username": current_user.get("username"),
        "email": current_user.get("email"),
        "is_admin": current_user.get("is_admin", False),
        "role": current_user.get("role"),
        "groups": current_user.get("groups", []),
        "user_uuid": str(current_user.get("user_uuid")) if current_user.get("user_uuid") else None,
        "group_uuids": [str(g) for g in current_user.get("group_uuids", [])],
        "auth_type": current_user.get("auth_type"),
        "permissions": current_user.get("permissions", [])
    }

@router.get("/workspace-permissions")
async def debug_workspace_permissions(
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Debug workspace permissions filtering"""
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    user_uuid = current_user.get("user_uuid")
    user_group_uuids = current_user.get("group_uuids", [])
    
    # Test filtering
    filtered_workspaces = await workspace_crud.get_multi(
        db=db,
        skip=0,
        limit=100,
        active_only=True,
        user_uuid=user_uuid,
        user_group_uuids=user_group_uuids,
        is_admin=is_admin
    )
    
    # Get all workspaces (as admin)
    all_workspaces = await workspace_crud.get_multi(
        db=db,
        skip=0,
        limit=100,
        active_only=True,
        is_admin=True
    )
    
    return {
        "debug_info": {
            "is_admin": is_admin,
            "user_uuid": str(user_uuid) if user_uuid else None,
            "user_group_uuids": [str(g) for g in user_group_uuids],
            "is_admin_type": type(is_admin).__name__,
            "is_admin_value": repr(is_admin)
        },
        "filtering_results": {
            "total_workspaces_in_db": len(all_workspaces),
            "workspaces_visible_to_user": len(filtered_workspaces),
            "should_filter": not is_admin,
            "filtering_applied": len(filtered_workspaces) < len(all_workspaces) if not is_admin else "N/A"
        },
        "sample_workspaces": {
            "all": [{"id": str(ws.id), "name": ws.name} for ws in all_workspaces[:3]],
            "filtered": [{"id": str(ws.id), "name": ws.name} for ws in filtered_workspaces[:3]]
        }
    }