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
                    print(f"🔍 Raw response type: {type(result)}")
                    if isinstance(result, dict):
                        print(f"🔍 Response keys: {list(result.keys())}")
                    
                    # Handle both direct list and paginated response formats
                    if isinstance(result, dict) and "items" in result:
                        groups = result["items"]
                    elif isinstance(result, dict) and "groups" in result:
                        groups = result["groups"]
                    elif isinstance(result, list):
                        groups = result
                    else:
                        groups = []
                        print(f"⚠️ Unexpected response format: {result}")
                    
                    print(f"✅ Success! Found {len(groups)} groups")
                    
                    # Log the structure of the first group for debugging
                    if groups and len(groups) > 0:
                        print(f"🔍 First group data structure: {groups[0]}")
                        print(f"🔍 Group keys: {list(groups[0].keys()) if isinstance(groups[0], dict) else 'Not a dict'}")
                        
                        # 외부 서버에 display_name이 있으면 사용, 없으면 name 사용
                        for group in groups:
                            if isinstance(group, dict) and 'display_name' not in group:
                                group['display_name'] = group.get('name', 'Unknown')
                                print(f"📝 Group {group.get('name', 'unknown')}: No display_name, using name as fallback: {group['display_name']}")
                    
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
                    
                    # 사용자도 display_name이 없으면 다른 필드 사용
                    for user in users:
                        if isinstance(user, dict) and 'display_name' not in user:
                            user['display_name'] = user.get('full_name', user.get('username', user.get('email', 'Unknown')))
                    
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