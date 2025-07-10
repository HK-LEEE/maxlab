from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Request, Query as QueryParam
from app.core.security import get_current_user
from app.services import ExternalAPIService

router = APIRouter(prefix="/external", tags=["external"])
external_api = ExternalAPIService()


@router.get("/groups", response_model=List[Dict[str, Any]])
async def get_groups(
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get list of groups from maxplatform."""
    try:
        # Get the token from request headers
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
        
        print(f"🔍 External groups request from user: {current_user.get('email', 'unknown')}")
        print(f"🔑 Token available: {'Yes' if token else 'No'}")
        
        if not token:
            print("❌ No authorization token found in request")
            return []
        
        groups = await external_api.get_groups(token)
        print(f"📊 Returning {len(groups)} groups to frontend")
        return groups
        
    except Exception as e:
        print(f"💥 Error in get_groups endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return []


@router.get("/users/search", response_model=List[Dict[str, Any]])
async def search_users(
    q: str = QueryParam(..., min_length=1, description="Search query"),
    request: Request = None,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Search users from maxplatform."""
    try:
        # Get the token from request headers
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
        
        print(f"🔍 External user search request from user: {current_user.get('email', 'unknown')}")
        print(f"🔍 Search query: '{q}'")
        print(f"🔑 Token available: {'Yes' if token else 'No'}")
        
        if not token:
            print("❌ No authorization token found in request")
            return []
        
        if not q or len(q.strip()) < 1:
            print("❌ Search query is empty or too short")
            return []
        
        users = await external_api.search_users(token, q.strip())
        print(f"📊 Returning {len(users)} users to frontend")
        return users
        
    except Exception as e:
        print(f"💥 Error in search_users endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return []


@router.get("/groups/search", response_model=List[Dict[str, Any]])
async def search_groups(
    q: str = QueryParam(..., min_length=1, description="Search query"),
    request: Request = None,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Search groups from maxplatform."""
    try:
        # Get the token from request headers
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
        
        print(f"🔍 External group search request from user: {current_user.get('email', 'unknown')}")
        print(f"🔍 Search query: '{q}'")
        print(f"🔑 Token available: {'Yes' if token else 'No'}")
        
        if not token:
            print("❌ No authorization token found in request")
            return []
        
        if not q or len(q.strip()) < 1:
            print("❌ Search query is empty or too short")
            return []
        
        # For groups, we get all groups and filter by search query
        all_groups = await external_api.get_groups(token)
        filtered_groups = [
            group for group in all_groups 
            if q.lower() in group.get('name', '').lower() or 
               q.lower() in group.get('display_name', '').lower()
        ]
        
        print(f"📊 Returning {len(filtered_groups)} filtered groups to frontend")
        return filtered_groups
        
    except Exception as e:
        print(f"💥 Error in search_groups endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return []