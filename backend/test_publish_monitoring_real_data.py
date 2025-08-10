#!/usr/bin/env python3
"""
Test script to verify that publish monitoring uses real data sources
instead of mock data after the implementation changes.
"""
import asyncio
import sys
import os
import json
from datetime import datetime
import httpx

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import AsyncSessionLocal, engine
from app.core.security import decrypt_connection_string
from app.services.data_providers.dynamic import DynamicProvider
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

async def test_data_source_configuration(db: AsyncSession):
    """Test that data source configurations are properly set up"""
    print("\n" + "="*60)
    print("1. Testing Data Source Configuration")
    print("="*60)
    
    try:
        # Get a published flow with data source
        query = text("""
            SELECT 
                f.id, f.name, f.data_source_id, f.publish_token,
                d.source_type, d.mssql_connection_string, d.api_url
            FROM personal_test_process_flows f
            LEFT JOIN data_source_configs d ON f.data_source_id = d.id
            WHERE f.is_published = true AND f.data_source_id IS NOT NULL
            LIMIT 1
        """)
        
        result = await db.execute(query)
        flow = result.fetchone()
        
        if not flow:
            print("❌ No published flows with data sources found")
            return None, None
        
        print(f"✅ Found published flow: {flow.name}")
        print(f"   - Flow ID: {flow.id}")
        print(f"   - Publish Token: {flow.publish_token}")
        print(f"   - Data Source ID: {flow.data_source_id}")
        print(f"   - Source Type: {flow.source_type}")
        
        # Test decryption
        if flow.mssql_connection_string:
            decrypted = decrypt_connection_string(flow.mssql_connection_string)
            if decrypted:
                print(f"   ✅ Connection string successfully decrypted")
            else:
                print(f"   ❌ Failed to decrypt connection string")
        
        return flow.publish_token, flow.data_source_id
        
    except Exception as e:
        print(f"❌ Error checking data source configuration: {e}")
        return None, None

async def test_dynamic_provider(db: AsyncSession, data_source_id: str):
    """Test DynamicProvider with execute_sql method"""
    print("\n" + "="*60)
    print("2. Testing DynamicProvider execute_sql")
    print("="*60)
    
    try:
        provider = DynamicProvider(
            db_session=db,
            workspace_id="",
            data_source_id=data_source_id
        )
        
        # Test a simple query
        test_query = "SELECT 1 as test_value, 'DynamicProvider' as source, CURRENT_TIMESTAMP as query_time"
        
        print(f"Executing test query: {test_query}")
        results = await provider.execute_sql(test_query)
        
        if results:
            print(f"✅ Query executed successfully")
            print(f"   Results: {json.dumps(results, indent=2, default=str)}")
        else:
            print(f"⚠️ Query returned no results")
        
        await provider.disconnect()
        return True
        
    except Exception as e:
        print(f"❌ Error testing DynamicProvider: {e}")
        return False

async def test_public_monitoring_endpoint(publish_token: str):
    """Test the public monitoring endpoint to verify it returns real data"""
    print("\n" + "="*60)
    print("3. Testing Public Monitoring Endpoint")
    print("="*60)
    
    try:
        # Test the public monitoring endpoint
        url = f"http://localhost:8100/api/v1/personal-test/process-flow/public/{publish_token}/monitoring/integrated-data"
        
        print(f"Testing endpoint: {url}")
        
        # Create flow data with a table node that has SQL query
        flow_data = {
            "nodes": [
                {
                    "id": "table_1",
                    "type": "table",
                    "data": {
                        "queryConfig": {
                            "sql": "SELECT * FROM personal_test_equipment_status LIMIT 5",
                            "dataSourceId": "test_source"
                        },
                        "tableConfig": {
                            "maxRows": 10
                        }
                    }
                }
            ]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"flow_data": json.dumps(flow_data)},
                timeout=30.0
            )
            
            print(f"Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check if we got real data instead of mock data
                if "table_data" in data:
                    table_data = data.get("table_data", {})
                    if table_data:
                        for node_id, node_data in table_data.items():
                            if node_data.get("data"):
                                # Check if data looks like mock data
                                first_row = node_data["data"][0] if node_data["data"] else {}
                                
                                # Mock data typically has "Item 1", "Item 2" pattern
                                if "name" in first_row and "Item " in str(first_row.get("name", "")):
                                    print(f"⚠️ Table data appears to be mock data")
                                else:
                                    print(f"✅ Table data appears to be real data from database")
                                    print(f"   Columns: {node_data.get('columns', [])}")
                                    print(f"   Row count: {node_data.get('row_count', 0)}")
                            else:
                                print(f"ℹ️ No data returned for table node {node_id}")
                
                # Check equipment and measurement data
                equipment_count = len(data.get("equipment_statuses", []))
                measurement_count = len(data.get("measurements", []))
                
                print(f"\n📊 Data Summary:")
                print(f"   - Equipment statuses: {equipment_count}")
                print(f"   - Measurements: {measurement_count}")
                print(f"   - Table nodes: {len(table_data)}")
                
                return True
            else:
                print(f"❌ Endpoint returned error: {response.status_code}")
                if response.text:
                    print(f"   Error: {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ Error testing public endpoint: {e}")
        return False

async def main():
    """Main test function"""
    print("\n" + "="*60)
    print("Testing Publish Monitoring Real Data Implementation")
    print("="*60)
    print(f"Started at: {datetime.now().isoformat()}")
    
    async with AsyncSessionLocal() as db:
        # Test 1: Check data source configuration
        publish_token, data_source_id = await test_data_source_configuration(db)
        
        if not publish_token or not data_source_id:
            print("\n⚠️ Cannot proceed without published flow and data source")
            return
        
        # Test 2: Test DynamicProvider
        provider_success = await test_dynamic_provider(db, data_source_id)
        
        # Test 3: Test public monitoring endpoint
        endpoint_success = await test_public_monitoring_endpoint(publish_token)
        
        # Summary
        print("\n" + "="*60)
        print("Test Summary")
        print("="*60)
        
        if provider_success and endpoint_success:
            print("✅ All tests passed! Publish monitoring is now using real data sources.")
        elif provider_success:
            print("⚠️ DynamicProvider works but endpoint may need additional configuration.")
        else:
            print("❌ Tests failed. Please check the implementation and error messages above.")
        
        print(f"\nCompleted at: {datetime.now().isoformat()}")

if __name__ == "__main__":
    asyncio.run(main())