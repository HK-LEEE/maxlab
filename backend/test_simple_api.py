#!/usr/bin/env python3
"""
Simple API test without workspace_id
"""
import requests

# Test equipment status endpoint without workspace_id
url = 'http://localhost:8010/api/v1/personal-test/process-flow/equipment/status'

print("🧪 Testing Equipment Status API (without workspace_id)")
print("=" * 50)

params = {'limit': 2}
print(f"\nCalling: {url}")
print(f"Params: {params}")

try:
    response = requests.get(url, params=params)
    print(f"\nStatus Code: {response.status_code}")
    
    if response.status_code == 200:
        print(f"\n✅ Success!")
        print(f"Response: {response.text[:500]}")
    else:
        print(f"\n❌ Error: {response.text}")
        
except Exception as e:
    print(f"\n❌ Request failed: {e}")