#!/usr/bin/env python3
"""
Encrypt existing unencrypted connection strings and API keys
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.security import encrypt_connection_string, decrypt_connection_string

# Load environment variables
load_dotenv()

async def encrypt_existing_data():
    # Get database connection string
    database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/platform_integration")
    
    # Parse the connection string
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "")
    
    # Extract connection parameters
    try:
        user_pass, host_db = database_url.split("@")
        user, password = user_pass.split(":")
        host_port, database = host_db.split("/")
        host, port = host_port.split(":")
    except:
        print("Failed to parse database URL, using defaults")
        host = "localhost"
        port = 5432
        user = "postgres"
        password = "postgres"
        database = "platform_integration"
    
    print(f"Connecting to database {database} at {host}:{port}")
    
    # Connect to the database
    conn = await asyncpg.connect(
        host=host,
        port=int(port),
        user=user,
        password=password,
        database=database
    )
    
    try:
        # Get all data sources
        sources = await conn.fetch("""
            SELECT id, api_url, mssql_connection_string, api_key 
            FROM data_source_configs
        """)
        
        print(f"Found {len(sources)} data sources to check")
        
        for source in sources:
            updated = False
            updates = {}
            
            # Check if api_url needs encryption
            if source['api_url']:
                try:
                    # Try to decrypt - if it fails, it's not encrypted
                    decrypt_connection_string(source['api_url'])
                    print(f"Source {source['id']}: api_url already encrypted")
                except:
                    # Not encrypted, encrypt it
                    encrypted = encrypt_connection_string(source['api_url'])
                    updates['api_url'] = encrypted
                    updated = True
                    print(f"Source {source['id']}: encrypted api_url")
            
            # Check if mssql_connection_string needs encryption
            if source['mssql_connection_string']:
                try:
                    decrypt_connection_string(source['mssql_connection_string'])
                    print(f"Source {source['id']}: mssql_connection_string already encrypted")
                except:
                    encrypted = encrypt_connection_string(source['mssql_connection_string'])
                    updates['mssql_connection_string'] = encrypted
                    updated = True
                    print(f"Source {source['id']}: encrypted mssql_connection_string")
            
            # Check if api_key needs encryption
            if source['api_key']:
                try:
                    decrypt_connection_string(source['api_key'])
                    print(f"Source {source['id']}: api_key already encrypted")
                except:
                    encrypted = encrypt_connection_string(source['api_key'])
                    updates['api_key'] = encrypted
                    updated = True
                    print(f"Source {source['id']}: encrypted api_key")
            
            # Update if needed
            if updated:
                set_clauses = []
                values = []
                for i, (key, value) in enumerate(updates.items(), 1):
                    set_clauses.append(f"{key} = ${i+1}")
                    values.append(value)
                
                query = f"""
                    UPDATE data_source_configs 
                    SET {', '.join(set_clauses)}
                    WHERE id = $1
                """
                await conn.execute(query, source['id'], *values)
                print(f"Updated source {source['id']}")
        
        print("\n✅ Encryption migration completed!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(encrypt_existing_data())