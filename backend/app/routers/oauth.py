"""
OAuth 관련 라우터
토큰 폐기(revoke) 등 OAuth 관련 엔드포인트를 제공합니다.
"""
from fastapi import APIRouter, HTTPException, status, Request
from fastapi.responses import JSONResponse
import httpx
from typing import Dict, Any
import logging
import jwt

from ..core.config import settings
from ..services.token_blacklist import get_token_blacklist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.post("/revoke")
async def revoke_token(request: Request):
    """
    OAuth 토큰 폐기 엔드포인트
    
    프론트엔드에서 로그아웃 시 refresh token을 폐기하기 위해 호출됩니다.
    실제 OAuth 서버가 revoke 엔드포인트를 제공하지 않는 경우,
    로컬 블랙리스트에 추가하여 처리합니다.
    """
    try:
        # Form data 파싱
        form_data = await request.form()
        token = form_data.get("token")
        token_type_hint = form_data.get("token_type_hint", "refresh_token")
        client_id = form_data.get("client_id")
        
        logger.info(f"Token revoke request - client_id: {client_id}, token_type: {token_type_hint}")
        
        if not token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token is required"
            )
        
        # 토큰 블랙리스트 서비스 가져오기
        blacklist_service = get_token_blacklist()
        
        # 외부 OAuth 서버에 revoke 요청 시도 (있는 경우)
        if hasattr(settings, 'OAUTH_REVOKE_ENDPOINT') and settings.OAUTH_REVOKE_ENDPOINT:
            async with httpx.AsyncClient() as client:
                try:
                    response = await client.post(
                        settings.OAUTH_REVOKE_ENDPOINT,
                        data={
                            "token": token,
                            "token_type_hint": token_type_hint,
                            "client_id": client_id
                        },
                        timeout=httpx.Timeout(5.0)
                    )
                    
                    if response.status_code == 200:
                        logger.info("Token successfully revoked on OAuth server")
                except Exception as e:
                    logger.warning(f"Failed to revoke token on OAuth server: {e}")
                    # Continue with local blacklist
        
        # 로컬 블랙리스트에 토큰 추가
        if blacklist_service:
            # 토큰에서 user_id 추출 시도
            user_id = None
            try:
                decoded = jwt.decode(token, options={"verify_signature": False})
                user_id = decoded.get("sub") or decoded.get("user_id")
            except:
                # 토큰 디코딩 실패 시 user_id 없이 진행
                pass
            
            blacklist_service.blacklist_token(
                token=token,
                user_id=user_id or "unknown",
                reason="logout",
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("User-Agent")
            )
            logger.info(f"Token added to local blacklist for user {user_id or 'unknown'}")
        
        # OAuth 2.0 RFC 7009에 따라 항상 200 OK 반환
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "success"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking token: {e}")
        # RFC 7009: 오류가 발생해도 200 OK 반환
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "success"}
        )