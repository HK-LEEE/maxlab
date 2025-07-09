#!/usr/bin/env python3
"""
Complete test script to verify the public API fix
"""
import asyncio
import httpx
import json

async def test_public_api_complete():
    async with httpx.AsyncClient() as client:
        # Test public measurements endpoint
        print("Testing public measurements endpoint...")
        response = await client.get('http://localhost:8010/api/v1/personal-test/process-flow/public/ynft8SDyXhYR4MhpGB8QscEdckx64KFCvcc370RjINg/measurements?limit=3')
        print(f'Status Code: {response.status_code}')
        if response.status_code == 200:
            data = response.json()
            print(f'Success! Returned {len(data)} measurements')
            if data:
                print(f'Sample measurement:')
                print(json.dumps(data[0], indent=2, default=str))
        else:
            print(f'Response: {response.text}')
            
        # Test public equipment status endpoint
        print("\nTesting public equipment status endpoint...")
        response = await client.get('http://localhost:8010/api/v1/personal-test/process-flow/public/ynft8SDyXhYR4MhpGB8QscEdckx64KFCvcc370RjINg/equipment/status?limit=3')
        print(f'Equipment Status Code: {response.status_code}')
        if response.status_code == 200:
            data = response.json()
            print(f'Success! Returned {len(data.get("items", []))} equipment items')
            if data.get("items"):
                print(f'Sample equipment:')
                print(json.dumps(data["items"][0], indent=2, default=str))
        else:
            print(f'Equipment Response: {response.text}')

if __name__ == "__main__":
    asyncio.run(test_public_api_complete())