"""
Total Monitoring System API Router
Handles Public workspace Total Monitoring features and data
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from typing import List, Dict, Any, Optional
import uuid
import logging
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_active_user, encrypt_connection_string, decrypt_connection_string
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/total-monitoring",
    tags=["Total Monitoring"]
)

# Pydantic Models
class TotalMonitoringFeature(BaseModel):
    id: str
    workspace_id: str
    feature_name: str
    feature_slug: str
    display_name: str
    description: Optional[str]
    icon: Optional[str]
    color: Optional[str]
    route_path: str
    component_path: Optional[str]
    is_implemented: bool
    is_active: bool
    sort_order: int

class DatabaseConnectionCreate(BaseModel):
    connection_name: str
    database_type: str
    connection_string: str
    groupid: str

class DatabaseConnection(BaseModel):
    id: str
    workspace_id: str
    groupid: str
    connection_name: str
    database_type: str
    is_active: bool
    created_by: str
    created_at: datetime
    updated_at: datetime

class ProcessFlowCreate(BaseModel):
    flow_name: str
    flow_data: Dict[str, Any]
    database_connection_id: Optional[str] = None
    groupid: str

class ProcessFlow(BaseModel):
    id: str
    workspace_id: str
    groupid: str
    flow_name: str
    flow_data: Dict[str, Any]
    database_connection_id: Optional[str]
    version_number: int
    is_published: bool
    published_at: Optional[datetime]
    publish_token: Optional[str]
    created_by: str
    created_at: datetime
    updated_at: datetime


@router.get("/features", response_model=List[TotalMonitoringFeature])
async def get_total_monitoring_features(
    db: AsyncSession = Depends(get_db)
):
    """Get all Total Monitoring features from Public workspace"""
    try:
        # Get Public workspace ID
        workspace_query = text("""
            SELECT id FROM workspaces 
            WHERE workspace_type = 'PUBLIC' AND slug = 'public_workspace'
            LIMIT 1
        """)
        workspace_result = await db.execute(workspace_query)
        workspace_row = workspace_result.fetchone()
        
        if not workspace_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Public workspace not found"
            )
        
        workspace_id = str(workspace_row[0])
        
        # Get features
        features_query = text("""
            SELECT id, workspace_id, feature_name, feature_slug, display_name, 
                   description, icon, color, route_path, component_path, 
                   is_implemented, is_active, sort_order
            FROM total_monitoring_workspace_features
            WHERE workspace_id = :workspace_id AND is_active = true
            ORDER BY sort_order ASC, display_name ASC
        """)
        
        result = await db.execute(features_query, {"workspace_id": workspace_id})
        features = []
        
        for row in result:
            features.append(TotalMonitoringFeature(
                id=str(row[0]),
                workspace_id=str(row[1]),
                feature_name=row[2],
                feature_slug=row[3],
                display_name=row[4],
                description=row[5],
                icon=row[6],
                color=row[7],
                route_path=row[8],
                component_path=row[9],
                is_implemented=row[10],
                is_active=row[11],
                sort_order=row[12]
            ))
        
        return features
        
    except Exception as e:
        logger.error(f"Failed to get Total Monitoring features: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load features"
        )


@router.get("/database-connections", response_model=List[DatabaseConnection])
async def get_database_connections(
    groupid: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get database connections - admin sees all, users see only their group"""
    try:
        # Get Public workspace ID
        workspace_query = text("""
            SELECT id FROM workspaces 
            WHERE workspace_type = 'PUBLIC' AND slug = 'public_workspace'
            LIMIT 1
        """)
        workspace_result = await db.execute(workspace_query)
        workspace_row = workspace_result.fetchone()
        
        if not workspace_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Public workspace not found"
            )
        
        workspace_id = str(workspace_row[0])
        
        # Build query based on user permissions
        is_admin = current_user.get('is_admin', False) or current_user.get('role') == 'admin'
        
        if is_admin:
            # Admin sees all connections
            connections_query = text("""
                SELECT id, workspace_id, groupid, connection_name, database_type,
                       is_active, created_by, created_at, updated_at
                FROM total_monitoring_database_connections
                WHERE workspace_id = :workspace_id
                ORDER BY connection_name ASC
            """)
            params = {"workspace_id": workspace_id}
        else:
            # Regular user sees only their group's connections
            if not groupid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Group ID required for non-admin users"
                )
            
            connections_query = text("""
                SELECT id, workspace_id, groupid, connection_name, database_type,
                       is_active, created_by, created_at, updated_at
                FROM total_monitoring_database_connections
                WHERE workspace_id = :workspace_id AND groupid = :groupid
                ORDER BY connection_name ASC
            """)
            params = {"workspace_id": workspace_id, "groupid": groupid}
        
        result = await db.execute(connections_query, params)
        connections = []
        
        for row in result:
            connections.append(DatabaseConnection(
                id=str(row[0]),
                workspace_id=str(row[1]),
                groupid=str(row[2]),
                connection_name=row[3],
                database_type=row[4],
                is_active=row[5],
                created_by=row[6],
                created_at=row[7],
                updated_at=row[8]
            ))
        
        return connections
        
    except Exception as e:
        logger.error(f"Failed to get database connections: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load database connections"
        )


@router.post("/database-connections", response_model=DatabaseConnection, status_code=status.HTTP_201_CREATED)
async def create_database_connection(
    connection_data: DatabaseConnectionCreate,
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new database connection with encrypted connection string"""
    try:
        # Get Public workspace ID
        workspace_query = text("""
            SELECT id FROM workspaces 
            WHERE workspace_type = 'PUBLIC' AND slug = 'public_workspace'
            LIMIT 1
        """)
        workspace_result = await db.execute(workspace_query)
        workspace_row = workspace_result.fetchone()
        
        if not workspace_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Public workspace not found"
            )
        
        workspace_id = str(workspace_row[0])
        
        # Encrypt connection string
        encrypted_connection_string = encrypt_connection_string(connection_data.connection_string)
        
        # Insert new connection
        connection_id = str(uuid.uuid4())
        insert_query = text("""
            INSERT INTO total_monitoring_database_connections (
                id, workspace_id, groupid, connection_name, database_type,
                connection_string_encrypted, is_active, created_by, created_at, updated_at
            ) VALUES (
                :id, :workspace_id, :groupid, :connection_name, :database_type,
                :connection_string_encrypted, :is_active, :created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """)
        
        await db.execute(insert_query, {
            "id": connection_id,
            "workspace_id": workspace_id,
            "groupid": connection_data.groupid,
            "connection_name": connection_data.connection_name,
            "database_type": connection_data.database_type,
            "connection_string_encrypted": encrypted_connection_string,
            "is_active": True,
            "created_by": current_user.get("user_id", current_user.get("id"))
        })
        
        await db.commit()
        
        # Return created connection (without encrypted string)
        select_query = text("""
            SELECT id, workspace_id, groupid, connection_name, database_type,
                   is_active, created_by, created_at, updated_at
            FROM total_monitoring_database_connections
            WHERE id = :id
        """)
        
        result = await db.execute(select_query, {"id": connection_id})
        row = result.fetchone()
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve created connection"
            )
        
        return DatabaseConnection(
            id=str(row[0]),
            workspace_id=str(row[1]),
            groupid=str(row[2]),
            connection_name=row[3],
            database_type=row[4],
            is_active=row[5],
            created_by=row[6],
            created_at=row[7],
            updated_at=row[8]
        )
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create database connection: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create database connection"
        )


@router.get("/process-flows", response_model=List[ProcessFlow])
async def get_process_flows(
    groupid: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get process flows - admin sees all, users see only their group"""
    try:
        # Get Public workspace ID
        workspace_query = text("""
            SELECT id FROM workspaces 
            WHERE workspace_type = 'PUBLIC' AND slug = 'public_workspace'
            LIMIT 1
        """)
        workspace_result = await db.execute(workspace_query)
        workspace_row = workspace_result.fetchone()
        
        if not workspace_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Public workspace not found"
            )
        
        workspace_id = str(workspace_row[0])
        
        # Build query based on user permissions
        is_admin = current_user.get('is_admin', False) or current_user.get('role') == 'admin'
        
        if is_admin:
            # Admin sees all flows
            flows_query = text("""
                SELECT id, workspace_id, groupid, flow_name, flow_data, database_connection_id,
                       version_number, is_published, published_at, publish_token,
                       created_by, created_at, updated_at
                FROM total_monitoring_process_flows
                WHERE workspace_id = :workspace_id
                ORDER BY flow_name ASC
            """)
            params = {"workspace_id": workspace_id}
        else:
            # Regular user sees only their group's flows
            if not groupid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Group ID required for non-admin users"
                )
            
            flows_query = text("""
                SELECT id, workspace_id, groupid, flow_name, flow_data, database_connection_id,
                       version_number, is_published, published_at, publish_token,
                       created_by, created_at, updated_at
                FROM total_monitoring_process_flows
                WHERE workspace_id = :workspace_id AND groupid = :groupid
                ORDER BY flow_name ASC
            """)
            params = {"workspace_id": workspace_id, "groupid": groupid}
        
        result = await db.execute(flows_query, params)
        flows = []
        
        for row in result:
            flows.append(ProcessFlow(
                id=str(row[0]),
                workspace_id=str(row[1]),
                groupid=str(row[2]),
                flow_name=row[3],
                flow_data=row[4],
                database_connection_id=str(row[5]) if row[5] else None,
                version_number=row[6],
                is_published=row[7],
                published_at=row[8],
                publish_token=row[9],
                created_by=row[10],
                created_at=row[11],
                updated_at=row[12]
            ))
        
        return flows
        
    except Exception as e:
        logger.error(f"Failed to get process flows: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load process flows"
        )