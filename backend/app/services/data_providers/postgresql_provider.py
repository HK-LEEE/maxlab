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
            # Check if custom query exists
            custom_query_info = self.custom_queries.get('equipment_status', {})
            custom_query = custom_query_info.get('query') if isinstance(custom_query_info, dict) else None
            
            if custom_query:
                # Use custom query
                params = {"limit": limit, "offset": offset}
                
                # Add filters to custom query if provided
                query_conditions = []
                if equipment_type:
                    query_conditions.append("equipment_type = :equipment_type")
                    params["equipment_type"] = equipment_type
                if status:
                    query_conditions.append("status = :status")
                    params["status"] = status
                
                # Parse custom query to add WHERE conditions if needed
                if query_conditions and "WHERE" in custom_query.upper():
                    # Add conditions after existing WHERE
                    custom_query += f" AND {' AND '.join(query_conditions)}"
                elif query_conditions:
                    # Add WHERE clause
                    custom_query += f" WHERE {' AND '.join(query_conditions)}"
                
                # Add pagination
                custom_query += " LIMIT :limit OFFSET :offset"
                
                # Execute query
                result = await self.db.execute(text(custom_query), params)
                equipment_list = []
                for row in result:
                    # Map row to EquipmentData based on column names
                    equipment_list.append(EquipmentData(
                        equipment_type=getattr(row, 'equipment_type', ''),
                        equipment_code=getattr(row, 'equipment_code', ''),
                        equipment_name=getattr(row, 'equipment_name', ''),
                        status=getattr(row, 'status', 'STOP'),
                        last_run_time=getattr(row, 'last_run_time', None)
                    ))
                
                # For total count, we need to modify the query
                count_query = custom_query.replace("SELECT", "SELECT COUNT(*) as total FROM (SELECT", 1) + ") as subquery"
                count_query = count_query.replace("LIMIT :limit OFFSET :offset", "")
                count_params = {k: v for k, v in params.items() if k not in ['limit', 'offset']}
                count_result = await self.db.execute(text(count_query), count_params)
                total_count = count_result.scalar() or len(equipment_list)
                
                return EquipmentStatusResponse(
                    items=equipment_list,
                    total=total_count,
                    limit=limit,
                    offset=offset,
                    has_more=(offset + limit) < total_count
                )
            
            # Default query logic if no custom query
            # 전체 개수 조회
            count_query = """
                SELECT COUNT(*) as total
                FROM personal_test_equipment_status
                WHERE 1=1
            """
            params = {}
            
            if equipment_type:
                count_query += " AND equipment_type = :equipment_type"
                params["equipment_type"] = equipment_type
            
            if status:
                count_query += " AND status = :status"
                params["status"] = status
            
            count_result = await self.db.execute(text(count_query), params)
            total_count = count_result.scalar()
            
            # 데이터 조회
            data_query = """
                SELECT equipment_type, equipment_code, equipment_name, status, last_run_time
                FROM personal_test_equipment_status
                WHERE 1=1
            """
            
            if equipment_type:
                data_query += " AND equipment_type = :equipment_type"
            
            if status:
                data_query += " AND status = :status"
            
            data_query += " ORDER BY equipment_type, equipment_code LIMIT :limit OFFSET :offset"
            
            params["limit"] = limit
            params["offset"] = offset
            
            result = await self.db.execute(text(data_query), params)
            
            equipment_list = []
            for row in result:
                equipment_list.append(EquipmentData(
                    equipment_type=row.equipment_type,
                    equipment_code=row.equipment_code,
                    equipment_name=row.equipment_name,
                    status=row.status,
                    last_run_time=row.last_run_time
                ))
            
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
        equipment_type: Optional[str] = None,
        limit: int = 100
    ) -> List[MeasurementData]:
        """측정 데이터 조회 (Spec 정보 포함)"""
        try:
            # Check if custom query exists
            custom_query_info = self.custom_queries.get('measurement_data', {})
            custom_query = custom_query_info.get('query') if isinstance(custom_query_info, dict) else None
            
            if custom_query:
                # Use custom query
                params = {"limit": limit}
                
                # Add filters to custom query if provided
                query_conditions = []
                if equipment_code:
                    query_conditions.append("equipment_code = :equipment_code")
                    params["equipment_code"] = equipment_code
                if equipment_type:
                    query_conditions.append("equipment_type = :equipment_type")
                    params["equipment_type"] = equipment_type
                
                # Parse custom query to add WHERE conditions if needed
                if query_conditions and "WHERE" in custom_query.upper():
                    # Add conditions after existing WHERE
                    custom_query += f" AND {' AND '.join(query_conditions)}"
                elif query_conditions:
                    # Add WHERE clause
                    custom_query += f" WHERE {' AND '.join(query_conditions)}"
                
                # Add ORDER BY and LIMIT if not present
                if "ORDER BY" not in custom_query.upper():
                    custom_query += " ORDER BY timestamp DESC"
                if "LIMIT" not in custom_query.upper():
                    custom_query += " LIMIT :limit"
                
                # Execute query
                result = await self.db.execute(text(custom_query), params)
                measurements = []
                for row in result:
                    # Map row to MeasurementData based on column names
                    measurements.append(MeasurementData(
                        id=getattr(row, 'id', 0),
                        equipment_type=getattr(row, 'equipment_type', ''),
                        equipment_code=getattr(row, 'equipment_code', ''),
                        measurement_code=getattr(row, 'measurement_code', ''),
                        measurement_desc=getattr(row, 'measurement_desc', ''),
                        measurement_value=float(getattr(row, 'measurement_value', 0)),
                        timestamp=getattr(row, 'timestamp', datetime.now()),
                        usl=getattr(row, 'usl', None),
                        lsl=getattr(row, 'lsl', None),
                        target=getattr(row, 'target', None),
                        spec_status=getattr(row, 'spec_status', None)
                    ))
                
                return measurements
            
            # Default query logic if no custom query
            # v_measurement_data_with_spec 뷰 사용
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
                WHERE 1=1
            """
            params = {"limit": limit}
            
            if equipment_code:
                query += " AND equipment_code = :equipment_code"
                params["equipment_code"] = equipment_code
            
            if equipment_type:
                query += " AND equipment_type = :equipment_type"
                params["equipment_type"] = equipment_type
            
            query += " ORDER BY timestamp DESC LIMIT :limit"
            
            result = await self.db.execute(text(query), params)
            
            measurements = []
            for row in result:
                measurements.append(MeasurementData(
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
                ))
            
            return measurements
            
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