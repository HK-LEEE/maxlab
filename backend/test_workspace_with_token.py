#!/usr/bin/env python3
"""토큰을 사용한 워크스페이스 권한 테스트"""

import httpx
import asyncio
import json

# 테스트 설정
BASE_URL = "http://localhost:8081"

async def test_with_token():
    """토큰을 사용한 테스트"""
    print("=== 워크스페이스 권한 시스템 테스트 ===\n")
    
    # 토큰 입력 받기
    print("프론트엔드에서 로그인 후 개발자 도구에서 토큰을 확인하세요.")
    print("Network 탭에서 API 요청의 Authorization 헤더를 확인하거나,")
    print("Console에서 localStorage.getItem('token')을 실행하세요.\n")
    
    token = input("토큰을 입력하세요: ").strip()
    
    if not token:
        print("토큰이 입력되지 않았습니다.")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # 1. 사용자 정보 확인
        print("\n1. 사용자 정보 확인")
        response = await client.get(
            f"{BASE_URL}/users/me",
            headers=headers
        )
        
        if response.status_code != 200:
            print(f"❌ 사용자 정보 조회 실패: {response.text}")
            return
        
        user_info = response.json()
        print(f"   - User UUID: {user_info.get('user_uuid')}")
        print(f"   - Email: {user_info.get('email')}")
        print(f"   - Is Admin: {user_info.get('is_admin')}")
        print(f"   - Role: {user_info.get('role')}")
        print(f"   - Groups: {user_info.get('groups')}")
        print(f"   - Group UUIDs: {user_info.get('group_uuids')}")
        
        # 2. 워크스페이스 목록 조회
        print("\n2. 워크스페이스 목록 조회")
        response = await client.get(
            f"{BASE_URL}/workspaces/",
            headers=headers
        )
        
        if response.status_code != 200:
            print(f"❌ 워크스페이스 조회 실패: {response.text}")
            return
        
        data = response.json()
        workspaces = data.get("workspaces", [])
        
        print(f"   총 {len(workspaces)}개의 워크스페이스가 조회됨")
        
        # 3. 워크스페이스 목록 출력
        print("\n3. 조회된 워크스페이스 목록:")
        for i, ws in enumerate(workspaces, 1):
            print(f"   [{i}] {ws['name']} (ID: {ws['id']})")
            print(f"       - 설명: {ws.get('description', 'N/A')}")
            print(f"       - 소유자: {ws.get('owner_type')} / {ws.get('owner_id')}")
        
        # 4. 특정 워크스페이스 권한 확인
        if workspaces:
            print("\n4. 특정 워크스페이스 권한 체크")
            test_ws = workspaces[0]
            
            response = await client.post(
                f"{BASE_URL}/workspaces/check-permission/",
                headers=headers,
                json={
                    "workspace_id": test_ws["id"],
                    "required_permission": "read"
                }
            )
            
            if response.status_code == 200:
                perm_data = response.json()
                print(f"   워크스페이스 '{test_ws['name']}' 권한:")
                print(f"   - 권한 있음: {perm_data.get('has_permission')}")
                print(f"   - 권한 레벨: {perm_data.get('user_permission_level')}")
                print(f"   - 부여된 그룹: {perm_data.get('granted_groups')}")
            else:
                print(f"   ❌ 권한 체크 실패: {response.text}")

if __name__ == "__main__":
    asyncio.run(test_with_token())