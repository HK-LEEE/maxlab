from fastapi import APIRouter, HTTPException, status, Header
import httpx
from app.core.config import settings
from typing import Optional

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def proxy_me(authorization: Optional[str] = Header(None)):
    """
    Proxy user info request to maxplatform authentication server.
    This supports both OAuth userinfo and traditional auth endpoints.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required"
        )
    
    async with httpx.AsyncClient() as client:
        try:
            # First try OAuth userinfo endpoint
            oauth_response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/oauth/userinfo",
                headers={"Authorization": authorization},
                timeout=httpx.Timeout(10.0)
            )
            
            if oauth_response.status_code == 200:
                oauth_data = oauth_response.json()
                
                # Safe group processing
                groups = []
                for g in oauth_data.get("groups", []):
                    if isinstance(g, dict):
                        groups.append(g.get("name", g.get("display_name", str(g))))
                    else:
                        groups.append(str(g))
                
                # Convert OAuth userinfo to traditional format for compatibility
                return {
                    "user_id": oauth_data.get("sub") or oauth_data.get("id"),
                    "username": oauth_data.get("display_name") or oauth_data.get("username"),
                    "email": oauth_data.get("email"),
                    "full_name": oauth_data.get("real_name") or oauth_data.get("full_name"),
                    "is_active": True,
                    "is_admin": oauth_data.get("is_admin", False),
                    "role": "admin" if oauth_data.get("is_admin", False) else "user",
                    "groups": groups,
                    "auth_type": "oauth"
                }
            
            # Fallback to traditional auth endpoint
            response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/auth/me",
                headers={"Authorization": authorization},
                timeout=httpx.Timeout(10.0)
            )
            
            if response.status_code == 200:
                data = response.json()
                data["auth_type"] = "traditional"
                return data
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Failed to get user info")
                )
                
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Cannot connect to authentication server: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"User info error: {str(e)}"
            )