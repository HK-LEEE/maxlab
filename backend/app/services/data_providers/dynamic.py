"""
Dynamic data provider that selects appropriate provider based on data source configuration.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
import asyncio
import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging
import json
import uuid

from .base import IDataProvider
from app.core.security import decrypt_connection_string

logger = logging.getLogger(__name__)


class DynamicProvider(IDataProvider):
    """
    Dynamic provider that reads data source configuration from database
    and delegates to appropriate provider based on source type.
    """
    
    def __init__(self, db_session: AsyncSession, workspace_id: str, data_source_id: Optional[str] = None):
        """
        Initialize dynamic provider with database session and workspace ID.
        
        Args:
            db_session: SQLAlchemy async session for config lookup
            workspace_id: Workspace ID to determine data source
            data_source_id: Optional data source ID to override workspace default
        """
        self.db_session = db_session
        self.workspace_id = workspace_id
        self.data_source_id = data_source_id
        self._provider: Optional[IDataProvider] = None
        self._config: Optional[Dict[str, Any]] = None
    
    def _is_valid_uuid(self, value: str) -> bool:
        """Check if a string is a valid UUID."""
        try:
            uuid.UUID(value)
            return True
        except (ValueError, TypeError):
            return False
    
    async def _load_config(self) -> Dict[str, Any]:
        """Load data source configuration from database."""
        if self._config is not None:
            return self._config
            
        try:
            # Convert workspace_id to string for consistent handling
            workspace_id_str = str(self.workspace_id)
            workspace_uuid = workspace_id_str
            
            # If not a valid UUID format, try to find by slug or name
            if not self._is_valid_uuid(workspace_id_str):
                logger.info(f"Workspace ID '{workspace_id_str}' is not a UUID, looking up workspace...")
                
                # Try to find workspace by slug or name
                workspace_query = text("""
                    SELECT id 
                    FROM workspaces 
                    WHERE slug = :workspace_id 
                       OR name = :workspace_id
                       OR slug = :workspace_id_no_underscore
                    LIMIT 1
                """)
                
                # Handle cases like 'personal_test' vs 'personaltest'
                workspace_id_no_underscore = workspace_id_str.replace('_', '')
                
                ws_result = await self.db_session.execute(workspace_query, {
                    "workspace_id": workspace_id_str,
                    "workspace_id_no_underscore": workspace_id_no_underscore
                })
                ws_row = ws_result.fetchone()
                
                if ws_row:
                    workspace_uuid = str(ws_row.id)
                    logger.info(f"Found workspace UUID: {workspace_uuid} for '{workspace_id_str}'")
                else:
                    logger.warning(f"No workspace found for '{workspace_id_str}'")
                    workspace_uuid = workspace_id_str  # Fallback to original
            
            # Query data source configuration
            if self.data_source_id:
                # If data_source_id is specified, load that specific data source
                logger.info(f"Loading specific data source: {self.data_source_id}")
                query = text("""
                    SELECT 
                        id as data_source_id,
                        source_type,
                        api_url,
                        mssql_connection_string,
                        api_key,
                        api_headers,
                        is_active,
                        custom_queries
                    FROM data_source_configs
                    WHERE id = :data_source_id AND is_active = true
                    LIMIT 1
                """)
                result = await self.db_session.execute(query, {"data_source_id": self.data_source_id})
            else:
                # Default behavior: load workspace default data source
                query = text("""
                    SELECT 
                        id as data_source_id,
                        source_type,
                        api_url,
                        mssql_connection_string,
                        api_key,
                        api_headers,
                        is_active,
                        custom_queries
                    FROM data_source_configs
                    WHERE workspace_id = :workspace_id AND is_active = true
                    ORDER BY created_at DESC
                    LIMIT 1
                """)
                result = await self.db_session.execute(query, {"workspace_id": workspace_uuid})
            config = result.fetchone()
            
            if not config:
                if self.data_source_id:
                    logger.error(f"Specific data source {self.data_source_id} not found or inactive")
                    raise ValueError(f"Data source {self.data_source_id} not found or inactive")
                else:
                    logger.error(f"No active data source config found for workspace {self.workspace_id}")
                    raise ValueError(f"No active data source configuration found for workspace {self.workspace_id}")
            else:
                self._config = dict(config._mapping)
                # Convert source_type to lowercase for internal use
                if 'source_type' in self._config:
                    self._config['source_type'] = self._config['source_type'].lower()
                    
                # Decrypt sensitive data
                if self._config.get('api_url'):
                    decrypted = decrypt_connection_string(self._config['api_url'])
                    # If decryption fails, it returns the original value
                    if decrypted != self._config['api_url']:
                        self._config['connection_string'] = decrypted
                    else:
                        # Try using as plain text if decryption failed
                        self._config['connection_string'] = self._config['api_url']
                elif self._config.get('mssql_connection_string'):
                    decrypted = decrypt_connection_string(self._config['mssql_connection_string'])
                    # Check if decryption returned None (failed for encrypted value)
                    if decrypted is None:
                        logger.error(f"❌ Failed to decrypt MSSQL connection string for workspace {self.workspace_id}")
                        # Don't use None as connection string
                        self._config['connection_string'] = None
                    elif decrypted != self._config['mssql_connection_string']:
                        # Successfully decrypted
                        self._config['connection_string'] = decrypted
                        logger.info(f"✅ Successfully decrypted MSSQL connection string")
                    else:
                        # Plain text connection string (no decryption needed)
                        self._config['connection_string'] = self._config['mssql_connection_string']
                        logger.info(f"ℹ️ Using plain text MSSQL connection string")
                else:
                    self._config['connection_string'] = None
                    
                if self._config.get('api_key'):
                    self._config['api_key'] = decrypt_connection_string(self._config['api_key'])
                    
                if self._config.get('api_headers'):
                    self._config['headers'] = json.loads(self._config['api_headers'])
                else:
                    self._config['headers'] = None
                
                # Custom queries are already a dict from JSONB column
                if not isinstance(self._config.get('custom_queries'), dict):
                    self._config['custom_queries'] = None
                    
                logger.info(f"Loaded data source config for workspace {self.workspace_id}: {self._config.get('source_type')}")
                
        except Exception as e:
            logger.error(f"Error loading data source config: {e}")
            # Don't fallback - raise the error to indicate configuration issue
            raise RuntimeError(f"Failed to load data source configuration for workspace {self.workspace_id}: {e}")
            
        return self._config
    
    async def _get_provider(self) -> IDataProvider:
        """Get or create appropriate provider based on configuration."""
        if self._provider is not None:
            return self._provider
            
        config = await self._load_config()
        source_type = config.get("source_type", "postgresql")
        
        try:
            if source_type == "postgresql":
                from .postgresql_provider import PostgreSQLProvider
                # If no connection string, use the same db session
                if not config.get("connection_string"):
                    self._provider = PostgreSQLProvider(
                        self.db_session,
                        custom_queries=config.get("custom_queries")
                    )
                else:
                    # Use connection string to create new connection with pooling
                    self._provider = PostgreSQLProvider(
                        config.get("connection_string"),
                        workspace_id=self.workspace_id,
                        custom_queries=config.get("custom_queries")
                    )
            elif source_type == "mssql":
                from .mssql import MSSQLProvider
                if not config.get("connection_string"):
                    logger.error(f"❌ MSSQL provider requires connection_string - decryption may have failed")
                    # Provide more context about the failure
                    if config.get("mssql_connection_string"):
                        raise ValueError("MSSQL connection string decryption failed. Please check encryption key configuration.")
                    else:
                        raise ValueError("MSSQL provider requires connection_string but none was configured")
                    
                logger.info(f"🔧 Creating MSSQL provider with connection string length: {len(config.get('connection_string'))}")
                self._provider = MSSQLProvider(
                    connection_string=config.get("connection_string"),
                    workspace_id=self.workspace_id,
                    custom_queries=config.get("custom_queries"),
                    db_session=self.db_session
                )
                logger.info(f"✅ MSSQL provider created successfully")
            elif source_type == "api":
                from .api import APIProvider
                if not config.get("connection_string"):
                    raise ValueError("API provider requires connection_string (base_url)")
                self._provider = APIProvider(
                    base_url=config.get("connection_string"),
                    api_key=config.get("api_key"),
                    headers=config.get("headers"),
                    db=self.db_session,
                    data_source_id=config.get("data_source_id")
                )
            else:
                raise ValueError(f"Unsupported data source type: {source_type}")
                
            logger.info(f"Created {source_type} provider for workspace {self.workspace_id}")
            
        except ImportError as e:
            logger.error(f"❌ Failed to import {source_type} provider: {e}")
            # DON'T fallback to PostgreSQL - raise the error with proper type
            raise ImportError(f"Failed to import {source_type} provider: {e}")
        except Exception as e:
            logger.error(f"❌ Failed to create {source_type} provider: {e}")
            # DON'T fallback to PostgreSQL - raise the error with proper type
            raise RuntimeError(f"Failed to create {source_type} provider: {e}")
            
        return self._provider
    
    async def connect(self) -> None:
        """Connect to the configured data source."""
        provider = await self._get_provider()
        await provider.connect()
    
    async def disconnect(self) -> None:
        """Disconnect from the data source."""
        if self._provider:
            await self._provider.disconnect()
    
    async def get_equipment_status(
        self,
        equipment_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> Dict[str, Any]:
        """Get equipment status using configured provider."""
        provider = await self._get_provider()
        # Call provider and return full response
        response = await provider.get_equipment_status(
            equipment_type=equipment_type,
            status=status,
            limit=limit,
            offset=offset
        )
        # Convert response to dict for API usage
        return response.dict()
    
    async def get_measurement_data(
        self,
        equipment_code: Optional[str] = None,
        equipment_codes: Optional[str] = None,
        equipment_type: Optional[str] = None,
        measurement_code: Optional[str] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """Get measurement data using configured provider."""
        provider = await self._get_provider()
        
        # Handle multiple equipment codes if provided
        if equipment_codes:
            # Parse comma-separated equipment codes
            code_list = [code.strip() for code in equipment_codes.split(',')]
            all_measurements = []
            
            for code in code_list:
                measurements = await provider.get_measurement_data(
                    equipment_code=code,
                    equipment_type=equipment_type,
                    limit=limit
                )
                all_measurements.extend(measurements)
            
            # Filter by measurement_code if provided
            if measurement_code:
                all_measurements = [m for m in all_measurements if m.measurement_code == measurement_code]
            
            # Convert to list of dicts for backward compatibility
            result = []
            for item in all_measurements:
                item_dict = item.dict()
                # Ensure spec_status is an integer
                if 'spec_status' in item_dict and isinstance(item_dict['spec_status'], str):
                    spec_status_mapping = {
                        'IN_SPEC': 0,
                        'BELOW_SPEC': 1,
                        'ABOVE_SPEC': 2,
                        'NO_SPEC': 9
                    }
                    item_dict['spec_status'] = spec_status_mapping.get(item_dict['spec_status'], 0)
                result.append(item_dict)
            return result
        else:
            # Single equipment code or no equipment code filter
            measurements = await provider.get_measurement_data(
                equipment_code=equipment_code,
                equipment_type=equipment_type,
                limit=limit
            )
            
            # Filter by measurement_code if provided
            if measurement_code:
                measurements = [m for m in measurements if m.measurement_code == measurement_code]
            
            # Convert to list of dicts for backward compatibility
            result = []
            for item in measurements:
                item_dict = item.dict()
                # Ensure spec_status is an integer
                if 'spec_status' in item_dict and isinstance(item_dict['spec_status'], str):
                    spec_status_mapping = {
                        'IN_SPEC': 0,
                        'BELOW_SPEC': 1,
                        'ABOVE_SPEC': 2,
                        'NO_SPEC': 9
                    }
                    item_dict['spec_status'] = spec_status_mapping.get(item_dict['spec_status'], 0)
                result.append(item_dict)
            return result
    
    async def get_measurement_specs(
        self,
        measurement_codes: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get measurement specifications using configured provider."""
        provider = await self._get_provider()
        # Since get_measurement_specs is not in the base interface, we need to handle this differently
        # For now, return empty list
        logger.warning("get_measurement_specs not implemented in current provider")
        return []
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to configured data source."""
        try:
            provider = await self._get_provider()
            await provider.connect()
            
            # Try to get some equipment status as a test
            # Use the provider's test_connection method if available
            if hasattr(provider, 'test_connection'):
                result = await provider.test_connection()
                await provider.disconnect()
                return result
            else:
                # Fallback test - try to query equipment
                equipment = await provider.get_equipment_status()
                await provider.disconnect()
                
                return {
                    "success": True,
                    "source_type": self._config.get("source_type"),
                    "message": f"Successfully connected to {self._config.get('source_type')} data source",
                    "test_query_count": len(equipment) if equipment else 0
                }
        except Exception as e:
            logger.error(f"Test connection failed: {e}")
            return {
                "success": False,
                "source_type": self._config.get("source_type") if self._config else "unknown",
                "message": str(e)
            }
    
    async def get_latest_measurement(
        self,
        equipment_code: str
    ) -> Optional[Dict[str, Any]]:
        """Get latest measurement for equipment using configured provider."""
        provider = await self._get_provider()
        measurement = await provider.get_latest_measurement(equipment_code)
        return measurement.dict() if measurement else None
    
    async def update_equipment_status(
        self,
        equipment_code: str,
        status: str
    ) -> bool:
        """Update equipment status using configured provider."""
        provider = await self._get_provider()
        return await provider.update_equipment_status(equipment_code, status)
    
    async def refresh_config(self) -> None:
        """Refresh configuration from database."""
        self._config = None
        if self._provider:
            await self._provider.disconnect()
            self._provider = None
    
    async def execute_sql(self, query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Execute arbitrary SQL query using the configured provider
        
        Args:
            query: SQL query string
            params: Optional query parameters for parameterized queries
            
        Returns:
            List[Dict[str, Any]]: Query results as list of dictionaries
        """
        provider = await self._get_provider()
        return await provider.execute_sql(query, params)