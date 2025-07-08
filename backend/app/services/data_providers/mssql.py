"""
Microsoft SQL Server data provider implementation.
Enhanced for complete localhost\SQLEXPRESS support with custom queries.
"""
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
import aioodbc
import pyodbc
import logging
import asyncio
from contextlib import asynccontextmanager

from .base import IDataProvider, EquipmentStatusResponse, MeasurementData

logger = logging.getLogger(__name__)


class MSSQLProvider(IDataProvider):
    """
    Enhanced Microsoft SQL Server data provider.
    Supports localhost\SQLEXPRESS, connection pooling, and custom queries.
    """
    
    def __init__(
        self, 
        connection_string: Optional[str] = None,
        workspace_id: Optional[str] = None,
        custom_queries: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize enhanced MSSQL provider.
        
        Args:
            connection_string: ODBC connection string for SQL Server
            workspace_id: Workspace identifier for connection pooling
            custom_queries: Custom query configurations from database
        """
        self.connection_string = self._convert_connection_string(connection_string or "")
        self.workspace_id = workspace_id or "default"
        self.custom_queries = custom_queries or {}
        self.pool: Optional[aioodbc.Pool] = None
        self._connection_lock = asyncio.Lock()
        
        # Connection pool settings optimized for ODBC 17
        self.pool_settings = {
            "minsize": 2,
            "maxsize": 10,  # Increased for better concurrency
            "autocommit": True,
            "pool_recycle": 3600,  # 1 hour
            "pool_reset_on_return": True,
            "pool_pre_ping": True,  # Test connections before use
            "pool_timeout": 30,  # Connection timeout from pool
            "pool_overflow": 5  # Allow additional connections beyond maxsize
        }
        
        logger.info(f"Initialized MSSQL provider for workspace: {self.workspace_id}")
    
    def _get_default_connection_string(self) -> str:
        """Get enhanced default MSSQL connection string."""
        import os
        # Support localhost\SQLEXPRESS with mss user and password 2300
        return os.getenv(
            "MSSQL_CONNECTION_STRING",
            "DRIVER={ODBC Driver 17 for SQL Server};"
            "SERVER=localhost\\SQLEXPRESS;"
            "DATABASE=equipment_db;"
            "UID=mss;"
            "PWD=2300;"
            "TrustServerCertificate=yes;"
            "Connection Timeout=30;"
            "Command Timeout=60"
        )
    
    def _convert_connection_string(self, raw_connection_string: str) -> str:
        """
        Convert user-provided connection string to proper ODBC format.
        
        Supports formats like:
        - server=172.28.32.1/SQLEXPRESS;Database=AIDB;Id=mss;Password=2300;
        - server=172.28.32.1\SQLEXPRESS;Database=AIDB;Id=mss;Password=2300;
        """
        if not raw_connection_string:
            return self._get_default_connection_string()
        
        # Check if it's already in ODBC format
        if "DRIVER=" in raw_connection_string.upper():
            return raw_connection_string
        
        # Parse simple format
        parts = {}
        for part in raw_connection_string.split(';'):
            if '=' in part:
                key, value = part.split('=', 1)
                parts[key.lower().strip()] = value.strip()
        
        # Extract components
        server = parts.get('server', 'localhost\\SQLEXPRESS')
        database = parts.get('database', 'equipment_db')
        uid = parts.get('id', parts.get('uid', 'mss'))
        pwd = parts.get('password', parts.get('pwd', '2300'))
        
        # Handle different server formats
        if '/' in server:
            server = server.replace('/', '\\')
        
        # Try to detect available drivers
        available_drivers = []
        try:
            import pyodbc
            available_drivers = pyodbc.drivers()
        except:
            pass
        
        # Choose best available driver with ODBC 17 priority
        driver = None
        if "ODBC Driver 17 for SQL Server" in available_drivers:
            driver = "ODBC Driver 17 for SQL Server"
        elif "ODBC Driver 18 for SQL Server" in available_drivers:
            driver = "ODBC Driver 18 for SQL Server"
        elif "ODBC Driver 13 for SQL Server" in available_drivers:
            driver = "ODBC Driver 13 for SQL Server"
        elif "FreeTDS" in available_drivers:
            driver = "FreeTDS"
        else:
            # Default fallback - assuming ODBC 17 is installed
            driver = "ODBC Driver 17 for SQL Server"
        
        # Build ODBC connection string optimized for ODBC 17
        odbc_string = (
            f"DRIVER={{{driver}}};"
            f"SERVER={server};"
            f"DATABASE={database};"
            f"UID={uid};"
            f"PWD={pwd};"
            f"TrustServerCertificate=yes;"
            f"Encrypt=yes;"
            f"Connection Timeout=30;"
            f"Command Timeout=60;"
            f"MultipleActiveResultSets=true;"
            f"ApplicationIntent=ReadWrite;"
            f"ConnectRetryCount=3;"
            f"ConnectRetryInterval=10"
        )
        
        if driver == "FreeTDS":
            # FreeTDS specific options for SQL Server Express
            # Try common Express ports or let SQL Server Browser find the port
            if "SQLEXPRESS" in server:
                odbc_string += ";TDS_Version=8.0"  # Let SQL Server Browser find the port
            else:
                odbc_string += ";Port=1433;TDS_Version=8.0"
        elif "ODBC Driver 17" in driver or "ODBC Driver 18" in driver:
            # ODBC 17/18 specific optimizations
            # Enable connection pooling for better performance
            odbc_string += ";Connection Pooling=true"
        
        logger.info(f"Converted connection string for server: {server}, database: {database}")
        return odbc_string
    
    async def connect(self) -> None:
        """Create enhanced connection pool to MSSQL database."""
        async with self._connection_lock:
            if self.pool is not None:
                return
                
            try:
                logger.info(f"Creating MSSQL connection pool for workspace: {self.workspace_id}")
                logger.debug(f"Connection string: {self._mask_connection_string()}")
                
                self.pool = await aioodbc.create_pool(
                    dsn=self.connection_string,
                    **self.pool_settings
                )
                
                # Test the connection
                await self._test_initial_connection()
                logger.info("MSSQL connection pool created successfully")
                
            except Exception as e:
                logger.error(f"Failed to create MSSQL connection pool: {e}")
                self.pool = None
                raise
    
    async def disconnect(self) -> None:
        """Close connection pool with proper cleanup."""
        async with self._connection_lock:
            if self.pool:
                try:
                    logger.info(f"Closing MSSQL connection pool for workspace: {self.workspace_id}")
                    self.pool.close()
                    await self.pool.wait_closed()
                except Exception as e:
                    logger.error(f"Error closing MSSQL connection pool: {e}")
                finally:
                    self.pool = None
    
    def _mask_connection_string(self) -> str:
        """Mask sensitive information in connection string for logging."""
        masked = self.connection_string
        if "PWD=" in masked:
            import re
            masked = re.sub(r'PWD=[^;]*', 'PWD=***', masked)
        return masked
    
    async def _test_initial_connection(self) -> None:
        """Test initial connection to ensure pool is working."""
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("SELECT @@VERSION")
                result = await cursor.fetchone()
                logger.debug(f"MSSQL Server version: {result[0] if result else 'Unknown'}")
    
    @asynccontextmanager
    async def get_connection(self):
        """Get connection from pool with enhanced error handling."""
        if not self.pool:
            await self.connect()
        
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    yield cursor
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            # Reset pool on connection errors
            if self.pool:
                try:
                    self.pool.close()
                    await self.pool.wait_closed()
                except:
                    pass
                self.pool = None
            raise
    
    async def get_equipment_status(
        self,
        equipment_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> EquipmentStatusResponse:
        """Get current status of equipment with enhanced filtering and custom query support."""
        try:
            # Check for custom query first
            if self.custom_queries and "equipment_status" in self.custom_queries:
                return await self._execute_custom_equipment_query(
                    equipment_type, status, limit, offset
                )
            
            # Default equipment status query
            async with self.get_connection() as cursor:
                # Build dynamic query based on filters
                base_query = """
                    SELECT 
                        e.equipment_code,
                        e.equipment_name,
                        e.equipment_type,
                        e.status,
                        e.last_run_time,
                        ISNULL(a.active_alarm_count, 0) as active_alarm_count
                    FROM personal_test_equipment_status e
                    LEFT JOIN (
                        SELECT 
                            equipment_code,
                            COUNT(*) as active_alarm_count
                        FROM equipment_alarms 
                        WHERE is_active = 1
                        GROUP BY equipment_code
                    ) a ON e.equipment_code = a.equipment_code
                    WHERE 1=1
                """
                
                params = []
                
                if equipment_type:
                    base_query += " AND e.equipment_type = ?"
                    params.append(equipment_type)
                
                if status:
                    base_query += " AND e.status = ?"
                    params.append(status)
                
                # Add ordering and pagination
                base_query += " ORDER BY e.last_run_time DESC"
                
                # Use OFFSET/FETCH for SQL Server pagination
                if offset > 0:
                    base_query += f" OFFSET {offset} ROWS"
                
                if limit > 0:
                    if offset == 0:
                        base_query = f"SELECT TOP ({limit}) * FROM ({base_query}) AS subquery"
                    else:
                        base_query += f" FETCH NEXT {limit} ROWS ONLY"
                
                logger.debug(f"Executing equipment status query: {base_query}")
                await cursor.execute(base_query, params)
                
                columns = [column[0] for column in cursor.description]
                equipment_data = []
                
                async for row in cursor:
                    row_dict = dict(zip(columns, row))
                    # Convert to standard format
                    equipment_data.append({
                        "equipment_type": row_dict.get("equipment_type"),
                        "equipment_code": row_dict.get("equipment_code"), 
                        "equipment_name": row_dict.get("equipment_name"),
                        "status": row_dict.get("status"),
                        "last_run_time": row_dict.get("last_run_time"),
                        "active_alarm_count": row_dict.get("active_alarm_count", 0)
                    })
                
                # Get total count for pagination
                count_query = """
                    SELECT COUNT(*) as total
                    FROM personal_test_equipment_status e
                    WHERE 1=1
                """
                count_params = []
                
                if equipment_type:
                    count_query += " AND e.equipment_type = ?"
                    count_params.append(equipment_type)
                
                if status:
                    count_query += " AND e.status = ?"
                    count_params.append(status)
                
                await cursor.execute(count_query, count_params)
                total_result = await cursor.fetchone()
                total_count = total_result[0] if total_result else 0
                
                return EquipmentStatusResponse(
                    equipment=equipment_data,
                    total_count=total_count,
                    page_size=limit,
                    current_page=(offset // limit) + 1 if limit > 0 else 1
                )
                
        except Exception as e:
            logger.error(f"Error getting equipment status: {e}")
            raise
    
    async def _execute_custom_equipment_query(
        self,
        equipment_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> EquipmentStatusResponse:
        """Execute custom equipment status query with parameter substitution."""
        try:
            custom_config = self.custom_queries["equipment_status"]
            query_template = custom_config.get("query", "")
            
            if not query_template:
                raise ValueError("Custom equipment query template is empty")
            
            # Parameter substitution for custom queries
            params = []
            query = query_template
            
            # Replace placeholders with actual parameters
            if equipment_type and "{{equipment_type}}" in query:
                query = query.replace("{{equipment_type}}", "?")
                params.append(equipment_type)
            
            if status and "{{status}}" in query:
                query = query.replace("{{status}}", "?")
                params.append(status)
            
            # Add pagination to custom query if not present
            if "TOP" not in query.upper() and "OFFSET" not in query.upper():
                if offset > 0:
                    query += f" ORDER BY 1 OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY"
                else:
                    query = f"SELECT TOP ({limit}) * FROM ({query}) AS custom_query"
            
            async with self.get_connection() as cursor:
                logger.debug(f"Executing custom equipment query: {query}")
                await cursor.execute(query, params)
                
                columns = [column[0] for column in cursor.description]
                equipment_data = []
                
                async for row in cursor:
                    row_dict = dict(zip(columns, row))
                    equipment_data.append(row_dict)
                
                return EquipmentStatusResponse(
                    equipment=equipment_data,
                    total_count=len(equipment_data),
                    page_size=limit,
                    current_page=(offset // limit) + 1 if limit > 0 else 1
                )
                
        except Exception as e:
            logger.error(f"Error executing custom equipment query: {e}")
            raise
    
    async def _execute_custom_query(
        self,
        query_name: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Execute a custom query with parameter substitution."""
        if query_name not in self.custom_queries:
            raise ValueError(f"Custom query '{query_name}' not found")
        
        custom_config = self.custom_queries[query_name]
        query_template = custom_config.get("query", "")
        
        if not query_template:
            raise ValueError(f"Custom query '{query_name}' template is empty")
        
        # Simple parameter substitution
        query = query_template
        params = []
        
        if parameters:
            for key, value in parameters.items():
                placeholder = f"{{{{{key}}}}}"
                if placeholder in query:
                    query = query.replace(placeholder, "?")
                    params.append(value)
        
        async with self.get_connection() as cursor:
            logger.debug(f"Executing custom query '{query_name}': {query}")
            await cursor.execute(query, params)
            
            columns = [column[0] for column in cursor.description]
            results = []
            
            async for row in cursor:
                results.append(dict(zip(columns, row)))
            
            return results
    
    async def get_measurement_data(
        self,
        equipment_code: Optional[str] = None,
        equipment_type: Optional[str] = None,
        limit: int = 100
    ) -> List[MeasurementData]:
        """Get measurement data with optional filtering and spec calculations."""
        try:
            # Check for custom measurement query
            if self.custom_queries and "measurement_data" in self.custom_queries:
                custom_results = await self._execute_custom_query(
                    "measurement_data",
                    {"equipment_code": equipment_code, "equipment_type": equipment_type, "limit": limit}
                )
                # Convert to MeasurementData objects
                return [self._dict_to_measurement_data(row) for row in custom_results]
            
            async with self.get_connection() as cursor:
                base_query = """
                    SELECT TOP (?)
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
                    LEFT JOIN measurement_specs s 
                        ON m.measurement_code = s.measurement_code
                    WHERE 1=1
                """
                
                params = [limit]
                
                if equipment_code:
                    base_query += " AND m.equipment_code = ?"
                    params.append(equipment_code)
                
                if equipment_type:
                    base_query += " AND m.equipment_type = ?"
                    params.append(equipment_type)
                
                base_query += " ORDER BY m.timestamp DESC"
                
                logger.debug(f"Executing measurement data query: {base_query}")
                await cursor.execute(base_query, params)
                
                columns = [column[0] for column in cursor.description]
                measurements = []
                
                async for row in cursor:
                    row_dict = dict(zip(columns, row))
                    measurements.append(self._dict_to_measurement_data(row_dict))
                
                return measurements
                
        except Exception as e:
            logger.error(f"Error getting measurement data: {e}")
            raise
    
    def _dict_to_measurement_data(self, row_dict: Dict[str, Any]) -> MeasurementData:
        """Convert database row to MeasurementData object."""
        return MeasurementData(
            id=row_dict.get("id", 0),
            equipment_type=row_dict.get("equipment_type", ""),
            equipment_code=row_dict.get("equipment_code", ""),
            measurement_code=row_dict.get("measurement_code", ""),
            measurement_desc=row_dict.get("measurement_desc", ""),
            measurement_value=float(row_dict.get("measurement_value", 0.0)),
            timestamp=row_dict.get("timestamp", datetime.now()),
            spec_status=row_dict.get("spec_status", 0),
            usl=row_dict.get("usl"),
            lsl=row_dict.get("lsl"),
            target=row_dict.get("target")
        )
    
    async def get_latest_measurement(
        self,
        equipment_code: str
    ) -> Optional[MeasurementData]:
        """Get latest measurement for equipment."""
        try:
            async with self.get_connection() as cursor:
                query = """
                    SELECT TOP (1)
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
                    LEFT JOIN measurement_specs s 
                        ON m.measurement_code = s.measurement_code
                    WHERE m.equipment_code = ?
                    ORDER BY m.timestamp DESC
                """
                
                await cursor.execute(query, [equipment_code])
                row = await cursor.fetchone()
                
                if row:
                    columns = [column[0] for column in cursor.description]
                    row_dict = dict(zip(columns, row))
                    return self._dict_to_measurement_data(row_dict)
                
                return None
                
        except Exception as e:
            logger.error(f"Error getting latest measurement: {e}")
            raise
    
    async def update_equipment_status(
        self,
        equipment_code: str,
        status: str
    ) -> bool:
        """Update equipment status."""
        try:
            async with self.get_connection() as cursor:
                query = """
                    UPDATE personal_test_equipment_status 
                    SET status = ?, last_run_time = GETDATE()
                    WHERE equipment_code = ?
                """
                
                await cursor.execute(query, [status, equipment_code])
                return cursor.rowcount > 0
                
        except Exception as e:
            logger.error(f"Error updating equipment status: {e}")
            raise
    
    async def test_connection(self) -> Dict[str, Any]:
        """Enhanced test connection with detailed diagnostics."""
        try:
            logger.info(f"Testing MSSQL connection for workspace: {self.workspace_id}")
            
            await self.connect()
            
            async with self.get_connection() as cursor:
                # Get SQL Server version and instance info
                await cursor.execute("""
                    SELECT 
                        @@VERSION as version,
                        @@SERVERNAME as server_name,
                        DB_NAME() as database_name,
                        SYSTEM_USER as system_user,
                        GETDATE() as current_time
                """)
                result = await cursor.fetchone()
                
                if result:
                    version, server_name, db_name, user, current_time = result
                else:
                    version = server_name = db_name = user = current_time = "Unknown"
                
                # Test basic query on equipment table
                try:
                    await cursor.execute("SELECT COUNT(*) FROM personal_test_equipment_status")
                    count_result = await cursor.fetchone()
                    equipment_count = count_result[0] if count_result else 0
                except Exception:
                    equipment_count = "N/A - Table not found"
                
                # Test measurement data table
                try:
                    await cursor.execute("SELECT COUNT(*) FROM personal_test_measurement_data")
                    measurement_result = await cursor.fetchone()
                    measurement_count = measurement_result[0] if measurement_result else 0
                except Exception:
                    measurement_count = "N/A - Table not found"
            
            logger.info("MSSQL connection test successful")
            
            return {
                "success": True,
                "source_type": "mssql",
                "message": f"Successfully connected to SQL Server: {server_name}",
                "details": {
                    "version": version.split('\n')[0] if version else "Unknown",
                    "server_name": server_name,
                    "database_name": db_name,
                    "system_user": user,
                    "current_time": str(current_time),
                    "equipment_count": equipment_count,
                    "measurement_count": measurement_count,
                    "workspace_id": self.workspace_id,
                    "connection_string_masked": self._mask_connection_string()
                }
            }
            
        except Exception as e:
            logger.error(f"MSSQL connection test failed: {e}")
            return {
                "success": False,
                "source_type": "mssql",
                "message": str(e),
                "details": {
                    "workspace_id": self.workspace_id,
                    "connection_string_masked": self._mask_connection_string(),
                    "error_type": type(e).__name__
                }
            }
        finally:
            # Always attempt to disconnect
            try:
                await self.disconnect()
            except Exception:
                pass
    
    async def execute_custom_query(
        self,
        query_name: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Public interface for executing custom queries."""
        return await self._execute_custom_query(query_name, parameters)
    
    async def get_available_custom_queries(self) -> List[str]:
        """Get list of available custom query names."""
        return list(self.custom_queries.keys()) if self.custom_queries else []
    
    def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information for debugging."""
        return {
            "workspace_id": self.workspace_id,
            "connection_string_masked": self._mask_connection_string(),
            "custom_queries_count": len(self.custom_queries) if self.custom_queries else 0,
            "custom_query_names": list(self.custom_queries.keys()) if self.custom_queries else [],
            "pool_active": self.pool is not None,
            "pool_settings": self.pool_settings
        }