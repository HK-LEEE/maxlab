"""
PostgreSQL Data Provider
기본 PostgreSQL 데이터베이스 프로바이더
"""
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import logging
import uuid

from .base import IDataProvider, EquipmentData, MeasurementData, EquipmentStatusResponse
from .connection_pool import connection_pool_manager

logger = logging.getLogger(__name__)

class PostgreSQLProvider(IDataProvider):
    """PostgreSQL 데이터베이스 프로바이더"""
    
    def __init__(self, db_or_connection_string: Union[AsyncSession, str], workspace_id: Optional[str] = None, custom_queries: Optional[Dict[str, Dict[str, str]]] = None):
        """
        Initialize PostgreSQL provider.
        
        Args:
            db_or_connection_string: Either an existing AsyncSession or a connection string
            workspace_id: Optional workspace ID for connection pooling
            custom_queries: Optional custom queries for each data type
        """
        if isinstance(db_or_connection_string, str):
            # Create new connection from connection string
            self.connection_string = db_or_connection_string
            self.workspace_id = workspace_id or str(uuid.uuid4())
            self.engine = None
            self.session_factory = None
            self.db = None
            self.owns_connection = True
            self.use_pool = True
        else:
            # Use existing session
            self.db = db_or_connection_string
            self.connection_string = None
            self.workspace_id = None
            self.engine = None
            self.session_factory = None
            self.owns_connection = False
            self.use_pool = False
        
        self.custom_queries = custom_queries or {}
    
    async def connect(self) -> None:
        """Connect to PostgreSQL if using connection string"""
        if self.owns_connection and not self.db:
            try:
                if self.use_pool:
                    # Use connection pool
                    self.engine = await connection_pool_manager.get_engine(
                        self.workspace_id,
                        "postgresql",
                        self.connection_string
                    )
                else:
                    # Create direct connection
                    self.engine = create_async_engine(self.connection_string, echo=False)
                
                self.session_factory = sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
                self.db = self.session_factory()
                logger.info(f"Connected to PostgreSQL {'using pool' if self.use_pool else 'directly'}")
            except Exception as e:
                logger.error(f"Failed to connect to PostgreSQL: {e}")
                raise
    
    async def disconnect(self) -> None:
        """Disconnect from PostgreSQL if we own the connection"""
        if self.owns_connection:
            try:
                if self.db:
                    await self.db.close()
                    self.db = None
                # Don't dispose pooled engines
                if self.engine and not self.use_pool:
                    await self.engine.dispose()
                    self.engine = None
                logger.info(f"Disconnected from PostgreSQL {'(pool retained)' if self.use_pool else ''}")
            except Exception as e:
                logger.error(f"Error disconnecting from PostgreSQL: {e}")
    
    async def get_equipment_status(
        self,
        equipment_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> EquipmentStatusResponse:
        """설비 상태 조회"""
        try:
            # Always require custom query configuration - no default query
            custom_query_info = self.custom_queries.get('equipment_status', {})
            custom_query = custom_query_info.get('query') if isinstance(custom_query_info, dict) else None
            
            if not custom_query:
                raise ValueError("PostgreSQL provider requires custom equipment_status query configuration")
            
            # Process custom query with parameter substitution (PostgreSQL style)
            params = {}
            final_query = custom_query
            
            # Replace placeholders with PostgreSQL parameter format
            if equipment_type and "{{equipment_type}}" in final_query:
                final_query = final_query.replace("{{equipment_type}}", ":equipment_type")
                params["equipment_type"] = equipment_type
            
            if status and "{{status}}" in final_query:
                final_query = final_query.replace("{{status}}", ":status")
                params["status"] = status
            
            if "{{limit}}" in final_query:
                final_query = final_query.replace("{{limit}}", ":limit")
                params["limit"] = limit
                
            if "{{offset}}" in final_query:
                final_query = final_query.replace("{{offset}}", ":offset")
                params["offset"] = offset
            
            logger.debug(f"Executing PostgreSQL equipment status query: {final_query}")
            logger.debug(f"Parameters: {params}")
            
            # Execute the query
            result = await self.db.execute(text(final_query), params)
            
            equipment_list = []
            total_count = 0
            
            for row in result:
                # Convert row to dict for easier handling
                row_dict = dict(row._mapping)
                
                # If the query includes a total count, extract it
                if 'total' in row_dict:
                    total_count = int(row_dict['total'])
                
                equipment_item = EquipmentData(
                    equipment_type=str(row_dict.get('equipment_type', '')),
                    equipment_code=str(row_dict.get('equipment_code', '')),
                    equipment_name=str(row_dict.get('equipment_name', '')),
                    status=str(row_dict.get('status', '')),
                    last_run_time=row_dict.get('last_run_time')
                )
                equipment_list.append(equipment_item)
            
            # If no total count was provided, use the length of results
            if total_count == 0:
                total_count = len(equipment_list)
            
            return EquipmentStatusResponse(
                items=equipment_list,
                total=total_count,
                limit=limit,
                offset=offset,
                has_more=(offset + limit) < total_count
            )
            
        except Exception as e:
            logger.error(f"Error getting equipment status: {e}")
            raise
    
    async def get_measurement_data(
        self,
        equipment_code: Optional[str] = None,
        equipment_codes: Optional[str] = None,
        equipment_type: Optional[str] = None,
        measurement_code: Optional[str] = None,
        limit: int = 100
    ) -> List[MeasurementData]:
        """측정 데이터 조회 (Spec 정보 포함) - Requires custom query configuration"""
        try:
            # Always require custom query configuration - no default query
            custom_query_info = self.custom_queries.get('measurement_data', {})
            custom_query = custom_query_info.get('query') if isinstance(custom_query_info, dict) else None
            
            if not custom_query:
                raise ValueError("PostgreSQL provider requires custom measurement_data query configuration")
            
            # Process custom query with parameter substitution (PostgreSQL style)
            params = {}
            final_query = custom_query
            
            # Replace placeholders with PostgreSQL parameter format
            if equipment_code and "{{equipment_code}}" in final_query:
                final_query = final_query.replace("{{equipment_code}}", ":equipment_code")
                params["equipment_code"] = equipment_code
            elif equipment_codes and "{{equipment_codes}}" in final_query:
                # Handle multiple equipment codes
                code_list = [code.strip() for code in equipment_codes.split(',')]
                placeholders = ','.join([f':equipment_code_{i}' for i in range(len(code_list))])
                final_query = final_query.replace("{{equipment_codes}}", placeholders)
                for i, code in enumerate(code_list):
                    params[f"equipment_code_{i}"] = code
            
            if equipment_type and "{{equipment_type}}" in final_query:
                final_query = final_query.replace("{{equipment_type}}", ":equipment_type")
                params["equipment_type"] = equipment_type
                
            if measurement_code and "{{measurement_code}}" in final_query:
                final_query = final_query.replace("{{measurement_code}}", ":measurement_code")
                params["measurement_code"] = measurement_code
            
            if "{{limit}}" in final_query:
                final_query = final_query.replace("{{limit}}", ":limit")
                params["limit"] = limit
            
            logger.debug(f"Executing PostgreSQL measurement query: {final_query}")
            logger.debug(f"Parameters: {params}")
            
            # Execute the query
            result = await self.db.execute(text(final_query), params)
            
            measurement_list = []
            for row in result:
                # Convert row to dict for easier handling
                row_dict = dict(row._mapping)
                
                # Convert to MeasurementData object
                measurement_obj = MeasurementData(
                    id=int(row_dict.get('id', 0)),
                    equipment_type=str(row_dict.get('equipment_type', '')),
                    equipment_code=str(row_dict.get('equipment_code', '')),
                    measurement_code=str(row_dict.get('measurement_code', '')),
                    measurement_desc=str(row_dict.get('measurement_desc', '')),
                    measurement_value=float(row_dict.get('measurement_value', 0.0)),
                    timestamp=row_dict.get('timestamp'),
                    spec_status=int(row_dict.get('spec_status', 0)),
                    upper_spec_limit=row_dict.get('upper_spec_limit') or row_dict.get('usl'),
                    lower_spec_limit=row_dict.get('lower_spec_limit') or row_dict.get('lsl'),
                    target_value=row_dict.get('target_value') or row_dict.get('target')
                )
                measurement_list.append(measurement_obj)
            
            return measurement_list
            
        except Exception as e:
            logger.error(f"Error getting measurement data: {e}")
            raise
    
    async def get_latest_measurement(
        self,
        equipment_code: str
    ) -> Optional[MeasurementData]:
        """특정 설비의 최신 측정 데이터 조회"""
        try:
            query = """
                SELECT 
                    id,
                    equipment_type,
                    equipment_code,
                    measurement_code,
                    measurement_desc,
                    measurement_value,
                    timestamp,
                    usl,
                    lsl,
                    target,
                    spec_status
                FROM v_measurement_data_with_spec
                WHERE equipment_code = :equipment_code
                ORDER BY timestamp DESC
                LIMIT 1
            """
            
            result = await self.db.execute(
                text(query), 
                {"equipment_code": equipment_code}
            )
            row = result.first()
            
            if row:
                return MeasurementData(
                    id=row.id,
                    equipment_type=row.equipment_type,
                    equipment_code=row.equipment_code,
                    measurement_code=row.measurement_code,
                    measurement_desc=row.measurement_desc,
                    measurement_value=row.measurement_value,
                    timestamp=row.timestamp,
                    usl=row.usl,
                    lsl=row.lsl,
                    target=row.target,
                    spec_status=row.spec_status
                )
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting latest measurement: {e}")
            raise
    
    async def update_equipment_status(
        self,
        equipment_code: str,
        status: str
    ) -> bool:
        """설비 상태 업데이트"""
        try:
            query = """
                UPDATE personal_test_equipment_status
                SET status = :status, last_run_time = NOW()
                WHERE equipment_code = :equipment_code
                RETURNING equipment_code
            """
            
            result = await self.db.execute(
                text(query),
                {"status": status, "equipment_code": equipment_code}
            )
            
            if result.rowcount > 0:
                await self.db.commit()
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error updating equipment status: {e}")
            await self.db.rollback()
            raise
    
    async def test_connection(self) -> Dict[str, Any]:
        """연결 테스트"""
        try:
            # 간단한 쿼리로 연결 테스트
            result = await self.db.execute(text("SELECT 1"))
            result.scalar()
            
            # 테이블 존재 확인
            table_check = await self.db.execute(text("""
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('personal_test_equipment_status', 'personal_test_measurement_data')
            """))
            table_count = table_check.scalar()
            
            return {
                "status": "success",
                "provider": "PostgreSQL",
                "tables_found": table_count,
                "message": "Connection successful"
            }
            
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return {
                "status": "error",
                "provider": "PostgreSQL",
                "message": str(e)
            }
    
    async def execute_sql(self, query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Execute arbitrary SQL query and return results
        
        Args:
            query: SQL query string
            params: Optional query parameters for parameterized queries
            
        Returns:
            List[Dict[str, Any]]: Query results as list of dictionaries
        """
        try:
            # Convert dict params to values for PostgreSQL
            param_values = []
            if params:
                # Replace named parameters with $1, $2, etc. for PostgreSQL
                for i, (key, value) in enumerate(params.items(), start=1):
                    # Replace :key with $i
                    query = query.replace(f":{key}", f"${i}")
                    param_values.append(value)
            
            logger.debug(f"Executing SQL query: {query[:500]}...")  # Log first 500 chars
            
            if self.connection_pool:
                # Use asyncpg pool
                async with self.connection_pool.acquire() as conn:
                    # Execute query with parameters
                    if param_values:
                        result = await conn.fetch(query, *param_values)
                    else:
                        result = await conn.fetch(query)
                    
                    # Convert Record objects to dictionaries
                    results = []
                    for row in result:
                        row_dict = dict(row)
                        # Convert datetime objects to ISO format strings
                        for key, value in row_dict.items():
                            if isinstance(value, datetime):
                                row_dict[key] = value.isoformat()
                        results.append(row_dict)
                    
                    logger.info(f"Query returned {len(results)} rows")
                    return results
            else:
                # Use SQLAlchemy session
                from sqlalchemy import text
                
                # For SQLAlchemy, use named parameters
                if params:
                    result = await self.db_session.execute(text(query), params)
                else:
                    result = await self.db_session.execute(text(query))
                
                # Check if this is a SELECT query
                if result.returns_rows:
                    rows = result.fetchall()
                    columns = result.keys()
                    
                    results = []
                    for row in rows:
                        row_dict = dict(zip(columns, row))
                        # Convert datetime objects to ISO format strings
                        for key, value in row_dict.items():
                            if isinstance(value, datetime):
                                row_dict[key] = value.isoformat()
                        results.append(row_dict)
                    
                    logger.info(f"Query returned {len(results)} rows")
                    return results
                else:
                    # Non-SELECT query
                    rows_affected = result.rowcount
                    logger.info(f"Query affected {rows_affected} rows")
                    return [{"rows_affected": rows_affected}]
                
        except Exception as e:
            logger.error(f"Error executing SQL query: {e}")
            logger.error(f"Query was: {query[:500]}...")
            raise RuntimeError(f"SQL execution failed: {str(e)}")