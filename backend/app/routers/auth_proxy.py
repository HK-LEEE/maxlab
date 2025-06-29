from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
import httpx
from app.core.config import settings
from typing import Optional

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def proxy_login(credentials: LoginRequest):
    """
    Proxy login request to maxplatform authentication server.
    This avoids CORS issues by making the request server-side.
    """
    async with httpx.AsyncClient() as client:
        try:
            # Forward the login request to maxplatform
            response = await client.post(
                f"{settings.AUTH_SERVER_URL}/api/auth/login",
                json=credentials.model_dump(),
                timeout=httpx.Timeout(10.0)
            )
            
            # Return the response as-is
            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Authentication failed")
                )
                
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Cannot connect to authentication server: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Authentication error: {str(e)}"
            )


@router.get("/me")
async def proxy_me(authorization: Optional[str] = Header(None)):
    """
    Proxy user info request to maxplatform authentication server.
    This avoids CORS issues by making the request server-side.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required"
        )
    
    async with httpx.AsyncClient() as client:
        try:
            # Forward the me request to maxplatform with the authorization header
            response = await client.get(
                f"{settings.AUTH_SERVER_URL}/api/auth/me",
                headers={"Authorization": authorization},
                timeout=httpx.Timeout(10.0)
            )
            
            # Return the response as-is
            if response.status_code == 200:
                return response.json()
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