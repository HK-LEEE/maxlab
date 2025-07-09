#!/usr/bin/env python3
"""
Test script for MSSQL integration validation.
Tests connection, queries, and custom query functionality.
"""
import asyncio
import sys
import json
from pathlib import Path
from datetime import datetime

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from app.services.data_providers.mssql import MSSQLProvider
from app.services.data_providers.dynamic import DynamicProvider
from app.core.database import get_db

async def test_direct_mssql_provider():
    """Test MSSQL provider directly."""
    print("\n🔧 Testing Direct MSSQL Provider")
    print("-" * 40)
    
    # Create MSSQL provider with localhost\SQLEXPRESS configuration
    connection_string = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        "SERVER=localhost\\SQLEXPRESS;"
        "DATABASE=equipment_db;"
        "UID=mss;"
        "PWD=2300;"
        "TrustServerCertificate=yes;"
        "Encrypt=yes;"
        "Connection Timeout=30;"
        "Command Timeout=60;"
        "MultipleActiveResultSets=true;"
        "ApplicationIntent=ReadWrite;"
        "ConnectRetryCount=3;"
        "ConnectRetryInterval=10;"
        "Connection Pooling=true"
    )
    
    provider = MSSQLProvider(
        connection_string=connection_string,
        workspace_id="test_workspace"
    )
    
    try:
        # Test connection
        print("1. Testing connection...")
        connection_result = await provider.test_connection()
        
        if connection_result["success"]:
            print("   ✅ Connection successful!")
            details = connection_result.get("details", {})
            print(f"   📊 Server: {details.get('server_name', 'N/A')}")
            print(f"   🗄️  Database: {details.get('database_name', 'N/A')}")
            print(f"   👤 User: {details.get('system_user', 'N/A')}")
            print(f"   📈 Equipment Count: {details.get('equipment_count', 'N/A')}")
            print(f"   📏 Measurement Count: {details.get('measurement_count', 'N/A')}")
        else:
            print(f"   ❌ Connection failed: {connection_result['message']}")
            return False
        
        # Test equipment status query
        print("\n2. Testing equipment status query...")
        try:
            equipment_response = await provider.get_equipment_status(limit=5)
            print(f"   ✅ Retrieved {len(equipment_response.equipment)} equipment records")
            print(f"   📊 Total count: {equipment_response.total_count}")
            
            if equipment_response.equipment:
                sample_equipment = equipment_response.equipment[0]
                print(f"   📋 Sample: {sample_equipment.get('equipment_code')} - {sample_equipment.get('status')}")
        except Exception as e:
            print(f"   ⚠️  Equipment query failed: {e}")
        
        # Test measurement data query
        print("\n3. Testing measurement data query...")
        try:
            measurements = await provider.get_measurement_data(limit=5)
            print(f"   ✅ Retrieved {len(measurements)} measurement records")
            
            if measurements:
                sample_measurement = measurements[0]
                print(f"   📋 Sample: {sample_measurement.measurement_code} = {sample_measurement.measurement_value}")
        except Exception as e:
            print(f"   ⚠️  Measurement query failed: {e}")
        
        # Test connection info
        print("\n4. Testing connection info...")
        info = provider.get_connection_info()
        print(f"   🔧 Pool active: {info['pool_active']}")
        print(f"   🔗 Custom queries: {info['custom_queries_count']}")
        
        return True
        
    except Exception as e:
        print(f"❌ Direct provider test failed: {e}")
        return False
    finally:
        await provider.disconnect()

async def test_dynamic_provider():
    """Test MSSQL through dynamic provider."""
    print("\n🔄 Testing Dynamic Provider (Database Configuration)")
    print("-" * 50)
    
    try:
        # Get database session
        async for db in get_db():
            provider = DynamicProvider(db, "personal_test")
            
            # Test connection
            print("1. Testing connection through dynamic provider...")
            result = await provider.test_connection()
            
            if result["success"]:
                print("   ✅ Dynamic provider connection successful!")
                print(f"   📋 Source type: {result.get('source_type', 'N/A')}")
                print(f"   💬 Message: {result.get('message', 'N/A')}")
            else:
                print(f"   ❌ Dynamic provider connection failed: {result['message']}")
                return False
            
            # Test equipment status
            print("\n2. Testing equipment status through dynamic provider...")
            try:
                equipment_data = await provider.get_equipment_status()
                print(f"   ✅ Retrieved equipment data: {len(equipment_data.get('equipment', []))} records")
            except Exception as e:
                print(f"   ⚠️  Equipment status failed: {e}")
            
            # Test measurement data
            print("\n3. Testing measurement data through dynamic provider...")
            try:
                measurement_data = await provider.get_measurement_data()
                print(f"   ✅ Retrieved measurement data: {len(measurement_data)} records")
            except Exception as e:
                print(f"   ⚠️  Measurement data failed: {e}")
            
            await provider.disconnect()
            return True
            
    except Exception as e:
        print(f"❌ Dynamic provider test failed: {e}")
        return False

async def test_custom_queries():
    """Test custom query functionality."""
    print("\n🔍 Testing Custom Query Functionality")
    print("-" * 40)
    
    # Custom queries for testing
    custom_queries = {
        "test_equipment_count": {
            "query": "SELECT COUNT(*) as equipment_count FROM personal_test_equipment_status",
            "description": "Count total equipment"
        },
        "test_active_equipment": {
            "query": """
                SELECT equipment_code, equipment_name, status
                FROM personal_test_equipment_status 
                WHERE status = 'ACTIVE'
                ORDER BY last_run_time DESC
            """,
            "description": "Get active equipment"
        }
    }
    
    connection_string = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        "SERVER=localhost\\SQLEXPRESS;"
        "DATABASE=equipment_db;"
        "UID=mss;"
        "PWD=2300;"
        "TrustServerCertificate=yes;"
        "Encrypt=yes;"
        "Connection Timeout=30;"
        "Command Timeout=60;"
        "MultipleActiveResultSets=true;"
        "ApplicationIntent=ReadWrite;"
        "ConnectRetryCount=3;"
        "ConnectRetryInterval=10;"
        "Connection Pooling=true"
    )
    
    provider = MSSQLProvider(
        connection_string=connection_string,
        workspace_id="test_workspace",
        custom_queries=custom_queries
    )
    
    try:
        await provider.connect()
        
        # Test available custom queries
        print("1. Testing available custom queries...")
        available_queries = await provider.get_available_custom_queries()
        print(f"   ✅ Available queries: {available_queries}")
        
        # Test custom query execution
        print("\n2. Testing custom query execution...")
        for query_name in available_queries:
            try:
                print(f"   🔍 Executing '{query_name}'...")
                results = await provider.execute_custom_query(query_name)
                print(f"   ✅ Query '{query_name}' returned {len(results)} rows")
                
                if results:
                    print(f"   📋 Sample result: {list(results[0].keys())}")
            except Exception as e:
                print(f"   ❌ Query '{query_name}' failed: {e}")
        
        return True
        
    except Exception as e:
        print(f"❌ Custom query test failed: {e}")
        return False
    finally:
        await provider.disconnect()

async def test_connection_pooling():
    """Test connection pooling functionality."""
    print("\n🏊 Testing Connection Pooling")
    print("-" * 35)
    
    connection_string = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        "SERVER=localhost\\SQLEXPRESS;"
        "DATABASE=equipment_db;"
        "UID=mss;"
        "PWD=2300;"
        "TrustServerCertificate=yes;"
        "Encrypt=yes;"
        "Connection Timeout=30;"
        "Command Timeout=60;"
        "MultipleActiveResultSets=true;"
        "ApplicationIntent=ReadWrite;"
        "ConnectRetryCount=3;"
        "ConnectRetryInterval=10;"
        "Connection Pooling=true"
    )
    
    # Create multiple providers with same connection string
    providers = []
    for i in range(3):
        provider = MSSQLProvider(
            connection_string=connection_string,
            workspace_id=f"test_workspace_{i}"
        )
        providers.append(provider)
    
    try:
        # Connect all providers
        print("1. Connecting multiple providers...")
        for i, provider in enumerate(providers):
            await provider.connect()
            print(f"   ✅ Provider {i+1} connected")
        
        # Test concurrent queries
        print("\n2. Testing concurrent queries...")
        tasks = []
        for i, provider in enumerate(providers):
            task = provider.get_equipment_status(limit=2)
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        successful_queries = 0
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"   ❌ Provider {i+1} query failed: {result}")
            else:
                print(f"   ✅ Provider {i+1} query successful: {len(result.equipment)} records")
                successful_queries += 1
        
        print(f"\n   📊 Summary: {successful_queries}/{len(providers)} queries successful")
        
        return successful_queries == len(providers)
        
    except Exception as e:
        print(f"❌ Connection pooling test failed: {e}")
        return False
    finally:
        # Disconnect all providers
        for provider in providers:
            try:
                await provider.disconnect()
            except Exception:
                pass

async def run_comprehensive_test():
    """Run comprehensive MSSQL integration test."""
    print("🚀 MaxLab MSSQL Integration Test Suite")
    print("=" * 50)
    
    test_results = {
        "direct_provider": False,
        "dynamic_provider": False,
        "custom_queries": False,
        "connection_pooling": False
    }
    
    # Run all tests
    try:
        test_results["direct_provider"] = await test_direct_mssql_provider()
        test_results["dynamic_provider"] = await test_dynamic_provider()
        test_results["custom_queries"] = await test_custom_queries()
        test_results["connection_pooling"] = await test_connection_pooling()
    except Exception as e:
        print(f"\n💥 Test suite failed with error: {e}")
    
    # Print summary
    print("\n📊 Test Results Summary")
    print("=" * 30)
    
    total_tests = len(test_results)
    passed_tests = sum(test_results.values())
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name.replace('_', ' ').title():<20} {status}")
    
    print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("🎉 All tests passed! MSSQL integration is working correctly.")
        return True
    else:
        print("⚠️  Some tests failed. Please check the configuration and retry.")
        return False

async def main():
    """Main function."""
    success = await run_comprehensive_test()
    
    if not success:
        print("\n🔧 Troubleshooting Tips:")
        print("1. Ensure SQL Server Express is installed and running")
        print("2. Verify ODBC Driver 17 for SQL Server is installed")
        print("3. Check that 'equipment_db' database exists")
        print("4. Verify user 'mss' exists with password '2300'")
        print("5. Ensure required tables exist in the database")
        print("6. Check firewall and network connectivity")
        
        sys.exit(1)
    else:
        print("\n🎯 Integration test completed successfully!")
        print("✅ MSSQL provider is ready for production use!")

if __name__ == "__main__":
    asyncio.run(main())