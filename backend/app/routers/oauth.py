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
    r"^http://localhost:301[0-9]/login(\?.*)?$",  # Frontend login (with optional query params for logout)
    r"^https://[a-zA-Z0-9-]+\.maxlab\.io/oauth/callback$",  # Production domain (maxlab.io)
    r"^https://[a-zA-Z0-9-]+\.maxlab\.io/$",  # Production root (maxlab.io)
    r"^https://maxlab\.dwchem\.co\.kr/oauth/callback$",  # Production domain (dwchem)
    r"^https://maxlab\.dwchem\.co\.kr/$",  # Production root (dwchem)
    r"^https://[a-zA-Z0-9-]+\.dwchem\.co\.kr/$",  # Production root (dwchem)
    r"^https://maxlab\.dwchem\.co\.kr/login(\?.*)?$",  # Production login (dwchem) with optional query params for logout
    r"^https://max\.dwchem\.co\.kr/login(\?.*)?$",  # Production login (dwchem) with optional query params for logout
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
        print(f"pasred : {parsed}")
        for pattern in ALLOWED_REDIRECT_PATTERNS:
            print(f"Pattern {pattern}")
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
        "https://dwchem.co.kr",      # Production
        "https://max.dwchem.co.kr",  # Production app
        "https://maxlab.dwchem.co.kr",  # Production (dwchem)
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
                    
                    # OAuth 서버 응답 전체를 로깅 (is_admin 포함 여부 확인)
                    logger.info(f"OAuth server userinfo response: {userinfo_response}")
                    
                    # is_admin 필드 존재 여부 명시적 로깅
                    if 'is_admin' in userinfo_response:
                        logger.info(f"is_admin field found in OAuth response: {userinfo_response['is_admin']}")
                    else:
                        logger.info("is_admin field NOT found in OAuth response")
                    
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


@router.get("/sync")
async def oauth_sync(
    token: str = Query(..., description="Access token from MAX Platform"),
    user: Optional[str] = Query(None, description="User data JSON string"),
    request: Request = None
):
    """
    SSO: MAX Platform에서 로그인 시 MAX Lab 세션 동기화
    
    MAX Platform에서 iframe을 통해 이 엔드포인트를 호출하여
    자동으로 MAX Lab에 로그인 세션을 생성합니다.
    """
    try:
        import json
        from ..core.database import get_db
        from sqlalchemy.orm import Session
        
        logger.info(f"🔄 SSO Sync request received with token: {token[:20]}...")
        
        # 1. MAX Platform OAuth 서버에서 토큰 검증
        userinfo_endpoint = f"{settings.AUTH_SERVER_URL}/api/oauth/userinfo"
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            response = await client.get(
                userinfo_endpoint,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json"
                }
            )
            
            if response.status_code != 200:
                logger.error(f"❌ SSO Sync: Token validation failed: {response.status_code}")
                return HTMLResponse(
                    content=f"""
                    <script>
                        console.error('SSO Sync failed: Invalid token');
                        if (window.parent) {{
                            window.parent.postMessage({{
                                type: 'SSO_SYNC_ERROR',
                                error: 'Invalid token'
                            }}, '*');
                        }}
                    </script>
                    """,
                    status_code=200
                )
            
            user_info = response.json()
            logger.info(f"✅ SSO Sync: Token validated for user: {user_info.get('email', 'unknown')}")
        
        # 2. 세션 데이터 생성 - Ensure all required fields for MaxLab frontend
        session_data = {
            # Primary ID field - MaxLab frontend expects 'id'
            "id": user_info.get("sub") or user_info.get("id") or user_info.get("user_id"),
            "user_id": user_info.get("sub"),
            "sub": user_info.get("sub"),  # Keep for OAuth compatibility
            
            # User display information
            "email": user_info.get("email"),
            "username": user_info.get("display_name") or user_info.get("name") or user_info.get("email", "Unknown User"),
            "full_name": user_info.get("real_name") or user_info.get("full_name") or user_info.get("name") or user_info.get("email", "Unknown User"),
            "name": user_info.get("name"),  # Keep original field
            "display_name": user_info.get("display_name"),
            "real_name": user_info.get("real_name"),
            
            # User metadata
            "department": user_info.get("department"),
            "position": user_info.get("position"),
            "phone_number": user_info.get("phone_number"),
            
            # Permissions and status
            "groups": user_info.get("groups", []),
            "permissions": user_info.get("permissions", []),
            "roles": user_info.get("roles", []),
            "is_admin": user_info.get("is_admin", False),
            "is_active": user_info.get("is_active", True),
            "is_verified": user_info.get("is_verified", False),
            "role": "admin" if user_info.get("is_admin", False) else "user",
            
            # Session metadata
            "access_token": token,
            "sync_source": "max_platform",
            "sync_time": time.time(),
            
            # SSO Sync specific metadata - CRITICAL for frontend handling
            "auth_method": "sso_sync",
            "has_refresh_token": False,  # SSO sync doesn't provide refresh tokens
            "max_platform_session": True,  # Indicates this is a MAX Platform session
            "token_renewable_via_sso": True,  # Can renew by going back to MAX Platform
            
            # Additional metadata from MAX Platform
            "created_at": user_info.get("created_at"),
            "last_login_at": user_info.get("last_login_at"),
            "login_count": user_info.get("login_count")
        }
        
        # 3. PostMessage로 프론트엔드에 세션 데이터 전송
        # iframe이므로 parent window에 메시지 전송
        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>SSO Sync</title>
            </head>
            <body>
                <script>
                    // SSO 동기화 성공 메시지를 부모 창에 전송
                    const sessionData = {json.dumps(session_data)};
                    console.log('🔄 SSO Sync: Sending session data to parent window');
                    
                    if (window.parent && window.parent !== window) {{
                        window.parent.postMessage({{
                            type: 'SSO_SYNC_SUCCESS',
                            sessionData: sessionData,
                            token: '{token}'
                        }}, '*');
                    }}
                    
                    // localStorage에도 저장 (같은 도메인인 경우)
                    try {{
                        localStorage.setItem('sso_sync_token', '{token}');
                        localStorage.setItem('sso_sync_user', JSON.stringify(sessionData));
                        console.log('✅ SSO Sync: Data saved to localStorage');
                    }} catch (e) {{
                        console.warn('⚠️ SSO Sync: Could not access localStorage:', e);
                    }}
                </script>
            </body>
            </html>
            """,
            status_code=200
        )
        
    except Exception as e:
        logger.error(f"❌ SSO Sync error: {e}")
        return HTMLResponse(
            content=f"""
            <script>
                console.error('SSO Sync error: {str(e)}');
                if (window.parent) {{
                    window.parent.postMessage({{
                        type: 'SSO_SYNC_ERROR',
                        error: '{str(e)}'
                    }}, '*');
                }}
            </script>
            """,
            status_code=200
        )


@router.get("/sso-token-refresh")
async def sso_token_refresh(
    redirect_uri: Optional[str] = Query(None, description="리다이렉트 URI"),
    state: Optional[str] = Query(None, description="상태 매개변수"),
    request: Request = None
):
    """
    SSO Token Refresh: MAX Platform 재인증으로 토큰 갱신
    
    SSO 동기화된 세션에서 refresh token이 없는 경우
    MAX Platform으로 silent 재인증을 요청하여 새로운 token을 받습니다.
    """
    try:
        logger.info(f"🔄 SSO Token refresh request - redirect_uri: {redirect_uri}")
        
        # 🔒 SECURITY: Validate redirect URI if provided
        if redirect_uri and not validate_redirect_uri(redirect_uri):
            logger.warning(f"Invalid redirect URI in SSO token refresh: {redirect_uri}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "invalid_redirect_uri",
                    "error_description": "Redirect URI is not in the allowed list"
                }
            )
        
        # Use default redirect URI if none provided
        if not redirect_uri:
            redirect_uri = f"{request.base_url}oauth/callback" if request else "/"
            
        # MAX Platform에 silent 재인증 요청을 위한 URL 생성
        # prompt=none을 사용하여 사용자 상호작용 없이 재인증 시도
        auth_params = {
            "response_type": "code",
            "client_id": settings.CLIENT_ID or "maxlab",
            "redirect_uri": redirect_uri,
            "scope": "openid profile email read:profile read:groups manage:workflows",
            "prompt": "none",  # 🔑 Silent 재인증
            "state": state or f"sso_refresh_{int(time.time())}"
        }
        
        query_string = "&".join([f"{k}={v}" for k, v in auth_params.items()])
        max_platform_auth_url = f"{settings.AUTH_SERVER_URL}/api/oauth/authorize?{query_string}"
        
        logger.info(f"🔄 Redirecting to MAX Platform for SSO token refresh: {max_platform_auth_url}")
        
        # MAX Platform으로 리다이렉트하여 silent 재인증 요청
        return RedirectResponse(
            url=max_platform_auth_url,
            status_code=status.HTTP_302_FOUND
        )
        
    except Exception as e:
        logger.error(f"❌ SSO token refresh error: {e}")
        
        # 오류 발생 시 적절한 페이지로 리다이렉트
        fallback_redirect = redirect_uri or "/"
        
        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>SSO Token Refresh Error</title>
                <script>
                    // 오류 발생을 부모 창에 알림
                    if (window.opener) {{
                        window.opener.postMessage({{
                            type: 'SSO_TOKEN_REFRESH_ERROR',
                            error: '{str(e)}'
                        }}, '*');
                        window.close();
                    }} else {{
                        // 일반 페이지에서 호출된 경우 리다이렉트
                        window.location.href = '{fallback_redirect}';
                    }}
                </script>
            </head>
            <body>
                <p>SSO token refresh failed. Redirecting...</p>
            </body>
            </html>
            """,
            status_code=status.HTTP_200_OK
        )


@router.get("/logout-sync")
async def oauth_logout_sync(request: Request = None):
    """
    SSO: MAX Platform에서 로그아웃 시 MAX Lab 세션 종료
    
    MAX Platform에서 iframe을 통해 이 엔드포인트를 호출하여
    자동으로 MAX Lab의 로그인 세션을 종료합니다.
    """
    try:
        logger.info("🔄 SSO Logout sync request received from MAX Platform")
        
        # PostMessage로 프론트엔드에 로그아웃 알림 전송
        return HTMLResponse(
            content="""
            <!DOCTYPE html>
            <html>
            <head>
                <title>SSO Logout Sync</title>
            </head>
            <body>
                <script>
                    // Enhanced SSO 로그아웃 동기화 with confirmation
                    console.log('🔄 SSO Logout Sync: Clearing MAX Lab session...');
                    
                    // Clear localStorage first
                    try {
                        localStorage.clear();
                        sessionStorage.clear();
                        console.log('✅ SSO Logout Sync: Storage cleared');
                    } catch (e) {
                        console.warn('⚠️ SSO Logout Sync: Could not clear storage:', e);
                    }
                    
                    // 🔥 Add instant logout trigger to localStorage BEFORE clearing
                    try {
                        localStorage.setItem('logout_trigger', JSON.stringify({
                            timestamp: Date.now(),
                            source: 'maxplatform_iframe'
                        }));
                        console.log('✅ SSO Logout Sync: Logout trigger set');
                        
                        // Clean up after 1 second
                        setTimeout(() => {
                            try {
                                localStorage.removeItem('logout_trigger');
                            } catch (e) {}
                        }, 1000);
                    } catch (e) {
                        console.warn('⚠️ SSO Logout Sync: Could not set logout trigger:', e);
                    }
                    
                    // Clear cookies
                    try {
                        const isProduction = window.location.hostname.includes('dwchem.co.kr');
                        document.cookie.split(";").forEach(function(c) { 
                            const cookie = c.replace(/^ +/, "");
                            const eqPos = cookie.indexOf("=");
                            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
                            // Clear for current domain
                            document.cookie = name + "=;expires=" + new Date().toUTCString() + ";path=/";
                            // Clear for .dwchem.co.kr domain in production
                            if (isProduction) {
                                document.cookie = name + "=;expires=" + new Date().toUTCString() + ";path=/;domain=.dwchem.co.kr";
                            }
                        });
                        console.log('✅ SSO Logout Sync: Cookies cleared');
                    } catch (e) {
                        console.warn('⚠️ SSO Logout Sync: Could not clear cookies:', e);
                    }
                    
                    // Send confirmation to parent window
                    console.log('🔄 SSO Logout Sync: Sending confirmation to parent window');
                    
                    function sendConfirmation() {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({
                                type: 'SSO_LOGOUT_SYNC',
                                source: 'maxlab',  // Fixed: source should be where message comes FROM
                                success: true,
                                timestamp: Date.now()
                            }, '*');
                            console.log('✅ SSO Logout Sync: Confirmation sent');
                        }
                        
                        // Also broadcast to BroadcastChannel
                        if ('BroadcastChannel' in window) {
                            try {
                                const channel = new BroadcastChannel('maxlab_cross_domain_logout');
                                channel.postMessage({ 
                                    type: 'LOGOUT', 
                                    reason: 'sso_logout_sync',
                                    timestamp: Date.now()
                                });
                                channel.close();
                                console.log('✅ SSO Logout Sync: Broadcast sent');
                            } catch (e) {
                                console.warn('⚠️ SSO Logout Sync: Broadcast failed:', e);
                            }
                            
                            // 🔥 Also use instant logout channel
                            try {
                                const instantChannel = new BroadcastChannel('sso_instant_logout');
                                instantChannel.postMessage({
                                    type: 'INSTANT_LOGOUT',
                                    timestamp: Date.now(),
                                    source: 'maxplatform_iframe'
                                });
                                instantChannel.close();
                                console.log('✅ SSO Logout Sync: Instant logout broadcast sent');
                            } catch (e) {
                                console.warn('⚠️ SSO Logout Sync: Instant broadcast failed:', e);
                            }
                        }
                    }
                    
                    // 🔥 즉시 전송 + 여러 번 시도
                    sendConfirmation();
                    setTimeout(sendConfirmation, 10);   // 🔥 100 → 10ms
                    setTimeout(sendConfirmation, 50);   // 🔥 500 → 50ms
                    setTimeout(sendConfirmation, 100);  // 🔥 추가
                    
                    // 🔥 리다이렉트 시간 단축
                    setTimeout(() => {
                        try {
                            window.top.location.href = window.location.origin + '/login?logout=sso_sync';
                        } catch (e) {
                            console.log('🔄 Cannot redirect top window, user will handle manually');
                        }
                    }, 200); // 🔥 1000 → 200ms
                </script>
            </body>
            </html>
            """,
            status_code=200
        )
        
    except Exception as e:
        logger.error(f"❌ SSO Logout sync error: {e}")
        return HTMLResponse(
            content=f"""
            <script>
                console.error('SSO Logout sync error: {str(e)}');
            </script>
            """,
            status_code=200
        )