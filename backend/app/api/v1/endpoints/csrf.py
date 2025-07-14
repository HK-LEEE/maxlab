"""
CSRF Token Management API Endpoints
Provides endpoints for CSRF token generation and validation
"""

from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel
from typing import Dict, Any
import logging

from ....middleware.csrf_protection import get_csrf_token_from_request
from ....core.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

class CSRFTokenResponse(BaseModel):
    token: str
    cookie_name: str
    header_name: str

class CSRFValidationResponse(BaseModel):
    valid: bool
    message: str

@router.get("/token", response_model=CSRFTokenResponse)
async def get_csrf_token(request: Request):
    """
    Get CSRF token for client-side usage
    This endpoint is exempt from CSRF protection to allow initial token retrieval
    """
    try:
        # Get or generate CSRF token
        csrf_middleware = None
        for middleware in request.app.middleware_stack:
            if hasattr(middleware, 'cls') and hasattr(middleware.cls, 'get_csrf_token'):
                csrf_middleware = middleware.cls
                break
        
        if csrf_middleware:
            token = csrf_middleware.get_csrf_token(request)
        else:
            # Fallback: get from cookie if middleware not found
            token = request.cookies.get('csrf_token', 'token-not-available')
        
        return CSRFTokenResponse(
            token=token,
            cookie_name="csrf_token",
            header_name="X-CSRF-Token"
        )
        
    except Exception as e:
        logger.error(f"Error getting CSRF token: {e}")
        # Return a placeholder response to avoid breaking the client
        return CSRFTokenResponse(
            token="error-generating-token",
            cookie_name="csrf_token", 
            header_name="X-CSRF-Token"
        )

@router.post("/validate", response_model=CSRFValidationResponse)
async def validate_csrf_token(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Validate CSRF token (for debugging/testing purposes)
    This endpoint requires authentication and CSRF protection
    """
    try:
        token = get_csrf_token_from_request(request)
        
        if not token:
            return CSRFValidationResponse(
                valid=False,
                message="No CSRF token found in request"
            )
        
        # If we reach here, the middleware already validated the token
        return CSRFValidationResponse(
            valid=True,
            message="CSRF token is valid"
        )
        
    except Exception as e:
        logger.error(f"Error validating CSRF token: {e}")
        return CSRFValidationResponse(
            valid=False,
            message=f"Error validating token: {str(e)}"
        )

@router.get("/status")
async def get_csrf_status(request: Request) -> Dict[str, Any]:
    """
    Get CSRF protection status and configuration
    (for debugging and monitoring purposes)
    """
    try:
        current_token = get_csrf_token_from_request(request)
        cookie_token = request.cookies.get('csrf_token')
        header_token = request.headers.get('X-CSRF-Token')
        
        return {
            "csrf_protection_enabled": True,
            "has_csrf_cookie": bool(cookie_token),
            "has_csrf_header": bool(header_token),
            "tokens_match": current_token == cookie_token if current_token and cookie_token else False,
            "request_method": request.method,
            "exempt_from_csrf": request.method in {"GET", "HEAD", "OPTIONS", "TRACE"},
            "cookie_name": "csrf_token",
            "header_name": "X-CSRF-Token"
        }
        
    except Exception as e:
        logger.error(f"Error getting CSRF status: {e}")
        return {
            "csrf_protection_enabled": False,
            "error": str(e)
        }