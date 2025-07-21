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
from ..core.config import settings
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


# 테스트 엔드포인트 (인증 불필요)
@router.get("/workspaces/test")
async def test_workspaces():
    """워크스페이스 라우터 테스트"""
    return {"status": "ok", "message": "Workspace router is working"}

# 간단한 워크스페이스 트리 테스트
@router.get("/workspaces/simple-tree")
async def simple_workspace_tree():
    """간단한 워크스페이스 트리 테스트"""
    return {
        "workspaces": [
            {
                "id": "test-1",
                "name": "Test Workspace 1",
                "description": "Test workspace",
                "is_active": True,
                "children": []
            },
            {
                "id": "test-2", 
                "name": "Test Workspace 2",
                "description": "Another test workspace",
                "is_active": True,
                "children": []
            }
        ]
    }

# 워크스페이스 API 엔드포인트
@router.get("/workspaces/", response_model=WorkspaceListResponse)
async def list_workspaces(
    skip: int = Query(0, ge=0, description="건너뛸 항목 수"),
    limit: int = Query(100, ge=1, le=1000, description="조회할 최대 항목 수"),
    active_only: bool = Query(True, description="활성 워크스페이스만 조회"),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """사용자가 접근 가능한 워크스페이스 목록 조회 (UUID 기반)"""
    
    # 상세 디버깅 정보 로깅
    logger.info("=" * 80)
    logger.info(f"🔍 워크스페이스 목록 조회 API 호출됨 - /workspaces/")
    logger.info(f"📋 전체 사용자 정보: {current_user}")
    logger.info(f"📧 요청한 사용자: {current_user.get('email', 'Unknown')}")
    
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    
    # UUID 기반 사용자 정보 추출
    user_uuid = current_user.get("user_uuid")
    user_group_uuids = current_user.get("group_uuids", [])
    
    # 레거시 호환성
    user_id = current_user.get("user_id", current_user.get("id"))
    user_groups = current_user.get("groups", [])
    
    logger.info(f"🔐 권한 정보 상세:")
    logger.info(f"  - is_admin: {is_admin}")
    logger.info(f"  - user_uuid: {user_uuid}")
    logger.info(f"  - user_id (legacy): {user_id}")
    logger.info(f"  - group_uuids: {user_group_uuids}")
    logger.info(f"  - groups (legacy): {user_groups}")
    logger.info(f"  - role: {current_user.get('role')}")
    logger.info(f"  - username: {current_user.get('username')}")
    logger.info(f"  - email: {current_user.get('email')}")
    
    # 워크스페이스 목록 조회 (UUID 우선, 레거시 fallback)
    workspaces = await workspace_crud.get_multi(
        db=db,
        skip=skip,
        limit=limit,
        active_only=active_only,
        user_uuid=user_uuid,
        user_group_uuids=user_group_uuids,
        is_admin=is_admin,
        # 레거시 호환성
        user_id=user_id,
        user_groups=user_groups
    )
    
    # 전체 개수 조회 (UUID 우선, 레거시 fallback)
    total = await workspace_crud.count(
        db=db,
        active_only=active_only,
        user_uuid=user_uuid,
        user_group_uuids=user_group_uuids,
        is_admin=is_admin,
        # 레거시 호환성
        user_id=user_id,
        user_groups=user_groups
    )
    
    logger.info(f"워크스페이스 목록 조회 완료: {len(workspaces)}개 반환, 전체 {total}개")
    
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
    
    # 상세 디버깅 정보 로깅
    logger.info("=" * 80)
    logger.info(f"🌳 워크스페이스 트리 조회 API 호출됨 - /workspaces/tree")
    logger.info(f"📧 요청한 사용자: {current_user.get('email', 'Unknown')}")
    logger.info(f"📋 전체 사용자 정보: {current_user}")
    
    # 관리자 권한 확인
    is_admin = current_user.get("is_admin", False) or current_user.get("role") == "admin"
    
    # UUID 기반 사용자 정보 추출
    user_uuid = current_user.get("user_uuid")
    user_group_uuids = current_user.get("group_uuids", [])
    
    # 레거시 호환성
    user_id = current_user.get("user_id", current_user.get("id"))
    user_groups = current_user.get("groups", [])
    
    logger.info(f"🔐 권한 정보 상세:")
    logger.info(f"  - is_admin: {is_admin}")
    logger.info(f"  - user_uuid: {user_uuid}")
    logger.info(f"  - user_id (legacy): {user_id}")
    logger.info(f"  - group_uuids: {user_group_uuids}")
    logger.info(f"  - groups (legacy): {user_groups}")
    
    # 트리 구조 조회 (UUID 우선, 레거시 fallback)
    workspaces = await workspace_crud.get_workspace_tree(
        db=db,
        user_uuid=user_uuid,
        user_group_uuids=user_group_uuids,
        is_admin=is_admin,
        parent_id=str(parent_id) if parent_id else None,
        # 레거시 호환성
        user_id=user_id,
        user_groups=user_groups
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
        # Validate all groups are UUIDs
        if workspace_in.selected_groups:
            validated_groups = []
            for group_identifier in workspace_in.selected_groups:
                try:
                    # Validate UUID format
                    group_uuid = uuid.UUID(group_identifier)
                    validated_groups.append(str(group_uuid))
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid group UUID: '{group_identifier}'. All groups must be valid UUIDs."
                    )
            
            # Update workspace_in with validated UUIDs
            workspace_in.selected_groups = validated_groups
        
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
            "user_id": str(user.user_id_uuid) if user.user_id_uuid else user.user_id,
            "user_email": user.user_email,
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
    """워크스페이스에 사용자 권한 추가 (UUID 기반)"""
    from ..crud.workspace import WorkspaceUserCRUD
    from ..models.workspace import WorkspaceUser
    from ..services.user_mapping import user_mapping_service
    
    workspace_user_crud = WorkspaceUserCRUD()
    
    # 사용자 식별자를 UUID로 변환
    user_identifier = user_data['user_id']
    
    # Get user token from current_user
    user_token = current_user.get("token")
    if not user_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User token not available"
        )
    
    # UUID로 변환 시도
    try:
        user_uuid = uuid.UUID(user_identifier) if isinstance(user_identifier, str) and len(user_identifier) == 36 else None
    except ValueError:
        user_uuid = None
    
    if not user_uuid:
        user_uuid = await user_mapping_service.get_user_uuid_by_identifier(user_identifier, user_token)
        
        if not user_uuid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not resolve user identifier '{user_identifier}' to UUID"
            )
    
    # 사용자 정보 조회 (캐싱용)
    user_info = await user_mapping_service.get_user_info_by_uuid(user_uuid, user_token)
    
    # Create user permission
    db_user = WorkspaceUser(
        workspace_id=workspace_id,
        user_id=str(user_uuid),  # 레거시 호환성
        user_id_uuid=user_uuid,  # 새로운 UUID 필드
        user_email=user_info.get('email') if user_info else None,
        user_display_name=user_info.get('display_name') if user_info else str(user_uuid),
        permission_level=user_data.get('permission_level', 'read'),
        created_by=current_user.get("user_id", current_user.get("id"))
    )
    
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    return {
        "id": str(db_user.id),
        "workspace_id": str(db_user.workspace_id),
        "user_id": str(db_user.user_id_uuid) if db_user.user_id_uuid else db_user.user_id,
        "user_email": db_user.user_email,
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
            "group_id": str(group.group_id_uuid) if group.group_id_uuid else group.group_name,
            "group_name": group.group_name,
            "group_display_name": group.group_display_name,
            "permission_level": group.permission_level,
            "created_at": group.created_at.isoformat() if group.created_at else None,
            "created_by": group.created_by
        }
        for group in groups
    ]


@router.post("/workspaces/{workspace_id}/groups/", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_workspace_group(
    workspace_id: uuid.UUID,
    group_data: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스에 그룹 권한 추가 (UUID 기반)"""
    from ..models.workspace import WorkspaceGroup
    from ..services.group_mapping import group_mapping_service
    
    # 사용자 토큰 먼저 가져오기
    user_token = current_user.get("token")
    if not user_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User token not available"
        )
    
    # 그룹 UUID 가져오기 (UUID만 허용)
    group_identifier = group_data.get('group_id')
    
    if not group_identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id (UUID) is required"
        )
    
    logger.info(f"Received group identifier: '{group_identifier}' (type: {type(group_identifier).__name__}, length: {len(str(group_identifier))})")
    
    # UUID 형식 검증
    try:
        # UUID 형식인지 정규식으로 검증
        import re
        uuid_pattern = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', re.IGNORECASE)
        if isinstance(group_identifier, str) and len(group_identifier) == 36 and uuid_pattern.match(group_identifier):
            group_uuid = uuid.UUID(group_identifier)
            logger.info(f"Successfully parsed UUID: {group_uuid}")
        else:
            raise ValueError(f"Invalid UUID format: '{group_identifier}'")
    except ValueError as e:
        logger.error(f"Invalid group_id format: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid group_id: '{group_identifier}'. Must be a valid UUID (e.g., '58ba91a5-0cba-563c-b2c3-8de00eb4b3b6')"
        )
    
    # 그룹 정보 조회 (선택적 - 외부 인증 서버와 연동)
    group_info = None
    try:
        group_info = await group_mapping_service.get_group_info_by_uuid(group_uuid, user_token)
        if group_info:
            logger.info(f"Fetched group info from auth server: {group_info}")
            logger.info(f"Group name: {group_info.get('name')}")
            logger.info(f"Group display_name: {group_info.get('display_name')}")
            logger.info(f"Group description: {group_info.get('description')}")
    except Exception as e:
        logger.warning(f"Could not fetch group info from auth server for UUID {group_uuid}: {e}")
        logger.warning("Proceeding with UUID only. Group display name will be updated later.")
    
    # 그룹 정보가 없는 경우 기본값 설정
    if not group_info:
        logger.info(f"Using default values for group {group_uuid}")
        group_info = {
            'name': str(group_uuid),  # UUID를 기본 이름으로 사용
            'display_name': 'Pending Update',  # 나중에 업데이트 예정
            'description': None
        }
    
    # Create group permission with actual group info from auth server
    db_group = WorkspaceGroup(
        workspace_id=workspace_id,
        group_name=group_info['name'],  # 실제 그룹명
        group_id_uuid=group_uuid,  # 그룹 UUID
        group_display_name=group_info['display_name'],  # 실제 표시명
        permission_level=group_data.get('permission_level', 'read'),
        created_by=current_user.get("user_id", current_user.get("id"))
    )
    
    db.add(db_group)
    await db.commit()
    await db.refresh(db_group)
    
    return {
        "id": str(db_group.id),
        "workspace_id": str(db_group.workspace_id),
        "group_id": str(db_group.group_id_uuid) if db_group.group_id_uuid else db_group.group_name,
        "group_name": db_group.group_name,
        "group_display_name": db_group.group_display_name,
        "permission_level": db_group.permission_level,
        "created_at": db_group.created_at.isoformat(),
        "created_by": db_group.created_by
    }


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