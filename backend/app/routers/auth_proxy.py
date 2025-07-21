from fastapi import APIRouter, HTTPException, status, Header, Request
import httpx
from app.core.config import settings
from app.core.security import create_oauth_headers, validate_bearer_token, AuthenticationError
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def proxy_me(authorization: Optional[str] = Header(None)):
    """
    Proxy user info request to MAX Platform OAuth server (OAuth only).
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required"
        )
    
    try:
        # Extract token from "Bearer {token}" format
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header format"
            )
        
        token = authorization.split(" ", 1)[1]
        headers = create_oauth_headers(token)
        
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except IndexError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authorization header"
        )
    
    async with httpx.AsyncClient() as client:
        try:
            # OAuth userinfo endpoint only
            oauth_response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/oauth/userinfo",
                headers=headers,
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
                
                # Convert OAuth userinfo to internal format
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
            
            elif oauth_response.status_code == 401:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication failed: Invalid or expired token"
                )
            else:
                raise HTTPException(
                    status_code=oauth_response.status_code,
                    detail="OAuth authentication service error"
                )
                
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Cannot connect to OAuth server: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"OAuth authentication error: {str(e)}"
            )