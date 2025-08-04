"""
OAuth 관련 라우터
토큰 폐기(revoke) 등 OAuth 관련 엔드포인트를 제공합니다.
"""
from fastapi import APIRouter, HTTPException, status, Request, Form, Query, Header
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
import httpx
from typing import Dict, Any, Optional, List
import logging
import jwt
import time
from urllib.parse import urlparse
import re

from ..core.config import settings
from ..services.token_blacklist import get_token_blacklist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

# 🔒 SECURITY: Allowed redirect URI patterns for strict validation
ALLOWED_REDIRECT_PATTERNS = [
    r"^http://localhost:301[0-9]/oauth/callback$",  # Frontend callback (3010-3019)
    r"^http://localhost:301[0-9]/$",  # Frontend root
    r"^http://localhost:301[0-9]/login$",  # Frontend login
    r"^https://[a-zA-Z0-9-]+\.maxlab\.io/oauth/callback$",  # Production domain
    r"^https://[a-zA-Z0-9-]+\.maxlab\.io/$",  # Production root
]

def validate_redirect_uri(redirect_uri: str) -> bool:
    """
    🔒 SECURITY: Strict redirect URI validation
    
    Validates redirect URIs against allowed patterns to prevent:
    - Open redirect attacks
    - Unauthorized redirect URI injection
    - Cross-origin security bypasses
    """
    if not redirect_uri:
        return False
    
    try:
        # Basic URL parsing validation
        parsed = urlparse(redirect_uri)
        if not parsed.scheme or not parsed.netloc:
            logger.warning(f"Invalid redirect URI format: {redirect_uri}")
            return False
        
        # Check against allowed patterns
        for pattern in ALLOWED_REDIRECT_PATTERNS:
            if re.match(pattern, redirect_uri):
                logger.info(f"Redirect URI validated: {redirect_uri}")
                return True
        
        logger.warning(f"Redirect URI not in allowlist: {redirect_uri}")
        return False
        
    except Exception as e:
        logger.error(f"Redirect URI validation error: {e}")
        return False

def get_trusted_origins() -> List[str]:
    """
    🔒 SECURITY: Get list of trusted origins for CORS validation
    """
    return [
        "http://localhost:3010",  # Frontend
        "http://localhost:3011",  # Frontend dev
        "http://localhost:3012",  # Frontend staging
        "http://localhost:8000",  # OAuth server
        "http://localhost:8010",  # Backend API
        "https://maxlab.io",      # Production
        "https://app.maxlab.io",  # Production app
    ]


@router.post("/token")
async def oauth_token_exchange(
    request: Request,
    grant_type: str = Form(..., description="인증 유형 (authorization_code)"),
    code: str = Form(..., description="Authorization code"),
    redirect_uri: str = Form(..., description="리다이렉트 URI"),
    client_id: str = Form(..., description="클라이언트 ID"),
    code_verifier: str = Form(..., description="PKCE code verifier"),
    client_secret: Optional[str] = Form(None, description="클라이언트 시크릿")
):
    """
    OAuth 2.0 Authorization Code Exchange Endpoint
    
    Authorization code를 access token으로 교환합니다.
    MAX Platform OAuth 서버의 /api/oauth/token 엔드포인트와 호환됩니다.
    """
    try:
        logger.info(f"OAuth token exchange - grant_type: {grant_type}, client_id: {client_id}")
        
        # Grant type 검증
        if grant_type != "authorization_code":
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "unsupported_grant_type",
                    "error_description": "Only authorization_code grant type is supported"
                }
            )
        
        # 🔒 SECURITY: Validate redirect URI
        if not validate_redirect_uri(redirect_uri):
            logger.warning(f"Invalid redirect URI in token exchange: {redirect_uri}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "invalid_redirect_uri",
                    "error_description": "Redirect URI is not in the allowed list"
                }
            )
        
        # MAX Platform OAuth 서버에 토큰 교환 요청
        token_endpoint = f"{settings.AUTH_SERVER_URL}/api/oauth/token"
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            try:
                # 토큰 교환 데이터 준비
                token_data = {
                    "grant_type": grant_type,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": client_id,
                    "code_verifier": code_verifier
                }
                
                # 기밀 클라이언트의 경우 client_secret 추가
                if client_secret:
                    token_data["client_secret"] = client_secret
                
                logger.info(f"Requesting token exchange from OAuth server: {token_endpoint}")
                
                # OAuth 서버에 토큰 교환 요청
                response = await client.post(
                    token_endpoint,
                    data=token_data,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json"
                    }
                )
                
                if response.status_code == 200:
                    token_response = response.json()
                    logger.info("Token exchange successful")
                    
                    # OAuth 2.0 표준 응답 형식으로 반환
                    return JSONResponse(
                        status_code=status.HTTP_200_OK,
                        content=token_response,
                        headers={
                            "Cache-Control": "no-store",
                            "Pragma": "no-cache"
                        }
                    )
                else:
                    logger.error(f"OAuth server token exchange failed: {response.status_code} - {response.text}")
                    
                    # OAuth 서버의 에러 응답을 그대로 전달
                    try:
                        error_response = response.json()
                    except:
                        error_response = {
                            "error": "server_error",
                            "error_description": f"OAuth server returned {response.status_code}"
                        }
                    
                    return JSONResponse(
                        status_code=response.status_code,
                        content=error_response
                    )
                    
            except httpx.TimeoutException:
                logger.error("Timeout during OAuth token exchange")
                return JSONResponse(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    content={
                        "error": "server_error",
                        "error_description": "OAuth server timeout"
                    }
                )
            except Exception as e:
                logger.error(f"Failed to contact OAuth server for token exchange: {e}")
                return JSONResponse(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    content={
                        "error": "server_error",
                        "error_description": "Failed to contact OAuth server"
                    }
                )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during OAuth token exchange: {e}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "server_error",
                "error_description": "Internal server error during token exchange"
            }
        )


@router.get("/userinfo")
async def oauth_userinfo(
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """
    OAuth 2.0 UserInfo Endpoint
    
    Access token을 사용하여 사용자 정보를 가져옵니다.
    MAX Platform OAuth 서버의 /api/oauth/userinfo 엔드포인트와 호환됩니다.
    """
    try:
        # Authorization 헤더에서 토큰 추출
        access_token = None
        
        if authorization:
            # Bearer 토큰 형식 확인
            if authorization.startswith("Bearer "):
                access_token = authorization[7:]  # "Bearer " 제거
            else:
                access_token = authorization
        
        if not access_token:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "error": "invalid_token",
                    "error_description": "Access token is required"
                },
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        # MAX Platform OAuth 서버에 사용자 정보 요청
        userinfo_endpoint = f"{settings.AUTH_SERVER_URL}/api/oauth/userinfo"
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            try:
                logger.info(f"Requesting user info from OAuth server: {userinfo_endpoint}")
                
                # OAuth 서버에 사용자 정보 요청
                response = await client.get(
                    userinfo_endpoint,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json"
                    }
                )
                
                if response.status_code == 200:
                    userinfo_response = response.json()
                    logger.info(f"UserInfo request successful for user: {userinfo_response.get('sub', 'unknown')}")
                    
                    return JSONResponse(
                        status_code=status.HTTP_200_OK,
                        content=userinfo_response,
                        headers={
                            "Cache-Control": "no-store",
                            "Pragma": "no-cache"
                        }
                    )
                else:
                    logger.error(f"OAuth server userinfo failed: {response.status_code} - {response.text}")
                    
                    # OAuth 서버의 에러 응답을 그대로 전달
                    if response.status_code == 401:
                        return JSONResponse(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            content={
                                "error": "invalid_token",
                                "error_description": "Access token is invalid or expired"
                            },
                            headers={"WWW-Authenticate": "Bearer"}
                        )
                    else:
                        try:
                            error_response = response.json()
                        except:
                            error_response = {
                                "error": "server_error",
                                "error_description": f"OAuth server returned {response.status_code}"
                            }
                        
                        return JSONResponse(
                            status_code=response.status_code,
                            content=error_response
                        )
                    
            except httpx.TimeoutException:
                logger.error("Timeout during OAuth userinfo request")
                return JSONResponse(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    content={
                        "error": "server_error",
                        "error_description": "OAuth server timeout"
                    }
                )
            except Exception as e:
                logger.error(f"Failed to contact OAuth server for userinfo: {e}")
                return JSONResponse(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    content={
                        "error": "server_error",
                        "error_description": "Failed to contact OAuth server"
                    }
                )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during OAuth userinfo request: {e}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "server_error",
                "error_description": "Internal server error during userinfo request"
            }
        )


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


@router.get("/validate-config")
async def validate_oauth_config():
    """
    🔒 SECURITY: OAuth Configuration Validation Endpoint
    
    Validates current OAuth configuration and returns security status.
    Used by frontend to detect and handle configuration mismatches.
    """
    try:
        config_status = {
            "auth_server_url": settings.AUTH_SERVER_URL,
            "client_id": settings.CLIENT_ID,
            "allowed_redirect_patterns": ALLOWED_REDIRECT_PATTERNS,
            "trusted_origins": get_trusted_origins(),
            "configuration_valid": True,
            "security_warnings": [],
            "recommendations": []
        }
        
        # Check for common configuration issues
        if settings.AUTH_SERVER_URL.startswith("http://localhost"):
            config_status["security_warnings"].append(
                "Using localhost OAuth server - ensure production uses HTTPS"
            )
        
        # Check if OAuth server is reachable
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(3.0)) as client:
                response = await client.get(f"{settings.AUTH_SERVER_URL}/health", timeout=3.0)
                config_status["oauth_server_reachable"] = response.status_code == 200
        except Exception:
            config_status["oauth_server_reachable"] = False
            config_status["security_warnings"].append(
                "OAuth server not reachable - authentication may fail"
            )
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=config_status
        )
        
    except Exception as e:
        logger.error(f"OAuth config validation error: {e}")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "configuration_valid": False,
                "error": str(e),
                "security_warnings": ["Configuration validation failed"],
                "recommendations": ["Check OAuth server configuration"]
            }
        )


@router.get("/logout")
async def oauth_logout(
    post_logout_redirect_uri: Optional[str] = Query(None, description="로그아웃 후 리다이렉트 URI"),
    client_id: Optional[str] = Query(None, description="클라이언트 ID"),
    state: Optional[str] = Query(None, description="상태 매개변수"),
):
    """
    OAuth 2.0 Provider Logout Endpoint
    
    OAuth 제공자(MAX Platform)에서 로그아웃하여 SSO 세션을 종료합니다.
    이것이 자동 재인증 문제를 해결하는 핵심 엔드포인트입니다.
    """
    try:
        logger.info(f"OAuth logout request - client_id: {client_id}, redirect_uri: {post_logout_redirect_uri}")
        
        # 🔒 SECURITY: Validate redirect URI before processing
        if post_logout_redirect_uri and not validate_redirect_uri(post_logout_redirect_uri):
            logger.warning(f"Invalid post-logout redirect URI rejected: {post_logout_redirect_uri}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "invalid_redirect_uri",
                    "error_description": "Post-logout redirect URI is not in the allowed list"
                }
            )
        
        # MAX Platform OAuth 서버에 로그아웃 요청 전달
        logout_params = {}
        if post_logout_redirect_uri:
            logout_params["post_logout_redirect_uri"] = post_logout_redirect_uri
        if client_id:
            logout_params["client_id"] = client_id
        if state:
            logout_params["state"] = state
            
        # MAX Platform OAuth 서버의 로그아웃 엔드포인트로 리다이렉트
        oauth_logout_url = f"{settings.AUTH_SERVER_URL}/api/oauth/logout"
        if logout_params:
            query_string = "&".join([f"{k}={v}" for k, v in logout_params.items()])
            oauth_logout_url = f"{oauth_logout_url}?{query_string}"
        
        logger.info(f"Redirecting to OAuth server logout: {oauth_logout_url}")
        
        # OAuth 제공자로 리다이렉트
        return RedirectResponse(
            url=oauth_logout_url,
            status_code=status.HTTP_302_FOUND
        )
        
    except Exception as e:
        logger.error(f"Error during OAuth logout: {e}")
        
        # 로그아웃이 실패해도 클라이언트를 적절한 페이지로 리다이렉트
        fallback_redirect = post_logout_redirect_uri or "/"
        
        # 팝업 모드에서 호출된 경우 메시지 전송
        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>OAuth Logout</title>
                <script>
                    // 팝업에서 호출된 경우 메시지 전송
                    if (window.opener) {{
                        window.opener.postMessage({{
                            type: 'OAUTH_LOGOUT_SUCCESS'
                        }}, '*');
                        window.close();
                    }} else {{
                        // 일반 페이지에서 호출된 경우 리다이렉트
                        window.location.href = '{fallback_redirect}';
                    }}
                </script>
            </head>
            <body>
                <p>Logging out...</p>
            </body>
            </html>
            """,
            status_code=status.HTTP_200_OK
        )


@router.post("/logout")
async def oauth_logout_post(
    request: Request,
    post_logout_redirect_uri: Optional[str] = Form(None, description="로그아웃 후 리다이렉트 URI"),
    client_id: Optional[str] = Form(None, description="클라이언트 ID"),
):
    """
    OAuth 2.0 Provider Logout Endpoint (POST 방식)
    
    POST 요청으로 OAuth 제공자 로그아웃을 처리합니다.
    """
    try:
        logger.info(f"OAuth logout POST request - client_id: {client_id}")
        
        # 🔒 SECURITY: Validate redirect URI before processing
        if post_logout_redirect_uri and not validate_redirect_uri(post_logout_redirect_uri):
            logger.warning(f"Invalid post-logout redirect URI rejected: {post_logout_redirect_uri}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "invalid_redirect_uri",
                    "error_description": "Post-logout redirect URI is not in the allowed list"
                }
            )
        
        # MAX Platform OAuth 서버에 로그아웃 요청
        logout_endpoint = f"{settings.AUTH_SERVER_URL}/api/oauth/logout"
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            try:
                logout_data = {}
                if post_logout_redirect_uri:
                    logout_data["post_logout_redirect_uri"] = post_logout_redirect_uri
                if client_id:
                    logout_data["client_id"] = client_id
                
                response = await client.post(logout_endpoint, data=logout_data)
                
                if response.status_code in [200, 302]:
                    logger.info("OAuth server logout successful")
                else:
                    logger.warning(f"OAuth server logout returned {response.status_code}: {response.text}")
                    
            except httpx.TimeoutException:
                logger.warning("Timeout during OAuth server logout")
            except Exception as e:
                logger.warning(f"Failed to contact OAuth server for logout: {e}")
        
        # 성공 응답 반환 (팝업 모드 지원)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "OAuth logout completed",
                "redirect_uri": post_logout_redirect_uri
            }
        )
        
    except Exception as e:
        logger.error(f"Error during OAuth logout POST: {e}")
        return JSONResponse(
            status_code=status.HTTP_200_OK,  # 로그아웃은 항상 성공으로 처리
            content={
                "success": True,
                "message": "OAuth logout attempted",
                "redirect_uri": post_logout_redirect_uri
            }
        )