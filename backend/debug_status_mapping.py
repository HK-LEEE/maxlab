#!/usr/bin/env python3
"""
Debug status mapping issue for published pages
"""
import asyncio
import asyncpg
import os
from pathlib import Path
from urllib.parse import urlparse
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.data_providers.dynamic import DynamicProvider

# Get the database URL from environment or .env file
def get_database_url():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        env_path = Path('.env')
        if env_path.exists():
            with open(env_path, 'r') as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        key, _, value = line.partition('=')
                        if key.strip() == 'DATABASE_URL':
                            db_url = value.strip()
                            break
    
    if not db_url:
        raise ValueError("DATABASE_URL not found in environment or .env file")
    
    # Parse the URL to get connection parameters
    parsed = urlparse(db_url)
    return {
        'host': parsed.hostname,
        'port': parsed.port or 5432,
        'user': parsed.username,
        'password': parsed.password,
        'database': parsed.path.lstrip('/')
    }

async def debug_status_mapping():
    """Debug status mapping issue"""
    try:
        db_params = get_database_url()
        conn = await asyncpg.connect(**db_params)
        
        print("🔍 Debugging Status Mapping Issue")
        print("=" * 50)
        
        # Check workspace info
        workspace_id = "21ee03db-90c4-4592-b00f-c44801e0b164"
        workspace = await conn.fetchrow("""
            SELECT id, name, slug FROM workspaces WHERE id = $1
        """, workspace_id)
        
        print(f"📋 Workspace Info:")
        print(f"   ID: {workspace['id']}")
        print(f"   Name: {workspace['name']}")
        print(f"   Slug: {workspace['slug']}")
        
        # Check status mappings
        print(f"\n📊 Status Mappings for workspace:")
        mappings = await conn.fetch("""
            SELECT source_status, target_status, is_active
            FROM status_mappings
            WHERE workspace_id = $1
        """, workspace_id)
        
        if mappings:
            for mapping in mappings:
                print(f"   {mapping['source_status']} -> {mapping['target_status']} (Active: {mapping['is_active']})")
        else:
            print("   ❌ No status mappings found!")
        
        # Test direct MSSQL query
        print(f"\n🔧 Testing MSSQL Query directly...")
        try:
            # Get data source config
            config = await conn.fetchrow("""
                SELECT source_type, mssql_connection_string, custom_queries 
                FROM data_source_configs 
                WHERE workspace_id = $1 AND is_active = true
            """, workspace_id)
            
            if config:
                print(f"   📋 Data source type: {config['source_type']}")
                print(f"   📋 Has connection string: {bool(config['mssql_connection_string'])}")
                
                if config['custom_queries']:
                    import json
                    custom_queries = json.loads(config['custom_queries']) if isinstance(config['custom_queries'], str) else config['custom_queries']
                    equipment_query = custom_queries.get('equipment_status', {}).get('query', '')
                    measurement_query = custom_queries.get('measurement_data', {}).get('query', '')
                    
                    print(f"   📝 Equipment Query: {equipment_query[:100] if equipment_query else 'None'}...")
                    print(f"   📝 Measurement Query: {measurement_query[:100] if measurement_query else 'None'}...")
                    
                    # Now test the actual provider
                    from app.services.data_providers.dynamic import DynamicProvider
                    provider = DynamicProvider(None, workspace_id)
                    
                    if equipment_query:
                        # Get the underlying provider and execute query
                        actual_provider = await provider._get_provider()
                        results = await actual_provider.execute_query(equipment_query)
                        print(f"   📊 Equipment Results: {len(results)} records")
                        if results:
                            print(f"   📋 First record: {results[0]}")
                            # Show unique status values
                            unique_statuses = set(row.get('status', 'N/A') for row in results[:10])
                            print(f"   📋 Status values found: {list(unique_statuses)}")
                    
                    if measurement_query:
                        actual_provider = await provider._get_provider()
                        results = await actual_provider.execute_query(measurement_query)
                        print(f"   📊 Measurement Results: {len(results)} records")
                        if results:
                            print(f"   📋 First measurement: {results[0]}")
                else:
                    print("   ❌ No custom queries found!")
            else:
                print("   ❌ No data source config found!")
                
        except Exception as e:
            print(f"   ❌ MSSQL test error: {e}")
            import traceback
            traceback.print_exc()
        
        await conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(debug_status_mapping())