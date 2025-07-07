#!/usr/bin/env python3
"""
Test data sources API with authentication
"""
import requests
import json

# First, login to get token
login_url = 'http://localhost:8010/api/v1/auth/login'
login_data = {
    "email": "admin@example.com",
    "password": "admin123"
}

print("🔐 Logging in...")
try:
    login_response = requests.post(login_url, json=login_data)
    if login_response.status_code == 200:
        auth_data = login_response.json()
        token = auth_data.get('access_token')
        print("✅ Login successful")
    else:
        print(f"❌ Login failed: {login_response.text}")
        exit(1)
except Exception as e:
    print(f"❌ Login request failed: {e}")
    exit(1)

# Test data sources endpoint
workspace_id = '21ee03db-90c4-4592-b00f-c44801e0b164'
url = f'http://localhost:8010/api/v1/personal-test/process-flow/data-sources'

print("\n🧪 Testing Data Sources API")
print("=" * 50)

headers = {
    'Authorization': f'Bearer {token}'
}
params = {'workspace_id': workspace_id}

print(f"\nCalling: {url}")
print(f"Params: {params}")

try:
    response = requests.get(url, params=params, headers=headers)
    print(f"\nStatus Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Success! Found {len(data)} data sources:")
        for ds in data:
            print(f"  - {ds.get('config_name')} ({ds.get('source_type')})")
    else:
        print(f"\n❌ Error: {response.text}")
        
except Exception as e:
    print(f"\n❌ Request failed: {e}")