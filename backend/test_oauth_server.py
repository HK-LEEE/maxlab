#!/usr/bin/env python3
"""
Test OAuth server responses directly
"""
import httpx
import asyncio
import json

OAUTH_SERVER_URL = "http://localhost:8000"

async def test_oauth_server():
    """Test OAuth server directly"""
    
    print("Testing OAuth server at:", OAUTH_SERVER_URL)
    print("\nEnter your OAuth token to test what the OAuth server returns")
    token = input("Token: ").strip()
    
    if not token:
        print("No token provided. Exiting.")
        return
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Get user info from OAuth server
        print("\n=== Test 1: OAuth Server UserInfo ===")
        try:
            response = await client.get(
                f"{OAUTH_SERVER_URL}/api/oauth/userinfo",
                headers=headers
            )
            print(f"Status: {response.status_code}")
            print(f"Headers: {dict(response.headers)}")
            if response.status_code == 200:
                data = response.json()
                print("\nUser data from OAuth server:")
                print(json.dumps(data, indent=2))
                
                # Highlight key fields
                print("\n--- Key Fields ---")
                print(f"is_admin: {data.get('is_admin')} (type: {type(data.get('is_admin')).__name__})")
                print(f"role: {data.get('role')}")
                print(f"groups: {data.get('groups')}")
                print(f"permissions: {data.get('permissions')}")
            else:
                print(f"Error: {response.text}")
        except Exception as e:
            print(f"Error: {e}")
        
        # Test 2: Get user groups
        print("\n=== Test 2: OAuth Server User Groups ===")
        try:
            response = await client.get(
                f"{OAUTH_SERVER_URL}/api/auth/me",
                headers=headers
            )
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print("\nGroups data:")
                print(json.dumps(data.get('groups', []), indent=2))
            else:
                print(f"Error: {response.text}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    print("🔍 Testing OAuth Server Responses\n")
    asyncio.run(test_oauth_server())