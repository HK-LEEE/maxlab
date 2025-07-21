#!/usr/bin/env python3
"""워크스페이스 권한 디버그 테스트"""

import httpx
import asyncio
import json
import sys

# 테스트 설정
BASE_URL = "http://localhost:8081"

async def test_debug_endpoints(token: str):
    """디버그 엔드포인트 테스트"""
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # 1. 사용자 정보 디버그
        print("\n=== 1. 사용자 정보 디버그 ===")
        response = await client.get(
            f"{BASE_URL}/debug/user-info",
            headers=headers
        )
        
        if response.status_code == 200:
            user_info = response.json()
            print(json.dumps(user_info, indent=2))
        else:
            print(f"❌ 사용자 정보 조회 실패: {response.status_code} - {response.text}")
        
        # 2. 워크스페이스 권한 디버그
        print("\n=== 2. 워크스페이스 권한 디버그 ===")
        response = await client.get(
            f"{BASE_URL}/debug/workspace-permissions",
            headers=headers
        )
        
        if response.status_code == 200:
            perm_info = response.json()
            print(json.dumps(perm_info, indent=2))
        else:
            print(f"❌ 워크스페이스 권한 디버그 실패: {response.status_code} - {response.text}")
        
        # 3. 일반 워크스페이스 목록 조회
        print("\n=== 3. 일반 워크스페이스 목록 조회 ===")
        response = await client.get(
            f"{BASE_URL}/workspaces/",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            workspaces = data.get("workspaces", [])
            print(f"총 {len(workspaces)}개의 워크스페이스가 조회됨")
            for ws in workspaces[:5]:  # 처음 5개만 출력
                print(f"  - {ws['name']} (ID: {ws['id']})")
        else:
            print(f"❌ 워크스페이스 목록 조회 실패: {response.status_code} - {response.text}")

async def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print("사용법: python test_workspace_debug.py <TOKEN>")
        print("\n토큰 얻는 방법:")
        print("1. 프론트엔드에서 로그인")
        print("2. 개발자 도구 > Network 탭에서 API 요청의 Authorization 헤더 확인")
        print("3. 또는 Console에서 localStorage.getItem('token') 실행")
        sys.exit(1)
    
    token = sys.argv[1]
    await test_debug_endpoints(token)

if __name__ == "__main__":
    asyncio.run(main())