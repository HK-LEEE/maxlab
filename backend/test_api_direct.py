#!/usr/bin/env python3
"""
Test API endpoint directly
"""
import requests
import json

# Test equipment status endpoint
workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
url = f'http://localhost:8010/api/v1/personal-test/process-flow/equipment/status'

print("🧪 Testing Equipment Status API")
print("=" * 50)

# Test with workspace_id parameter
params = {'workspace_id': workspace_id, 'limit': 5}
print(f"\nCalling: {url}")
print(f"Params: {params}")

try:
    response = requests.get(url, params=params)
    print(f"\nStatus Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Success! Response:")
        print(json.dumps(data, indent=2))
    else:
        print(f"\n❌ Error: {response.text}")
        
except Exception as e:
    print(f"\n❌ Request failed: {e}")

# Test data sources endpoint
print("\n\n🧪 Testing Data Sources API")
print("=" * 50)

url = f'http://localhost:8010/api/v1/personal-test/process-flow/data-sources'
params = {'workspace_id': workspace_id}

print(f"\nCalling: {url}")
print(f"Params: {params}")

try:
    response = requests.get(url, params=params)
    print(f"\nStatus Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Success! Response:")
        print(json.dumps(data, indent=2))
    else:
        print(f"\n❌ Error: {response.text}")
        
except Exception as e:
    print(f"\n❌ Request failed: {e}")