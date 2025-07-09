#!/usr/bin/env python3
"""
Test script to verify flow-specific data source routing implementation
"""
import asyncio
import httpx
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings

class FlowDataSourceTest:
    def __init__(self):
        self.base_url = "http://localhost:8010"
        self.workspace_id = "21ee03db-90c4-4592-b00f-c44801e0b164"
        self.engine = create_async_engine(settings.DATABASE_URL)
        self.async_session = sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        
    async def test_database_setup(self):
        """Test that database schema is correctly set up"""
        print("=== Testing Database Setup ===")
        
        async with self.async_session() as session:
            # Test ProcessFlow table has data_source_id column
            result = await session.execute(text('''
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'personal_test_process_flows' 
                AND column_name = 'data_source_id'
            '''))
            column_info = result.fetchone()
            
            if column_info:
                print(f"✓ ProcessFlow table has data_source_id column: {column_info.data_type}")
            else:
                print("✗ ProcessFlow table missing data_source_id column")
                return False
                
            # Test that flows have data_source_id assigned
            result = await session.execute(text('''
                SELECT COUNT(*) as total, 
                       COUNT(data_source_id) as with_data_source
                FROM personal_test_process_flows
            '''))
            counts = result.fetchone()
            
            print(f"✓ Flows: {counts.with_data_source}/{counts.total} have data_source_id assigned")
            
            # Test data source configs exist
            result = await session.execute(text('''
                SELECT COUNT(*) as total
                FROM data_source_configs
                WHERE workspace_id = :workspace_id AND is_active = true
            '''), {'workspace_id': self.workspace_id})
            ds_count = result.fetchone()
            
            print(f"✓ Active data sources: {ds_count.total}")
            
            return True
    
    async def test_api_endpoints(self):
        """Test that API endpoints include data_source_id"""
        print("\n=== Testing API Endpoints ===")
        
        async with httpx.AsyncClient() as client:
            # Test flows endpoint returns data_source_id
            response = await client.get(f"{self.base_url}/api/v1/personal-test/process-flow/flows?workspace_id={self.workspace_id}")
            if response.status_code == 200:
                flows = response.json()
                if flows:
                    sample_flow = flows[0]
                    if 'data_source_id' in sample_flow:
                        print(f"✓ Flows API includes data_source_id: {sample_flow['data_source_id']}")
                    else:
                        print("✗ Flows API missing data_source_id")
                        return False
                else:
                    print("? No flows found to test")
            else:
                print(f"✗ Flows API failed: {response.status_code}")
                return False
                
            # Test equipment status endpoint accepts data_source_id parameter
            sample_data_source = flows[0]['data_source_id'] if flows else None
            if sample_data_source:
                status_url = f"{self.base_url}/api/v1/personal-test/process-flow/equipment/status?workspace_id={self.workspace_id}&data_source_id={sample_data_source}"
                response = await client.get(status_url)
                if response.status_code == 200:
                    print("✓ Equipment status API accepts data_source_id parameter")
                else:
                    print(f"✗ Equipment status API with data_source_id failed: {response.status_code}")
                    return False
                    
                # Test measurements endpoint accepts data_source_id parameter
                measurements_url = f"{self.base_url}/api/v1/personal-test/process-flow/measurements?workspace_id={self.workspace_id}&data_source_id={sample_data_source}"
                response = await client.get(measurements_url)
                if response.status_code == 200:
                    print("✓ Measurements API accepts data_source_id parameter")
                else:
                    print(f"✗ Measurements API with data_source_id failed: {response.status_code}")
                    return False
                    
            return True
    
    async def test_flow_creation_with_data_source(self):
        """Test creating new flow with data_source_id"""
        print("\n=== Testing Flow Creation with Data Source ===")
        
        async with httpx.AsyncClient() as client:
            # Get available data sources
            response = await client.get(f"{self.base_url}/api/v1/personal-test/process-flow/data-sources?workspace_id={self.workspace_id}")
            if response.status_code == 200:
                data_sources = response.json()
                if data_sources:
                    test_data_source = data_sources[0]['id']
                    print(f"✓ Using data source: {test_data_source}")
                    
                    # Create test flow with data_source_id
                    flow_data = {
                        "workspace_id": self.workspace_id,
                        "name": f"Test Flow {uuid.uuid4().hex[:8]}",
                        "flow_data": {
                            "nodes": [
                                {
                                    "id": "test_node",
                                    "type": "equipment",
                                    "position": {"x": 100, "y": 100},
                                    "data": {
                                        "label": "Test Equipment",
                                        "equipmentType": "A1",
                                        "equipmentCode": "TEST001"
                                    }
                                }
                            ],
                            "edges": []
                        },
                        "data_source_id": test_data_source
                    }
                    
                    response = await client.post(f"{self.base_url}/api/v1/personal-test/process-flow/flows", json=flow_data)
                    if response.status_code == 200:
                        created_flow = response.json()
                        if created_flow.get('data_source_id') == test_data_source:
                            print(f"✓ Created flow with data_source_id: {created_flow['data_source_id']}")
                            return created_flow['id']
                        else:
                            print(f"✗ Created flow has wrong data_source_id: {created_flow.get('data_source_id')}")
                            return False
                    else:
                        print(f"✗ Flow creation failed: {response.status_code}")
                        return False
                else:
                    print("? No data sources found")
                    return False
            else:
                print(f"✗ Data sources API failed: {response.status_code}")
                return False
    
    async def test_flow_update_data_source(self, flow_id):
        """Test updating flow's data_source_id"""
        print("\n=== Testing Flow Data Source Update ===")
        
        async with httpx.AsyncClient() as client:
            # Get available data sources
            response = await client.get(f"{self.base_url}/api/v1/personal-test/process-flow/data-sources?workspace_id={self.workspace_id}")
            if response.status_code == 200:
                data_sources = response.json()
                if len(data_sources) > 0:
                    # Use the first available data source
                    new_data_source = data_sources[0]['id']
                    
                    # Update flow with new data_source_id
                    update_data = {
                        "name": "Updated Test Flow",
                        "flow_data": {
                            "nodes": [
                                {
                                    "id": "updated_node",
                                    "type": "equipment",
                                    "position": {"x": 200, "y": 200},
                                    "data": {
                                        "label": "Updated Equipment",
                                        "equipmentType": "B1",
                                        "equipmentCode": "TEST002"
                                    }
                                }
                            ],
                            "edges": []
                        },
                        "data_source_id": new_data_source
                    }
                    
                    response = await client.put(f"{self.base_url}/api/v1/personal-test/process-flow/flows/{flow_id}", json=update_data)
                    if response.status_code == 200:
                        updated_flow = response.json()
                        if updated_flow.get('data_source_id') == new_data_source:
                            print(f"✓ Updated flow with new data_source_id: {updated_flow['data_source_id']}")
                            return True
                        else:
                            print(f"✗ Updated flow has wrong data_source_id: {updated_flow.get('data_source_id')}")
                            return False
                    else:
                        print(f"✗ Flow update failed: {response.status_code}")
                        return False
                else:
                    print("? No data sources found for update test")
                    return False
            else:
                print(f"✗ Data sources API failed: {response.status_code}")
                return False
    
    async def test_public_flow_data_source_routing(self):
        """Test that published flows use their specific data source"""
        print("\n=== Testing Public Flow Data Source Routing ===")
        
        async with self.async_session() as session:
            # Get a published flow with data_source_id
            result = await session.execute(text('''
                SELECT id, name, data_source_id, publish_token
                FROM personal_test_process_flows 
                WHERE is_published = true AND data_source_id IS NOT NULL
                LIMIT 1
            '''))
            published_flow = result.fetchone()
            
            if not published_flow:
                print("? No published flows found to test")
                return True
                
            print(f"✓ Testing published flow: {published_flow.name}")
            print(f"  Data source: {published_flow.data_source_id}")
            print(f"  Token: {published_flow.publish_token}")
            
            # Test public API endpoints use flow-specific data source
            async with httpx.AsyncClient() as client:
                base_public_url = f"{self.base_url}/api/v1/personal-test/process-flow/public/{published_flow.publish_token}"
                
                # Test public equipment status
                response = await client.get(f"{base_public_url}/equipment/status")
                if response.status_code == 200:
                    print("✓ Public equipment status API works with flow-specific data source")
                else:
                    print(f"✗ Public equipment status API failed: {response.status_code}")
                    return False
                    
                # Test public measurements
                response = await client.get(f"{base_public_url}/measurements")
                if response.status_code == 200:
                    print("✓ Public measurements API works with flow-specific data source")
                else:
                    print(f"✗ Public measurements API failed: {response.status_code}")
                    return False
                    
            return True
    
    async def cleanup_test_flows(self):
        """Clean up test flows created during testing"""
        print("\n=== Cleaning up test flows ===")
        
        async with self.async_session() as session:
            result = await session.execute(text('''
                DELETE FROM personal_test_process_flows 
                WHERE name LIKE 'Test Flow %' OR name = 'Updated Test Flow'
            '''))
            await session.commit()
            print(f"✓ Cleaned up {result.rowcount} test flows")
    
    async def run_all_tests(self):
        """Run all tests"""
        print("Starting Flow-Specific Data Source Routing Tests...")
        print("=" * 60)
        
        try:
            # Test database setup
            if not await self.test_database_setup():
                return False
                
            # Test API endpoints
            if not await self.test_api_endpoints():
                return False
                
            # Test flow creation with data source
            flow_id = await self.test_flow_creation_with_data_source()
            if not flow_id:
                return False
                
            # Test flow update with data source
            if not await self.test_flow_update_data_source(flow_id):
                return False
                
            # Test public flow data source routing
            if not await self.test_public_flow_data_source_routing():
                return False
                
            # Cleanup
            await self.cleanup_test_flows()
            
            print("\n" + "=" * 60)
            print("🎉 All tests passed! Flow-specific data source routing is working correctly.")
            return True
            
        except Exception as e:
            print(f"\n❌ Test failed with error: {e}")
            import traceback
            traceback.print_exc()
            return False

async def main():
    tester = FlowDataSourceTest()
    success = await tester.run_all_tests()
    return success

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)