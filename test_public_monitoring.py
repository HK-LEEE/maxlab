#!/usr/bin/env python3
"""
Test script to verify public monitoring endpoints work without authentication
"""
import requests
import json
import time

# Test configuration
BASE_URL = "http://172.28.36.241:8010"
# You'll need to replace this with an actual valid publish token
# This is just for testing the authentication bypass
TEST_PUBLISH_TOKEN = "test_token_123"

def test_public_monitoring_endpoints():
    """Test that public monitoring endpoints are accessible without authentication"""
    
    endpoints = [
        f"/api/v1/personal-test/process-flow/public/{TEST_PUBLISH_TOKEN}/monitoring/integrated-data",
        f"/api/v1/personal-test/process-flow/public/{TEST_PUBLISH_TOKEN}/equipment/status",
        f"/api/v1/personal-test/process-flow/public/{TEST_PUBLISH_TOKEN}/measurements"
    ]
    
    print("Testing public monitoring endpoints without authentication...")
    print("=" * 60)
    
    for endpoint in endpoints:
        url = BASE_URL + endpoint
        print(f"\nTesting: {endpoint}")
        print("-" * 40)
        
        try:
            # Make request without any authentication headers or cookies
            response = requests.get(url, timeout=5)
            
            print(f"Status Code: {response.status_code}")
            
            # Check if we're getting authentication errors
            if response.status_code == 401:
                print("❌ FAILED: Got 401 Unauthorized - Session middleware still blocking!")
                print(f"Response: {response.text[:200]}...")
            elif response.status_code == 403:
                print("❌ FAILED: Got 403 Forbidden - Access denied")
                print(f"Response: {response.text[:200]}...")
            elif response.status_code == 404:
                print("✅ PASSED: Got 404 - Token not found (expected for invalid token)")
                print("This means the endpoint is accessible without authentication!")
            elif response.status_code == 400:
                print("✅ PASSED: Got 400 - Bad request (likely invalid token)")
                print("This means the endpoint is accessible without authentication!")
            elif response.status_code == 200:
                print("✅ PASSED: Got 200 OK - Endpoint is fully accessible!")
                print(f"Response preview: {str(response.json())[:100]}...")
            else:
                print(f"⚠️  Got unexpected status code: {response.status_code}")
                print(f"Response: {response.text[:200]}...")
                
        except requests.exceptions.Timeout:
            print("❌ FAILED: Request timed out - might be stuck in authentication loop")
        except requests.exceptions.ConnectionError as e:
            print(f"❌ FAILED: Connection error - {str(e)}")
        except Exception as e:
            print(f"❌ FAILED: Unexpected error - {str(e)}")
    
    print("\n" + "=" * 60)
    print("Test complete!")
    print("\nNote: 404/400 responses are GOOD - they mean the endpoint is accessible")
    print("      but the token is invalid. 401/403 responses are BAD - they mean")
    print("      authentication is still blocking access.")

if __name__ == "__main__":
    test_public_monitoring_endpoints()