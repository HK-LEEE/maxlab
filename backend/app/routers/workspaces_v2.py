"""
MAX Lab MVP 플랫폼 워크스페이스 관리 API 라우터 v2
향상된 아키텍처를 사용하는 워크스페이스 API 엔드포인트
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import logging
import uuid

from ..core.database import get_db
from ..core.security import get_current_active_user, require_admin, require_workspace_permission
from ..core.config import settings
from ..schemas.workspace import (
    Workspace, WorkspaceCreate, WorkspaceUpdate, WorkspaceDetail, WorkspaceListResponse,
    WorkspaceGroup, WorkspaceGroupCreate, WorkspaceGroupUpdate,
    MVPModule, MVPModuleCreate, MVPModuleUpdate, MVPModuleListResponse,
    PermissionCheckRequest, PermissionCheckResponse, WorkspaceStats,
    WorkspaceTree, WorkspaceTreeResponse
)
from ..services.permission_service import permission_service, PermissionContext, PermissionLevel
from ..services.query_builder import standard_query_builder
from ..repositories.workspace_repository import WorkspaceRepository
from ..services.performance_monitor import performance_monitor

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Workspaces v2"], prefix="/v2")

# Repository instance
workspace_repository = WorkspaceRepository(permission_service, standard_query_builder)


# 테스트 엔드포인트
@router.get("/workspaces/test")
async def test_workspaces_v2():
    """워크스페이스 v2 라우터 테스트"""
    return {
        "status": "ok", 
        "message": "Workspace v2 router is working",
        "version": "2.0",
        "features": ["optimized_queries", "permission_caching", "repository_pattern"]
    }


# 워크스페이스 목록 조회
@router.get("/workspaces/", response_model=WorkspaceListResponse)
async def list_workspaces(
    skip: int = Query(0, ge=0, description="건너뛸 항목 수"),
    limit: int = Query(100, ge=1, le=1000, description="조회할 최대 항목 수"),
    active_only: bool = Query(True, description="활성 워크스페이스만 조회"),
    include_details: bool = Query(False, description="상세 정보 포함"),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    사용자가 접근 가능한 워크스페이스 목록 조회 (향상된 성능)
    
    - UUID 기반 권한 확인
    - 최적화된 쿼리 사용
    - 권한 캐싱 지원
    """
    # 권한 컨텍스트 생성
    user_context = PermissionContext(
        user_uuid=current_user.get("user_uuid"),
        group_uuids=current_user.get("group_uuids", []),
        is_system_admin=current_user.get("is_admin", False) or current_user.get("role") == "admin",
        required_level=PermissionLevel.READ,
        legacy_user_id=current_user.get("user_id", current_user.get("id")),
        legacy_groups=current_user.get("groups", [])
    )
    
    logger.info(f"워크스페이스 목록 조회 요청 (v2): 사용자 {user_context.user_uuid}, "
               f"관리자 {user_context.is_system_admin}")
    
    # Repository를 통해 조회
    workspaces, total = await workspace_repository.get_workspace_list(
        db=db,
        user_context=user_context,
        skip=skip,
        limit=limit,
        active_only=active_only,
        include_details=include_details
    )
    
    return WorkspaceListResponse(
        workspaces=workspaces,
        total=total,
        skip=skip,
        limit=limit
    )


# 워크스페이스 상세 조회
@router.get("/workspaces/{workspace_id}", response_model=WorkspaceDetail)
async def get_workspace(
    workspace_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 상세 정보 조회 (향상된 권한 확인)"""
    # 권한 컨텍스트 생성
    user_context = PermissionContext(
        user_uuid=current_user.get("user_uuid"),
        group_uuids=current_user.get("group_uuids", []),
        is_system_admin=current_user.get("is_admin", False) or current_user.get("role") == "admin",
        required_level=PermissionLevel.READ,
        legacy_user_id=current_user.get("user_id", current_user.get("id")),
        legacy_groups=current_user.get("groups", [])
    )
    
    workspace = await workspace_repository.get_workspace_by_id(
        db=db,
        workspace_id=workspace_id,
        user_context=user_context,
        include_details=True
    )
    
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or access denied"
        )
    
    return workspace


# 워크스페이스 생성
@router.post("/workspaces/", response_model=Workspace, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    workspace_in: WorkspaceCreate,
    current_user: Dict[str, Any] = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """새 워크스페이스 생성 (관리자 전용)"""
    # 권한 컨텍스트 생성
    user_context = PermissionContext(
        user_uuid=current_user.get("user_uuid"),
        group_uuids=current_user.get("group_uuids", []),
        is_system_admin=True,  # require_admin을 통과했으므로 관리자
        required_level=PermissionLevel.ADMIN
    )
    
    try:
        # 모든 그룹이 UUID인지 검증
        if workspace_in.selected_groups:
            validated_groups = []
            for group_identifier in workspace_in.selected_groups:
                try:
                    group_uuid = uuid.UUID(group_identifier)
                    validated_groups.append(str(group_uuid))
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid group UUID: '{group_identifier}'. All groups must be valid UUIDs."
                    )
            workspace_in.selected_groups = validated_groups
        
        workspace = await workspace_repository.create_workspace(
            db=db,
            workspace_data=workspace_in,
            creator_id=current_user.get("user_id", current_user.get("id")),
            user_context=user_context
        )
        
        return workspace
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Failed to create workspace: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create workspace"
        )


# 워크스페이스 수정
@router.put("/workspaces/{workspace_id}", response_model=Workspace)
async def update_workspace(
    workspace_id: uuid.UUID,
    workspace_in: WorkspaceUpdate,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 정보 수정 (워크스페이스 관리자 권한 필요)"""
    # 권한 컨텍스트 생성
    user_context = PermissionContext(
        user_uuid=current_user.get("user_uuid"),
        group_uuids=current_user.get("group_uuids", []),
        is_system_admin=current_user.get("is_admin", False) or current_user.get("role") == "admin",
        required_level=PermissionLevel.ADMIN,
        legacy_user_id=current_user.get("user_id", current_user.get("id")),
        legacy_groups=current_user.get("groups", [])
    )
    
    try:
        workspace = await workspace_repository.update_workspace(
            db=db,
            workspace_id=workspace_id,
            workspace_data=workspace_in,
            updater_id=current_user.get("user_id", current_user.get("id")),
            user_context=user_context
        )
        
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found or access denied"
            )
        
        return workspace
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# 워크스페이스 삭제
@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: uuid.UUID,
    hard_delete: bool = Query(False, description="완전 삭제 여부"),
    current_user: Dict[str, Any] = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 삭제 (관리자 전용)"""
    # 권한 컨텍스트 생성
    user_context = PermissionContext(
        user_uuid=current_user.get("user_uuid"),
        group_uuids=current_user.get("group_uuids", []),
        is_system_admin=True,  # require_admin을 통과했으므로 관리자
        required_level=PermissionLevel.ADMIN
    )
    
    success = await workspace_repository.delete_workspace(
        db=db,
        workspace_id=workspace_id,
        user_context=user_context,
        hard_delete=hard_delete
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )


# 워크스페이스 권한 정보 조회
@router.get("/workspaces/{workspace_id}/permissions", response_model=Dict[str, Any])
async def get_workspace_permissions(
    workspace_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 권한 정보 조회"""
    # 권한 컨텍스트 생성
    user_context = PermissionContext(
        user_uuid=current_user.get("user_uuid"),
        group_uuids=current_user.get("group_uuids", []),
        is_system_admin=current_user.get("is_admin", False) or current_user.get("role") == "admin",
        required_level=PermissionLevel.READ,
        legacy_user_id=current_user.get("user_id", current_user.get("id")),
        legacy_groups=current_user.get("groups", [])
    )
    
    permissions = await workspace_repository.get_workspace_permissions(
        db=db,
        workspace_id=workspace_id,
        user_context=user_context
    )
    
    return permissions


# 그룹 권한 추가
@router.post("/workspaces/{workspace_id}/groups/", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_workspace_group(
    workspace_id: uuid.UUID,
    group_data: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스에 그룹 권한 추가 (UUID 기반)"""
    from ..services.group_mapping import group_mapping_service
    
    # 권한 컨텍스트 생성
    user_context = PermissionContext(
        user_uuid=current_user.get("user_uuid"),
        group_uuids=current_user.get("group_uuids", []),
        is_system_admin=current_user.get("is_admin", False) or current_user.get("role") == "admin",
        required_level=PermissionLevel.ADMIN,
        legacy_user_id=current_user.get("user_id", current_user.get("id")),
        legacy_groups=current_user.get("groups", [])
    )
    
    # 그룹 UUID 가져오기
    group_identifier = group_data.get('group_id')
    if not group_identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id (UUID) is required"
        )
    
    # UUID 형식 검증
    try:
        group_uuid = uuid.UUID(group_identifier)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid group_id: '{group_identifier}'. Must be a valid UUID."
        )
    
    # 그룹 정보 조회 (선택적)
    group_info = None
    try:
        user_token = current_user.get("token")
        if user_token:
            group_info = await group_mapping_service.get_group_info_by_uuid(group_uuid, user_token)
    except Exception as e:
        logger.warning(f"Could not fetch group info: {e}")
    
    # 기본값 설정
    group_display_name = None
    if group_info:
        group_display_name = group_info.get('display_name') or group_info.get('name')
    
    if not group_display_name:
        group_display_name = 'Pending Update'
    
    try:
        # Repository를 통해 권한 추가
        workspace_group = await workspace_repository.add_group_permission(
            db=db,
            workspace_id=workspace_id,
            group_uuid=group_uuid,
            permission_level=group_data.get('permission_level', 'read'),
            creator_id=current_user.get("user_id", current_user.get("id")),
            user_context=user_context,
            group_display_name=group_display_name
        )
        
        return {
            "id": str(workspace_group.id),
            "workspace_id": str(workspace_group.workspace_id),
            "group_id": str(workspace_group.group_id_uuid) if workspace_group.group_id_uuid else workspace_group.group_name,
            "group_name": workspace_group.group_name,
            "group_display_name": workspace_group.group_display_name,
            "permission_level": workspace_group.permission_level,
            "created_at": workspace_group.created_at.isoformat(),
            "created_by": workspace_group.created_by
        }
        
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )


# 캐시 통계 조회
@router.get("/workspaces/cache/stats", response_model=Dict[str, Any])
async def get_cache_stats(
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """권한 캐시 통계 조회 (관리자 전용)"""
    permission_stats = permission_service.get_cache_stats()
    query_stats = standard_query_builder.get_query_stats()
    repo_stats = workspace_repository.get_operation_stats()
    
    return {
        "permission_cache": permission_stats,
        "query_builder": query_stats,
        "repository": repo_stats
    }


# 캐시 초기화
@router.post("/workspaces/cache/clear", status_code=status.HTTP_204_NO_CONTENT)
async def clear_cache(
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """권한 캐시 초기화 (관리자 전용)"""
    permission_service.clear_cache()
    standard_query_builder.reset_stats()
    workspace_repository.reset_stats()
    
    logger.info(f"캐시 초기화: 관리자 {current_user.get('email')}")


# 특정 워크스페이스 캐시 무효화
@router.post("/workspaces/{workspace_id}/cache/invalidate", status_code=status.HTTP_204_NO_CONTENT)
async def invalidate_workspace_cache(
    workspace_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """특정 워크스페이스 캐시 무효화 (관리자 전용)"""
    permission_service.invalidate_workspace_cache(workspace_id)
    
    logger.info(f"워크스페이스 {workspace_id} 캐시 무효화: 관리자 {current_user.get('email')}")


# 성능 메트릭 조회
@router.get("/workspaces/performance/metrics", response_model=Dict[str, Any])
async def get_performance_metrics(
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """성능 메트릭 조회 (관리자 전용)"""
    return performance_monitor.get_statistics()


# 성능 메트릭 초기화
@router.post("/workspaces/performance/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_performance_metrics(
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """성능 메트릭 초기화 (관리자 전용)"""
    performance_monitor.reset_metrics()
    logger.info(f"성능 메트릭 초기화: 관리자 {current_user.get('email')}")