"""
Microsoft SQL Server data provider implementation.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
import aioodbc
import pyodbc
from contextlib import asynccontextmanager

from .base import IDataProvider


class MSSQLProvider(IDataProvider):
    """
    Data provider for Microsoft SQL Server databases.
    Uses aioodbc for async operations.
    """
    
    def __init__(self, connection_string: Optional[str] = None):
        """
        Initialize MSSQL provider.
        
        Args:
            connection_string: ODBC connection string for SQL Server
        """
        self.connection_string = connection_string or self._get_default_connection_string()
        self.pool: Optional[aioodbc.Pool] = None
    
    def _get_default_connection_string(self) -> str:
        """Get default MSSQL connection string from environment."""
        import os
        return os.getenv(
            "MSSQL_CONNECTION_STRING",
            "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=equipment_db;UID=sa;PWD=password"
        )
    
    async def connect(self) -> None:
        """Create connection pool to MSSQL database."""
        if not self.pool:
            self.pool = await aioodbc.create_pool(
                dsn=self.connection_string,
                minsize=1,
                maxsize=10,
                autocommit=True
            )
    
    async def disconnect(self) -> None:
        """Close connection pool."""
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()
            self.pool = None
    
    @asynccontextmanager
    async def get_connection(self):
        """Get connection from pool."""
        if not self.pool:
            await self.connect()
        
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                yield cursor
    
    async def get_equipment_status(
        self,
        equipment_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get current status of equipment."""
        async with self.get_connection() as cursor:
            if equipment_ids:
                placeholders = ','.join(['?' for _ in equipment_ids])
                query = f"""
                    SELECT 
                        e.equipment_id,
                        e.equipment_name,
                        e.equipment_type,
                        e.status,
                        e.location,
                        e.last_maintenance_date,
                        e.updated_at,
                        COUNT(DISTINCT a.alarm_id) as active_alarm_count
                    FROM equipment e
                    LEFT JOIN equipment_alarms a 
                        ON e.equipment_id = a.equipment_id 
                        AND a.is_active = 1
                    WHERE e.equipment_id IN ({placeholders})
                    GROUP BY 
                        e.equipment_id, e.equipment_name, e.equipment_type,
                        e.status, e.location, e.last_maintenance_date, e.updated_at
                """
                await cursor.execute(query, equipment_ids)
            else:
                query = """
                    SELECT 
                        e.equipment_id,
                        e.equipment_name,
                        e.equipment_type,
                        e.status,
                        e.location,
                        e.last_maintenance_date,
                        e.updated_at,
                        COUNT(DISTINCT a.alarm_id) as active_alarm_count
                    FROM equipment e
                    LEFT JOIN equipment_alarms a 
                        ON e.equipment_id = a.equipment_id 
                        AND a.is_active = 1
                    GROUP BY 
                        e.equipment_id, e.equipment_name, e.equipment_type,
                        e.status, e.location, e.last_maintenance_date, e.updated_at
                """
                await cursor.execute(query)
            
            columns = [column[0] for column in cursor.description]
            results = []
            
            async for row in cursor:
                results.append(dict(zip(columns, row)))
            
            return results
    
    async def get_measurement_data(
        self,
        measurement_code: str,
        equipment_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get measurement data with optional filtering."""
        async with self.get_connection() as cursor:
            query = """
                SELECT TOP (?)
                    m.measurement_id,
                    m.equipment_id,
                    m.measurement_code,
                    m.measurement_value,
                    m.unit,
                    m.measured_at,
                    m.created_at,
                    s.upper_spec_limit,
                    s.lower_spec_limit,
                    s.target_value,
                    CASE 
                        WHEN s.upper_spec_limit IS NOT NULL AND m.measurement_value > s.upper_spec_limit THEN 'ABOVE_SPEC'
                        WHEN s.lower_spec_limit IS NOT NULL AND m.measurement_value < s.lower_spec_limit THEN 'BELOW_SPEC'
                        ELSE 'IN_SPEC'
                    END as spec_status
                FROM measurements m
                LEFT JOIN measurement_specs s 
                    ON m.measurement_code = s.measurement_code
                WHERE m.measurement_code = ?
            """
            
            params = [limit, measurement_code]
            
            if equipment_id:
                query += " AND m.equipment_id = ?"
                params.append(equipment_id)
            
            if start_time:
                query += " AND m.measured_at >= ?"
                params.append(start_time)
            
            if end_time:
                query += " AND m.measured_at <= ?"
                params.append(end_time)
            
            query += " ORDER BY m.measured_at DESC"
            
            await cursor.execute(query, params)
            
            columns = [column[0] for column in cursor.description]
            results = []
            
            async for row in cursor:
                results.append(dict(zip(columns, row)))
            
            return results
    
    async def get_measurement_specs(
        self,
        measurement_codes: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get measurement specifications."""
        async with self.get_connection() as cursor:
            if measurement_codes:
                placeholders = ','.join(['?' for _ in measurement_codes])
                query = f"""
                    SELECT 
                        measurement_code,
                        upper_spec_limit,
                        lower_spec_limit,
                        target_value,
                        spec_description,
                        created_at,
                        updated_at
                    FROM measurement_specs
                    WHERE measurement_code IN ({placeholders})
                """
                await cursor.execute(query, measurement_codes)
            else:
                query = """
                    SELECT 
                        measurement_code,
                        upper_spec_limit,
                        lower_spec_limit,
                        target_value,
                        spec_description,
                        created_at,
                        updated_at
                    FROM measurement_specs
                """
                await cursor.execute(query)
            
            columns = [column[0] for column in cursor.description]
            results = []
            
            async for row in cursor:
                results.append(dict(zip(columns, row)))
            
            return results
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test MSSQL connection."""
        try:
            await self.connect()
            
            async with self.get_connection() as cursor:
                await cursor.execute("SELECT @@VERSION as version")
                result = await cursor.fetchone()
                version = result[0] if result else "Unknown"
            
            await self.disconnect()
            
            return {
                "success": True,
                "source_type": "mssql",
                "message": f"Successfully connected to SQL Server",
                "version": version
            }
        except Exception as e:
            return {
                "success": False,
                "source_type": "mssql",
                "message": str(e)
            }