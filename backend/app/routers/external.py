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
    # Get the token from request headers
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
    
    groups = await external_api.get_groups(token)
    return groups


@router.get("/users/search", response_model=List[Dict[str, Any]])
async def search_users(
    q: str = QueryParam(..., min_length=1, description="Search query"),
    request: Request = None,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Search users from maxplatform."""
    # Get the token from request headers
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
    
    users = await external_api.search_users(token, q)
    return users