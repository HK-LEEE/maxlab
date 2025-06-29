"""
MVP 모듈 관리 API 라우터
워크스페이스별 MVP 페이지/모듈을 관리하는 엔드포인트입니다.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Form, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any, Optional
import logging
import uuid

from app.core.database import get_db
from app.core.security import get_current_active_user, require_workspace_permission
from app.crud.workspace import mvp_module_crud
from app.schemas.workspace import (
    MVPModule, MVPModuleCreate, MVPModuleUpdate,
    MVPModuleListResponse
)
from app.services.workspace_manager import WorkspaceManager
from app.services.dynamic_loader import module_template_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MVP Modules"])

# 워크스페이스 관리자 인스턴스
workspace_manager = WorkspaceManager()


@router.get("/workspaces/{workspace_id}/modules", response_model=MVPModuleListResponse)
async def list_workspace_modules(
    workspace_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = Query(True),
    current_user: Dict[str, Any] = Depends(require_workspace_permission("read")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스의 MVP 모듈 목록 조회"""
    modules = await mvp_module_crud.get_by_workspace(
        db=db,
        workspace_id=workspace_id,
        active_only=active_only
    )
    
    # 페이지네이션
    total = len(modules)
    modules = modules[skip:skip + limit]
    
    return MVPModuleListResponse(
        modules=modules,
        total=total,
        skip=skip,
        limit=limit
    )


@router.post("/workspaces/{workspace_id}/modules", response_model=MVPModule, status_code=status.HTTP_201_CREATED)
async def create_mvp_module(
    workspace_id: uuid.UUID,
    module_name: str = Form(...),
    display_name: str = Form(...),
    description: Optional[str] = Form(None),
    module_type: str = Form("custom"),
    template: str = Form("default"),
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스에 새 MVP 모듈 생성"""
    try:
        # 워크스페이스 디렉토리 확인/생성
        if not workspace_manager.workspace_exists(str(workspace_id)):
            workspace_manager.create_workspace_directory(str(workspace_id))
        
        # 모듈 디렉토리 생성
        module_path = workspace_manager.create_mvp_module(
            str(workspace_id),
            module_name,
            template=module_type  # template type을 module_type으로 사용
        )
        
        # 템플릿 적용
        if module_type in ["dashboard", "analytics", "report"]:
            template_data = module_template_manager.get_template(module_type)
            context = {
                "module_name": module_name,
                "module_title": module_name.replace("_", " ").title().replace(" ", ""),
                "display_name": display_name
            }
            applied_template = module_template_manager.apply_template(template_data, context)
            
            # 템플릿 파일 쓰기
            if "backend" in applied_template:
                (module_path / "backend" / "router.py").write_text(applied_template["backend"])
            if "frontend" in applied_template:
                (module_path / "frontend" / "index.tsx").write_text(applied_template["frontend"])
        
        # DB에 모듈 정보 저장
        module_data = MVPModuleCreate(
            workspace_id=workspace_id,
            module_name=module_name,
            display_name=display_name,
            description=description,
            module_type=module_type,
            route_path=f"/{module_name}",
            template=template,
            is_installed=True
        )
        
        module = await mvp_module_crud.create(
            db=db,
            obj_in=module_data,
            created_by=current_user.get("user_id", current_user.get("id"))
        )
        
        # module_path 업데이트
        module.module_path = str(module_path)
        await db.commit()
        
        logger.info(f"Created MVP module {module_name} in workspace {workspace_id}")
        return module
        
    except Exception as e:
        logger.error(f"Failed to create MVP module: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create module: {str(e)}"
        )


@router.get("/workspaces/{workspace_id}/modules/{module_id}", response_model=MVPModule)
async def get_mvp_module(
    workspace_id: uuid.UUID,
    module_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("read")),
    db: AsyncSession = Depends(get_db)
):
    """MVP 모듈 상세 정보 조회"""
    module = await mvp_module_crud.get(db=db, id=module_id)
    
    if not module or module.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found"
        )
    
    return module


@router.put("/workspaces/{workspace_id}/modules/{module_id}", response_model=MVPModule)
async def update_mvp_module(
    workspace_id: uuid.UUID,
    module_id: uuid.UUID,
    module_update: MVPModuleUpdate,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """MVP 모듈 정보 수정"""
    module = await mvp_module_crud.get(db=db, id=module_id)
    
    if not module or module.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found"
        )
    
    updated_module = await mvp_module_crud.update(
        db=db,
        module_id=module_id,
        obj_in=module_update,
        updater_id=current_user.get("user_id", current_user.get("id"))
    )
    
    return updated_module


@router.delete("/workspaces/{workspace_id}/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mvp_module(
    workspace_id: uuid.UUID,
    module_id: uuid.UUID,
    delete_files: bool = Query(False, description="파일도 함께 삭제"),
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """MVP 모듈 삭제"""
    module = await mvp_module_crud.get(db=db, id=module_id)
    
    if not module or module.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found"
        )
    
    # 파일 삭제 옵션
    if delete_files:
        try:
            workspace_manager.delete_module(str(workspace_id), module.module_name)
        except Exception as e:
            logger.error(f"Failed to delete module files: {e}")
    
    # DB에서 삭제
    await mvp_module_crud.delete(db=db, id=module_id)
    
    logger.info(f"Deleted MVP module {module.module_name} from workspace {workspace_id}")


@router.post("/workspaces/{workspace_id}/modules/{module_id}/activate", response_model=MVPModule)
async def activate_module(
    workspace_id: uuid.UUID,
    module_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """MVP 모듈 활성화"""
    module = await mvp_module_crud.get(db=db, id=module_id)
    
    if not module or module.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found"
        )
    
    update_data = MVPModuleUpdate(is_active=True)
    updated_module = await mvp_module_crud.update(
        db=db,
        module_id=module_id,
        obj_in=update_data,
        updater_id=current_user.get("user_id", current_user.get("id"))
    )
    
    return updated_module


@router.post("/workspaces/{workspace_id}/modules/{module_id}/deactivate", response_model=MVPModule)
async def deactivate_module(
    workspace_id: uuid.UUID,
    module_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """MVP 모듈 비활성화"""
    module = await mvp_module_crud.get(db=db, id=module_id)
    
    if not module or module.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found"
        )
    
    update_data = MVPModuleUpdate(is_active=False)
    updated_module = await mvp_module_crud.update(
        db=db,
        module_id=module_id,
        obj_in=update_data,
        updater_id=current_user.get("user_id", current_user.get("id"))
    )
    
    return updated_module


@router.get("/workspaces/{workspace_id}/modules/{module_id}/config")
async def get_module_config(
    workspace_id: uuid.UUID,
    module_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(require_workspace_permission("read")),
    db: AsyncSession = Depends(get_db)
):
    """MVP 모듈 설정 조회"""
    module = await mvp_module_crud.get(db=db, id=module_id)
    
    if not module or module.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found"
        )
    
    # 파일 시스템에서 설정 읽기
    file_config = workspace_manager.get_module_config(str(workspace_id), module.module_name)
    
    return {
        "db_config": module.config,
        "file_config": file_config,
        "permissions": module.permissions
    }


@router.put("/workspaces/{workspace_id}/modules/{module_id}/config")
async def update_module_config(
    workspace_id: uuid.UUID,
    module_id: uuid.UUID,
    config: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(require_workspace_permission("admin")),
    db: AsyncSession = Depends(get_db)
):
    """MVP 모듈 설정 업데이트"""
    module = await mvp_module_crud.get(db=db, id=module_id)
    
    if not module or module.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found"
        )
    
    # DB 설정 업데이트
    update_data = MVPModuleUpdate(config=config)
    await mvp_module_crud.update(
        db=db,
        module_id=module_id,
        obj_in=update_data,
        updater_id=current_user.get("user_id", current_user.get("id"))
    )
    
    return {"status": "success", "message": "Configuration updated"}


@router.get("/templates")
async def list_available_templates(
    current_user: Dict[str, Any] = Depends(get_current_active_user)
):
    """사용 가능한 MVP 모듈 템플릿 목록"""
    return {
        "templates": [
            {
                "name": "dashboard",
                "display_name": "Dashboard",
                "description": "Dashboard template with stats and charts",
                "icon": "layout-dashboard"
            },
            {
                "name": "analytics",
                "display_name": "Analytics",
                "description": "Analytics template with metrics and trends",
                "icon": "chart-line"
            },
            {
                "name": "report",
                "display_name": "Report",
                "description": "Report generation and management template",
                "icon": "file-text"
            },
            {
                "name": "custom",
                "display_name": "Custom",
                "description": "Blank template for custom functionality",
                "icon": "code"
            }
        ]
    }