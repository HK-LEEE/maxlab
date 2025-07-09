#!/usr/bin/env python3
"""
MSSQL Connection Diagnostic Tool
다양한 연결 방법을 시도하여 문제를 진단합니다.
"""
import socket
import subprocess
import sys
import asyncio
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

def test_network_connectivity(host, port):
    """Test basic network connectivity to SQL Server"""
    print(f"\n🔍 Testing network connectivity to {host}:{port}")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            print(f"✅ Port {port} is open on {host}")
            return True
        else:
            print(f"❌ Port {port} is closed or filtered on {host}")
            return False
    except Exception as e:
        print(f"❌ Network test failed: {e}")
        return False

def test_odbc_drivers():
    """Test available ODBC drivers"""
    print("\n🔍 Testing available ODBC drivers")
    try:
        import pyodbc
        drivers = pyodbc.drivers()
        print(f"✅ Available drivers: {drivers}")
        return drivers
    except Exception as e:
        print(f"❌ Failed to get ODBC drivers: {e}")
        return []

def test_sql_server_service():
    """Test if SQL Server service is running (Linux/Windows)"""
    print("\n🔍 Testing SQL Server service status")
    try:
        # Try to find SQL Server processes
        result = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
        if 'sql' in result.stdout.lower():
            print("✅ SQL Server-related processes found")
            # Show relevant processes
            lines = result.stdout.split('\n')
            for line in lines:
                if 'sql' in line.lower():
                    print(f"   📋 {line}")
        else:
            print("❌ No SQL Server processes found")
    except Exception as e:
        print(f"⚠️  Could not check processes: {e}")

async def test_connection_variations():
    """Test different connection string variations"""
    print("\n🔍 Testing different connection string variations")
    
    from app.services.data_providers.mssql import MSSQLProvider
    
    # Different connection strings to try
    test_configs = [
        {
            "name": "FreeTDS with IP",
            "connection_string": "DRIVER={FreeTDS};SERVER=127.0.0.1;DATABASE=AIDB;UID=mss;PWD=2300;TDS_Version=8.0;Port=1433"
        },
        {
            "name": "FreeTDS without port",
            "connection_string": "DRIVER={FreeTDS};SERVER=127.0.0.1;DATABASE=AIDB;UID=mss;PWD=2300;TDS_Version=8.0"
        },
        {
            "name": "FreeTDS with master database",
            "connection_string": "DRIVER={FreeTDS};SERVER=127.0.0.1;DATABASE=master;UID=sa;PWD=sa;TDS_Version=8.0;Port=1433"
        },
        {
            "name": "FreeTDS with different IP",
            "connection_string": "DRIVER={FreeTDS};SERVER=172.28.32.1;DATABASE=AIDB;UID=mss;PWD=2300;TDS_Version=8.0;Port=1433"
        }
    ]
    
    for config in test_configs:
        print(f"\n🧪 Testing: {config['name']}")
        try:
            provider = MSSQLProvider(connection_string=config['connection_string'])
            result = await provider.test_connection()
            
            if result["success"]:
                print(f"✅ {config['name']} - SUCCESS!")
                print(f"   📋 Details: {result.get('message', 'N/A')}")
                return config['connection_string']
            else:
                print(f"❌ {config['name']} - FAILED")
                print(f"   📋 Error: {result.get('message', 'N/A')}")
        except Exception as e:
            print(f"❌ {config['name']} - EXCEPTION: {e}")
    
    return None

def test_freetds_config():
    """Check FreeTDS configuration"""
    print("\n🔍 Checking FreeTDS configuration")
    try:
        # Check if freetds.conf exists
        freetds_paths = [
            "/etc/freetds/freetds.conf",
            "/usr/local/etc/freetds.conf",
            "/etc/freetds.conf"
        ]
        
        for path in freetds_paths:
            if Path(path).exists():
                print(f"✅ Found FreeTDS config at: {path}")
                # Read first few lines
                with open(path, 'r') as f:
                    lines = f.readlines()[:20]
                    print("   📋 Sample config:")
                    for line in lines:
                        print(f"      {line.strip()}")
                return True
        
        print("❌ No FreeTDS config found")
        return False
        
    except Exception as e:
        print(f"❌ Error checking FreeTDS config: {e}")
        return False

async def main():
    """Main diagnostic function"""
    print("🚀 MSSQL Connection Diagnostic Tool")
    print("=" * 50)
    
    # 1. Test network connectivity
    hosts_to_test = ["127.0.0.1", "localhost", "172.28.32.1"]
    ports_to_test = [1433, 1434]
    
    for host in hosts_to_test:
        for port in ports_to_test:
            test_network_connectivity(host, port)
    
    # 2. Test ODBC drivers
    drivers = test_odbc_drivers()
    
    # 3. Test SQL Server service
    test_sql_server_service()
    
    # 4. Test FreeTDS configuration
    test_freetds_config()
    
    # 5. Test different connection variations
    working_connection = await test_connection_variations()
    
    print("\n📊 Diagnostic Summary")
    print("=" * 30)
    
    if working_connection:
        print(f"✅ Working connection found:")
        print(f"   {working_connection}")
        print("\n🎯 Recommendations:")
        print("1. Use the working connection string above")
        print("2. Update your data source configuration")
    else:
        print("❌ No working connection found")
        print("\n🔧 Troubleshooting Steps:")
        print("1. Ensure SQL Server is installed and running")
        print("2. Check if SQL Server is listening on port 1433")
        print("3. Verify firewall settings")
        print("4. Check SQL Server TCP/IP configuration")
        print("5. Verify user credentials and database existence")
        print("6. Consider using sa account for initial testing")

if __name__ == "__main__":
    asyncio.run(main())