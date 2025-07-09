#!/usr/bin/env python3
"""
Fix MSSQL connection string with proper encryption
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
from app.core.security import encrypt_connection_string, decrypt_connection_string

async def fix_mssql_connection():
    """Fix MSSQL connection string with proper encryption"""
    
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
            print("🔧 Fixing MSSQL connection string...")
            
            # Create the connection string
            connection_string = (
                "DRIVER={FreeTDS};"
                "SERVER=172.28.32.1;"
                "DATABASE=AIDB;"
                "UID=mss;"
                "PWD=2300;"
                "TrustServerCertificate=yes;"
                "Connection Timeout=30;"
                "Command Timeout=60;"
                "TDS_Version=8.0;"
                "Port=1433"
            )
            
            print(f"📝 Original connection string: {connection_string}")
            
            # Test encryption and decryption
            try:
                encrypted = encrypt_connection_string(connection_string)
                print(f"✅ Encryption successful, length: {len(encrypted)}")
                
                decrypted = decrypt_connection_string(encrypted)
                print(f"✅ Decryption successful: {decrypted}")
                
                if decrypted == connection_string:
                    print("✅ Encryption/decryption cycle successful!")
                else:
                    print("❌ Encryption/decryption cycle failed!")
                    print(f"   Original: {connection_string}")
                    print(f"   Decrypted: {decrypted}")
                    return
                    
            except Exception as e:
                print(f"❌ Encryption/decryption test failed: {e}")
                return
            
            # Find the active MSSQL data source
            find_query = text("""
                SELECT id, workspace_id, source_type, is_active
                FROM data_source_configs
                WHERE source_type = 'MSSQL' AND is_active = true
                ORDER BY created_at DESC
                LIMIT 1
            """)
            
            result = await session.execute(find_query)
            config = result.fetchone()
            
            if not config:
                print("❌ No active MSSQL data source found")
                return
            
            print(f"✅ Found MSSQL config: {config.id}")
            
            # Update the configuration
            update_query = text("""
                UPDATE data_source_configs
                SET 
                    mssql_connection_string = :mssql_connection_string,
                    updated_at = NOW()
                WHERE id = :config_id
            """)
            
            await session.execute(update_query, {
                "config_id": config.id,
                "mssql_connection_string": encrypted
            })
            
            await session.commit()
            
            print(f"✅ Updated MSSQL connection string")
            
            # Verify by retrieving and decrypting
            verify_query = text("""
                SELECT mssql_connection_string
                FROM data_source_configs
                WHERE id = :config_id
            """)
            
            verify_result = await session.execute(verify_query, {"config_id": config.id})
            verify_config = verify_result.fetchone()
            
            if verify_config and verify_config.mssql_connection_string:
                try:
                    retrieved_decrypted = decrypt_connection_string(verify_config.mssql_connection_string)
                    print(f"✅ Retrieved and decrypted: {retrieved_decrypted}")
                    
                    if retrieved_decrypted == connection_string:
                        print("🎉 Connection string successfully saved and verified!")
                    else:
                        print("❌ Retrieved connection string doesn't match original")
                        
                except Exception as e:
                    print(f"❌ Error decrypting retrieved connection string: {e}")
            else:
                print("❌ Connection string not found in database")
                
    except Exception as e:
        print(f"❌ Error fixing MSSQL connection: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(fix_mssql_connection())