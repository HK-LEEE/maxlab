"""
WebSocket Connection Manager for real-time updates
"""
from typing import Dict, Set, List
from fastapi import WebSocket
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time data updates"""
    
    def __init__(self):
        # workspace_id -> Set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # connection -> workspace_id mapping for cleanup
        self.connection_workspace: Dict[WebSocket, str] = {}
    
    async def connect(self, websocket: WebSocket, workspace_id: str):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        
        if workspace_id not in self.active_connections:
            self.active_connections[workspace_id] = set()
        
        self.active_connections[workspace_id].add(websocket)
        self.connection_workspace[websocket] = workspace_id
        
        logger.info(f"WebSocket connected for workspace {workspace_id}")
        
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connection",
            "status": "connected",
            "workspace_id": workspace_id,
            "timestamp": datetime.now().isoformat()
        })
    
    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        workspace_id = self.connection_workspace.get(websocket)
        
        if workspace_id and workspace_id in self.active_connections:
            self.active_connections[workspace_id].discard(websocket)
            
            # Clean up empty workspace sets
            if not self.active_connections[workspace_id]:
                del self.active_connections[workspace_id]
        
        if websocket in self.connection_workspace:
            del self.connection_workspace[websocket]
        
        logger.info(f"WebSocket disconnected for workspace {workspace_id}")
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        """Send a message to a specific connection"""
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
            self.disconnect(websocket)
    
    async def broadcast_to_workspace(self, workspace_id: str, message: dict):
        """Broadcast a message to all connections in a workspace"""
        if workspace_id not in self.active_connections:
            return
        
        # Create a copy of connections to avoid modification during iteration
        connections = list(self.active_connections[workspace_id])
        disconnected = []
        
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected connections
        for connection in disconnected:
            self.disconnect(connection)
    
    async def broadcast_equipment_update(self, workspace_id: str, equipment_code: str, data: dict):
        """Broadcast equipment status update"""
        message = {
            "type": "equipment_update",
            "equipment_code": equipment_code,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        await self.broadcast_to_workspace(workspace_id, message)
    
    async def broadcast_measurement_update(self, workspace_id: str, measurements: List[dict]):
        """Broadcast measurement data update"""
        message = {
            "type": "measurement_update",
            "measurements": measurements,
            "timestamp": datetime.now().isoformat()
        }
        await self.broadcast_to_workspace(workspace_id, message)
    
    async def broadcast_spec_alarm(self, workspace_id: str, alarm: dict):
        """Broadcast spec violation alarm"""
        message = {
            "type": "spec_alarm",
            "alarm": alarm,
            "timestamp": datetime.now().isoformat()
        }
        await self.broadcast_to_workspace(workspace_id, message)


# Global connection manager instance
websocket_manager = ConnectionManager()