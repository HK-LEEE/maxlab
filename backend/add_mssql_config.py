#!/usr/bin/env python3
"""
Add MSSQL Server configuration to the database.
This script adds the localhost\SQLEXPRESS configuration with encrypted credentials.
"""
import asyncio
import sys
import os
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import uuid
from datetime import datetime

from app.core.config import settings
from app.core.security import encrypt_connection_string

async def add_mssql_configuration():
    """Add MSSQL server configuration to the database."""
    
    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=True
    )
    
    # Create async session
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    try:
        async with async_session() as session:
            print("🔍 Checking for existing MSSQL configuration...")
            
            # Check if personal_test workspace exists
            workspace_query = text("""
                SELECT id, name, slug 
                FROM workspaces 
                WHERE slug = 'personal_test' OR name = 'Personal Test Workspace'
                LIMIT 1
            """)
            
            result = await session.execute(workspace_query)
            workspace = result.fetchone()
            
            if not workspace:
                print("❌ Personal Test workspace not found. Creating it...")
                # Create the workspace first
                workspace_id = str(uuid.uuid4())
                create_workspace_query = text("""
                    INSERT INTO workspaces (id, name, slug, description, created_at, updated_at)
                    VALUES (:id, :name, :slug, :description, :created_at, :updated_at)
                """)
                
                await session.execute(create_workspace_query, {
                    "id": workspace_id,
                    "name": "Personal Test Workspace",
                    "slug": "personal_test",
                    "description": "Personal workspace for testing MSSQL integration",
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                })
                print(f"✅ Created Personal Test workspace with ID: {workspace_id}")
            else:
                workspace_id = str(workspace.id)
                print(f"✅ Found existing workspace: {workspace.name} (ID: {workspace_id})")
            
            # Check for existing MSSQL configuration
            existing_config_query = text("""
                SELECT id, source_type, is_active
                FROM data_source_configs
                WHERE workspace_id = :workspace_id AND source_type = 'MSSQL'
            """)
            
            result = await session.execute(existing_config_query, {"workspace_id": workspace_id})
            existing_config = result.fetchone()
            
            if existing_config:
                print(f"⚠️  Existing MSSQL configuration found (ID: {existing_config.id})")
                
                # Update existing configuration
                print("🔄 Updating existing MSSQL configuration...")
                
                # MSSQL connection string with localhost\SQLEXPRESS - Enhanced for ODBC 17
                mssql_connection_string = (
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
                
                # Encrypt the connection string
                encrypted_connection_string = encrypt_connection_string(mssql_connection_string)
                
                # Custom queries for MSSQL
                custom_queries = {
                    "equipment_status": {
                        "query": """
                            SELECT 
                                equipment_code,
                                equipment_name,
                                equipment_type,
                                status,
                                last_run_time,
                                0 as active_alarm_count
                            FROM personal_test_equipment_status
                            WHERE 1=1
                            {{#if equipment_type}} AND equipment_type = '{{equipment_type}}' {{/if}}
                            {{#if status}} AND status = '{{status}}' {{/if}}
                            ORDER BY last_run_time DESC
                        """,
                        "description": "Get equipment status with optional filtering"
                    },
                    "measurement_data": {
                        "query": """
                            SELECT 
                                m.id,
                                m.equipment_type,
                                m.equipment_code,
                                m.measurement_code,
                                m.measurement_desc,
                                m.measurement_value,
                                m.timestamp,
                                s.usl,
                                s.lsl,
                                s.target,
                                CASE 
                                    WHEN s.usl IS NOT NULL AND m.measurement_value > s.usl THEN 1
                                    WHEN s.lsl IS NOT NULL AND m.measurement_value < s.lsl THEN 1
                                    ELSE 0
                                END as spec_status
                            FROM personal_test_measurement_data m
                            LEFT JOIN measurement_specs s ON m.measurement_code = s.measurement_code
                            WHERE 1=1
                            {{#if equipment_code}} AND m.equipment_code = '{{equipment_code}}' {{/if}}
                            {{#if equipment_type}} AND m.equipment_type = '{{equipment_type}}' {{/if}}
                            ORDER BY m.timestamp DESC
                        """,
                        "description": "Get measurement data with spec calculations"
                    },
                    "equipment_summary": {
                        "query": """
                            SELECT 
                                equipment_type,
                                COUNT(*) as total_count,
                                SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
                                SUM(CASE WHEN status = 'PAUSE' THEN 1 ELSE 0 END) as pause_count,
                                SUM(CASE WHEN status = 'STOP' THEN 1 ELSE 0 END) as stop_count,
                                MAX(last_run_time) as latest_run_time
                            FROM personal_test_equipment_status
                            GROUP BY equipment_type
                            ORDER BY equipment_type
                        """,
                        "description": "Get equipment summary by type"
                    }
                }
                
                update_query = text("""
                    UPDATE data_source_configs
                    SET 
                        mssql_connection_string = :mssql_connection_string,
                        custom_queries = :custom_queries,
                        is_active = true,
                        updated_at = :updated_at
                    WHERE id = :config_id
                """)
                
                await session.execute(update_query, {
                    "config_id": existing_config.id,
                    "mssql_connection_string": encrypted_connection_string,
                    "custom_queries": custom_queries,
                    "updated_at": datetime.utcnow()
                })
                
                print(f"✅ Updated MSSQL configuration (ID: {existing_config.id})")
                
            else:
                # Create new MSSQL configuration
                print("🆕 Creating new MSSQL configuration...")
                
                config_id = str(uuid.uuid4())
                
                # MSSQL connection string with localhost\SQLEXPRESS - Enhanced for ODBC 17
                mssql_connection_string = (
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
                
                # Encrypt the connection string
                encrypted_connection_string = encrypt_connection_string(mssql_connection_string)
                
                # Custom queries for MSSQL
                custom_queries = {
                    "equipment_status": {
                        "query": """
                            SELECT 
                                equipment_code,
                                equipment_name,
                                equipment_type,
                                status,
                                last_run_time,
                                0 as active_alarm_count
                            FROM personal_test_equipment_status
                            WHERE 1=1
                            {{#if equipment_type}} AND equipment_type = '{{equipment_type}}' {{/if}}
                            {{#if status}} AND status = '{{status}}' {{/if}}
                            ORDER BY last_run_time DESC
                        """,
                        "description": "Get equipment status with optional filtering"
                    },
                    "measurement_data": {
                        "query": """
                            SELECT 
                                m.id,
                                m.equipment_type,
                                m.equipment_code,
                                m.measurement_code,
                                m.measurement_desc,
                                m.measurement_value,
                                m.timestamp,
                                s.usl,
                                s.lsl,
                                s.target,
                                CASE 
                                    WHEN s.usl IS NOT NULL AND m.measurement_value > s.usl THEN 1
                                    WHEN s.lsl IS NOT NULL AND m.measurement_value < s.lsl THEN 1
                                    ELSE 0
                                END as spec_status
                            FROM personal_test_measurement_data m
                            LEFT JOIN measurement_specs s ON m.measurement_code = s.measurement_code
                            WHERE 1=1
                            {{#if equipment_code}} AND m.equipment_code = '{{equipment_code}}' {{/if}}
                            {{#if equipment_type}} AND m.equipment_type = '{{equipment_type}}' {{/if}}
                            ORDER BY m.timestamp DESC
                        """,
                        "description": "Get measurement data with spec calculations"
                    },
                    "equipment_summary": {
                        "query": """
                            SELECT 
                                equipment_type,
                                COUNT(*) as total_count,
                                SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
                                SUM(CASE WHEN status = 'PAUSE' THEN 1 ELSE 0 END) as pause_count,
                                SUM(CASE WHEN status = 'STOP' THEN 1 ELSE 0 END) as stop_count,
                                MAX(last_run_time) as latest_run_time
                            FROM personal_test_equipment_status
                            GROUP BY equipment_type
                            ORDER BY equipment_type
                        """,
                        "description": "Get equipment summary by type"
                    }
                }
                
                insert_query = text("""
                    INSERT INTO data_source_configs (
                        id, workspace_id, source_type, mssql_connection_string, 
                        custom_queries, is_active, created_at, updated_at
                    ) VALUES (
                        :id, :workspace_id, :source_type, :mssql_connection_string,
                        :custom_queries, :is_active, :created_at, :updated_at
                    )
                """)
                
                await session.execute(insert_query, {
                    "id": config_id,
                    "workspace_id": workspace_id,
                    "source_type": "MSSQL",
                    "mssql_connection_string": encrypted_connection_string,
                    "custom_queries": custom_queries,
                    "is_active": True,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                })
                
                print(f"✅ Created new MSSQL configuration (ID: {config_id})")
            
            # Commit the transaction
            await session.commit()
            
            print("\n🎉 MSSQL Configuration Summary:")
            print(f"   📍 Workspace: Personal Test ({workspace_id})")
            print(f"   🔌 Server: localhost\\SQLEXPRESS")
            print(f"   👤 User: mss")
            print(f"   🔐 Password: 2300 (encrypted in database)")
            print(f"   📊 Database: equipment_db")
            print(f"   🔧 Custom Queries: 3 configured")
            print(f"   ✅ Status: Active")
            
            print("\n📝 Available Custom Queries:")
            print("   1. equipment_status - Get equipment status with filtering")
            print("   2. measurement_data - Get measurement data with spec calculations")
            print("   3. equipment_summary - Get equipment summary by type")
            
    except Exception as e:
        print(f"❌ Error adding MSSQL configuration: {e}")
        raise
    finally:
        await engine.dispose()

async def test_mssql_configuration():
    """Test the MSSQL configuration."""
    try:
        print("\n🧪 Testing MSSQL Configuration...")
        
        from app.services.data_providers.dynamic import DynamicProvider
        from app.database import get_db
        
        # Get database session
        async for db in get_db():
            provider = DynamicProvider(db, "personal_test")
            
            # Test connection
            result = await provider.test_connection()
            
            if result["success"]:
                print("✅ MSSQL connection test successful!")
                print(f"   📋 Details: {result.get('message', 'N/A')}")
                if "details" in result:
                    details = result["details"]
                    print(f"   🏷️  Server: {details.get('server_name', 'N/A')}")
                    print(f"   🗄️  Database: {details.get('database_name', 'N/A')}")
                    print(f"   👤 User: {details.get('current_user', 'N/A')}")
            else:
                print(f"❌ MSSQL connection test failed: {result.get('message', 'Unknown error')}")
            
            await provider.disconnect()
            break
            
    except Exception as e:
        print(f"❌ Error testing MSSQL configuration: {e}")

async def main():
    """Main function."""
    print("🚀 MSSQL Configuration Setup for MaxLab")
    print("=" * 50)
    
    try:
        await add_mssql_configuration()
        await test_mssql_configuration()
        
        print("\n🎯 Next Steps:")
        print("1. Ensure SQL Server Express is installed and running")
        print("2. Create 'equipment_db' database on localhost\\SQLEXPRESS")
        print("3. Create user 'mss' with password '2300'")
        print("4. Grant appropriate permissions to the 'mss' user")
        print("5. Create required tables (personal_test_equipment_status, personal_test_measurement_data, etc.)")
        print("6. Test the connection using the MaxLab API endpoints")
        
    except Exception as e:
        print(f"\n💥 Setup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())