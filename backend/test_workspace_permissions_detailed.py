#!/usr/bin/env python3
"""워크스페이스 권한 시스템 상세 테스트 스크립트"""

import httpx
import asyncio
import json
import sys
from uuid import UUID

# 테스트 설정
BASE_URL = "http://localhost:8081"
AUTH_URL = "http://localhost:8000"

async def get_token(email: str, password: str = "test123!") -> str:
    """토큰 가져오기"""
    async with httpx.AsyncClient() as client:
        # 로그인
        login_response = await client.post(
            f"{AUTH_URL}/auth/login",
            json={
                "username": email,
                "password": password
            }
        )
        
        if login_response.status_code != 200:
            print(f"❌ 로그인 실패: {login_response.text}")
            return None
        
        token = login_response.json()["access_token"]
        return token

async def get_user_info(token: str) -> dict:
    """사용자 정보 조회"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/users/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        return response.json()

async def test_workspace_permissions_with_token(token: str, user_desc: str = "User"):
    """토큰을 사용한 워크스페이스 권한 시스템 테스트"""
    print(f"\n=== {user_desc} 권한 테스트 ===")
    
    # 1. 사용자 정보 확인
    print("\n1. 사용자 정보 확인")
    user_info = await get_user_info(token)
    print(f"   - User UUID: {user_info.get('user_uuid')}")
    print(f"   - Email: {user_info.get('email')}")
    print(f"   - Is Admin: {user_info.get('is_admin')} (타입: {type(user_info.get('is_admin')).__name__})")
    print(f"   - Role: {user_info.get('role')}")
    print(f"   - Groups: {user_info.get('groups')}")
    print(f"   - Group UUIDs: {user_info.get('group_uuids')}")
    
    # OAuth 서버에서 직접 정보 가져오기
    print("\n2. OAuth 서버 직접 조회")
    async with httpx.AsyncClient() as client:
        oauth_response = await client.get(
            f"{AUTH_URL}/api/oauth/userinfo",
            headers={"Authorization": f"Bearer {token}"}
        )
        if oauth_response.status_code == 200:
            oauth_data = oauth_response.json()
            print(f"   - OAuth is_admin: {oauth_data.get('is_admin')} (타입: {type(oauth_data.get('is_admin')).__name__})")
            print(f"   - OAuth groups (원본): {oauth_data.get('groups')}")
        else:
            print(f"   ❌ OAuth 조회 실패: {oauth_response.status_code}")
    print()
    
    # 3. 워크스페이스 목록 조회
    print("\n3. 워크스페이스 목록 조회")
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/workspaces/",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code != 200:
            print(f"❌ 워크스페이스 조회 실패: {response.text}")
            return
        
        data = response.json()
        workspaces = data.get("workspaces", [])
        
        print(f"   총 {len(workspaces)}개의 워크스페이스가 조회됨")
        print()
        
        # 4. 각 워크스페이스 권한 상세 분석
        print("4. 워크스페이스별 권한 분석:")
        for i, ws in enumerate(workspaces, 1):
            print(f"\n   [{i}] {ws['name']} (ID: {ws['id']})")
            print(f"       - 설명: {ws.get('description', 'N/A')}")
            print(f"       - 소유자 타입: {ws.get('owner_type')}")
            print(f"       - 소유자 ID: {ws.get('owner_id')}")
            print(f"       - 활성화: {ws.get('is_active')}")
            
            # 권한 정보 가져오기
            perm_response = await client.get(
                f"{BASE_URL}/workspaces/{ws['id']}",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if perm_response.status_code == 200:
                details = perm_response.json()
                
                # 그룹 권한 확인
                groups = details.get("groups", [])
                if groups:
                    print(f"       - 그룹 권한:")
                    for g in groups:
                        print(f"         • {g.get('group_display_name', g.get('group_name'))} ({g.get('group_id')}): {g.get('permission_level')}")
                
                # 사용자 권한 확인
                users = details.get("users", [])
                if users:
                    print(f"       - 사용자 권한:")
                    for u in users:
                        print(f"         • {u.get('user_display_name', u.get('user_email'))} ({u.get('user_id')}): {u.get('permission_level')}")
            else:
                print(f"       ⚠️  상세 정보 조회 실패: {perm_response.status_code}")
    
    # 5. 권한 확인 테스트
    print("\n5. 특정 워크스페이스 권한 확인 테스트")
    if workspaces:
        test_ws = workspaces[0]
        async with httpx.AsyncClient() as client:
            check_response = await client.post(
                f"{BASE_URL}/workspaces/check-permission/",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "workspace_id": test_ws["id"],
                    "required_permission": "read"
                }
            )
            
            if check_response.status_code == 200:
                perm_data = check_response.json()
                print(f"   워크스페이스 '{test_ws['name']}' 권한 체크:")
                print(f"   - 권한 있음: {perm_data.get('has_permission')}")
                print(f"   - 권한 레벨: {perm_data.get('user_permission_level')}")
                print(f"   - 부여된 그룹: {perm_data.get('granted_groups')}")
            else:
                print(f"   ❌ 권한 체크 실패: {check_response.text}")

async def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print("사용법: python test_workspace_permissions_detailed.py <TOKEN> [<TOKEN2>]")
        print("\n토큰 얻는 방법:")
        print("1. 프론트엔드에서 로그인")
        print("2. 개발자 도구 > Network 탭에서 API 요청의 Authorization 헤더 확인")
        print("3. 또는 Console에서 localStorage.getItem('token') 실행")
        sys.exit(1)
    
    token1 = sys.argv[1]
    print("=== 워크스페이스 권한 시스템 상세 테스트 ===")
    
    # 첫 번째 사용자 테스트
    await test_workspace_permissions_with_token(token1, "첫 번째 사용자")
    
    # 두 번째 사용자 테스트 (옵션)
    if len(sys.argv) > 2:
        token2 = sys.argv[2]
        await test_workspace_permissions_with_token(token2, "두 번째 사용자")

if __name__ == "__main__":
    asyncio.run(main())