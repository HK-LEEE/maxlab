#!/usr/bin/env python3
"""OAuth userinfo 응답 확인"""

import httpx
import asyncio
import json
import sys

# 테스트 설정
AUTH_URL = "http://localhost:8000"

async def check_oauth_userinfo(token: str):
    """OAuth userinfo 응답 확인"""
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # OAuth userinfo 엔드포인트 호출
        print("\n=== OAuth Userinfo 응답 ===")
        response = await client.get(
            f"{AUTH_URL}/api/oauth/userinfo",
            headers=headers
        )
        
        if response.status_code == 200:
            userinfo = response.json()
            print(json.dumps(userinfo, indent=2))
            
            # 그룹 정보 분석
            print("\n=== 그룹 정보 분석 ===")
            groups = userinfo.get("groups", [])
            print(f"그룹 수: {len(groups)}")
            
            for i, group in enumerate(groups):
                print(f"\n그룹 {i+1}:")
                if isinstance(group, dict):
                    print(f"  타입: dict")
                    for key, value in group.items():
                        print(f"  {key}: {value}")
                else:
                    print(f"  타입: {type(group).__name__}")
                    print(f"  값: {group}")
        else:
            print(f"❌ OAuth userinfo 조회 실패: {response.status_code} - {response.text}")

async def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print("사용법: python test_oauth_userinfo.py <TOKEN>")
        sys.exit(1)
    
    token = sys.argv[1]
    await check_oauth_userinfo(token)

if __name__ == "__main__":
    asyncio.run(main())