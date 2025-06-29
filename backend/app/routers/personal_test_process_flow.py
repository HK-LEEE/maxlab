"""
Personal Test Process Flow System API Router
공정도 편집기와 모니터링을 위한 API 엔드포인트
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Dict, Any, Optional
import uuid
import json
from datetime import datetime
import logging

from app.core.database import get_db
from app.core.security import get_current_active_user, require_admin
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

class ProcessFlowUpdate(BaseModel):
    name: Optional[str] = None
    flow_data: Optional[Dict[str, Any]] = None

class ProcessFlow(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    flow_data: Dict[str, Any]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

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
        SELECT id, workspace_id, name, flow_data, created_by, created_at, updated_at
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
            created_by=row.created_by,
            created_at=row.created_at,
            updated_at=row.updated_at
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
        (id, workspace_id, name, flow_data, created_by, created_at, updated_at)
        VALUES (:id, :workspace_id, :name, CAST(:flow_data AS jsonb), :created_by, NOW(), NOW())
        RETURNING id, workspace_id, name, flow_data, created_by, created_at, updated_at
    """
    
    result = await db.execute(
        text(query),
        {
            "id": str(flow_id),
            "workspace_id": str(flow_data.workspace_id),
            "name": flow_data.name,
            "flow_data": json.dumps(flow_data.flow_data),
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
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at
    )


@router.get("/flows/{flow_id}", response_model=ProcessFlow)
async def get_process_flow(
    flow_id: uuid.UUID,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """공정도 상세 조회"""
    query = """
        SELECT id, workspace_id, name, flow_data, created_by, created_at, updated_at
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
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at
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
        RETURNING id, workspace_id, name, flow_data, created_by, created_at, updated_at
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
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at
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


# Equipment Status endpoints
class EquipmentStatusResponse(BaseModel):
    items: List[EquipmentStatus]
    total: int
    limit: int
    offset: int
    has_more: bool


@router.get("/equipment/status", response_model=EquipmentStatusResponse)
async def get_equipment_status(
    equipment_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """설비 운행 상태 조회 (공개)"""
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
    equipment_code: Optional[str] = Query(None),
    equipment_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """측정 데이터 조회 (공개)"""
    base_query = """
        SELECT id, equipment_type, equipment_code, measurement_code, 
               measurement_desc, measurement_value, timestamp
        FROM personal_test_measurement_data
        WHERE 1=1
    """
    params = {"limit": limit}
    
    if equipment_code:
        base_query += " AND equipment_code = :equipment_code"
        params["equipment_code"] = equipment_code
    
    if equipment_type:
        base_query += " AND equipment_type = :equipment_type"
        params["equipment_type"] = equipment_type
    
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
            timestamp=row.timestamp
        ))
    
    return measurements


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