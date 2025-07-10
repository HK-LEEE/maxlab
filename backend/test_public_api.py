#!/usr/bin/env python3
"""
Test script for public API endpoints
Tests the published flow public access functionality
"""
import asyncio
import aiohttp
import sys
import json
from typing import Optional

# Test configuration
BASE_URL = "http://localhost:8010"
TEST_PUBLISH_TOKEN = "zK62ELnYQtkw7lm4yoQAjk94DzdfACWhhGR-db86oto"  # Replace with actual token


async def test_public_flow_api(token: str):
    """Test all public flow endpoints"""
    async with aiohttp.ClientSession() as session:
        
        print(f"🔍 Testing public flow API with token: {token}")
        
        # Test 1: Get published flow info
        print("\n1. Testing published flow info...")
        try:
            async with session.get(f"{BASE_URL}/api/v1/personal-test/process-flow/public/{token}") as resp:
                if resp.status == 200:
                    flow_data = await resp.json()
                    print(f"✅ Flow info: {flow_data.get('name', 'Unknown')} - Nodes: {len(flow_data.get('flow_data', {}).get('nodes', []))}")
                else:
                    print(f"❌ Flow info failed: {resp.status} - {await resp.text()}")
                    return False
        except Exception as e:
            print(f"❌ Flow info error: {e}")
            return False
        
        # Test 2: Get equipment status
        print("\n2. Testing equipment status...")
        try:
            async with session.get(f"{BASE_URL}/api/v1/personal-test/process-flow/public/{token}/equipment/status?limit=10") as resp:
                if resp.status == 200:
                    status_data = await resp.json()
                    if isinstance(status_data, dict) and 'items' in status_data:
                        items = status_data['items']
                    else:
                        items = status_data if isinstance(status_data, list) else []
                    print(f"✅ Equipment status: {len(items)} items")
                    if items:
                        print(f"   Sample: {items[0].get('equipment_code', 'Unknown')} - {items[0].get('status', 'Unknown')}")
                else:
                    print(f"❌ Equipment status failed: {resp.status} - {await resp.text()}")
        except Exception as e:
            print(f"❌ Equipment status error: {e}")
        
        # Test 3: Get measurements (this is the one that was failing)
        print("\n3. Testing measurements...")
        try:
            async with session.get(f"{BASE_URL}/api/v1/personal-test/process-flow/public/{token}/measurements?limit=10") as resp:
                if resp.status == 200:
                    measurements = await resp.json()
                    print(f"✅ Measurements: {len(measurements)} items")
                    if measurements:
                        print(f"   Sample: {measurements[0].get('equipment_code', 'Unknown')} - {measurements[0].get('measurement_code', 'Unknown')} = {measurements[0].get('measurement_value', 'Unknown')}")
                else:
                    error_text = await resp.text()
                    print(f"❌ Measurements failed: {resp.status}")
                    print(f"   Error: {error_text}")
                    
                    # Try to parse JSON error for more details
                    try:
                        error_json = json.loads(error_text)
                        print(f"   Detail: {error_json.get('detail', 'No detail')}")
                    except:
                        pass
        except Exception as e:
            print(f"❌ Measurements error: {e}")
        
        print("\n🏁 Public API test completed")
        return True


async def test_with_invalid_token():
    """Test with invalid token to verify error handling"""
    print("\n🔍 Testing with invalid token...")
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(f"{BASE_URL}/api/v1/personal-test/process-flow/public/invalid-token/measurements") as resp:
                print(f"Invalid token response: {resp.status} - {await resp.text()}")
        except Exception as e:
            print(f"Invalid token error: {e}")


async def main():
    """Main test function"""
    if len(sys.argv) > 1:
        token = sys.argv[1]
    else:
        token = TEST_PUBLISH_TOKEN
    
    print("🚀 Public Flow API Test Script")
    print(f"Base URL: {BASE_URL}")
    
    # Test with provided/default token
    await test_public_flow_api(token)
    
    # Test with invalid token
    await test_with_invalid_token()


if __name__ == "__main__":
    asyncio.run(main())