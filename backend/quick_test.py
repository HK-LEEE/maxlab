#!/usr/bin/env python3
import requests
print("Testing API...")
try:
    r = requests.get("http://localhost:8010/api/v1/personal-test/process-flow/equipment/status?limit=2", timeout=5)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:200]}")
except Exception as e:
    print(f"Error: {e}")