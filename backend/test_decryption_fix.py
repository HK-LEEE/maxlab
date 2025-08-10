#!/usr/bin/env python3
"""
Test script to verify the decryption fix for public monitoring
"""
import asyncio
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings
from app.core.security import decrypt_connection_string, encrypt_connection_string

async def test_decryption_fix():
    """Test the decryption fix"""
    print("🧪 Testing decryption fix for public monitoring...")
    
    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False
    )
    
    # Create async session
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    try:
        async with async_session() as session:
            print("\n1️⃣ Testing encryption/decryption functionality...")
            
            # Test encryption/decryption with a sample connection string
            sample_conn_string = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=testdb;UID=testuser;PWD=testpass;"
            
            print(f"   Original: {sample_conn_string[:50]}...")
            
            # Encrypt it
            encrypted = encrypt_connection_string(sample_conn_string)
            print(f"   Encrypted: {encrypted[:50]}..." if encrypted else "   Encryption failed")
            
            # Decrypt it
            decrypted = decrypt_connection_string(encrypted)
            print(f"   Decrypted: {decrypted[:50]}..." if decrypted else "   Decryption failed or returned None")
            
            # Check if they match
            if decrypted == sample_conn_string:
                print("   ✅ Encryption/Decryption works correctly")
            elif decrypted is None:
                print("   ❌ Decryption returned None (this is expected for corrupted data)")
            else:
                print("   ❌ Decryption mismatch")
            
            print("\n2️⃣ Testing database data source configurations...")
            
            # Get data source configs with connection strings
            query = text("""
                SELECT 
                    id,
                    workspace_id,
                    source_type,
                    mssql_connection_string,
                    is_active,
                    LENGTH(mssql_connection_string) as connection_string_length
                FROM data_source_configs
                WHERE mssql_connection_string IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 3
            """)
            
            result = await session.execute(query)
            configs = result.fetchall()
            
            if not configs:
                print("   ℹ️ No data source configurations with connection strings found")
                return
            
            for config in configs:
                print(f"\n   📊 Data Source Config {config.id}:")
                print(f"      - Workspace: {config.workspace_id}")
                print(f"      - Type: {config.source_type}")
                print(f"      - Active: {config.is_active}")
                print(f"      - Connection String Length: {config.connection_string_length}")
                
                # Test decryption
                if config.mssql_connection_string:
                    decrypted = decrypt_connection_string(config.mssql_connection_string)
                    
                    if decrypted is None:
                        print("      ❌ Decryption returned None (encryption key mismatch or corrupted data)")
                        print("         This will cause public monitoring to fail with proper error messages")
                    elif decrypted == config.mssql_connection_string:
                        print("      ⚠️ Connection string is stored as plain text (backward compatibility)")
                        print("         Consider re-encrypting with current encryption key")
                    else:
                        print("      ✅ Successfully decrypted connection string")
                        # Check if it looks like a valid connection string
                        if any(keyword in decrypted.upper() for keyword in ['SERVER=', 'DATABASE=', 'DRIVER=']):
                            print("      ✅ Decrypted string appears to be a valid connection string")
                        else:
                            print("      ⚠️ Decrypted string may not be a valid connection string")
            
            print("\n3️⃣ Testing publish token validation...")
            
            # Check for published flows
            publish_query = text("""
                SELECT 
                    f.id as flow_id,
                    f.workspace_id,
                    f.data_source_id,
                    f.publish_token,
                    f.is_published
                FROM personal_test_process_flows f
                WHERE f.is_published = true AND f.publish_token IS NOT NULL
                LIMIT 3
            """)
            
            result = await session.execute(publish_query)
            published_flows = result.fetchall()
            
            if published_flows:
                print(f"   ✅ Found {len(published_flows)} published flows")
                for flow in published_flows:
                    print(f"      - Flow {flow.flow_id}: token={flow.publish_token[:8]}..., data_source_id={flow.data_source_id}")
            else:
                print("   ℹ️ No published flows found")
            
            print("\n4️⃣ Testing decryption with invalid data...")
            
            # Test with various invalid inputs
            test_cases = [
                ("None", None),
                ("Empty string", ""),
                ("Invalid base64", "invalid_base64_data"),
                ("Valid base64 but invalid encryption", "dGVzdCBkYXRh"),  # "test data" in base64
            ]
            
            for test_name, test_value in test_cases:
                print(f"   Testing {test_name}...")
                result = decrypt_connection_string(test_value)
                if result is None:
                    print(f"      ✅ Correctly returned None for {test_name}")
                else:
                    print(f"      ℹ️ Returned value for {test_name}: {result[:30]}...")
                    
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await engine.dispose()
        
    print("\n🏁 Testing completed!")
    print("\n📋 Summary of fixes applied:")
    print("   1. Updated decrypt_connection_string() to return None for failed decryption")
    print("   2. Added proper error handling in public query endpoints")
    print("   3. Distinguished between plain text (backward compatible) and encrypted data")
    print("   4. Improved error messages for debugging")

if __name__ == "__main__":
    asyncio.run(test_decryption_fix())