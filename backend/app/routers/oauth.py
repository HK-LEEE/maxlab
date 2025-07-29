"""
OAuth 관련 라우터
토큰 폐기(revoke) 등 OAuth 관련 엔드포인트를 제공합니다.
"""
from fastapi import APIRouter, HTTPException, status, Request, Form
from fastapi.responses import JSONResponse
import httpx
from typing import Dict, Any, Optional
import logging
import jwt
import time

from ..core.config import settings
from ..services.token_blacklist import get_token_blacklist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])


@router.post("/revoke")
async def revoke_token(
    request: Request,
    token: str = Form(..., description="취소할 토큰"),
    token_type_hint: Optional[str] = Form(None, description="access_token 또는 refresh_token"),
    client_id: str = Form(..., description="클라이언트 ID"),
    client_secret: Optional[str] = Form(None, description="클라이언트 시크릿 (기밀 클라이언트의 경우)")
):
    """
    OAuth 2.0 Token Revocation (RFC 7009)
    
    Access Token과 Refresh Token 모두 취소를 지원합니다.
    MAX Platform의 /api/oauth/revoke 엔드포인트와 호환됩니다.
    """
    try:
        
        logger.info(f"Token revoke request - client_id: {client_id}, token_type: {token_type_hint or 'auto'}")
        
        # 토큰 타입 자동 감지 (힌트가 없는 경우)
        if not token_type_hint:
            try:
                # JWT 토큰 디코드 (서명 검증 없이)
                decoded = jwt.decode(token, options={"verify_signature": False})
                
                # token_use claim 확인 또는 타임스탬프 기반 추측
                if "token_use" in decoded:
                    token_type_hint = decoded["token_use"]
                elif "refresh_token" in decoded:
                    token_type_hint = "refresh_token"
                else:
                    # 만료 시간으로 판단 (refresh token은 보통 더 길다)
                    exp = decoded.get("exp", 0)
                    if exp - time.time() > 86400:  # 1일 이상 남은 경우
                        token_type_hint = "refresh_token"
                    else:
                        token_type_hint = "access_token"
                        
                logger.info(f"Auto-detected token type: {token_type_hint}")
            except:
                # 디코드 실패 시 기본값
                token_type_hint = "access_token"
        
        # 토큰 블랙리스트 서비스 가져오기
        blacklist_service = get_token_blacklist()
        
        # MAX Platform OAuth 서버에 revoke 요청
        revoke_endpoint = f"{settings.AUTH_SERVER_URL}/api/oauth/revoke"
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            try:
                # 요청 데이터 준비
                revoke_data = {
                    "token": token,
                    "token_type_hint": token_type_hint,
                    "client_id": client_id
                }
                
                # 기밀 클라이언트의 경우 client_secret 추가
                if client_secret:
                    revoke_data["client_secret"] = client_secret
                
                response = await client.post(
                    revoke_endpoint,
                    data=revoke_data
                )
                
                if response.status_code == 200:
                    logger.info(f"Token successfully revoked on MAX Platform OAuth server ({token_type_hint})")
                else:
                    logger.warning(f"OAuth server returned {response.status_code}: {response.text}")
                    
            except httpx.TimeoutException:
                logger.warning("Timeout while revoking token on OAuth server")
            except Exception as e:
                logger.warning(f"Failed to revoke token on OAuth server: {e}")
        
        # 로컬 블랙리스트에 토큰 추가 (보호 계층)
        if blacklist_service:
            # 토큰에서 user_id 추출 시도
            user_id = None
            exp_time = None
            try:
                decoded = jwt.decode(token, options={"verify_signature": False})
                user_id = decoded.get("sub") or decoded.get("user_id")
                exp_time = decoded.get("exp")
            except:
                # 토큰 디코딩 실패 시 user_id 없이 진행
                pass
            
            # 토큰 타입에 따른 이유 설정
            reason = f"{token_type_hint}_revoked" if token_type_hint else "token_revoked"
            
            blacklist_service.blacklist_token(
                token=token,
                user_id=user_id or "unknown",
                reason=reason,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("User-Agent"),
                expires_at=exp_time  # 토큰 만료 시간 저장
            )
            logger.info(f"{token_type_hint or 'Token'} added to local blacklist for user {user_id or 'unknown'}")
        
        # OAuth 2.0 RFC 7009에 따라 항상 200 OK 반환
        # 성공 여부와 관계없이 200 OK를 반환하여 보안 정보 노출 방지
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={}
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