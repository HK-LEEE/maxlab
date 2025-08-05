"""
Process Flow Data Source Extension
기본 data source 정보를 제공하는 추가 엔드포인트
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, Dict, Any
import uuid

from app.core.database import get_db
from app.core.security import get_current_active_user

router = APIRouter(
    prefix="/api/v1/personal-test/process-flow",
    tags=["Personal Test Process Flow"]
)

@router.get("/default-data-source")
async def get_default_data_source(
    workspace_id: str,
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get the default data source for a workspace.
    Returns the first active data source or indicates to use workspace default.
    """
    # Convert workspace_id to UUID format
    if workspace_id in ['personal_test', 'personaltest']:
        workspace_uuid = '21ee03db-90c4-4592-b00f-c44801e0b164'
    else:
        try:
            workspace_uuid = str(uuid.UUID(workspace_id))
        except:
            workspace_uuid = workspace_id
    
    # Query for active data sources
    query = """
        SELECT 
            id, config_name, source_type, is_active,
            created_at, updated_at
        FROM data_source_configs
        WHERE workspace_id = :workspace_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1
    """
    
    result = await db.execute(text(query), {"workspace_id": workspace_uuid})
    row = result.fetchone()
    
    if row:
        # Return the first active data source
        return {
            "default_data_source_id": str(row.id),
            "config_name": row.config_name,
            "source_type": row.source_type.lower() if row.source_type else 'postgresql',
            "use_workspace_default": False
        }
    else:
        # No defined data sources, use workspace default
        return {
            "default_data_source_id": None,
            "use_workspace_default": True,
            "message": "No data sources defined. Using workspace default configuration."
        }