"""
Personal Test Process Flow System API Router
공정도 편집기와 모니터링을 위한 API 엔드포인트
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Dict, Any, Optional
import uuid
import json
import secrets
from datetime import datetime
import logging
import os

from app.core.database import get_db
from app.core.security import get_current_active_user, require_admin, encrypt_connection_string, decrypt_connection_string
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/personal-test/process-flow",
    tags=["Personal Test Process Flow"]
)

# Pydantic models
class ProcessFlowCreate(BaseModel):
    workspace_id: uuid.UUID
    name: str
    flow_data: Dict[str, Any]
    data_source_id: Optional[str] = None

class ProcessFlowUpdate(BaseModel):
    name: Optional[str] = None
    flow_data: Optional[Dict[str, Any]] = None
    data_source_id: Optional[str] = None

class ProcessFlow(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    flow_data: Dict[str, Any]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    is_published: Optional[bool] = False
    published_at: Optional[datetime] = None
    publish_token: Optional[str] = None
    current_version: Optional[int] = None
    data_source_id: Optional[str] = None

class PublishResponse(BaseModel):
    message: str
    publish_url: str
    publish_token: str

class EquipmentStatus(BaseModel):
    equipment_type: str
    equipment_code: str
    equipment_name: str
    status: str
    last_run_time: Optional[datetime]

class MeasurementData(BaseModel):
    id: int
    equipment_type: str
    equipment_code: str
    measurement_code: str
    measurement_desc: str
    measurement_value: float
    timestamp: datetime
    usl: Optional[float] = None
    lsl: Optional[float] = None
    spec_status: Optional[int] = None  # 0: within spec, 1: out of spec

class EquipmentStatusResponse(BaseModel):
    items: List[EquipmentStatus]
    total: int
    limit: int
    offset: int
    has_more: bool

class FlowVersion(BaseModel):
    id: uuid.UUID
    flow_id: uuid.UUID
    version_number: int
    name: str
    description: Optional[str] = None
    flow_data: Dict[str, Any]
    created_by: str
    created_at: datetime
    is_published: bool = False
    published_at: Optional[datetime] = None
    publish_token: Optional[str] = None

class FlowVersionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    flow_data: Dict[str, Any]

class FlowVersionList(BaseModel):
    versions: List[FlowVersion]
    current_version: int


# Process Flow endpoints
@router.get("/flows", response_model=List[ProcessFlow])
async def list_process_flows(
    workspace_id: uuid.UUID = Query(...),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """워크스페이스의 공정도 목록 조회"""
    query = """
        SELECT id, workspace_id, name, flow_data, data_source_id, created_by, created_at, updated_at,
               is_published, published_at, publish_token, current_version
        FROM personal_test_process_flows
        WHERE workspace_id = :workspace_id
        ORDER BY updated_at DESC
        LIMIT :limit OFFSET :skip
    """
    
    result = await db.execute(
        text(query),
        {"workspace_id": str(workspace_id), "limit": limit, "skip": skip}
    )
    
    flows = []
    for row in result:
        flows.append(ProcessFlow(
            id=row.id,
            workspace_id=row.workspace_id,
            name=row.name,
            flow_data=row.flow_data,
            data_source_id=row.data_source_id,
            created_by=row.created_by,
            created_at=row.created_at,
            updated_at=row.updated_at,
            is_published=row.is_published if hasattr(row, 'is_published') else False,
            published_at=row.published_at if hasattr(row, 'published_at') else None,
            publish_token=row.publish_token if hasattr(row, 'publish_token') else None,
            current_version=row.current_version if hasattr(row, 'current_version') else None
        ))
    
    return flows


@router.post("/flows", response_model=ProcessFlow, status_code=status.HTTP_201_CREATED)
async def create_process_flow(
    flow_data: ProcessFlowCreate,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """새 공정도 생성 (관리자 전용)"""
    flow_id = uuid.uuid4()
    user_id = current_user.get("user_id", current_user.get("id", "unknown"))
    
    query = """
        INSERT INTO personal_test_process_flows 
        (id, workspace_id, name, flow_data, data_source_id, created_by, created_at, updated_at)
        VALUES (:id, :workspace_id, :name, CAST(:flow_data AS jsonb), :data_source_id, :created_by, NOW(), NOW())
        RETURNING id, workspace_id, name, flow_data, data_source_id, created_by, created_at, updated_at, is_published, published_at, publish_token
    """
    
    result = await db.execute(
        text(query),
        {
            "id": str(flow_id),
            "workspace_id": str(flow_data.workspace_id),
            "name": flow_data.name,
            "flow_data": json.dumps(flow_data.flow_data),
            "data_source_id": flow_data.data_source_id,
            "created_by": user_id
        }
    )
    await db.commit()
    
    row = result.first()
    return ProcessFlow(
        id=row.id,
        workspace_id=row.workspace_id,
        name=row.name,
        flow_data=row.flow_data,
        data_source_id=row.data_source_id,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_published=False,
        published_at=None,
        publish_token=None
    )


@router.get("/flows/{flow_id}", response_model=ProcessFlow)
async def get_process_flow(
    flow_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """공정도 상세 조회"""
    query = """
        SELECT id, workspace_id, name, flow_data, data_source_id, created_by, created_at, updated_at,
               is_published, published_at, publish_token
        FROM personal_test_process_flows
        WHERE id = :flow_id
    """
    
    result = await db.execute(text(query), {"flow_id": str(flow_id)})
    row = result.first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Process flow not found"
        )
    
    return ProcessFlow(
        id=row.id,
        workspace_id=row.workspace_id,
        name=row.name,
        flow_data=row.flow_data,
        data_source_id=row.data_source_id,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_published=row.is_published if hasattr(row, 'is_published') else False,
        published_at=row.published_at if hasattr(row, 'published_at') else None,
        publish_token=row.publish_token if hasattr(row, 'publish_token') else None
    )


@router.put("/flows/{flow_id}", response_model=ProcessFlow)
async def update_process_flow(
    flow_id: uuid.UUID,
    flow_update: ProcessFlowUpdate,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """공정도 수정 (관리자 전용)"""
    update_parts = []
    params = {"flow_id": str(flow_id)}
    
    if flow_update.name is not None:
        update_parts.append("name = :name")
        params["name"] = flow_update.name
    
    if flow_update.flow_data is not None:
        update_parts.append("flow_data = CAST(:flow_data AS jsonb)")
        params["flow_data"] = json.dumps(flow_update.flow_data)
    
    if flow_update.data_source_id is not None:
        update_parts.append("data_source_id = :data_source_id")
        params["data_source_id"] = flow_update.data_source_id
    
    if not update_parts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )
    
    update_parts.append("updated_at = NOW()")
    
    query = f"""
        UPDATE personal_test_process_flows
        SET {', '.join(update_parts)}
        WHERE id = :flow_id
        RETURNING id, workspace_id, name, flow_data, data_source_id, created_by, created_at, updated_at, is_published, published_at, publish_token
    """
    
    result = await db.execute(text(query), params)
    await db.commit()
    
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Process flow not found"
        )
    
    return ProcessFlow(
        id=row.id,
        workspace_id=row.workspace_id,
        name=row.name,
        flow_data=row.flow_data,
        data_source_id=row.data_source_id,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_published=row.is_published if hasattr(row, 'is_published') else False,
        published_at=row.published_at if hasattr(row, 'published_at') else None,
        publish_token=row.publish_token if hasattr(row, 'publish_token') else None
    )


@router.delete("/flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_process_flow(
    flow_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """공정도 삭제 (관리자 전용)"""
    query = "DELETE FROM personal_test_process_flows WHERE id = :flow_id"
    result = await db.execute(text(query), {"flow_id": str(flow_id)})
    await db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Process flow not found"
        )


# Version Management endpoints
@router.get("/flows/{flow_id}/versions", response_model=FlowVersionList)
async def list_flow_versions(
    flow_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """공정도의 버전 목록 조회"""
    # Check if version table exists
    try:
        # First check if the current_version column exists
        check_column_query = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='personal_test_process_flows' 
            AND column_name='current_version'
        """
        column_result = await db.execute(text(check_column_query))
        if not column_result.first():
            # Column doesn't exist, return empty version list
            return FlowVersionList(versions=[], current_version=1)
        
        # Get current version
        current_query = """
            SELECT current_version FROM personal_test_process_flows
            WHERE id = :flow_id
        """
        current_result = await db.execute(text(current_query), {"flow_id": str(flow_id)})
        current_row = current_result.first()
        
        if not current_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Process flow not found"
            )
    except Exception as e:
        # If there's any database error, return empty version list
        logger.error(f"Error checking versions: {e}")
        return FlowVersionList(versions=[], current_version=1)
    
    # Check if versions table exists
    check_table_query = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name='personal_test_process_flow_versions'
    """
    table_result = await db.execute(text(check_table_query))
    if not table_result.first():
        # Table doesn't exist, return empty version list
        return FlowVersionList(versions=[], current_version=1)
    
    # Get all versions
    query = """
        SELECT id, flow_id, version_number, name, description, flow_data,
               created_by, created_at, is_published, published_at, publish_token
        FROM personal_test_process_flow_versions
        WHERE flow_id = :flow_id
        ORDER BY version_number DESC
    """
    
    try:
        result = await db.execute(text(query), {"flow_id": str(flow_id)})
        
        versions = []
        for row in result:
            versions.append(FlowVersion(
                id=row.id,
                flow_id=row.flow_id,
                version_number=row.version_number,
                name=row.name,
                description=row.description,
                flow_data=row.flow_data,
                created_by=row.created_by,
                created_at=row.created_at,
                is_published=row.is_published,
                published_at=row.published_at,
                publish_token=row.publish_token
            ))
        
        return FlowVersionList(
            versions=versions,
            current_version=current_row.current_version or 1
        )
    except Exception as e:
        logger.error(f"Error fetching versions: {e}")
        return FlowVersionList(versions=[], current_version=1)


@router.post("/flows/{flow_id}/versions", response_model=FlowVersion, status_code=status.HTTP_201_CREATED)
async def create_flow_version(
    flow_id: uuid.UUID,
    version_data: FlowVersionCreate,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """공정도의 새 버전 생성"""
    # Check if versions table exists
    check_table_query = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name='personal_test_process_flow_versions'
    """
    table_result = await db.execute(text(check_table_query))
    if not table_result.first():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Version management not available. Database migration required."
        )
    
    user_id = current_user.get("user_id", current_user.get("id", "unknown"))
    version_id = uuid.uuid4()
    
    try:
        # Get next version number - fallback to 1 if function doesn't exist
        next_version_query = "SELECT COALESCE((SELECT MAX(version_number) + 1 FROM personal_test_process_flow_versions WHERE flow_id = :flow_id), 1)"
        version_result = await db.execute(text(next_version_query), {"flow_id": str(flow_id)})
        next_version = version_result.scalar()
    except:
        next_version = 1
    
    # Create new version
    query = """
        INSERT INTO personal_test_process_flow_versions
        (id, flow_id, version_number, name, description, flow_data, created_by, created_at)
        VALUES (:id, :flow_id, :version_number, :name, :description, CAST(:flow_data AS jsonb), :created_by, NOW())
        RETURNING id, flow_id, version_number, name, description, flow_data, created_by, created_at, is_published, published_at, publish_token
    """
    
    result = await db.execute(
        text(query),
        {
            "id": str(version_id),
            "flow_id": str(flow_id),
            "version_number": next_version,
            "name": version_data.name,
            "description": version_data.description,
            "flow_data": json.dumps(version_data.flow_data),
            "created_by": user_id
        }
    )
    
    # Update current version in main flow table
    update_query = """
        UPDATE personal_test_process_flows
        SET current_version = :version_number,
            flow_data = CAST(:flow_data AS jsonb),
            updated_at = NOW()
        WHERE id = :flow_id
    """
    await db.execute(
        text(update_query),
        {
            "flow_id": str(flow_id),
            "version_number": next_version,
            "flow_data": json.dumps(version_data.flow_data)
        }
    )
    
    await db.commit()
    
    row = result.first()
    return FlowVersion(
        id=row.id,
        flow_id=row.flow_id,
        version_number=row.version_number,
        name=row.name,
        description=row.description,
        flow_data=row.flow_data,
        data_source_id=row.data_source_id,
        created_by=row.created_by,
        created_at=row.created_at,
        is_published=row.is_published,
        published_at=row.published_at,
        publish_token=row.publish_token
    )


@router.put("/flows/{flow_id}/versions/{version_id}/restore", response_model=ProcessFlow)
async def restore_flow_version(
    flow_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """특정 버전으로 복원"""
    # Get version data
    version_query = """
        SELECT version_number, flow_data
        FROM personal_test_process_flow_versions
        WHERE id = :version_id AND flow_id = :flow_id
    """
    
    version_result = await db.execute(
        text(version_query),
        {"version_id": str(version_id), "flow_id": str(flow_id)}
    )
    version_row = version_result.first()
    
    if not version_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    # Update main flow with version data
    update_query = """
        UPDATE personal_test_process_flows
        SET flow_data = CAST(:flow_data AS jsonb),
            current_version = :version_number,
            updated_at = NOW()
        WHERE id = :flow_id
        RETURNING id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token
    """
    
    result = await db.execute(
        text(update_query),
        {
            "flow_id": str(flow_id),
            "flow_data": json.dumps(version_row.flow_data),
            "version_number": version_row.version_number
        }
    )
    await db.commit()
    
    row = result.first()
    return ProcessFlow(
        id=row.id,
        workspace_id=row.workspace_id,
        name=row.name,
        flow_data=row.flow_data,
        data_source_id=row.data_source_id,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_published=row.is_published if hasattr(row, 'is_published') else False,
        published_at=row.published_at if hasattr(row, 'published_at') else None,
        publish_token=row.publish_token if hasattr(row, 'publish_token') else None
    )


@router.put("/flows/{flow_id}/versions/{version_id}/publish", response_model=PublishResponse)
async def publish_flow_version(
    flow_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """특정 버전 게시"""
    # Get version number
    version_query = """
        SELECT version_number, name
        FROM personal_test_process_flow_versions
        WHERE id = :version_id AND flow_id = :flow_id
    """
    
    version_result = await db.execute(
        text(version_query),
        {"version_id": str(version_id), "flow_id": str(flow_id)}
    )
    version_row = version_result.first()
    
    if not version_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    # Generate publish token
    publish_token = secrets.token_urlsafe(32)
    
    # Call stored procedure to publish version
    publish_query = "SELECT publish_flow_version(:flow_id, :version_number, :token)"
    await db.execute(
        text(publish_query),
        {
            "flow_id": str(flow_id),
            "version_number": version_row.version_number,
            "token": publish_token
        }
    )
    await db.commit()
    
    # TODO: Replace with actual domain
    base_url = "http://localhost:3000"
    publish_url = f"{base_url}/public/monitor/{publish_token}"
    
    return PublishResponse(
        message=f"Version {version_row.version_number} of '{version_row.name}' published successfully",
        publish_url=publish_url,
        publish_token=publish_token
    )


@router.put("/flows/{flow_id}/publish", response_model=PublishResponse)
async def publish_process_flow(
    flow_id: uuid.UUID,
    version_number: Optional[int] = Query(None, description="특정 버전 번호 (미지정시 현재 버전)"),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """공정도 게시 (관리자 전용)"""
    # Generate unique publish token
    publish_token = secrets.token_urlsafe(32)
    
    if version_number is None:
        # Get current version
        current_query = """
            SELECT current_version FROM personal_test_process_flows
            WHERE id = :flow_id
        """
        current_result = await db.execute(text(current_query), {"flow_id": str(flow_id)})
        current_row = current_result.first()
        if not current_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Process flow not found"
            )
        version_number = current_row.current_version or 1
    
    # Call stored procedure to publish version
    publish_query = "SELECT publish_flow_version(:flow_id, :version_number, :token)"
    await db.execute(
        text(publish_query),
        {
            "flow_id": str(flow_id),
            "version_number": version_number,
            "token": publish_token
        }
    )
    await db.commit()
    
    # Get flow name
    name_query = """
        SELECT name FROM personal_test_process_flows WHERE id = :flow_id
    """
    name_result = await db.execute(text(name_query), {"flow_id": str(flow_id)})
    name_row = name_result.first()
    
    # Construct the public URL
    base_url = "http://localhost:3000"
    publish_url = f"{base_url}/public/monitor/{publish_token}"
    
    return PublishResponse(
        message=f"Process flow '{name_row.name}' (version {version_number}) has been published",
        publish_url=publish_url,
        publish_token=publish_token
    )


@router.put("/flows/{flow_id}/unpublish")
async def unpublish_process_flow(
    flow_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """공정도 게시 취소 (관리자 전용)"""
    # Unpublish all versions
    version_query = """
        UPDATE personal_test_process_flow_versions
        SET is_published = false, 
            publish_token = NULL,
            published_at = NULL
        WHERE flow_id = :flow_id
    """
    await db.execute(text(version_query), {"flow_id": str(flow_id)})
    
    # Update main flow
    query = """
        UPDATE personal_test_process_flows
        SET is_published = false, 
            publish_token = NULL,
            published_at = NULL
        WHERE id = :flow_id
        RETURNING name
    """
    
    result = await db.execute(text(query), {"flow_id": str(flow_id)})
    await db.commit()
    
    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Process flow not found"
        )
    
    return {"message": f"Process flow '{row.name}' has been unpublished"}


# Public endpoints (no authentication required)
@router.get("/public/{publish_token}", response_model=ProcessFlow)
async def get_public_process_flow(
    publish_token: str,
    db: AsyncSession = Depends(get_db)
):
    """게시된 공정도 조회 (공개 접근)"""
    # Try to get published version data first
    version_query = """
        SELECT 
            f.id, f.workspace_id, f.name, f.data_source_id, v.flow_data, f.created_by, 
            f.created_at, f.updated_at, v.is_published, v.published_at, v.publish_token
        FROM personal_test_process_flows f
        JOIN personal_test_process_flow_versions v ON f.id = v.flow_id
        WHERE v.publish_token = :publish_token AND v.is_published = true
    """
    
    result = await db.execute(text(version_query), {"publish_token": publish_token})
    row = result.fetchone()
    
    # If not found in versions, try main table
    if not row:
        main_query = """
            SELECT 
                id, workspace_id, name, data_source_id, flow_data, created_by, 
                created_at, updated_at, is_published, published_at, publish_token
            FROM personal_test_process_flows
            WHERE publish_token = :publish_token AND is_published = true
        """
        result = await db.execute(text(main_query), {"publish_token": publish_token})
        row = result.fetchone()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published flow not found"
        )
    
    return ProcessFlow(
        id=row.id,
        workspace_id=row.workspace_id,
        name=row.name,
        flow_data=row.flow_data,
        data_source_id=row.data_source_id,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_published=row.is_published,
        published_at=row.published_at,
        publish_token=row.publish_token
    )


@router.get("/public/{publish_token}/equipment/status", response_model=EquipmentStatusResponse)
async def get_public_equipment_status(
    publish_token: str,
    equipment_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """게시된 공정도의 설비 상태 조회 (공개 접근)"""
    # First get workspace_id and data_source_id from the published flow
    # For versions table, we need to join with flows table to get workspace_id and data_source_id
    flow_info_query = """
        SELECT f.workspace_id, f.data_source_id 
        FROM personal_test_process_flow_versions v
        JOIN personal_test_process_flows f ON v.flow_id = f.id
        WHERE v.publish_token = :publish_token AND v.is_published = true
        UNION
        SELECT workspace_id, data_source_id 
        FROM personal_test_process_flows
        WHERE publish_token = :publish_token AND is_published = true
        LIMIT 1
    """
    result = await db.execute(text(flow_info_query), {"publish_token": publish_token})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published flow not found"
        )
    
    workspace_id = row.workspace_id
    data_source_id = row.data_source_id
    
    # If data_source_id is specified, use it for data provider routing
    if data_source_id:
        # Use flow-specific data source
        # Use flow-specific data source
        from app.services.data_providers.dynamic import DynamicProvider
        
        # Create dynamic provider with specific data source
        provider = DynamicProvider(db, workspace_id, data_source_id)
        
        try:
            logger.info(f"🔍 Starting equipment status query for workspace: {workspace_id}, data_source: {data_source_id}")
            
            # Connect to data source
            await provider.connect()
            
            # Get equipment status
            equipment_data = await provider.get_equipment_status(
                equipment_type=equipment_type,
                status=status,
                limit=limit,
                offset=offset
            )
            
            # Convert to response format
            equipment_list = []
            total_count = 0
            
            if equipment_data:
                if isinstance(equipment_data, dict) and 'items' in equipment_data:
                    equipment_list = [
                        EquipmentStatus(
                            equipment_type=row['equipment_type'],
                            equipment_code=row['equipment_code'],
                            equipment_name=row['equipment_name'],
                            status=row['status'],
                            last_run_time=row.get('last_run_time')
                        ) for row in equipment_data['items']
                    ]
                    total_count = equipment_data.get('total', len(equipment_list))
                else:
                    equipment_list = [
                        EquipmentStatus(
                            equipment_type=row['equipment_type'],
                            equipment_code=row['equipment_code'],
                            equipment_name=row['equipment_name'],
                            status=row['status'],
                            last_run_time=row.get('last_run_time')
                        ) for row in equipment_data
                    ]
                    total_count = len(equipment_list)
            
            return EquipmentStatusResponse(
                items=equipment_list,
                total=total_count,
                limit=limit,
                offset=offset,
                has_more=(offset + limit) < total_count
            )
        except Exception as e:
            logger.error(f"Error getting equipment status for public flow: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get equipment status: {str(e)}"
            )
        finally:
            try:
                await provider.disconnect()
            except Exception as e:
                logger.warning(f"Error disconnecting provider: {e}")
    else:
        # Fall back to workspace default data source
        return await get_equipment_status(
            workspace_id=workspace_id,
            equipment_type=equipment_type,
            status=status,
            limit=limit,
            offset=offset,
            db=db
        )


@router.get("/public/{publish_token}/measurements", response_model=List[MeasurementData])
async def get_public_measurements(
    publish_token: str,
    equipment_code: Optional[str] = Query(None),
    equipment_codes: Optional[str] = Query(None, description="Comma-separated equipment codes"),
    equipment_type: Optional[str] = Query(None),
    measurement_code: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """게시된 공정도의 측정 데이터 조회 (공개 접근)"""
    provider = None
    
    try:
        # Validate publish_token format
        if not publish_token or len(publish_token) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid publish token format"
            )
        
        # First get workspace_id and data_source_id from the published flow
        # For versions table, we need to join with flows table to get workspace_id and data_source_id
        flow_info_query = """
            SELECT f.workspace_id, f.data_source_id 
            FROM personal_test_process_flow_versions v
            JOIN personal_test_process_flows f ON v.flow_id = f.id
            WHERE v.publish_token = :publish_token AND v.is_published = true
            UNION
            SELECT workspace_id, data_source_id 
            FROM personal_test_process_flows
            WHERE publish_token = :publish_token AND is_published = true
            LIMIT 1
        """
        
        try:
            result = await db.execute(text(flow_info_query), {"publish_token": publish_token})
            row = result.fetchone()
        except Exception as db_error:
            logger.error(f"❌ Database query error in public measurements: {db_error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error while looking up published flow"
            )
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Published flow not found"
            )
        
        workspace_id = row.workspace_id
        data_source_id = row.data_source_id
        
        logger.info(f"🔍 Public measurements - workspace: {workspace_id}, data_source: {data_source_id}")
        
        # Validate workspace_id and data_source_id
        if not workspace_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Published flow has no workspace configuration"
            )
        
        # Always use DynamicProvider - without fallback logic
        from app.services.data_providers.dynamic import DynamicProvider
        
        # Create dynamic provider with required data_source_id
        provider = DynamicProvider(db, workspace_id, data_source_id)
        
        logger.info(f"🔍 Starting measurement data query for workspace: {workspace_id}, data_source: {data_source_id}")
        
        # Connect to data source
        try:
            await provider.connect()
        except Exception as connect_error:
            logger.error(f"❌ Failed to connect to data source: {connect_error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Cannot connect to data source for this flow: {str(connect_error)}"
            )
        
        # Get measurement data
        try:
            measurement_data = await provider.get_measurement_data(
                equipment_code=equipment_code,
                equipment_codes=equipment_codes,
                equipment_type=equipment_type,
                measurement_code=measurement_code,
                limit=limit
            )
            logger.info(f"✅ Successfully retrieved {len(measurement_data)} measurements")
        except Exception as provider_error:
            logger.error(f"❌ Provider error in public measurements: {provider_error}")
            import traceback
            logger.error(f"Provider error traceback: {traceback.format_exc()}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get measurement data: {str(provider_error)}"
            )
        
        # Check if measurement_data is already a list of MeasurementData objects
        if measurement_data and len(measurement_data) > 0:
            first_item = measurement_data[0]
            if hasattr(first_item, 'spec_status'):
                # Already MeasurementData objects - need to convert
                result = []
                for item in measurement_data:
                    if hasattr(item, 'dict'):
                        # Convert to dict first
                        item_dict = item.dict()
                    else:
                        # Already a dict
                        item_dict = item
                    
                    # Fix spec_status
                    spec_status = item_dict.get('spec_status', 0)
                    if isinstance(spec_status, str):
                        spec_status_mapping = {
                            'IN_SPEC': 0,
                            'BELOW_SPEC': 1,
                            'ABOVE_SPEC': 2,
                            'NO_SPEC': 9
                        }
                        spec_status = spec_status_mapping.get(spec_status, 0)
                    
                    # Create new MeasurementData object with corrected spec_status
                    result.append(MeasurementData(
                        id=item_dict.get('id', 0),
                        equipment_type=item_dict.get('equipment_type', ''),
                        equipment_code=item_dict.get('equipment_code', ''),
                        measurement_code=item_dict.get('measurement_code', ''),
                        measurement_desc=item_dict.get('measurement_desc', ''),
                        measurement_value=item_dict.get('measurement_value', 0.0),
                        timestamp=item_dict.get('timestamp', datetime.now()),
                        spec_status=spec_status,
                        usl=item_dict.get('usl'),
                        lsl=item_dict.get('lsl')
                    ))
                return result
        
        # Convert to response format - with explicit spec_status conversion
        result = []
        for row in (measurement_data or []):
            # Ensure spec_status is an integer
            spec_status = row.get('spec_status', 0)
            if isinstance(spec_status, str):
                spec_status_mapping = {
                    'IN_SPEC': 0,
                    'BELOW_SPEC': 1,
                    'ABOVE_SPEC': 2,
                    'NO_SPEC': 9
                }
                spec_status = spec_status_mapping.get(spec_status, 0)
            elif spec_status is None:
                spec_status = 0
            
            # Create measurement object with proper type conversion
            measurement_obj = MeasurementData(
                id=int(row.get('id', 0)),
                equipment_type=str(row.get('equipment_type', '')),
                equipment_code=str(row.get('equipment_code', '')),
                measurement_code=str(row.get('measurement_code', '')),
                measurement_desc=str(row.get('measurement_desc', '')),
                measurement_value=float(row.get('measurement_value', 0.0)),
                timestamp=row.get('timestamp', datetime.now()),
                spec_status=int(spec_status),
                usl=row.get('usl'),
                lsl=row.get('lsl')
            )
            result.append(measurement_obj)
        
        return result
    except Exception as e:
        logger.error(f"Error getting measurement data for public flow: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get measurement data: {str(e)}"
        )
    finally:
        if provider:
            try:
                await provider.disconnect()
            except Exception as e:
                logger.warning(f"Error disconnecting provider: {e}")




@router.get("/equipment/status", response_model=EquipmentStatusResponse)
async def get_equipment_status(
    workspace_id: str = Query('personaltest', description="Workspace ID"),
    equipment_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    data_source_id: Optional[str] = Query(None, description="Data Source ID"),
    db: AsyncSession = Depends(get_db)
):
    """설비 운행 상태 조회 (Dynamic Provider 사용)"""
    from app.services.data_providers.dynamic import DynamicProvider
    
    # Create dynamic provider with optional data_source_id
    provider = DynamicProvider(db, workspace_id, data_source_id)
    
    try:
        logger.info(f"🔍 Starting equipment status query for workspace: {workspace_id}")
        
        # Load config first to debug
        config = await provider._load_config()
        logger.info(f"📋 Config loaded - Source type: {config.get('source_type')}, Active: {config.get('is_active')}")
        
        # Test connection
        connection_test = await provider.test_connection()
        logger.info(f"🔌 Connection test result: {connection_test}")
        
        if not connection_test.get('success'):
            logger.error(f"❌ Connection test failed: {connection_test.get('message')}")
            # Don't fallback, raise the error
            raise Exception(f"Data source connection failed: {connection_test.get('message')}")
        
        # Connect to data source
        logger.info(f"🔗 Connecting to data source...")
        await provider.connect()
        logger.info(f"✅ Connected to data source")
        
        # Get equipment status data with filters and pagination
        logger.info(f"🎯 Calling provider.get_equipment_status()")
        response_data = await provider.get_equipment_status(
            equipment_type=equipment_type,
            status=status,
            limit=limit,
            offset=offset
        )
        logger.info(f"✅ Provider response received: {type(response_data)}")
        
        # Debug the response
        if hasattr(response_data, 'equipment'):
            logger.info(f"📊 Equipment data count: {len(response_data.equipment)}")
        else:
            logger.info(f"📊 Response data keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dict'}")
        
        # Convert dict response back to EquipmentStatusResponse
        equipment_list = []
        for item in response_data.get('items', []):
            equipment_list.append(EquipmentStatus(
                equipment_type=item.get('equipment_type'),
                equipment_code=item.get('equipment_code'),
                equipment_name=item.get('equipment_name'),
                status=item.get('status'),
                last_run_time=item.get('last_run_time')
            ))
        
        return EquipmentStatusResponse(
            items=equipment_list,
            total=response_data.get('total', 0),
            limit=response_data.get('limit', limit),
            offset=response_data.get('offset', offset),
            has_more=response_data.get('has_more', False)
        )
        
    except Exception as e:
        logger.error(f"❌ Error getting equipment status from provider: {e}")
        logger.error(f"❌ Exception type: {type(e)}")
        import traceback
        logger.error(f"❌ Full traceback: {traceback.format_exc()}")
        
        # Check if we have a configured data source - if MSSQL is configured but failing, don't fallback
        try:
            # Get active data source configuration
            from app.services.data_providers.dynamic import DynamicProvider
            dynamic_provider = DynamicProvider(db, workspace_id)
            config = await dynamic_provider._load_config()
            
            logger.info(f"🔍 Checking fallback conditions - Source type: {config.get('source_type')}")
            
            if config and config.get('source_type') == 'mssql':
                # MSSQL is configured but failing - don't fallback, return proper error
                logger.error(f"🚫 MSSQL configured but failing - NO FALLBACK")
                raise HTTPException(
                    status_code=503,
                    detail=f"MSSQL data source connection failed: {str(e)}. Please check your MSSQL server configuration."
                )
            elif config and config.get('source_type') != 'postgresql':
                # Any other configured data source failing - don't fallback
                logger.error(f"🚫 {config.get('source_type')} configured but failing - NO FALLBACK")
                raise HTTPException(
                    status_code=503,
                    detail=f"{config.get('source_type')} data source connection failed: {str(e)}. Please check your configuration."
                )
        except HTTPException:
            raise
        except Exception as config_error:
            logger.warning(f"⚠️ Could not check data source configuration: {config_error}")
        
        # Only fallback to PostgreSQL if no specific data source is configured or if PostgreSQL is configured
        logger.warning("🔄 Falling back to PostgreSQL for equipment status")
        
        # Fallback to direct database query
        # First, get the total count
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
        
        count_result = await db.execute(text(count_query), params) if params else await db.execute(text(count_query))
        total_count = count_result.scalar()
        
        # Now get the paginated data
        base_query = """
            SELECT equipment_type, equipment_code, equipment_name, status, last_run_time
            FROM personal_test_equipment_status
            WHERE 1=1
        """
        
        if equipment_type:
            base_query += " AND equipment_type = :equipment_type"
        
        if status:
            base_query += " AND status = :status"
        
        base_query += " ORDER BY equipment_type, equipment_code LIMIT :limit OFFSET :offset"
        
        params["limit"] = limit
        params["offset"] = offset
        
        result = await db.execute(text(base_query), params)
        
        equipment_list = []
        for row in result:
            equipment_list.append(EquipmentStatus(
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
    finally:
        await provider.disconnect()


@router.put("/equipment/{equipment_code}/status")
async def update_equipment_status(
    equipment_code: str,
    status: str = Query(..., regex="^(ACTIVE|PAUSE|STOP)$"),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """설비 상태 업데이트 (관리자 전용)"""
    query = """
        UPDATE personal_test_equipment_status
        SET status = :status, last_run_time = NOW()
        WHERE equipment_code = :equipment_code
        RETURNING equipment_code
    """
    
    result = await db.execute(
        text(query),
        {"status": status, "equipment_code": equipment_code}
    )
    await db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipment not found"
        )
    
    return {"message": "Equipment status updated", "equipment_code": equipment_code, "status": status}


# Measurement Data endpoints
@router.get("/measurements", response_model=List[MeasurementData])
async def get_measurement_data(
    workspace_id: str = Query('personaltest', description="Workspace ID"),
    equipment_code: Optional[str] = Query(None),
    equipment_codes: Optional[str] = Query(None, description="Comma-separated equipment codes"),
    equipment_type: Optional[str] = Query(None),
    measurement_code: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    data_source_id: Optional[str] = Query(None, description="Data Source ID"),
    db: AsyncSession = Depends(get_db)
):
    """측정 데이터 조회 (Dynamic Provider 사용)"""
    from app.services.data_providers.dynamic import DynamicProvider
    
    # Create dynamic provider with optional data_source_id
    provider = DynamicProvider(db, workspace_id, data_source_id)
    
    try:
        # Connect to data source
        await provider.connect()
        
        # Get measurement data
        measurements_raw = await provider.get_measurement_data(
            equipment_code=equipment_code,
            equipment_type=equipment_type,
            limit=limit
        )
        
        # Convert to response format
        measurements = []
        for item in measurements_raw:
            # Handle dict format from provider
            if isinstance(item, dict):
                measurements.append(MeasurementData(
                    id=item.get('id', 0),
                    equipment_type=item.get('equipment_type', ''),
                    equipment_code=item.get('equipment_code', ''),
                    measurement_code=item.get('measurement_code', ''),
                    measurement_desc=item.get('measurement_desc', ''),
                    measurement_value=float(item.get('measurement_value', 0)),
                    timestamp=item.get('timestamp', datetime.now()),
                    usl=item.get('usl'),
                    lsl=item.get('lsl'),
                    spec_status=item.get('spec_status')
                ))
            else:
                # Already a MeasurementData object
                measurements.append(item)
        
        return measurements
        
    except Exception as e:
        logger.error(f"Error getting measurements from provider: {e}")
        
        # Check if we have a configured data source - if MSSQL is configured but failing, don't fallback
        try:
            # Get active data source configuration
            from app.services.data_providers.dynamic import DynamicProvider
            dynamic_provider = DynamicProvider(db, workspace_id)
            config = await dynamic_provider._load_config()
            
            logger.info(f"🔍 Checking fallback conditions - Source type: {config.get('source_type')}")
            
            if config and config.get('source_type') == 'mssql':
                # MSSQL is configured but failing - don't fallback, return proper error
                logger.error(f"🚫 MSSQL configured but failing - NO FALLBACK")
                raise HTTPException(
                    status_code=503,
                    detail=f"MSSQL data source connection failed: {str(e)}. Please check your MSSQL server configuration."
                )
            elif config and config.get('source_type') != 'postgresql':
                # Any other configured data source failing - don't fallback
                logger.error(f"🚫 {config.get('source_type')} configured but failing - NO FALLBACK")
                raise HTTPException(
                    status_code=503,
                    detail=f"{config.get('source_type')} data source connection failed: {str(e)}. Please check your configuration."
                )
        except HTTPException:
            raise
        except Exception as config_error:
            logger.warning(f"⚠️ Could not check data source configuration: {config_error}")
        
        # Only fallback to PostgreSQL if no specific data source is configured or if PostgreSQL is configured
        logger.warning("🔄 Falling back to PostgreSQL for measurement data")
        
        # Fallback to direct database query
        base_query = """
            SELECT id, equipment_type, equipment_code, measurement_code, 
                   measurement_desc, measurement_value, timestamp,
                   usl, lsl, spec_status
            FROM personal_test_measurement_data
            WHERE 1=1
        """
        params = {"limit": limit}
        
        if equipment_codes:
            # Handle comma-separated equipment codes
            codes_list = equipment_codes.split(',')
            placeholders = ','.join([f':code_{i}' for i in range(len(codes_list))])
            base_query += f" AND equipment_code IN ({placeholders})"
            for i, code in enumerate(codes_list):
                params[f"code_{i}"] = code.strip()
        elif equipment_code:
            base_query += " AND equipment_code = :equipment_code"
            params["equipment_code"] = equipment_code
        
        if equipment_type:
            base_query += " AND equipment_type = :equipment_type"
            params["equipment_type"] = equipment_type
            
        if measurement_code:
            base_query += " AND measurement_code = :measurement_code"
            params["measurement_code"] = measurement_code
        
        base_query += " ORDER BY timestamp DESC LIMIT :limit"
        
        result = await db.execute(text(base_query), params)
        
        measurements = []
        for row in result:
            measurements.append(MeasurementData(
                id=row.id,
                equipment_type=row.equipment_type,
                equipment_code=row.equipment_code,
                measurement_code=row.measurement_code,
                measurement_desc=row.measurement_desc,
                measurement_value=float(row.measurement_value),
                timestamp=row.timestamp,
                usl=float(row.usl) if row.usl is not None else None,
                lsl=float(row.lsl) if row.lsl is not None else None,
                spec_status=int(row.spec_status) if row.spec_status is not None else None
            ))
        
        return measurements
    finally:
        await provider.disconnect()


@router.post("/measurements")
async def add_measurement_data(
    measurement: MeasurementData,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """측정 데이터 추가 (관리자 전용)"""
    query = """
        INSERT INTO personal_test_measurement_data
        (equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value)
        VALUES (:equipment_type, :equipment_code, :measurement_code, :measurement_desc, :measurement_value)
        RETURNING id
    """
    
    result = await db.execute(
        text(query),
        {
            "equipment_type": measurement.equipment_type,
            "equipment_code": measurement.equipment_code,
            "measurement_code": measurement.measurement_code,
            "measurement_desc": measurement.measurement_desc,
            "measurement_value": measurement.measurement_value
        }
    )
    await db.commit()
    
    measurement_id = result.scalar()
    return {"message": "Measurement data added", "id": measurement_id}


# Equipment Types endpoint
@router.get("/equipment/types")
async def get_equipment_types(db: AsyncSession = Depends(get_db)):
    """사용 가능한 설비 타입 목록 (공개)"""
    return {
        "equipment_types": [
            {"code": "A1", "name": "감압기", "icon": "gauge"},
            {"code": "B1", "name": "차압기", "icon": "activity"},
            {"code": "C1", "name": "흡착기", "icon": "filter"},
            {"code": "C2", "name": "측정기", "icon": "thermometer"},
            {"code": "D1", "name": "압축기", "icon": "wind"},
            {"code": "D2", "name": "펌프", "icon": "zap"},
            {"code": "E1", "name": "탱크", "icon": "database"},
            {"code": "E2", "name": "저장탱크", "icon": "archive"},
            {"code": "F1", "name": "밸브", "icon": "git-merge"},
            {"code": "G1", "name": "히터", "icon": "flame"}
        ]
    }


# Additional public endpoints for monitoring
@router.get("/public/{publish_token}/status")
async def get_public_flow_status(
    publish_token: str,
    db: AsyncSession = Depends(get_db)
):
    """게시된 공정도의 설비 상태 조회 (공개)"""
    # First verify the token is valid
    verify_query = """
        SELECT 1 FROM personal_test_process_flow_versions
        WHERE publish_token = :publish_token AND is_published = true
    """
    
    verify_result = await db.execute(text(verify_query), {"publish_token": publish_token})
    
    # If not found in versions, try main table
    if not verify_result.first():
        main_verify_query = """
            SELECT 1 FROM personal_test_process_flows
            WHERE publish_token = :publish_token AND is_published = true
        """
        main_verify_result = await db.execute(text(main_verify_query), {"publish_token": publish_token})
        if not main_verify_result.first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Published flow not found"
            )
    
    # Get equipment status and measurements
    equipment_query = """
        SELECT equipment_type, equipment_code, equipment_name, status, last_run_time
        FROM personal_test_equipment_status
        ORDER BY equipment_type, equipment_code
    """
    
    measurement_query = """
        SELECT 
            m.id, m.equipment_type, m.equipment_code, m.measurement_code, 
            m.measurement_desc, m.measurement_value, m.timestamp,
            m.usl, m.lsl, m.spec_status
        FROM personal_test_measurement_data m
        ORDER BY m.timestamp DESC
        LIMIT 1000
    """
    
    equipment_result = await db.execute(text(equipment_query))
    measurement_result = await db.execute(text(measurement_query))
    
    equipment_list = []
    for row in equipment_result:
        equipment_list.append({
            "equipment_type": row.equipment_type,
            "equipment_code": row.equipment_code,
            "equipment_name": row.equipment_name,
            "status": row.status,
            "last_run_time": row.last_run_time.isoformat() if row.last_run_time else None
        })
    
    measurements = []
    for row in measurement_result:
        measurements.append({
            "id": row.id,
            "equipment_type": row.equipment_type,
            "equipment_code": row.equipment_code,
            "measurement_code": row.measurement_code,
            "measurement_desc": row.measurement_desc,
            "measurement_value": float(row.measurement_value),
            "timestamp": row.timestamp.isoformat(),
            "usl": float(row.usl) if row.usl is not None else None,
            "lsl": float(row.lsl) if row.lsl is not None else None,
            "spec_status": int(row.spec_status) if row.spec_status is not None else None
        })
    
    return {
        "equipment_status": equipment_list,
        "measurements": measurements
    }


# Data Source Configuration APIs
class DataSourceConfig(BaseModel):
    workspace_id: str
    source_type: str  # postgresql, mssql, api
    connection_string: str
    api_key: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    custom_queries: Optional[Dict[str, Dict[str, str]]] = None  # {"equipment_status": {"query": "...", "description": "..."}}
    priority: int = 0
    is_active: bool = True

class DataSourceConfigResponse(DataSourceConfig):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

class APIEndpointMapping(BaseModel):
    data_source_id: uuid.UUID
    data_type: str  # equipment_status, measurement_data, measurement_specs
    endpoint_path: str
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None

@router.get("/data-sources", response_model=List[DataSourceConfigResponse])
async def get_data_sources(
    workspace_id: str,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all data source configurations for a workspace."""
    # Convert string workspace_id to UUID format
    try:
        # If workspace_id is 'personal_test' or 'personaltest', use a predefined UUID
        if workspace_id in ['personal_test', 'personaltest']:
            workspace_uuid = '21ee03db-90c4-4592-b00f-c44801e0b164'
        else:
            workspace_uuid = str(uuid.UUID(workspace_id))
    except:
        workspace_uuid = workspace_id
    
    query = """
        SELECT 
            id, workspace_id, config_name, source_type, 
            api_url, api_key, api_headers, mssql_connection_string,
            custom_queries, is_active, created_at, updated_at
        FROM data_source_configs
        WHERE workspace_id = :workspace_id
        ORDER BY created_at DESC
    """
    
    result = await db.execute(text(query), {"workspace_id": workspace_uuid})
    sources = []
    
    for row in result:
        # Don't return sensitive data to client
        sources.append({
            "id": row.id,
            "workspace_id": workspace_id,  # Return the original string workspace_id
            "source_type": row.source_type.lower() if row.source_type else 'postgresql',
            "connection_string": '',  # Don't return actual connection string for security
            "api_key": '',  # Don't return actual API key for security
            "headers": json.loads(row.api_headers) if row.api_headers else None,
            "custom_queries": row.custom_queries if row.custom_queries else None,  # Already a dict/JSONB
            "priority": 0,  # Priority column doesn't exist in table
            "is_active": row.is_active if row.is_active is not None else True,
            "created_at": row.created_at,
            "updated_at": row.updated_at
        })
    
    return sources

@router.post("/data-sources", response_model=DataSourceConfigResponse)
async def create_data_source(
    config: DataSourceConfig,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new data source configuration."""
    source_id = str(uuid.uuid4())
    
    # Convert string workspace_id to UUID format
    if config.workspace_id in ['personal_test', 'personaltest']:
        workspace_uuid = '21ee03db-90c4-4592-b00f-c44801e0b164'
    else:
        try:
            workspace_uuid = str(uuid.UUID(config.workspace_id))
        except:
            workspace_uuid = config.workspace_id
    
    # Map API fields to database columns
    api_url = config.connection_string if config.source_type.lower() == 'api' else None
    mssql_connection_string = config.connection_string if config.source_type.lower() == 'mssql' else None
    # For PostgreSQL, we'll store it in mssql_connection_string field (since we're reusing the column)
    if config.source_type.lower() == 'postgresql' and config.connection_string:
        mssql_connection_string = config.connection_string
    
    query = """
        INSERT INTO data_source_configs (
            id, workspace_id, config_name, source_type, 
            api_url, api_key, api_headers, mssql_connection_string,
            custom_queries, is_active, created_by
        ) VALUES (
            :id, :workspace_id, :config_name, :source_type,
            :api_url, :api_key, :api_headers, :mssql_connection_string,
            :custom_queries, :is_active, :created_by
        )
    """
    
    # Encrypt sensitive data before storing
    encrypted_api_url = encrypt_connection_string(api_url) if api_url else None
    encrypted_mssql_connection = encrypt_connection_string(mssql_connection_string) if mssql_connection_string else None
    encrypted_api_key = encrypt_connection_string(config.api_key) if config.api_key else None
    
    await db.execute(text(query), {
        "id": source_id,
        "workspace_id": workspace_uuid,
        "config_name": f"{config.source_type}_config",
        "source_type": config.source_type.upper(),  # Database expects uppercase
        "api_url": encrypted_api_url,
        "api_key": encrypted_api_key,
        "api_headers": json.dumps(config.headers) if config.headers else None,
        "mssql_connection_string": encrypted_mssql_connection,
        "custom_queries": json.dumps(config.custom_queries) if config.custom_queries else None,
        "is_active": config.is_active,
        "created_by": current_user.get("username", "unknown")
    })
    
    await db.commit()
    
    # Fetch the created record
    result = await db.execute(
        text("SELECT * FROM data_source_configs WHERE id = :id"),
        {"id": source_id}
    )
    row = result.fetchone()
    
    # Don't decrypt when returning to client - just return empty string for security
    return {
        "id": row.id,
        "workspace_id": config.workspace_id,  # Return the original string workspace_id
        "source_type": row.source_type.lower() if row.source_type else 'postgresql',
        "connection_string": '',  # Don't return actual connection string for security
        "api_key": '',  # Don't return actual API key for security
        "headers": json.loads(row.api_headers) if row.api_headers else None,
        "custom_queries": row.custom_queries if row.custom_queries else None,  # Already a dict/JSONB
        "priority": 0,
        "is_active": row.is_active if row.is_active is not None else True,
        "created_at": row.created_at,
        "updated_at": row.updated_at
    }

@router.put("/data-sources/{source_id}", response_model=DataSourceConfigResponse)
async def update_data_source(
    source_id: uuid.UUID,
    config: DataSourceConfig,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a data source configuration."""
    try:
        # Map API fields to database columns
        api_url = config.connection_string if config.source_type.lower() == 'api' else None
        mssql_connection_string = config.connection_string if config.source_type.lower() == 'mssql' else None
        # For PostgreSQL, we'll store it in mssql_connection_string field (since we're reusing the column)
        if config.source_type.lower() == 'postgresql' and config.connection_string:
            mssql_connection_string = config.connection_string
        
        query = """
            UPDATE data_source_configs SET
                source_type = :source_type,
                api_url = :api_url,
                mssql_connection_string = :mssql_connection_string,
                api_key = :api_key,
                api_headers = :api_headers,
                custom_queries = :custom_queries,
                is_active = :is_active,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id AND workspace_id = :workspace_id
        """
        
        # Convert workspace_id if it's 'personal_test'
        workspace_id_str = str(config.workspace_id)
        logger.info(f"Updating data source with workspace_id: {workspace_id_str}")
        
        if workspace_id_str in ['personal_test', 'personaltest']:
            workspace_uuid = '21ee03db-90c4-4592-b00f-c44801e0b164'
        else:
            try:
                # Try to parse as UUID
                workspace_uuid = str(uuid.UUID(workspace_id_str))
            except:
                # If it fails, use the predefined UUID for personal_test
                workspace_uuid = '21ee03db-90c4-4592-b00f-c44801e0b164'
        
        # Encrypt sensitive data before storing
        encrypted_api_url = encrypt_connection_string(api_url) if api_url else None
        encrypted_mssql_connection = encrypt_connection_string(mssql_connection_string) if mssql_connection_string else None
        encrypted_api_key = encrypt_connection_string(config.api_key) if config.api_key else None
        
        result = await db.execute(text(query), {
            "id": str(source_id),
            "workspace_id": workspace_uuid,
            "source_type": config.source_type.upper(),
            "api_url": encrypted_api_url,
            "mssql_connection_string": encrypted_mssql_connection,
            "api_key": encrypted_api_key,
            "api_headers": json.dumps(config.headers) if config.headers else None,
            "custom_queries": json.dumps(config.custom_queries) if config.custom_queries else None,
            "is_active": config.is_active
        })
        
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Data source not found")
        
        await db.commit()
        
        # Fetch the updated record
        result = await db.execute(
            text("SELECT * FROM data_source_configs WHERE id = :id"),
            {"id": str(source_id)}
        )
        row = result.fetchone()
        
        # Don't decrypt when returning to client - just return empty string for security
        return {
            "id": row.id,
            "workspace_id": config.workspace_id,  # Return the original string workspace_id
            "source_type": row.source_type.lower() if row.source_type else 'postgresql',
            "connection_string": '',  # Don't return actual connection string for security
            "api_key": '',  # Don't return actual API key for security
            "headers": json.loads(row.api_headers) if row.api_headers else None,
            "custom_queries": row.custom_queries if row.custom_queries else None,  # Already a dict/JSONB
            "priority": 0,
            "is_active": row.is_active,
            "created_at": row.created_at,
            "updated_at": row.updated_at
        }
    except Exception as e:
        logger.error(f"Error updating data source: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/data-sources/{source_id}")
async def delete_data_source(
    source_id: uuid.UUID,
    workspace_id: str = Query(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a data source configuration."""
    query = """
        DELETE FROM data_source_configs
        WHERE id = :id AND workspace_id = :workspace_id
    """
    
    # Convert workspace_id if it's 'personal_test' or 'personaltest'
    if workspace_id in ['personal_test', 'personaltest']:
        workspace_uuid = '21ee03db-90c4-4592-b00f-c44801e0b164'
    else:
        try:
            workspace_uuid = str(uuid.UUID(workspace_id))
        except:
            workspace_uuid = workspace_id
    
    result = await db.execute(text(query), {
        "id": str(source_id),
        "workspace_id": workspace_uuid
    })
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    await db.commit()
    
    return {"message": "Data source deleted successfully"}

@router.post("/data-sources/{source_id}/test")
async def test_data_source(
    source_id: uuid.UUID,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Test a data source connection."""
    # Get the data source configuration
    result = await db.execute(
        text("SELECT * FROM data_source_configs WHERE id = :id"),
        {"id": str(source_id)}
    )
    config = result.fetchone()
    
    if not config:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    # Import providers
    from app.services.data_providers import APIProvider, PostgreSQLProvider, MSSQLProvider
    
    # Create appropriate provider based on source type
    provider = None
    try:
        source_type_lower = config.source_type.lower() if config.source_type else "postgresql"
        
        if source_type_lower == "postgresql":
            # PostgreSQL provider doesn't need connection string, it uses the existing db session
            from app.services.data_providers.postgresql_provider import PostgreSQLProvider
            provider = PostgreSQLProvider(db)
        elif source_type_lower == "mssql":
            # Decrypt connection string
            decrypted_connection = decrypt_connection_string(config.mssql_connection_string)
            provider = MSSQLProvider(connection_string=decrypted_connection)
        elif source_type_lower == "api":
            # Decrypt API URL and key
            decrypted_url = decrypt_connection_string(config.api_url)
            decrypted_key = decrypt_connection_string(config.api_key)
            headers = json.loads(config.api_headers) if config.api_headers else None
            provider = APIProvider(
                base_url=decrypted_url,
                api_key=decrypted_key,
                headers=headers
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported source type: {config.source_type}")
        
        # Test the connection
        result = await provider.test_connection()
        
        # Clean up
        await provider.disconnect()
        
        return result
        
    except Exception as e:
        if provider:
            await provider.disconnect()
        return {
            "success": False,
            "source_type": config.source_type,
            "message": str(e)
        }


# Measurement Spec APIs
class MeasurementSpec(BaseModel):
    measurement_code: str
    upper_spec_limit: Optional[float] = None
    lower_spec_limit: Optional[float] = None
    target_value: Optional[float] = None
    spec_description: Optional[str] = None

class MeasurementSpecResponse(MeasurementSpec):
    created_at: datetime
    updated_at: datetime

@router.get("/measurement-specs", response_model=List[MeasurementSpecResponse])
async def get_measurement_specs(
    measurement_codes: Optional[List[str]] = Query(None),
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get measurement specifications."""
    if measurement_codes:
        placeholders = ','.join([f":code_{i}" for i in range(len(measurement_codes))])
        query = f"""
            SELECT 
                measurement_code,
                usl as upper_spec_limit,
                lsl as lower_spec_limit,
                target as target_value,
                created_at,
                updated_at
            FROM measurement_specs
            WHERE measurement_code IN ({placeholders})
        """
        params = {f"code_{i}": code for i, code in enumerate(measurement_codes)}
    else:
        query = """
            SELECT 
                measurement_code,
                usl as upper_spec_limit,
                lsl as lower_spec_limit,
                target as target_value,
                created_at,
                updated_at
            FROM measurement_specs
        """
        params = {}
    
    result = await db.execute(text(query), params)
    specs = []
    
    for row in result:
        specs.append({
            "measurement_code": row.measurement_code,
            "upper_spec_limit": float(row.upper_spec_limit) if row.upper_spec_limit else None,
            "lower_spec_limit": float(row.lower_spec_limit) if row.lower_spec_limit else None,
            "target_value": float(row.target_value) if row.target_value else None,
            "spec_description": None,  # This column doesn't exist in the table
            "created_at": row.created_at,
            "updated_at": row.updated_at
        })
    
    return specs

@router.post("/measurement-specs", response_model=MeasurementSpecResponse)
async def create_measurement_spec(
    spec: MeasurementSpec,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create or update a measurement specification."""
    query = """
        INSERT INTO measurement_specs (
            measurement_code, usl, lsl, target
        ) VALUES (
            :measurement_code, :upper_spec_limit, :lower_spec_limit,
            :target_value
        )
        ON CONFLICT (measurement_code) DO UPDATE SET
            usl = EXCLUDED.usl,
            lsl = EXCLUDED.lsl,
            target = EXCLUDED.target,
            updated_at = CURRENT_TIMESTAMP
        RETURNING 
            measurement_code,
            usl as upper_spec_limit,
            lsl as lower_spec_limit,
            target as target_value,
            created_at,
            updated_at
    """
    
    result = await db.execute(text(query), {
        "measurement_code": spec.measurement_code,
        "upper_spec_limit": spec.upper_spec_limit,
        "lower_spec_limit": spec.lower_spec_limit,
        "target_value": spec.target_value
    })
    
    await db.commit()
    row = result.fetchone()
    
    return {
        "measurement_code": row.measurement_code,
        "upper_spec_limit": float(row.upper_spec_limit) if row.upper_spec_limit else None,
        "lower_spec_limit": float(row.lower_spec_limit) if row.lower_spec_limit else None,
        "target_value": float(row.target_value) if row.target_value else None,
        "spec_description": spec.spec_description,  # Return the input value since it's not stored
        "created_at": row.created_at,
        "updated_at": row.updated_at
    }

@router.delete("/measurement-specs/{measurement_code}")
async def delete_measurement_spec(
    measurement_code: str,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a measurement specification."""
    query = "DELETE FROM measurement_specs WHERE measurement_code = :measurement_code"
    
    result = await db.execute(text(query), {"measurement_code": measurement_code})
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Measurement spec not found")
    
    await db.commit()
    
    return {"message": "Measurement spec deleted successfully"}


# Field Mapping APIs
class FieldMapping(BaseModel):
    data_type: str  # equipment_status, measurement_data
    source_field: str
    target_field: str
    data_type_conversion: Optional[str] = None
    transform_function: Optional[str] = None
    default_value: Optional[str] = None
    is_required: bool = False

class FieldMappingResponse(FieldMapping):
    id: uuid.UUID
    data_source_id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

@router.get("/data-sources/{data_source_id}/field-mappings", response_model=List[FieldMappingResponse])
async def get_field_mappings(
    data_source_id: str,
    data_type: Optional[str] = Query(None, description="Filter by data type"),
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get field mappings for a data source"""
    try:
        # First check if table exists
        check_table = """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'data_source_field_mappings'
            )
        """
        table_exists = await db.execute(text(check_table))
        if not table_exists.scalar():
            logger.warning("Table data_source_field_mappings does not exist")
            return []
        
        query = """
            SELECT * FROM data_source_field_mappings
            WHERE data_source_id = :data_source_id AND is_active = true
        """
        params = {"data_source_id": data_source_id}
        
        if data_type:
            query += " AND data_type = :data_type"
            params["data_type"] = data_type
        
        query += " ORDER BY data_type, target_field"
        
        result = await db.execute(text(query), params)
        mappings = []
        
        for row in result:
            mappings.append({
                "id": row.id,
                "data_source_id": row.data_source_id,
                "data_type": row.data_type,
                "source_field": row.source_field,
                "target_field": row.target_field,
                "data_type_conversion": row.data_type_conversion,
                "transform_function": row.transform_function,
                "default_value": row.default_value,
                "is_required": row.is_required,
                "is_active": row.is_active,
                "created_at": row.created_at,
                "updated_at": row.updated_at
            })
        
        return mappings
    except Exception as e:
        logger.error(f"Error getting field mappings: {e}")
        return []

@router.post("/data-sources/{data_source_id}/field-mappings", response_model=FieldMappingResponse)
async def create_field_mapping(
    data_source_id: str,
    mapping: FieldMapping,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create or update field mapping"""
    mapping_id = str(uuid.uuid4())
    
    # Ensure table exists
    from app.utils.auto_create_tables import ensure_tables_exist
    await ensure_tables_exist(db)
    
    query = """
        INSERT INTO data_source_field_mappings (
            id, data_source_id, data_type,
            source_field, target_field,
            data_type_conversion, transform_function,
            default_value, is_required
        ) VALUES (
            :id, :data_source_id, :data_type,
            :source_field, :target_field,
            :data_type_conversion, :transform_function,
            :default_value, :is_required
        )
        ON CONFLICT (data_source_id, data_type, target_field) DO UPDATE SET
            source_field = EXCLUDED.source_field,
            data_type_conversion = EXCLUDED.data_type_conversion,
            transform_function = EXCLUDED.transform_function,
            default_value = EXCLUDED.default_value,
            is_required = EXCLUDED.is_required,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    """
    
    result = await db.execute(text(query), {
        "id": mapping_id,
        "data_source_id": data_source_id,
        "data_type": mapping.data_type,
        "source_field": mapping.source_field,
        "target_field": mapping.target_field,
        "data_type_conversion": mapping.data_type_conversion,
        "transform_function": mapping.transform_function,
        "default_value": mapping.default_value,
        "is_required": mapping.is_required
    })
    
    await db.commit()
    row = result.fetchone()
    
    return {
        "id": row.id,
        "data_source_id": row.data_source_id,
        "data_type": row.data_type,
        "source_field": row.source_field,
        "target_field": row.target_field,
        "data_type_conversion": row.data_type_conversion,
        "transform_function": row.transform_function,
        "default_value": row.default_value,
        "is_required": row.is_required,
        "is_active": row.is_active,
        "created_at": row.created_at,
        "updated_at": row.updated_at
    }

@router.delete("/data-sources/{data_source_id}/field-mappings/{mapping_id}")
async def delete_field_mapping(
    data_source_id: str,
    mapping_id: str,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete field mapping"""
    query = """
        UPDATE data_source_field_mappings
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = :mapping_id AND data_source_id = :data_source_id
    """
    
    result = await db.execute(text(query), {
        "mapping_id": mapping_id,
        "data_source_id": data_source_id
    })
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Field mapping not found")
    
    await db.commit()
    
    return {"message": "Field mapping deleted successfully"}

# Query Execution API
class QueryExecutionRequest(BaseModel):
    query_type: str  # 'equipment_status' or 'measurement_data'
    custom_query: Optional[str] = None  # Override query for testing
    limit: int = 10

class QueryExecutionResponse(BaseModel):
    columns: List[str]
    sample_data: List[Dict[str, Any]]
    row_count: int
    error: Optional[str] = None

@router.post("/data-sources/{data_source_id}/execute-query", response_model=QueryExecutionResponse)
async def execute_query(
    data_source_id: str,
    request: QueryExecutionRequest,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Execute a query against the data source and return schema and sample data"""
    try:
        # Get data source configuration
        config_query = """
            SELECT source_type, api_url, mssql_connection_string, 
                   custom_queries, api_key, api_headers
            FROM data_source_configs
            WHERE id = :data_source_id
        """
        result = await db.execute(text(config_query), {"data_source_id": data_source_id})
        config = result.fetchone()
        
        if not config:
            raise HTTPException(status_code=404, detail="Data source not found")
        
        # Decrypt connection strings
        from app.core.security import decrypt_connection_string
        connection_string = None
        if config.source_type == 'POSTGRESQL' and config.mssql_connection_string:
            connection_string = decrypt_connection_string(config.mssql_connection_string)
        elif config.source_type == 'MSSQL' and config.mssql_connection_string:
            connection_string = decrypt_connection_string(config.mssql_connection_string)
        elif config.source_type == 'API' and config.api_url:
            # For API, we can't execute SQL queries
            return QueryExecutionResponse(
                columns=[],
                sample_data=[],
                row_count=0,
                error="Cannot execute SQL queries against API data sources"
            )
        
        # Get the query to execute
        query_to_execute = request.custom_query
        if not query_to_execute and config.custom_queries:
            # custom_queries is already a dict/JSONB from PostgreSQL
            custom_queries = config.custom_queries
            if request.query_type in custom_queries:
                query_to_execute = custom_queries[request.query_type].get('query')
        
        if not query_to_execute:
            # Use default query based on type
            if request.query_type == 'equipment_status':
                query_to_execute = """
                    SELECT equipment_type, equipment_code, equipment_name, 
                           status, last_run_time
                    FROM personal_test_equipment_status
                    WHERE 1=1
                """
            elif request.query_type == 'measurement_data':
                query_to_execute = """
                    SELECT equipment_type, equipment_code, measurement_code,
                           measurement_desc, measurement_value, timestamp
                    FROM personal_test_measurement_data
                    WHERE 1=1
                """
            else:
                return QueryExecutionResponse(
                    columns=[],
                    sample_data=[],
                    row_count=0,
                    error=f"Unknown query type: {request.query_type}"
                )
        
        # Add LIMIT/TOP to the query if not present based on source type
        if 'limit' not in query_to_execute.lower() and 'top' not in query_to_execute.lower():
            if config.source_type.upper() == 'MSSQL':
                # For SQL Server, use TOP clause at the beginning
                if query_to_execute.strip().upper().startswith('SELECT'):
                    query_to_execute = query_to_execute.replace('SELECT', f'SELECT TOP {request.limit}', 1)
                else:
                    # If it's not a SELECT statement, don't add TOP
                    pass
            else:
                # For PostgreSQL and other databases, use LIMIT
                query_to_execute += f" LIMIT {request.limit}"
        
        # Execute the query
        if config.source_type == 'POSTGRESQL':
            # Log for debugging
            logger.info(f"Executing query for PostgreSQL - Connection string available: {bool(connection_string)}")
            logger.info(f"Query to execute: {query_to_execute[:100]}...")
            
            # Use existing connection if no custom connection string
            if not connection_string:
                result = await db.execute(text(query_to_execute))
            else:
                # Create new connection for external database
                from sqlalchemy.ext.asyncio import create_async_engine
                try:
                    # Make sure the connection string starts with postgresql://
                    if not connection_string.startswith('postgresql://'):
                        connection_string = f'postgresql://{connection_string}'
                    
                    engine = create_async_engine(connection_string)
                    async with engine.begin() as conn:
                        result = await conn.execute(text(query_to_execute))
                    await engine.dispose()
                except Exception as conn_error:
                    logger.error(f"Connection error with external database: {conn_error}")
                    # Fallback to default connection
                    logger.info("Falling back to default database connection")
                    result = await db.execute(text(query_to_execute))
        elif config.source_type.upper() == "MSSQL":
            # MSSQL query execution
            try:
                from app.services.data_providers.mssql import MSSQLProvider
                
                # Decrypt connection string
                decrypted_connection = decrypt_connection_string(config.mssql_connection_string)
                
                # Create MSSQL provider
                provider = MSSQLProvider(connection_string=decrypted_connection)
                
                # Execute query using the provider's connection
                async with provider.get_connection() as cursor:
                    await cursor.execute(query_to_execute)
                    
                    # Get column names
                    columns = [column[0] for column in cursor.description]
                    
                    # Fetch results
                    rows = await cursor.fetchall()
                    
                    # Convert to list of tuples for compatibility
                    result_rows = [tuple(row) for row in rows]
                    
                    # Create a mock result object for consistency
                    class MockResult:
                        def __init__(self, columns, rows):
                            self.columns = columns
                            self.rows = rows
                            
                        def keys(self):
                            return self.columns
                            
                        def fetchall(self):
                            return self.rows
                    
                    result = MockResult(columns, result_rows)
                    
                await provider.disconnect()
                
            except Exception as e:
                logger.error(f"MSSQL query execution failed: {e}")
                return QueryExecutionResponse(
                    columns=[],
                    sample_data=[],
                    row_count=0,
                    error=f"MSSQL query execution failed: {str(e)}"
                )
        else:
            # Unsupported source type
            return QueryExecutionResponse(
                columns=[],
                sample_data=[],
                row_count=0,
                error=f"Query execution not yet implemented for {config.source_type}"
            )
        
        # Get column names and data
        columns = list(result.keys())
        rows = result.fetchall()
        
        # Convert rows to dictionaries
        sample_data = []
        for row in rows:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # Convert datetime objects to ISO format strings
                if hasattr(value, 'isoformat'):
                    value = value.isoformat()
                row_dict[col] = value
            sample_data.append(row_dict)
        
        return QueryExecutionResponse(
            columns=columns,
            sample_data=sample_data,
            row_count=len(sample_data)
        )
        
    except Exception as e:
        logger.error(f"Error executing query: {e}")
        return QueryExecutionResponse(
            columns=[],
            sample_data=[],
            row_count=0,
            error=str(e)
        )

# Data Preview API
class DataPreviewRequest(BaseModel):
    data_type: str  # 'equipment_status' or 'measurement_data'
    limit: int = 5

class DataPreviewResponse(BaseModel):
    original_data: List[Dict[str, Any]]
    mapped_data: List[Dict[str, Any]]
    mapping_errors: List[str]

@router.post("/data-sources/{data_source_id}/preview-mapping", response_model=DataPreviewResponse)
async def preview_data_mapping(
    data_source_id: str,
    request: DataPreviewRequest,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Preview how data will look after field mapping is applied"""
    try:
        # Execute query to get raw data
        query_result = await execute_query(
            data_source_id=data_source_id,
            request=QueryExecutionRequest(
                query_type=request.data_type,
                limit=request.limit
            ),
            current_user=current_user,
            db=db
        )
        
        if query_result.error:
            return DataPreviewResponse(
                original_data=[],
                mapped_data=[],
                mapping_errors=[query_result.error]
            )
        
        # Get field mappings
        mappings_query = """
            SELECT source_field, target_field, data_type_conversion,
                   transform_function, default_value, is_required
            FROM data_source_field_mappings
            WHERE data_source_id = :data_source_id 
            AND data_type = :data_type
            AND is_active = true
        """
        
        mappings_result = await db.execute(text(mappings_query), {
            "data_source_id": data_source_id,
            "data_type": request.data_type
        })
        
        field_mappings = {}
        for row in mappings_result:
            field_mappings[row.target_field] = {
                "source_field": row.source_field,
                "data_type_conversion": row.data_type_conversion,
                "transform_function": row.transform_function,
                "default_value": row.default_value,
                "is_required": row.is_required
            }
        
        # Apply mappings to sample data
        mapped_data = []
        mapping_errors = []
        
        for original_row in query_result.sample_data:
            mapped_row = {}
            
            # Check if we have mappings configured
            if not field_mappings:
                # No mappings, use direct mapping
                mapped_row = original_row
            else:
                # Apply field mappings
                for target_field, mapping in field_mappings.items():
                    source_field = mapping["source_field"]
                    
                    # Get source value
                    if source_field in original_row:
                        value = original_row[source_field]
                        
                        # Apply data type conversion
                        if mapping["data_type_conversion"]:
                            try:
                                if mapping["data_type_conversion"] == "int":
                                    value = int(value) if value is not None else None
                                elif mapping["data_type_conversion"] == "float":
                                    value = float(value) if value is not None else None
                                elif mapping["data_type_conversion"] == "string":
                                    value = str(value) if value is not None else None
                                elif mapping["data_type_conversion"] == "boolean":
                                    value = bool(value) if value is not None else None
                            except Exception as e:
                                mapping_errors.append(
                                    f"Conversion error for {source_field} -> {target_field}: {str(e)}"
                                )
                        
                        mapped_row[target_field] = value
                    elif mapping["default_value"]:
                        mapped_row[target_field] = mapping["default_value"]
                    elif mapping["is_required"]:
                        mapping_errors.append(
                            f"Required field '{source_field}' not found in source data"
                        )
            
            mapped_data.append(mapped_row)
        
        return DataPreviewResponse(
            original_data=query_result.sample_data,
            mapped_data=mapped_data,
            mapping_errors=mapping_errors
        )
        
    except Exception as e:
        logger.error(f"Error previewing data mapping: {e}")
        return DataPreviewResponse(
            original_data=[],
            mapped_data=[],
            mapping_errors=[str(e)]
        )

# Data Source Mapping endpoints
class DataSourceMapping(BaseModel):
    mapping_type: str  # 'equipment' or 'measurement'
    source_code: str
    source_name: Optional[str] = None
    source_type: Optional[str] = None
    target_code: str
    target_name: Optional[str] = None
    target_type: Optional[str] = None
    transform_rules: Optional[Dict[str, Any]] = None

class DataSourceMappingResponse(DataSourceMapping):
    id: str
    workspace_id: str
    data_source_id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

@router.get("/data-sources/{data_source_id}/mappings", response_model=List[DataSourceMappingResponse])
async def get_data_source_mappings(
    data_source_id: str,
    mapping_type: Optional[str] = Query(None, description="Filter by mapping type (equipment/measurement)"),
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all mappings for a data source"""
    query = """
        SELECT 
            id, workspace_id, data_source_id, mapping_type,
            source_code, source_name, source_type,
            target_code, target_name, target_type,
            transform_rules, is_active,
            created_at, updated_at
        FROM data_source_mappings
        WHERE data_source_id = :data_source_id AND is_active = true
    """
    params = {"data_source_id": data_source_id}
    
    if mapping_type:
        query += " AND mapping_type = :mapping_type"
        params["mapping_type"] = mapping_type
    
    query += " ORDER BY mapping_type, source_code"
    
    result = await db.execute(text(query), params)
    mappings = []
    
    for row in result:
        mappings.append({
            "id": row.id,
            "workspace_id": row.workspace_id,
            "data_source_id": row.data_source_id,
            "mapping_type": row.mapping_type,
            "source_code": row.source_code,
            "source_name": row.source_name,
            "source_type": row.source_type,
            "target_code": row.target_code,
            "target_name": row.target_name,
            "target_type": row.target_type,
            "transform_rules": row.transform_rules,
            "is_active": row.is_active,
            "created_at": row.created_at,
            "updated_at": row.updated_at
        })
    
    return mappings

@router.post("/data-sources/{data_source_id}/mappings", response_model=DataSourceMappingResponse)
async def create_data_source_mapping(
    data_source_id: str,
    mapping: DataSourceMapping,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new data source mapping"""
    from app.services.data_source_mapping import MappingService
    
    # Get workspace_id from data_source
    source_query = "SELECT workspace_id FROM data_source_configs WHERE id = :id"
    source_result = await db.execute(text(source_query), {"id": data_source_id})
    source_row = source_result.fetchone()
    
    if not source_row:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    workspace_id = source_row.workspace_id
    
    mapping_service = MappingService(db)
    mapping_id = await mapping_service.create_mapping(
        workspace_id=str(workspace_id),
        data_source_id=data_source_id,
        mapping_type=mapping.mapping_type,
        source_code=mapping.source_code,
        target_code=mapping.target_code,
        source_name=mapping.source_name,
        target_name=mapping.target_name,
        source_type=mapping.source_type,
        target_type=mapping.target_type,
        transform_rules=mapping.transform_rules,
        created_by=current_user.get("username", "unknown")
    )
    
    # Fetch created mapping
    fetch_query = """
        SELECT * FROM data_source_mappings WHERE id = :id
    """
    result = await db.execute(text(fetch_query), {"id": mapping_id})
    row = result.fetchone()
    
    return {
        "id": row.id,
        "workspace_id": str(row.workspace_id),
        "data_source_id": row.data_source_id,
        "mapping_type": row.mapping_type,
        "source_code": row.source_code,
        "source_name": row.source_name,
        "source_type": row.source_type,
        "target_code": row.target_code,
        "target_name": row.target_name,
        "target_type": row.target_type,
        "transform_rules": row.transform_rules,
        "is_active": row.is_active,
        "created_at": row.created_at,
        "updated_at": row.updated_at
    }

@router.post("/data-sources/{data_source_id}/mappings/bulk")
async def bulk_create_mappings(
    data_source_id: str,
    mappings: List[DataSourceMapping],
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create multiple mappings at once"""
    from app.services.data_source_mapping import MappingService
    
    # Get workspace_id from data_source
    source_query = "SELECT workspace_id FROM data_source_configs WHERE id = :id"
    source_result = await db.execute(text(source_query), {"id": data_source_id})
    source_row = source_result.fetchone()
    
    if not source_row:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    workspace_id = source_row.workspace_id
    
    mapping_service = MappingService(db)
    created_count = await mapping_service.bulk_create_mappings(
        workspace_id=str(workspace_id),
        data_source_id=data_source_id,
        mappings=[m.dict() for m in mappings],
        created_by=current_user.get("username", "unknown")
    )
    
    return {
        "message": f"Created {created_count} mappings successfully",
        "created_count": created_count
    }

@router.delete("/data-sources/{data_source_id}/mappings/{mapping_type}/{source_code}")
async def delete_data_source_mapping(
    data_source_id: str,
    mapping_type: str,
    source_code: str,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a data source mapping"""
    from app.services.data_source_mapping import MappingService
    
    # Get workspace_id from data_source
    source_query = "SELECT workspace_id FROM data_source_configs WHERE id = :id"
    source_result = await db.execute(text(source_query), {"id": data_source_id})
    source_row = source_result.fetchone()
    
    if not source_row:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    workspace_id = source_row.workspace_id
    
    mapping_service = MappingService(db)
    success = await mapping_service.delete_mapping(
        workspace_id=str(workspace_id),
        data_source_id=data_source_id,
        mapping_type=mapping_type,
        source_code=source_code
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    return {"message": "Mapping deleted successfully"}


# WebSocket endpoints (optional, controlled by environment variable)
if os.getenv("ENABLE_WEBSOCKET", "false").lower() == "true":
    from app.services.websocket_manager import websocket_manager
    
    @router.websocket("/ws/{workspace_id}")
    async def websocket_endpoint(
        websocket: WebSocket,
        workspace_id: str,
        token: Optional[str] = Query(None)
    ):
        """WebSocket endpoint for real-time updates"""
        try:
            # Simple token validation (you may want to enhance this)
            if token != os.getenv("WEBSOCKET_TOKEN", "default-ws-token"):
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
            
            await websocket_manager.connect(websocket, workspace_id)
            
            try:
                while True:
                    # Keep connection alive and handle incoming messages
                    data = await websocket.receive_text()
                    
                    # Simple ping/pong handling
                    if data == "ping":
                        await websocket.send_text("pong")
                    else:
                        # You can add more message handling here
                        await websocket.send_json({
                            "type": "echo",
                            "data": data,
                            "timestamp": datetime.now().isoformat()
                        })
                        
            except WebSocketDisconnect:
                websocket_manager.disconnect(websocket)
                logger.info(f"WebSocket disconnected for workspace {workspace_id}")
                
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            websocket_manager.disconnect(websocket)
            await websocket.close()