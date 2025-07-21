#!/usr/bin/env python3
"""
Test debug endpoints to understand permission filtering issue
"""
import httpx
import asyncio
import json
import os

BASE_URL = "http://localhost:8010"

async def test_debug_endpoints():
    """Test the debug endpoints"""
    
    # First, we need to get a token - you'll need to provide valid credentials
    print("Please ensure you have a valid OAuth token")
    print("You can get one by logging in through the frontend")
    print("Or by making a POST request to /api/v1/auth/login")
    print("")
    
    token = input("Enter your OAuth token (or press Enter to skip): ").strip()
    
    if not token:
        print("No token provided. Exiting.")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Get user info
        print("\n=== Test 1: Debug User Info ===")
        try:
            response = await client.get(f"{BASE_URL}/api/v1/debug/user-info", headers=headers)
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(json.dumps(data, indent=2))
            else:
                print(f"Error: {response.text}")
        except Exception as e:
            print(f"Error: {e}")
        
        # Test 2: Debug workspace permissions
        print("\n=== Test 2: Debug Workspace Permissions ===")
        try:
            response = await client.get(f"{BASE_URL}/api/v1/debug/workspace-permissions", headers=headers)
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(json.dumps(data, indent=2))
            else:
                print(f"Error: {response.text}")
        except Exception as e:
            print(f"Error: {e}")
        
        # Test 3: Regular workspace list endpoint
        print("\n=== Test 3: Regular Workspace List ===")
        try:
            response = await client.get(f"{BASE_URL}/api/v1/workspaces/", headers=headers)
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"Total workspaces: {data.get('total', 0)}")
                print(f"Workspaces returned: {len(data.get('workspaces', []))}")
                if data.get('workspaces'):
                    print("\nFirst workspace:")
                    print(json.dumps(data['workspaces'][0], indent=2))
            else:
                print(f"Error: {response.text}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    print("🔍 Testing MaxLab Debug Endpoints\n")
    asyncio.run(test_debug_endpoints())