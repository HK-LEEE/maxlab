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
        """Get list of groups from maxplatform using /admin/groups endpoint."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                print(f"🔍 Getting groups from {self.base_url}")
                print(f"🔑 Using token: {token[:20]}..." if token else "❌ No token provided")
                
                # Use the correct endpoint: /admin/groups
                endpoint = "/admin/groups"
                full_url = f"{self.base_url}{endpoint}"
                print(f"🌐 Using admin groups endpoint: {full_url}")
                
                response = await client.get(
                    full_url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    }
                )
                
                print(f"📊 Response status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    # Handle both direct list and paginated response formats
                    if isinstance(result, dict) and "items" in result:
                        groups = result["items"]
                    elif isinstance(result, dict) and "groups" in result:
                        groups = result["groups"]
                    elif isinstance(result, list):
                        groups = result
                    else:
                        groups = []
                    
                    print(f"✅ Success! Found {len(groups)} groups")
                    return groups
                else:
                    print(f"⚠️ Status {response.status_code}: {response.text[:200]}")
                    return []
                
            except Exception as e:
                print(f"💥 Critical error in get_groups: {str(e)}")
                import traceback
                traceback.print_exc()
                return []
    
    async def search_users(self, token: str, query: str) -> List[Dict[str, Any]]:
        """Search users from maxplatform using /admin/users endpoint."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                print(f"🔍 Searching users with query: '{query}' at {self.base_url}")
                print(f"🔑 Using token: {token[:20]}..." if token else "❌ No token provided")
                
                # Use the correct endpoint: /admin/users with search parameter
                endpoint = "/admin/users"
                full_url = f"{self.base_url}{endpoint}"
                print(f"🌐 Using admin users endpoint: {full_url}")
                
                response = await client.get(
                    full_url,
                    params={"search": query, "limit": 50},  # Use search parameter as documented
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    }
                )
                
                print(f"📊 Response status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    # Handle both direct list and paginated response formats
                    if isinstance(result, dict) and "items" in result:
                        users = result["items"]
                    elif isinstance(result, dict) and "users" in result:
                        users = result["users"]
                    elif isinstance(result, list):
                        users = result
                    else:
                        users = []
                    
                    print(f"✅ Success! Found {len(users)} users")
                    return users
                else:
                    print(f"⚠️ Status {response.status_code}: {response.text[:200]}")
                    return []
                
            except Exception as e:
                print(f"💥 Critical error in search_users: {str(e)}")
                import traceback
                traceback.print_exc()
                return []
    
    async def validate_group_exists(self, token: str, group_id: str) -> bool:
        """Check if a group exists in maxplatform."""
        groups = await self.get_groups(token)
        return any(g.get("id") == group_id for g in groups)
    
    async def validate_user_exists(self, token: str, user_id: str) -> bool:
        """Check if a user exists in maxplatform."""
        users = await self.search_users(token, user_id)
        return any(u.get("id") == user_id for u in users)