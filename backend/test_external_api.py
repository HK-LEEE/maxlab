#!/usr/bin/env python3
"""
Test script for external API connectivity
Tests the connection to the auth server (localhost:8000) for users and groups
"""
import asyncio
import aiohttp
import sys
import os
from typing import Optional

# Add the app directory to the path so we can import from it
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.core.config import settings

# Test configuration
AUTH_SERVER_URL = settings.AUTH_SERVER_URL or "http://localhost:8000"
TEST_TOKEN = "your_test_token_here"  # Replace with a valid token if you have one


async def test_external_connectivity():
    """Test external API connectivity to auth server."""
    print(f"🚀 External API Connectivity Test")
    print(f"Auth Server URL: {AUTH_SERVER_URL}")
    print(f"Settings AUTH_SERVER_URL: {settings.AUTH_SERVER_URL}")
    print("=" * 50)
    
    async with aiohttp.ClientSession() as session:
        
        # Test 1: Basic connectivity
        print("\n1. Testing basic connectivity to auth server...")
        try:
            async with session.get(f"{AUTH_SERVER_URL}/", timeout=5) as resp:
                print(f"✅ Basic connectivity: {resp.status}")
                if resp.status == 200:
                    content = await resp.text()
                    print(f"   Response preview: {content[:100]}...")
        except Exception as e:
            print(f"❌ Basic connectivity failed: {e}")
        
        # Test 2: API endpoint discovery
        print("\n2. Testing common API endpoints...")
        endpoints_to_test = [
            "/api/v1/users/search?q=test",
            "/api/v1/admin/users/search?q=test",
            "/api/users/search?q=test",
            "/users/search?q=test",
            "/api/v1/groups",
            "/api/v1/admin/groups",
            "/api/groups",
            "/groups",
            "/api/v1/health",
            "/health",
            "/api/docs",
            "/docs"
        ]
        
        for endpoint in endpoints_to_test:
            try:
                url = f"{AUTH_SERVER_URL}{endpoint}"
                headers = {}
                if TEST_TOKEN and TEST_TOKEN != "your_test_token_here":
                    headers["Authorization"] = f"Bearer {TEST_TOKEN}"
                
                async with session.get(url, headers=headers, timeout=3) as resp:
                    status_emoji = "✅" if resp.status < 400 else "⚠️" if resp.status < 500 else "❌"
                    print(f"   {status_emoji} {endpoint}: {resp.status}")
                    
                    if resp.status == 200:
                        try:
                            if 'application/json' in resp.headers.get('content-type', ''):
                                data = await resp.json()
                                if isinstance(data, list):
                                    print(f"      → Found {len(data)} items")
                                elif isinstance(data, dict):
                                    print(f"      → Response: {list(data.keys())}")
                        except:
                            pass
                            
            except asyncio.TimeoutError:
                print(f"   ⏰ {endpoint}: Timeout")
            except Exception as e:
                print(f"   ❌ {endpoint}: {str(e)[:50]}")
        
        # Test 3: Test with our ExternalAPIService
        print("\n3. Testing with ExternalAPIService...")
        try:
            from app.services.external_api import ExternalAPIService
            
            external_api = ExternalAPIService()
            print(f"   Service base URL: {external_api.base_url}")
            
            # Test groups
            print("   Testing get_groups()...")
            groups = await external_api.get_groups(TEST_TOKEN if TEST_TOKEN != "your_test_token_here" else "dummy_token")
            print(f"   Groups result: {len(groups)} items")
            
            # Test user search
            print("   Testing search_users()...")
            users = await external_api.search_users(TEST_TOKEN if TEST_TOKEN != "your_test_token_here" else "dummy_token", "test")
            print(f"   Users result: {len(users)} items")
            
        except Exception as e:
            print(f"   ❌ ExternalAPIService test failed: {e}")
        
        # Test 4: Environment check
        print("\n4. Environment check...")
        print(f"   AUTH_SERVER_URL setting: {settings.AUTH_SERVER_URL}")
        print(f"   Environment AUTH_SERVER_URL: {os.getenv('AUTH_SERVER_URL', 'Not set')}")
        print(f"   Computed base URL: {AUTH_SERVER_URL}")
        
        # Test 5: Network diagnostics
        print("\n5. Network diagnostics...")
        try:
            import socket
            hostname = AUTH_SERVER_URL.replace('http://', '').replace('https://', '').split(':')[0]
            port = 8000 if ':8000' in AUTH_SERVER_URL else 80
            
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            result = sock.connect_ex((hostname, port))
            sock.close()
            
            if result == 0:
                print(f"   ✅ Port {port} is open on {hostname}")
            else:
                print(f"   ❌ Port {port} is closed on {hostname}")
                
        except Exception as e:
            print(f"   ❌ Network test failed: {e}")


if __name__ == "__main__":
    print("🔧 External API Test Script")
    print("This script tests connectivity to the auth server for user/group APIs")
    print()
    
    if len(sys.argv) > 1:
        TEST_TOKEN = sys.argv[1]
        print(f"Using provided token: {TEST_TOKEN[:20]}...")
    else:
        print("No token provided. Some endpoints may return 401/403.")
        print("Usage: python test_external_api.py [your_access_token]")
    
    print()
    asyncio.run(test_external_connectivity())