#!/usr/bin/env python3
"""사용자 그룹 정보 확인 테스트"""

import httpx
import asyncio
import json
import sys

# 테스트 설정  
BASE_URL = "http://localhost:8081"

async def check_user_groups(token: str):
    """사용자 그룹 정보 확인"""
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # 1. 현재 사용자 정보
        print("\n=== 1. 현재 사용자 정보 ===")
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
                print("\n⚠️  경고: 사용자의 group_uuids가 비어있습니다!")
                print("이것이 모든 워크스페이스가 보이지 않는 원인일 수 있습니다.")
        else:
            print(f"❌ 사용자 정보 조회 실패: {response.status_code} - {response.text}")
            return
        
        # 2. 외부 인증 서버에서 직접 사용자 정보 조회
        print("\n=== 2. 외부 인증 서버 정보 확인 ===")
        auth_response = await client.get(
            "http://localhost:8000/api/v1/users/me",
            headers=headers
        )
        
        if auth_response.status_code == 200:
            auth_user_info = auth_response.json()
            print(f"Auth Server - Is Admin: {auth_user_info.get('is_admin')}")
            print(f"Auth Server - Groups: {auth_user_info.get('groups')}")
            print(f"Auth Server - Group UUIDs: {auth_user_info.get('group_uuids')}")
        else:
            print(f"❌ 외부 인증 서버 조회 실패: {auth_response.status_code}")

async def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print("사용법: python test_check_user_groups.py <TOKEN>")
        sys.exit(1)
    
    token = sys.argv[1]
    await check_user_groups(token)

if __name__ == "__main__":
    asyncio.run(main())