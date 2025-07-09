#!/usr/bin/env python3
"""
Test script to verify the public API fix
"""
import asyncio
import httpx

async def test_public_api():
    async with httpx.AsyncClient() as client:
        # Test public measurements endpoint
        print("Testing public measurements endpoint...")
        response = await client.get('http://localhost:8010/api/v1/personal-test/process-flow/public/ynft8SDyXhYR4MhpGB8QscEdckx64KFCvcc370RjINg/measurements?limit=10')
        print(f'Status Code: {response.status_code}')
        if response.status_code != 200:
            print(f'Response: {response.text}')
        else:
            print('Success! API returned data')
            
        # Test public equipment status endpoint
        print("\nTesting public equipment status endpoint...")
        response = await client.get('http://localhost:8010/api/v1/personal-test/process-flow/public/ynft8SDyXhYR4MhpGB8QscEdckx64KFCvcc370RjINg/equipment/status?limit=10')
        print(f'Equipment Status Code: {response.status_code}')
        if response.status_code != 200:
            print(f'Equipment Response: {response.text}')
        else:
            print('Success! Equipment API returned data')

if __name__ == "__main__":
    asyncio.run(test_public_api())