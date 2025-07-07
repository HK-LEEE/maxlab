"""
Connection pool manager for data providers.
Manages database connections per workspace/data source.
"""
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
import asyncio
import logging
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine
from sqlalchemy.pool import NullPool, QueuePool

logger = logging.getLogger(__name__)


class ConnectionInfo:
    """Information about a pooled connection."""
    def __init__(self, engine: AsyncEngine, source_type: str, connection_string: str):
        self.engine = engine
        self.source_type = source_type
        self.connection_string = connection_string
        self.created_at = datetime.now()
        self.last_used = datetime.now()
        self.usage_count = 0
        self.lock = asyncio.Lock()


class ConnectionPoolManager:
    """
    Manages connection pools for different data sources.
    Implements connection pooling, lifecycle management, and cleanup.
    """
    
    # Class-level singleton instance
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._pools: Dict[str, ConnectionInfo] = {}
            self._max_pool_size = 10
            self._pool_recycle_seconds = 3600  # 1 hour
            self._idle_timeout_seconds = 1800  # 30 minutes
            self._cleanup_task = None
            self._initialized = True
    
    async def get_engine(
        self, 
        workspace_id: str, 
        source_type: str,
        connection_string: str
    ) -> AsyncEngine:
        """
        Get or create a database engine for the given workspace.
        
        Args:
            workspace_id: Workspace identifier
            source_type: Type of data source (postgresql, mssql, etc.)
            connection_string: Database connection string
            
        Returns:
            AsyncEngine instance
        """
        pool_key = f"{workspace_id}:{source_type}"
        
        async with self._lock:
            # Check if pool exists and is still valid
            if pool_key in self._pools:
                conn_info = self._pools[pool_key]
                
                # Check if connection string has changed
                if conn_info.connection_string != connection_string:
                    logger.info(f"Connection string changed for {pool_key}, recreating pool")
                    await self._close_pool(pool_key)
                else:
                    # Update last used time
                    conn_info.last_used = datetime.now()
                    conn_info.usage_count += 1
                    return conn_info.engine
            
            # Create new engine
            logger.info(f"Creating new connection pool for {pool_key}")
            engine = await self._create_engine(source_type, connection_string)
            
            self._pools[pool_key] = ConnectionInfo(
                engine=engine,
                source_type=source_type,
                connection_string=connection_string
            )
            
            # Start cleanup task if not running
            if self._cleanup_task is None:
                self._cleanup_task = asyncio.create_task(self._cleanup_idle_pools())
            
            return engine
    
    async def _create_engine(self, source_type: str, connection_string: str) -> AsyncEngine:
        """Create a new database engine with appropriate settings."""
        if source_type == "postgresql":
            # PostgreSQL optimized settings
            return create_async_engine(
                connection_string,
                pool_size=5,
                max_overflow=5,
                pool_recycle=self._pool_recycle_seconds,
                pool_pre_ping=True,
                echo=False
            )
        elif source_type == "mssql":
            # MSSQL with different pool settings
            return create_async_engine(
                connection_string,
                pool_size=3,
                max_overflow=2,
                pool_recycle=self._pool_recycle_seconds,
                pool_pre_ping=True,
                echo=False
            )
        else:
            # Default settings for other databases
            return create_async_engine(
                connection_string,
                poolclass=NullPool,  # No pooling for unknown types
                echo=False
            )
    
    async def _close_pool(self, pool_key: str) -> None:
        """Close and remove a connection pool."""
        if pool_key in self._pools:
            conn_info = self._pools[pool_key]
            try:
                await conn_info.engine.dispose()
                logger.info(f"Closed connection pool for {pool_key}")
            except Exception as e:
                logger.error(f"Error closing pool {pool_key}: {e}")
            finally:
                del self._pools[pool_key]
    
    async def _cleanup_idle_pools(self) -> None:
        """Background task to clean up idle connection pools."""
        while True:
            try:
                await asyncio.sleep(300)  # Check every 5 minutes
                
                current_time = datetime.now()
                idle_pools = []
                
                async with self._lock:
                    for pool_key, conn_info in self._pools.items():
                        idle_time = (current_time - conn_info.last_used).total_seconds()
                        
                        if idle_time > self._idle_timeout_seconds:
                            idle_pools.append(pool_key)
                    
                    # Close idle pools
                    for pool_key in idle_pools:
                        logger.info(f"Closing idle pool: {pool_key}")
                        await self._close_pool(pool_key)
                
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")
    
    async def close_workspace_pools(self, workspace_id: str) -> None:
        """Close all connection pools for a workspace."""
        async with self._lock:
            pools_to_close = [
                key for key in self._pools.keys() 
                if key.startswith(f"{workspace_id}:")
            ]
            
            for pool_key in pools_to_close:
                await self._close_pool(pool_key)
    
    async def close_all(self) -> None:
        """Close all connection pools and stop cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            self._cleanup_task = None
        
        async with self._lock:
            for pool_key in list(self._pools.keys()):
                await self._close_pool(pool_key)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about connection pools."""
        stats = {
            "total_pools": len(self._pools),
            "pools": {}
        }
        
        for pool_key, conn_info in self._pools.items():
            stats["pools"][pool_key] = {
                "source_type": conn_info.source_type,
                "created_at": conn_info.created_at.isoformat(),
                "last_used": conn_info.last_used.isoformat(),
                "usage_count": conn_info.usage_count,
                "idle_seconds": (datetime.now() - conn_info.last_used).total_seconds()
            }
        
        return stats


# Global instance
connection_pool_manager = ConnectionPoolManager()


@asynccontextmanager
async def get_pooled_engine(workspace_id: str, source_type: str, connection_string: str):
    """
    Context manager to get a pooled database engine.
    
    Usage:
        async with get_pooled_engine(workspace_id, source_type, connection_string) as engine:
            # Use engine
    """
    engine = await connection_pool_manager.get_engine(workspace_id, source_type, connection_string)
    try:
        yield engine
    finally:
        # Engine remains in pool, no cleanup needed
        pass