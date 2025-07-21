#!/usr/bin/env python3
"""
OAuth 토큰 획득 도우미 스크립트
로컬 개발 환경에서 OAuth 토큰을 쉽게 얻을 수 있도록 도와줍니다.
"""
import webbrowser
import asyncio
import aiohttp
from urllib.parse import urlencode


def get_oauth_login_url(auth_server_url: str = "http://localhost:8000") -> str:
    """OAuth 로그인 URL 생성"""
    # OAuth 파라미터
    params = {
        "response_type": "token",
        "client_id": "maxlab-frontend",  # 프론트엔드 클라이언트 ID
        "redirect_uri": "http://localhost:3010/auth/callback",  # 리다이렉트 URI
        "scope": "read write",
        "state": "test-state-123"
    }
    
    return f"{auth_server_url}/oauth/authorize?{urlencode(params)}"


async def check_auth_server(auth_server_url: str = "http://localhost:8000") -> bool:
    """인증 서버 연결 확인"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(auth_server_url, timeout=5) as response:
                return response.status == 200
    except:
        return False


async def main():
    """메인 함수"""
    print("=" * 60)
    print("🔐 OAuth Token Helper")
    print("=" * 60)
    
    auth_server_url = "http://localhost:8000"
    
    # 인증 서버 확인
    print(f"\nChecking auth server at {auth_server_url}...")
    if await check_auth_server(auth_server_url):
        print("✅ Auth server is running")
    else:
        print("❌ Auth server is not responding")
        print(f"Please make sure the auth server is running at {auth_server_url}")
        return
    
    # OAuth 로그인 URL 생성
    login_url = get_oauth_login_url(auth_server_url)
    
    print("\n📝 Steps to get OAuth token:")
    print("1. Open the following URL in your browser")
    print("2. Log in with your credentials")
    print("3. After successful login, you'll be redirected")
    print("4. Copy the access_token from the URL")
    print("\n" + "=" * 60)
    print(f"Login URL: {login_url}")
    print("=" * 60)
    
    # 브라우저 열기 옵션
    print("\nWould you like to open this URL in your browser? (y/n): ", end="")
    choice = input().lower()
    
    if choice == 'y':
        webbrowser.open(login_url)
        print("\n✅ Browser opened. Please complete the login process.")
    
    print("\n📌 After login, the URL will look like:")
    print("http://localhost:3010/auth/callback#access_token=YOUR_TOKEN_HERE&...")
    print("\nCopy the value of 'access_token' and use it for testing:")
    print("./tests/quick_oauth_test.sh YOUR_TOKEN_HERE")
    print("python tests/test_oauth_flow.py --token YOUR_TOKEN_HERE")
    
    print("\n" + "=" * 60)
    print("💡 Tips:")
    print("- The token is usually valid for 7 days")
    print("- Save the token in a file for repeated use")
    print("- Don't commit the token to version control")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())