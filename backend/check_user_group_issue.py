#!/usr/bin/env python3
"""사용자 그룹 문제 디버깅"""

import httpx
import asyncio
import json
import sys

# 테스트 설정  
BASE_URL = "http://localhost:8081"
AUTH_URL = "http://localhost:8000"

async def debug_user_groups(token: str):
    """사용자 그룹 정보 디버깅"""
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # 1. 백엔드에서 보는 사용자 정보
        print("\n=== 1. MAX Lab 백엔드에서 보는 사용자 정보 ===")
        response = await client.get(
            f"{BASE_URL}/users/me",
            headers=headers
        )
        
        if response.status_code == 200:
            user_info = response.json()
            print(f"User UUID: {user_info.get('user_uuid')}")
            print(f"Email: {user_info.get('email')}")
            print(f"Is Admin: {user_info.get('is_admin')}")
            print(f"Groups: {user_info.get('groups')}")
            print(f"Group UUIDs: {user_info.get('group_uuids')}")
            
            # 그룹 정보가 비어있는지 확인
            if not user_info.get('group_uuids'):
                print("\n⚠️  경고: group_uuids가 비어있습니다!")
        else:
            print(f"❌ 사용자 정보 조회 실패: {response.status_code} - {response.text}")
            return
        
        # 2. 인증 서버에서 직접 사용자 정보 조회
        print("\n=== 2. 외부 인증 서버에서 보는 사용자 정보 ===")
        try:
            auth_response = await client.get(
                f"{AUTH_URL}/api/v1/users/me",
                headers=headers
            )
            
            if auth_response.status_code == 200:
                auth_user_info = auth_response.json()
                print(f"Auth Server - User UUID: {auth_user_info.get('user_uuid')}")
                print(f"Auth Server - Is Admin: {auth_user_info.get('is_admin')}")
                print(f"Auth Server - Groups: {auth_user_info.get('groups')}")
                print(f"Auth Server - Group UUIDs: {auth_user_info.get('group_uuids')}")
                
                # 차이점 비교
                print("\n=== 3. 차이점 분석 ===")
                backend_groups = set(user_info.get('group_uuids', []))
                auth_groups = set(auth_user_info.get('group_uuids', []))
                
                if backend_groups != auth_groups:
                    print("⚠️  그룹 정보가 일치하지 않습니다!")
                    print(f"백엔드에만 있는 그룹: {backend_groups - auth_groups}")
                    print(f"인증서버에만 있는 그룹: {auth_groups - backend_groups}")
                else:
                    print("✅ 그룹 정보가 일치합니다.")
            else:
                print(f"❌ 인증 서버 조회 실패: {auth_response.status_code}")
        except Exception as e:
            print(f"❌ 인증 서버 연결 실패: {e}")
        
        # 3. 워크스페이스 목록 조회
        print("\n=== 4. 워크스페이스 접근 권한 확인 ===")
        ws_response = await client.get(
            f"{BASE_URL}/workspaces/",
            headers=headers
        )
        
        if ws_response.status_code == 200:
            data = ws_response.json()
            workspaces = data.get("workspaces", [])
            print(f"총 {len(workspaces)}개의 워크스페이스가 조회됨")
            
            # 사용자가 접근 가능해야 하는 워크스페이스
            user_uuid = user_info.get('user_uuid')
            user_groups = user_info.get('group_uuids', [])
            
            print(f"\n예상 접근 가능 워크스페이스:")
            print(f"- 사용자 UUID {user_uuid}가 직접 권한을 가진 워크스페이스")
            if user_groups:
                for g in user_groups:
                    print(f"- 그룹 {g}에 속한 워크스페이스")
            else:
                print("- (그룹 정보가 없음)")

async def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print("사용법: python check_user_group_issue.py <TOKEN>")
        sys.exit(1)
    
    token = sys.argv[1]
    await debug_user_groups(token)

if __name__ == "__main__":
    asyncio.run(main())