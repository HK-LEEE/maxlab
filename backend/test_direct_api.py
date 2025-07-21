#!/usr/bin/env python3
"""직접 API 호출 테스트"""

import httpx
import asyncio
import json
import sys

BASE_URL = "http://localhost:8081"

async def test_workspaces_api(token: str):
    """워크스페이스 API 직접 호출"""
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # 1. 사용자 정보 확인
        print("\n=== 1. 사용자 정보 ===")
        response = await client.get(
            f"{BASE_URL}/users/me",
            headers=headers
        )
        
        if response.status_code == 200:
            user_info = response.json()
            print(f"Email: {user_info.get('email')}")
            print(f"Is Admin: {user_info.get('is_admin')}")
            print(f"Group UUIDs: {user_info.get('group_uuids')}")
        else:
            print(f"❌ 사용자 정보 조회 실패: {response.status_code}")
            return
        
        # 2. 워크스페이스 목록 조회
        print("\n=== 2. 워크스페이스 목록 조회 ===")
        response = await client.get(
            f"{BASE_URL}/workspaces/",
            headers=headers
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            workspaces = data.get("workspaces", [])
            print(f"총 {len(workspaces)}개의 워크스페이스가 조회됨")
            
            for ws in workspaces:
                print(f"\n워크스페이스: {ws['name']}")
                print(f"  - ID: {ws['id']}")
                print(f"  - Owner Type: {ws.get('owner_type')}")
                print(f"  - Owner ID: {ws.get('owner_id')}")
                
                # 상세 정보 조회
                detail_response = await client.get(
                    f"{BASE_URL}/workspaces/{ws['id']}",
                    headers=headers
                )
                
                if detail_response.status_code == 200:
                    details = detail_response.json()
                    groups = details.get("groups", [])
                    users = details.get("users", [])
                    
                    if groups:
                        print("  - 그룹 권한:")
                        for g in groups:
                            print(f"    • {g.get('group_name')} ({g.get('group_id')})")
                    
                    if users:
                        print("  - 사용자 권한:")
                        for u in users:
                            print(f"    • {u.get('user_email')} ({u.get('user_id')})")
                else:
                    print(f"  - 상세 정보 조회 실패: {detail_response.status_code}")
        else:
            print(f"❌ 워크스페이스 조회 실패: {response.status_code}")
            print(f"Response: {response.text}")

async def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print("사용법: python test_direct_api.py <TOKEN>")
        sys.exit(1)
    
    token = sys.argv[1]
    await test_workspaces_api(token)

if __name__ == "__main__":
    asyncio.run(main())