"""
MAX Lab MVP 플랫폼 워크스페이스 관리 API 라우터
워크스페이스, 그룹, MVP 모듈에 대한 REST API 엔드포인트를 제공합니다.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import logging
import uuid

from ..core.database import get_db
from ..core.security import get_current_active_user, require_admin, AuthorizationError, require_workspace_permission
from ..crud.workspace import workspace_crud, workspace_group_crud, mvp_module_crud
from ..schemas.workspace import (
    Workspace, WorkspaceCreate, WorkspaceUpdate, WorkspaceDetail, WorkspaceListResponse,
    WorkspaceGroup, WorkspaceGroupCreate, WorkspaceGroupUpdate,
    MVPModule, MVPModuleCreate, MVPModuleUpdate, MVPModuleListResponse,
    PermissionCheckRequest, PermissionCheckResponse, WorkspaceStats,
    WorkspaceTree, WorkspaceTreeResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Workspaces"])


# PermissionChecker와 require_workspace_permission은 이제 security.py에서 import됨


# 워크스페이스 API 엔드포인트
@router.get("/workspaces/", response_model=WorkspaceListResponse)
async def list_workspaces(
    skip: int = Query(0, ge=0, description="건너뛸 항목 수"),
    limit: int = Query(100, ge=1, le=1000, description="조회할 최대 항목 수"),
    active_only: bool = Query(True, description="활성 워크스페이스만 조회"),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """사용자가 접근 가능한 워크스페이스 목록 조회"""
    
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    user_id = current_user.get("user_id", current_user.get("id"))
    user_groups = current_user.get("groups", [])
    
    # 워크스페이스 목록 조회
    workspaces = await workspace_crud.get_multi(
        db=db,
        skip=skip,
        limit=limit,
        active_only=active_only,
        user_id=user_id,
        user_groups=user_groups,
        is_admin=is_admin
    )
    
    # 전체 개수 조회
    total = await workspace_crud.count(
        db=db,
        active_only=active_only,
        user_id=user_id,
        user_groups=user_groups,
        is_admin=is_admin
    )
    
    return WorkspaceListResponse(
        workspaces=workspaces,
        total=total,
        skip=skip,
        limit=limit
    )


@router.get("/workspaces/tree", response_model=WorkspaceTreeResponse)
async def get_workspace_tree(
    parent_id: Optional[uuid.UUID] = Query(None, description="부모 워크스페이스 ID"),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 트리 구조 조회"""
    
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    user_id = current_user.get("user_id", current_user.get("id"))
    user_groups = current_user.get("groups", [])
    
    # 트리 구조 조회
    workspaces = await workspace_crud.get_workspace_tree(
        db=db,
        user_id=user_id,
        user_groups=user_groups,
        is_admin=is_admin,
        parent_id=str(parent_id) if parent_id else None
    )
    
    # 트리 구조로 변환
    def build_tree(items, parent_id=None):
        tree = []
        for item in items:
            if item.parent_id == parent_id:
                children = build_tree(items, item.id)
                workspace_dict = {
                    "id": item.id,
                    "name": item.name,
                    "slug": item.slug,
                    "description": item.description,
                    "workspace_type": item.workspace_type,
                    "owner_type": item.owner_type,
                    "owner_id": item.owner_id,
                    "parent_id": item.parent_id,
                    "path": item.path,
                    "is_folder": item.is_folder,
                    "is_active": item.is_active,
                    "settings": item.settings,
                    "created_by": item.created_by,
                    "updated_by": item.updated_by,
                    "created_at": item.created_at,
                    "updated_at": item.updated_at,
                    "children": children
                }
                tree.append(workspace_dict)
        return tree
    
    tree = build_tree(workspaces)
    
    return WorkspaceTreeResponse(
        workspaces=tree,
        total=len(workspaces)
    )


@router.post("/workspaces/", response_model=Workspace, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    workspace_in: WorkspaceCreate,
    current_user: Dict[str, Any] = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """새 워크스페이스 생성 (관리자 전용)"""
    
    try:
        workspace = await workspace_crud.create(
            db=db,
            obj_in=workspace_in,
            creator_id=current_user.get("user_id", current_user.get("id"))
        )
        return workspace
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Failed to create workspace: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create workspace"
        )


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceDetail)
async def get_workspace(
    workspace_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("read")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 상세 정보 조회"""
    
    workspace = await workspace_crud.get_with_details(db=db, workspace_id=workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )
    
    return workspace


@router.put("/workspaces/{workspace_id}", response_model=Workspace)
async def update_workspace(
    workspace_id: uuid.UUID,
    workspace_in: WorkspaceUpdate,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 정보 수정 (워크스페이스 관리자 권한 필요)"""
    
    try:
        workspace = await workspace_crud.update(
            db=db,
            workspace_id=workspace_id,
            obj_in=workspace_in,
            updater_id=current_user.get("user_id", current_user.get("id"))
        )
        
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found"
            )
        
        return workspace
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: uuid.UUID,
    hard_delete: bool = Query(False, description="완전 삭제 여부"),
    current_user: Dict[str, Any] = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 삭제 (관리자 전용)"""
    
    user_id = current_user.get("user_id", current_user.get("id"))
    
    if hard_delete:
        success = await workspace_crud.delete(db=db, workspace_id=workspace_id)
    else:
        success = await workspace_crud.soft_delete(
            db=db, 
            workspace_id=workspace_id, 
            deleter_id=user_id
        )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )


# 워크스페이스 사용자 관리 API
@router.get("/workspaces/{workspace_id}/users/", response_model=List[Dict[str, Any]])
async def list_workspace_users(
    workspace_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 사용자 목록 조회"""
    from ..crud.workspace import WorkspaceUserCRUD
    workspace_user_crud = WorkspaceUserCRUD()
    
    users = await workspace_user_crud.get_by_workspace(db=db, workspace_id=workspace_id)
    
    # Convert WorkspaceUser objects to dictionaries
    return [
        {
            "id": str(user.id),
            "workspace_id": str(user.workspace_id),
            "user_id": user.user_id,
            "user_display_name": user.user_display_name,
            "permission_level": user.permission_level,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "created_by": user.created_by
        }
        for user in users
    ]


@router.post("/workspaces/{workspace_id}/users/", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_workspace_user(
    workspace_id: uuid.UUID,
    user_data: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스에 사용자 권한 추가"""
    from ..crud.workspace import WorkspaceUserCRUD
    from ..models.workspace import WorkspaceUser
    
    workspace_user_crud = WorkspaceUserCRUD()
    
    # Create user permission
    db_user = WorkspaceUser(
        workspace_id=workspace_id,
        user_id=user_data['user_id'],
        permission_level=user_data.get('permission_level', 'read'),
        created_by=current_user.get("user_id", current_user.get("id"))
    )
    
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    return {
        "id": str(db_user.id),
        "workspace_id": str(db_user.workspace_id),
        "user_id": db_user.user_id,
        "user_display_name": db_user.user_display_name,
        "permission_level": db_user.permission_level,
        "created_at": db_user.created_at.isoformat(),
        "created_by": db_user.created_by
    }


@router.delete("/workspaces/{workspace_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace_user(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 사용자 권한 삭제"""
    from ..crud.workspace import WorkspaceUserCRUD
    workspace_user_crud = WorkspaceUserCRUD()
    
    success = await workspace_user_crud.delete(db=db, user_id=user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace user not found"
        )


# 워크스페이스 그룹 관리 API
@router.get("/workspaces/{workspace_id}/groups/", response_model=List[Dict[str, Any]])
async def list_workspace_groups(
    workspace_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 그룹 목록 조회"""
    
    groups = await workspace_group_crud.get_by_workspace(db=db, workspace_id=workspace_id)
    
    # Convert WorkspaceGroup objects to dictionaries
    return [
        {
            "id": str(group.id),
            "workspace_id": str(group.workspace_id),
            "group_name": group.group_name,
            "group_display_name": group.group_display_name,
            "permission_level": group.permission_level,
            "created_at": group.created_at.isoformat() if group.created_at else None,
            "created_by": group.created_by
        }
        for group in groups
    ]


@router.post("/workspaces/{workspace_id}/groups/", response_model=WorkspaceGroup, status_code=status.HTTP_201_CREATED)
async def create_workspace_group(
    workspace_id: uuid.UUID,
    group_in: WorkspaceGroupCreate,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스에 그룹 권한 추가"""
    
    # 워크스페이스 ID 설정
    group_in.workspace_id = workspace_id
    
    try:
        group = await workspace_group_crud.create(
            db=db,
            obj_in=group_in,
            created_by=current_user.get("user_id", current_user.get("id"))
        )
        return group
        
    except Exception as e:
        logger.error(f"Failed to create workspace group: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create workspace group"
        )


@router.delete("/workspaces/{workspace_id}/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace_group(
    workspace_id: uuid.UUID,
    group_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 그룹 권한 삭제"""
    
    success = await workspace_group_crud.delete(db=db, group_id=group_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace group not found"
        )


# MVP 모듈 관리 API
@router.get("/workspaces/{workspace_id}/modules/", response_model=MVPModuleListResponse)
async def list_mvp_modules(
    workspace_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = Query(True, description="활성 모듈만 조회"),
    current_user: Dict[str, Any] = Depends(require_workspace_permission("read")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스의 MVP 모듈 목록 조회"""
    
    modules = await mvp_module_crud.get_by_workspace(
        db=db,
        workspace_id=workspace_id,
        active_only=active_only
    )
    
    # 페이지네이션 적용
    total = len(modules)
    modules = modules[skip:skip + limit]
    
    return MVPModuleListResponse(
        modules=modules,
        total=total,
        skip=skip,
        limit=limit
    )


@router.post("/workspaces/{workspace_id}/modules/", response_model=MVPModule, status_code=status.HTTP_201_CREATED)
async def create_mvp_module(
    workspace_id: uuid.UUID,
    module_in: MVPModuleCreate,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스에 MVP 모듈 추가"""
    
    # 워크스페이스 ID 설정
    module_in.workspace_id = workspace_id
    
    try:
        module = await mvp_module_crud.create(
            db=db,
            obj_in=module_in,
            created_by=current_user.get("user_id", current_user.get("id"))
        )
        return module
        
    except Exception as e:
        logger.error(f"Failed to create MVP module: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create MVP module"
        )


@router.put("/workspaces/{workspace_id}/modules/{module_id}", response_model=MVPModule)
async def update_mvp_module(
    workspace_id: uuid.UUID,
    module_id: uuid.UUID,
    module_in: MVPModuleUpdate,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """MVP 모듈 정보 수정"""
    
    try:
        module = await mvp_module_crud.update(
            db=db,
            module_id=module_id,
            obj_in=module_in,
            updater_id=current_user.get("user_id", current_user.get("id"))
        )
        
        if not module:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MVP module not found"
            )
        
        return module
        
    except Exception as e:
        logger.error(f"Failed to update MVP module: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update MVP module"
        )


# 권한 확인 API
@router.post("/workspaces/check-permission/", response_model=PermissionCheckResponse)
async def check_workspace_permission(
    request: PermissionCheckRequest,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 접근 권한 확인"""
    
    # 관리자는 모든 권한 보유
    # Check both is_admin and role fields for backward compatibility
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    if is_admin:
        return PermissionCheckResponse(
            has_permission=True,
            user_permission_level="admin",
            granted_groups=["admin"]
        )
    
    user_groups = current_user.get("groups", [])
    
    permission_result = await workspace_group_crud.check_permission(
        db=db,
        workspace_id=request.workspace_id,
        user_groups=user_groups,
        required_permission=request.required_permission
    )
    
    return PermissionCheckResponse(**permission_result)


# 통계 API
@router.get("/workspaces/stats/", response_model=WorkspaceStats)
async def get_workspace_stats(
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스 통계 정보 조회"""
    
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    user_groups = current_user.get("groups", [])
    
    # 전체 통계 (관리자용)
    if is_admin:
        total_workspaces = await workspace_crud.count(db=db, active_only=False)
        active_workspaces = await workspace_crud.count(db=db, active_only=True)
        user_accessible_workspaces = active_workspaces
    else:
        # 사용자별 통계
        total_workspaces = await workspace_crud.count(
            db=db, active_only=False, user_groups=user_groups, is_admin=False
        )
        active_workspaces = await workspace_crud.count(
            db=db, active_only=True, user_groups=user_groups, is_admin=False
        )
        user_accessible_workspaces = active_workspaces
    
    # MVP 모듈 통계 (전체)
    all_modules = await mvp_module_crud.get_active_modules(db=db)
    total_mvp_modules = len(all_modules)
    active_mvp_modules = len([m for m in all_modules if m.is_active])
    
    return WorkspaceStats(
        total_workspaces=total_workspaces,
        active_workspaces=active_workspaces,
        total_mvp_modules=total_mvp_modules,
        active_mvp_modules=active_mvp_modules,
        user_accessible_workspaces=user_accessible_workspaces
    )