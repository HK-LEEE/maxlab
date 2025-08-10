"""
Base Data Provider Interface
데이터 프로바이더 인터페이스 정의
"""
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any, TYPE_CHECKING
from datetime import datetime
from pydantic import BaseModel

if TYPE_CHECKING:
    from ..data_source_mapping import MappingService
    from ..status_normalizer import StatusNormalizer

class EquipmentData(BaseModel):
    """설비 데이터 모델"""
    equipment_type: str
    equipment_code: str
    equipment_name: str
    status: str
    last_run_time: Optional[datetime]
    active_alarm_count: Optional[int] = 0

class MeasurementData(BaseModel):
    """측정 데이터 모델"""
    id: int
    equipment_type: str
    equipment_code: str
    measurement_code: str
    measurement_desc: str
    measurement_value: float
    timestamp: datetime
    # Spec 관련 필드
    spec_status: int = 0  # 0: In spec, 1: Out of spec
    usl: Optional[float] = None  # Upper Spec Limit
    lsl: Optional[float] = None  # Lower Spec Limit
    target: Optional[float] = None

class EquipmentStatusResponse(BaseModel):
    """설비 상태 응답 모델"""
    items: List[EquipmentData]
    total: int
    limit: int
    offset: int
    has_more: bool

class IDataProvider(ABC):
    """
    데이터 프로바이더 인터페이스
    PostgreSQL, MSSQL, API 등 다양한 데이터 소스를 지원하기 위한 추상 클래스
    """
    
    def __init__(self):
        self.mapping_service: Optional['MappingService'] = None
        self.data_source_id: Optional[str] = None
        self.workspace_id: Optional[str] = None
        self.status_normalizer: Optional['StatusNormalizer'] = None
    
    def set_mapping_service(self, mapping_service: 'MappingService', data_source_id: str, workspace_id: str):
        """Set mapping service for code translation"""
        self.mapping_service = mapping_service
        self.data_source_id = data_source_id
        self.workspace_id = workspace_id
    
    def set_status_normalizer(self, status_normalizer: 'StatusNormalizer'):
        """Set status normalizer for flexible status handling"""
        self.status_normalizer = status_normalizer
    
    async def _normalize_equipment_status(self, equipment_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize equipment status in data
        
        Args:
            equipment_data: Equipment data dictionary
            
        Returns:
            Dict[str, Any]: Equipment data with normalized status
        """
        if "status" in equipment_data and self.status_normalizer:
            original_status = equipment_data["status"]
            normalized_status = await self.status_normalizer.normalize_status(
                original_status, 
                self.workspace_id
            )
            equipment_data["status"] = normalized_status
        return equipment_data
    
    @abstractmethod
    async def get_equipment_status(
        self,
        equipment_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> EquipmentStatusResponse:
        """
        설비 상태 조회
        
        Args:
            equipment_type: 설비 타입 필터
            status: 상태 필터 (ACTIVE, PAUSE, STOP)
            limit: 조회 개수
            offset: 시작 위치
            
        Returns:
            EquipmentStatusResponse: 설비 상태 목록
        """
        pass
    
    @abstractmethod
    async def get_measurement_data(
        self,
        equipment_code: Optional[str] = None,
        equipment_type: Optional[str] = None,
        limit: int = 1000
    ) -> List[MeasurementData]:
        """
        측정 데이터 조회
        
        Args:
            equipment_code: 설비 코드
            equipment_type: 설비 타입
            limit: 조회 개수
            
        Returns:
            List[MeasurementData]: 측정 데이터 목록
        """
        pass
    
    @abstractmethod
    async def get_latest_measurement(
        self,
        equipment_code: str
    ) -> Optional[MeasurementData]:
        """
        특정 설비의 최신 측정 데이터 조회
        
        Args:
            equipment_code: 설비 코드
            
        Returns:
            Optional[MeasurementData]: 최신 측정 데이터
        """
        pass
    
    @abstractmethod
    async def update_equipment_status(
        self,
        equipment_code: str,
        status: str
    ) -> bool:
        """
        설비 상태 업데이트
        
        Args:
            equipment_code: 설비 코드
            status: 새로운 상태 (ACTIVE, PAUSE, STOP)
            
        Returns:
            bool: 성공 여부
        """
        pass
    
    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        """
        연결 테스트
        
        Returns:
            Dict[str, Any]: 테스트 결과
        """
        pass
    
    @abstractmethod
    async def connect(self) -> None:
        """연결 초기화"""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """연결 종료"""
        pass
    
    @abstractmethod
    async def execute_sql(self, query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Execute arbitrary SQL query and return results
        
        Args:
            query: SQL query string
            params: Optional query parameters for parameterized queries
            
        Returns:
            List[Dict[str, Any]]: Query results as list of dictionaries
        """
        pass