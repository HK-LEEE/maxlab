from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Request, Query as QueryParam
from app.core.security import get_current_user
from app.services import ExternalAPIService

router = APIRouter(prefix="/admin", tags=["admin"])
external_api = ExternalAPIService()


@router.get("/groups", response_model=List[Dict[str, Any]])
async def get_admin_groups(
    request: Request,
    skip: int = QueryParam(0, ge=0),
    limit: int = QueryParam(100, ge=1, le=1000),
    search: str = QueryParam(None, description="Search query"),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get list of groups from maxplatform (proxy for frontend)."""
    try:
        # Get the token from request headers
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
        
        print(f"🔍 Admin groups request from user: {current_user.get('email', 'unknown')}")
        print(f"🔑 Token available: {'Yes' if token else 'No'}")
        
        if not token:
            print("❌ No authorization token found in request")
            return []
        
        groups = await external_api.get_groups(token)
        print(f"📊 Returning {len(groups)} groups to frontend")
        
        # Filter by search if provided
        if search:
            groups = [
                group for group in groups 
                if search.lower() in group.get('name', '').lower() or 
                   search.lower() in group.get('display_name', '').lower()
            ]
        
        return groups
        
    except Exception as e:
        print(f"💥 Error in get_admin_groups endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return []


@router.get("/users", response_model=List[Dict[str, Any]])
async def get_admin_users(
    request: Request,
    skip: int = QueryParam(0, ge=0),
    limit: int = QueryParam(100, ge=1, le=1000),
    search: str = QueryParam(None, description="Search query"),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get list of users from maxplatform (proxy for frontend)."""
    try:
        # Get the token from request headers
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
        
        print(f"🔍 Admin users request from user: {current_user.get('email', 'unknown')}")
        print(f"🔑 Token available: {'Yes' if token else 'No'}")
        
        if not token:
            print("❌ No authorization token found in request")
            return []
        
        users = await external_api.get_users(token, skip, limit)
        print(f"📊 Returning {len(users)} users to frontend")
        
        # Filter by search if provided
        if search:
            users = [
                user for user in users 
                if search.lower() in user.get('email', '').lower() or 
                   search.lower() in user.get('full_name', '').lower() or
                   search.lower() in user.get('username', '').lower() or
                   search.lower() in user.get('display_name', '').lower()
            ]
        
        return users
        
    except Exception as e:
        print(f"💥 Error in get_admin_users endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return []