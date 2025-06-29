from typing import List, Dict, Any, Optional
import httpx
from fastapi import HTTPException, status
from app.core.config import settings


class ExternalAPIService:
    """Service for communicating with external APIs (maxplatform)."""
    
    def __init__(self):
        self.base_url = settings.AUTH_SERVER_URL
        self.timeout = httpx.Timeout(10.0, connect=5.0)
    
    async def get_groups(self, token: str) -> List[Dict[str, Any]]:
        """Get list of groups from maxplatform."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/api/v1/groups",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                if response.status_code == 404:
                    # If not found, return empty list
                    print(f"Groups endpoint not found at {self.base_url}/api/v1/groups")
                    return []
                    
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                print(f"External API error: {str(e)}")
                # Return empty list instead of raising error
                return []
    
    async def search_users(self, token: str, query: str) -> List[Dict[str, Any]]:
        """Search users from maxplatform."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                # First try the standard endpoint
                response = await client.get(
                    f"{self.base_url}/api/v1/users/search",
                    params={"q": query},
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                if response.status_code == 404:
                    # If not found, return empty list with informative message
                    print(f"User search endpoint not found at {self.base_url}/api/v1/users/search")
                    return []
                    
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                print(f"External API error: {str(e)}")
                # Return empty list instead of raising error
                return []
    
    async def validate_group_exists(self, token: str, group_id: str) -> bool:
        """Check if a group exists in maxplatform."""
        groups = await self.get_groups(token)
        return any(g.get("id") == group_id for g in groups)
    
    async def validate_user_exists(self, token: str, user_id: str) -> bool:
        """Check if a user exists in maxplatform."""
        users = await self.search_users(token, user_id)
        return any(u.get("id") == user_id for u in users)