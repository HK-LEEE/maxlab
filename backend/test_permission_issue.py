#!/usr/bin/env python3
"""
Test workspace permission filtering issue
"""
import asyncio
import httpx
import json

# Test configuration
BASE_URL = "http://localhost:8010"
TEST_TOKEN = None  # Will be set after login

async def login():
    """Login to get a valid token"""
    global TEST_TOKEN
    async with httpx.AsyncClient() as client:
        # Try to login with a test user
        response = await client.post(
            f"{BASE_URL}/api/v1/auth/login",
            json={"username": "admin", "password": "admin"}  # Adjust credentials
        )
        if response.status_code == 200:
            data = response.json()
            TEST_TOKEN = data.get("access_token", data.get("token"))
            print(f"✅ Login successful, token: {TEST_TOKEN[:20]}...")
            return True
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return False

async def test_workspace_list():
    """Test workspace list endpoint"""
    if not TEST_TOKEN:
        print("❌ No token available")
        return
    
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    
    async with httpx.AsyncClient() as client:
        # Test 1: Get current user info
        print("\n=== Test 1: Get current user info ===")
        try:
            response = await client.get(f"{BASE_URL}/api/v1/auth/me", headers=headers)
            if response.status_code == 200:
                user_info = response.json()
                print(f"Current user: {json.dumps(user_info, indent=2)}")
            else:
                print(f"Failed to get user info: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Error getting user info: {e}")
        
        # Test 2: Get workspace list
        print("\n=== Test 2: Get workspace list ===")
        try:
            response = await client.get(
                f"{BASE_URL}/api/v1/workspaces/",
                headers=headers,
                params={"skip": 0, "limit": 100}
            )
            if response.status_code == 200:
                data = response.json()
                print(f"Total workspaces returned: {data.get('total', 0)}")
                workspaces = data.get('workspaces', [])
                print(f"Workspaces in response: {len(workspaces)}")
                
                # Show first few workspaces
                for i, ws in enumerate(workspaces[:3]):
                    print(f"\nWorkspace {i+1}:")
                    print(f"  ID: {ws.get('id')}")
                    print(f"  Name: {ws.get('name')}")
                    print(f"  Owner ID: {ws.get('owner_id')}")
            else:
                print(f"Failed to get workspaces: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Error getting workspaces: {e}")

async def test_with_different_user():
    """Test with a non-admin user"""
    print("\n=== Testing with non-admin user ===")
    
    # You would need to create a non-admin test user and use their credentials
    # For now, this is a placeholder
    print("TODO: Add non-admin user test")

async def main():
    """Run all tests"""
    print("🔍 Testing workspace permission filtering\n")
    
    # Login first
    if await login():
        await test_workspace_list()
        await test_with_different_user()
    else:
        print("❌ Cannot proceed without login")

if __name__ == "__main__":
    asyncio.run(main())