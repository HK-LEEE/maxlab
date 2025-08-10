"""
Status Normalizer Service
설비 상태값을 표준 형태로 정규화하는 서비스
"""
from typing import Dict, Optional, Set
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


class StatusNormalizer:
    """설비 상태값 정규화 서비스"""
    
    # 기본 상태 매핑 테이블
    DEFAULT_STATUS_MAPPINGS = {
        # Active/Running variants
        "ACTIVE": "ACTIVE",
        "RUNNING": "ACTIVE", 
        "RUN": "ACTIVE",
        "ONLINE": "ACTIVE",
        "STARTED": "ACTIVE",
        "OPERATIONAL": "ACTIVE",
        "ON": "ACTIVE",
        "START": "ACTIVE",
        "WORKING": "ACTIVE",
        "OPERATE": "ACTIVE",
        "OPERATION": "ACTIVE",
        
        # Pause variants
        "PAUSE": "PAUSE",
        "PAUSED": "PAUSE",
        "IDLE": "PAUSE",
        "STANDBY": "PAUSE",
        "WAITING": "PAUSE",
        "HOLD": "PAUSE",
        "SUSPENDED": "PAUSE",
        
        # Stop variants
        "STOP": "STOP",
        "STOPPED": "STOP",
        "OFFLINE": "STOP",
        "DOWN": "STOP",
        "SHUTDOWN": "STOP",
        "MAINTENANCE": "STOP",
        "ERROR": "STOP",
        "FAULT": "STOP",
        "FAILED": "STOP",
        "INACTIVE": "STOP",
        "OFF": "STOP",
        "DISABLED": "STOP",
        "BROKEN": "STOP",
    }
    
    def __init__(self, db_session: Optional[AsyncSession] = None):
        """
        상태 정규화 서비스 초기화
        
        Args:
            db_session: 데이터베이스 세션 (사용자 정의 매핑 로드용)
        """
        self.db_session = db_session
        self._custom_mappings: Dict[str, Dict[str, str]] = {}  # workspace_id -> {source_status -> target_status}
        self._cache_loaded: Set[str] = set()  # 캐시 로드 완료된 workspace_id 목록
    
    async def normalize_status(self, raw_status: str, workspace_id: Optional[str] = None) -> str:
        """
        상태값을 표준 형태로 정규화
        
        Args:
            raw_status: 원본 상태값
            workspace_id: 워크스페이스 ID (사용자 정의 매핑 적용용)
            
        Returns:
            str: 정규화된 상태값 (ACTIVE, PAUSE, STOP 중 하나)
        """
        if not raw_status:
            return "STOP"
        
        # 대소문자 구분 없이 처리
        normalized_input = raw_status.upper().strip()
        
        # 사용자 정의 매핑 확인 (우선순위 높음)
        if workspace_id and self.db_session:
            # workspace_id를 문자열로 변환 (asyncpg UUID 객체 처리)
            workspace_id_str = str(workspace_id)
            await self._load_custom_mappings(workspace_id_str)
            custom_mapping = self._custom_mappings.get(workspace_id_str, {})
            if normalized_input in custom_mapping:
                result = custom_mapping[normalized_input]
                logger.debug(f"Status normalized using custom mapping: {raw_status} -> {result} (workspace: {workspace_id_str})")
                return result
        
        # 기본 매핑 테이블 확인
        if normalized_input in self.DEFAULT_STATUS_MAPPINGS:
            result = self.DEFAULT_STATUS_MAPPINGS[normalized_input]
            logger.debug(f"Status normalized using default mapping: {raw_status} -> {result}")
            return result
        
        # 부분 매칭 시도 (키워드 기반)
        result = self._partial_match(normalized_input)
        if result:
            logger.debug(f"Status normalized using partial matching: {raw_status} -> {result}")
            return result
        
        # 매핑되지 않은 상태는 STOP으로 기본값 설정
        logger.warning(f"Unknown status '{raw_status}' normalized to STOP")
        return "STOP"
    
    def _partial_match(self, status: str) -> Optional[str]:
        """
        부분 매칭을 통한 상태 정규화
        
        Args:
            status: 정규화할 상태값
            
        Returns:
            str: 매칭된 상태값 또는 None
        """
        # Active 관련 키워드
        active_keywords = ["RUN", "ACTIVE", "ON", "START", "WORK", "OPER"]
        for keyword in active_keywords:
            if keyword in status:
                return "ACTIVE"
        
        # Pause 관련 키워드
        pause_keywords = ["PAUSE", "IDLE", "WAIT", "HOLD", "STAND"]
        for keyword in pause_keywords:
            if keyword in status:
                return "PAUSE"
        
        # Stop 관련 키워드
        stop_keywords = ["STOP", "OFF", "DOWN", "ERROR", "FAULT", "FAIL", "MAINT"]
        for keyword in stop_keywords:
            if keyword in status:
                return "STOP"
        
        return None
    
    async def _load_custom_mappings(self, workspace_id: str) -> None:
        """
        워크스페이스별 사용자 정의 매핑 로드
        
        Args:
            workspace_id: 워크스페이스 ID
        """
        # workspace_id를 문자열로 변환 (asyncpg UUID 객체 처리)
        workspace_id_str = str(workspace_id)
        
        if workspace_id_str in self._cache_loaded:
            return
        
        try:
            # workspace_id가 UUID 형식인지 확인
            import uuid
            try:
                uuid.UUID(workspace_id_str)
                # UUID인 경우 직접 사용
                query = text("""
                    SELECT source_status, target_status
                    FROM status_mappings
                    WHERE workspace_id = :workspace_id AND is_active = true
                """)
                result = await self.db_session.execute(query, {"workspace_id": workspace_id_str})
            except ValueError:
                # UUID가 아닌 경우 workspace lookup
                query = text("""
                    SELECT sm.source_status, sm.target_status
                    FROM status_mappings sm
                    INNER JOIN workspaces w ON sm.workspace_id = w.id
                    WHERE (w.slug = :workspace_id OR w.name = :workspace_id) AND sm.is_active = true
                """)
                result = await self.db_session.execute(query, {"workspace_id": workspace_id_str})
            mappings = {}
            
            for row in result:
                source_status = row.source_status.upper().strip()
                target_status = row.target_status.upper().strip()
                mappings[source_status] = target_status
            
            self._custom_mappings[workspace_id_str] = mappings
            self._cache_loaded.add(workspace_id_str)
            
            logger.info(f"Loaded {len(mappings)} custom status mappings for workspace {workspace_id_str}")
            
        except Exception as e:
            logger.error(f"Failed to load custom status mappings for workspace {workspace_id_str}: {e}")
            # 실패 시 빈 매핑으로 설정
            self._custom_mappings[workspace_id_str] = {}
            self._cache_loaded.add(workspace_id_str)
    
    async def add_custom_mapping(
        self,
        workspace_id: str,
        source_status: str,
        target_status: str,
        data_source_type: Optional[str] = None
    ) -> bool:
        """
        사용자 정의 상태 매핑 추가
        
        Args:
            workspace_id: 워크스페이스 ID
            source_status: 원본 상태값
            target_status: 대상 상태값 (ACTIVE, PAUSE, STOP 중 하나)
            data_source_type: 데이터 소스 유형 (선택사항)
            
        Returns:
            bool: 성공 여부
        """
        if not self.db_session:
            logger.error("Database session not available for custom mapping")
            return False
        
        # 대상 상태값 검증
        if target_status.upper() not in ["ACTIVE", "PAUSE", "STOP"]:
            logger.error(f"Invalid target status: {target_status}")
            return False
        
        try:
            query = text("""
                INSERT INTO status_mappings
                (workspace_id, source_status, target_status, data_source_type, is_active, created_at)
                VALUES (:workspace_id, :source_status, :target_status, :data_source_type, true, NOW())
                ON CONFLICT (workspace_id, source_status, data_source_type)
                DO UPDATE SET
                    target_status = EXCLUDED.target_status,
                    is_active = EXCLUDED.is_active,
                    created_at = NOW()
            """)
            
            await self.db_session.execute(query, {
                "workspace_id": workspace_id,
                "source_status": source_status.upper().strip(),
                "target_status": target_status.upper().strip(),
                "data_source_type": data_source_type
            })
            
            await self.db_session.commit()
            
            # 캐시 무효화
            if workspace_id in self._cache_loaded:
                self._cache_loaded.remove(workspace_id)
                self._custom_mappings.pop(workspace_id, None)
            
            logger.info(f"Added custom status mapping: {source_status} -> {target_status} (workspace: {workspace_id})")
            return True
            
        except Exception as e:
            logger.error(f"Failed to add custom status mapping: {e}")
            await self.db_session.rollback()
            return False
    
    async def get_custom_mappings(self, workspace_id: str) -> Dict[str, str]:
        """
        워크스페이스의 사용자 정의 매핑 조회
        
        Args:
            workspace_id: 워크스페이스 ID
            
        Returns:
            Dict[str, str]: 사용자 정의 매핑 딕셔너리
        """
        await self._load_custom_mappings(workspace_id)
        return self._custom_mappings.get(workspace_id, {})
    
    def get_default_mappings(self) -> Dict[str, str]:
        """
        기본 매핑 테이블 조회
        
        Returns:
            Dict[str, str]: 기본 매핑 딕셔너리
        """
        return self.DEFAULT_STATUS_MAPPINGS.copy()
    
    def clear_cache(self, workspace_id: Optional[str] = None) -> None:
        """
        캐시 초기화
        
        Args:
            workspace_id: 특정 워크스페이스 캐시만 삭제 (None이면 전체 삭제)
        """
        if workspace_id:
            self._cache_loaded.discard(workspace_id)
            self._custom_mappings.pop(workspace_id, None)
        else:
            self._cache_loaded.clear()
            self._custom_mappings.clear()
        
        logger.info(f"Status normalizer cache cleared for workspace: {workspace_id or 'ALL'}")