"""
Process Flow Permission Management System
공정도 접근 권한 관리를 위한 클래스와 함수들
"""
from enum import Enum
from typing import Dict, Any, Optional, Tuple
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

class ScopeType(str, Enum):
    """Flow 저장 스코프 타입"""
    WORKSPACE = "WORKSPACE"  # 워크스페이스 공유
    USER = "USER"           # 개인용

class VisibilityScope(str, Enum):
    """Flow 가시성 스코프"""
    WORKSPACE = "WORKSPACE"  # 워크스페이스 멤버 모두 조회 가능
    PRIVATE = "PRIVATE"      # 생성자만 조회 가능

class PermissionLevel(str, Enum):
    """권한 레벨"""
    READ = "READ"       # 읽기 권한
    WRITE = "WRITE"     # 쓰기 권한  
    ADMIN = "ADMIN"     # 관리자 권한
    PUBLISH = "PUBLISH" # 게시 권한

class FlowPermissionChecker:
    """Flow 권한 검증 클래스"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    def _is_admin(self, user: Dict[str, Any]) -> bool:
        """사용자가 관리자인지 확인"""
        return user.get('is_admin', False) or user.get('role') == 'admin'
    
    def _get_user_id(self, user: Dict[str, Any]) -> str:
        """사용자 ID 추출"""
        return user.get("user_id", user.get("id", "unknown"))
    
    async def _get_flow_info(self, flow_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        """Flow 정보 조회"""
        query = """
            SELECT id, workspace_id, name, created_by, scope_type, 
                   visibility_scope, shared_with_workspace
            FROM personal_test_process_flows
            WHERE id = :flow_id
        """
        
        result = await self.db.execute(
            text(query), 
            {"flow_id": str(flow_id)}
        )
        
        row = result.first()
        if not row:
            return None
            
        return {
            "id": row.id,
            "workspace_id": row.workspace_id,
            "name": row.name,
            "created_by": row.created_by,
            "scope_type": row.scope_type,
            "visibility_scope": row.visibility_scope,
            "shared_with_workspace": row.shared_with_workspace
        }
    
    async def _is_workspace_member(self, user_id: str, workspace_id: uuid.UUID) -> bool:
        """워크스페이스 멤버십 확인 (현재는 단순 구현)"""
        # TODO: 실제 워크스페이스 멤버십 테이블이 있다면 해당 테이블 조회
        # 현재는 모든 인증된 사용자가 워크스페이스 멤버로 간주
        return True
    
    async def can_access_flow(
        self, 
        flow_id: uuid.UUID, 
        current_user: Dict[str, Any], 
        required_permission: PermissionLevel = PermissionLevel.READ
    ) -> Tuple[bool, str]:
        """
        Flow 접근 권한 확인
        
        Returns:
            Tuple[bool, str]: (권한 여부, 오류 메시지)
        """
        try:
            # 관리자는 모든 권한
            if self._is_admin(current_user):
                logger.debug(f"Admin access granted for flow {flow_id}")
                return True, ""
            
            # Flow 정보 조회
            flow_info = await self._get_flow_info(flow_id)
            if not flow_info:
                return False, "Flow not found"
            
            user_id = self._get_user_id(current_user)
            
            # 생성자는 모든 권한
            if flow_info["created_by"] == user_id:
                logger.debug(f"Owner access granted for flow {flow_id}")
                return True, ""
            
            # 스코프별 권한 체크
            scope_type = flow_info.get("scope_type", "USER")
            
            if scope_type == ScopeType.USER:
                # 개인용은 생성자만 접근 가능
                return False, "You don't have permission to access this private flow"
            
            elif scope_type == ScopeType.WORKSPACE:
                # 워크스페이스 공유는 워크스페이스 멤버만 접근 가능
                is_member = await self._is_workspace_member(
                    user_id, 
                    flow_info["workspace_id"]
                )
                
                if is_member:
                    logger.debug(f"Workspace member access granted for flow {flow_id}")
                    return True, ""
                else:
                    return False, "You don't have permission to access this workspace flow"
            
            return False, "Unknown scope type"
            
        except Exception as e:
            logger.error(f"Error checking flow access: {e}")
            return False, "Error checking permissions"
    
    async def get_accessible_flows_filter(
        self, 
        workspace_id: uuid.UUID, 
        current_user: Dict[str, Any],
        scope_filter: Optional[ScopeType] = None
    ) -> Dict[str, Any]:
        """
        접근 가능한 Flow 필터 조건 생성
        
        Args:
            workspace_id: 워크스페이스 ID
            current_user: 현재 사용자 정보
            scope_filter: 스코프 필터 (optional)
            
        Returns:
            Dict containing filter_clause and params for SQL query
        """
        try:
            # 관리자는 모든 Flow 조회 가능
            if self._is_admin(current_user):
                filter_clause = ""
                params = {}
                
                # 스코프 필터 적용
                if scope_filter:
                    filter_clause = "AND scope_type = :scope_filter"
                    params["scope_filter"] = scope_filter.value
                
                return {
                    "filter_clause": filter_clause,
                    "params": params
                }
            
            user_id = self._get_user_id(current_user)
            
            # 일반 사용자: 본인이 생성한 Flow + 워크스페이스 공유 Flow
            base_filter = """
                AND (
                    (scope_type = 'USER' AND created_by = :user_id) OR
                    (scope_type = 'WORKSPACE' AND shared_with_workspace = true)
                )
            """
            
            params = {"user_id": user_id}
            
            # 스코프 필터 적용
            if scope_filter:
                if scope_filter == ScopeType.USER:
                    base_filter = "AND scope_type = 'USER' AND created_by = :user_id"
                elif scope_filter == ScopeType.WORKSPACE:
                    base_filter = "AND scope_type = 'WORKSPACE' AND shared_with_workspace = true"
                
                params["scope_filter"] = scope_filter.value
            
            return {
                "filter_clause": base_filter,
                "params": params
            }
            
        except Exception as e:
            logger.error(f"Error generating flow filter: {e}")
            return {
                "filter_clause": "AND 1=0",  # 오류 시 아무것도 조회 안됨
                "params": {}
            }
    
    async def can_create_flow_with_scope(
        self,
        workspace_id: uuid.UUID,
        scope_type: ScopeType,
        current_user: Dict[str, Any]
    ) -> Tuple[bool, str]:
        """
        특정 스코프로 Flow 생성 권한 확인
        
        Returns:
            Tuple[bool, str]: (권한 여부, 오류 메시지)
        """
        try:
            # 관리자는 모든 스코프로 생성 가능
            if self._is_admin(current_user):
                return True, ""
            
            # USER 스코프는 누구나 생성 가능
            if scope_type == ScopeType.USER:
                return True, ""
            
            # WORKSPACE 스코프는 워크스페이스 멤버만 생성 가능
            if scope_type == ScopeType.WORKSPACE:
                user_id = self._get_user_id(current_user)
                is_member = await self._is_workspace_member(user_id, workspace_id)
                
                if is_member:
                    return True, ""
                else:
                    return False, "You don't have permission to create workspace-shared flows"
            
            return False, "Invalid scope type"
            
        except Exception as e:
            logger.error(f"Error checking create permission: {e}")
            return False, "Error checking permissions"

# 편의 함수들
async def check_flow_permission(
    flow_id: uuid.UUID,
    current_user: Dict[str, Any],
    db: AsyncSession,
    required_permission: PermissionLevel = PermissionLevel.READ
) -> Tuple[bool, str]:
    """Flow 권한 확인 편의 함수"""
    checker = FlowPermissionChecker(db)
    return await checker.can_access_flow(flow_id, current_user, required_permission)

async def get_flow_list_filter(
    workspace_id: uuid.UUID,
    current_user: Dict[str, Any],
    db: AsyncSession,
    scope_filter: Optional[ScopeType] = None
) -> Dict[str, Any]:
    """Flow 목록 필터 생성 편의 함수"""
    checker = FlowPermissionChecker(db)
    return await checker.get_accessible_flows_filter(workspace_id, current_user, scope_filter)

async def can_create_with_scope(
    workspace_id: uuid.UUID,
    scope_type: ScopeType,
    current_user: Dict[str, Any],
    db: AsyncSession
) -> Tuple[bool, str]:
    """스코프별 생성 권한 확인 편의 함수"""
    checker = FlowPermissionChecker(db)
    return await checker.can_create_flow_with_scope(workspace_id, scope_type, current_user)