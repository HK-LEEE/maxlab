"""
Data Source Mapping Service
Handles mapping between external data sources and internal system codes
"""
from typing import Dict, List, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import json
import logging
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)


class MappingService:
    """Service for managing data source mappings"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self._mapping_cache: Dict[str, Dict[str, str]] = {}
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl_seconds = 300  # 5 minutes cache
    
    async def get_mappings(
        self, 
        workspace_id: str, 
        data_source_id: str,
        mapping_type: Optional[str] = None,
        use_cache: bool = True
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get all mappings for a data source.
        Returns dict: {source_code: {target_code, transform_rules, ...}}
        """
        cache_key = f"{workspace_id}:{data_source_id}:{mapping_type or 'all'}"
        
        # Check cache
        if use_cache and self._is_cache_valid() and cache_key in self._mapping_cache:
            return self._mapping_cache[cache_key]
        
        try:
            query = """
                SELECT 
                    mapping_type,
                    source_code,
                    source_name,
                    source_type,
                    target_code,
                    target_name,
                    target_type,
                    transform_rules
                FROM data_source_mappings
                WHERE workspace_id = :workspace_id 
                  AND data_source_id = :data_source_id
                  AND is_active = true
            """
            params = {
                "workspace_id": workspace_id,
                "data_source_id": data_source_id
            }
            
            if mapping_type:
                query += " AND mapping_type = :mapping_type"
                params["mapping_type"] = mapping_type
            
            result = await self.db.execute(text(query), params)
            
            mappings = {}
            for row in result:
                key = f"{row.mapping_type}:{row.source_code}"
                mappings[key] = {
                    "mapping_type": row.mapping_type,
                    "source_code": row.source_code,
                    "source_name": row.source_name,
                    "source_type": row.source_type,
                    "target_code": row.target_code,
                    "target_name": row.target_name,
                    "target_type": row.target_type,
                    "transform_rules": row.transform_rules
                }
            
            # Update cache
            self._mapping_cache[cache_key] = mappings
            self._cache_timestamp = datetime.now()
            
            return mappings
            
        except Exception as e:
            logger.error(f"Error getting mappings: {e}")
            return {}
    
    async def map_equipment_code(
        self,
        workspace_id: str,
        data_source_id: str,
        source_code: str,
        default: Optional[str] = None
    ) -> str:
        """Map external equipment code to internal code"""
        mappings = await self.get_mappings(workspace_id, data_source_id, "equipment")
        key = f"equipment:{source_code}"
        
        if key in mappings:
            return mappings[key]["target_code"]
        
        return default or source_code
    
    async def map_measurement_code(
        self,
        workspace_id: str,
        data_source_id: str,
        source_code: str,
        default: Optional[str] = None
    ) -> str:
        """Map external measurement code to internal code"""
        mappings = await self.get_mappings(workspace_id, data_source_id, "measurement")
        key = f"measurement:{source_code}"
        
        if key in mappings:
            return mappings[key]["target_code"]
        
        return default or source_code
    
    async def apply_transform_rules(
        self,
        value: Any,
        transform_rules: Optional[Dict[str, Any]]
    ) -> Any:
        """Apply transformation rules to a value"""
        if not transform_rules or value is None:
            return value
        
        try:
            # Scale transformation
            if "scale" in transform_rules:
                value = float(value) * transform_rules["scale"]
            
            # Offset transformation
            if "offset" in transform_rules:
                value = float(value) + transform_rules["offset"]
            
            # Unit conversion
            if "unit_conversion" in transform_rules:
                conversion = transform_rules["unit_conversion"]
                if conversion == "F_to_C":
                    value = (float(value) - 32) * 5/9
                elif conversion == "C_to_F":
                    value = float(value) * 9/5 + 32
                # Add more conversions as needed
            
            # Round to specified decimals
            if "decimals" in transform_rules:
                value = round(float(value), transform_rules["decimals"])
            
            return value
            
        except Exception as e:
            logger.error(f"Error applying transform rules: {e}")
            return value
    
    async def create_mapping(
        self,
        workspace_id: str,
        data_source_id: str,
        mapping_type: str,
        source_code: str,
        target_code: str,
        source_name: Optional[str] = None,
        target_name: Optional[str] = None,
        source_type: Optional[str] = None,
        target_type: Optional[str] = None,
        transform_rules: Optional[Dict[str, Any]] = None,
        created_by: str = "system"
    ) -> str:
        """Create a new mapping"""
        try:
            mapping_id = str(uuid.uuid4())
            
            query = """
                INSERT INTO data_source_mappings (
                    id, workspace_id, data_source_id, mapping_type,
                    source_code, source_name, source_type,
                    target_code, target_name, target_type,
                    transform_rules, created_by
                ) VALUES (
                    :id, :workspace_id, :data_source_id, :mapping_type,
                    :source_code, :source_name, :source_type,
                    :target_code, :target_name, :target_type,
                    :transform_rules, :created_by
                )
                ON CONFLICT (data_source_id, mapping_type, source_code) 
                DO UPDATE SET
                    target_code = EXCLUDED.target_code,
                    target_name = EXCLUDED.target_name,
                    target_type = EXCLUDED.target_type,
                    transform_rules = EXCLUDED.transform_rules,
                    updated_at = CURRENT_TIMESTAMP
            """
            
            await self.db.execute(text(query), {
                "id": mapping_id,
                "workspace_id": workspace_id,
                "data_source_id": data_source_id,
                "mapping_type": mapping_type,
                "source_code": source_code,
                "source_name": source_name,
                "source_type": source_type,
                "target_code": target_code,
                "target_name": target_name,
                "target_type": target_type,
                "transform_rules": json.dumps(transform_rules) if transform_rules else None,
                "created_by": created_by
            })
            
            await self.db.commit()
            
            # Invalidate cache
            self._invalidate_cache()
            
            return mapping_id
            
        except Exception as e:
            logger.error(f"Error creating mapping: {e}")
            await self.db.rollback()
            raise
    
    async def bulk_create_mappings(
        self,
        workspace_id: str,
        data_source_id: str,
        mappings: List[Dict[str, Any]],
        created_by: str = "system"
    ) -> int:
        """Create multiple mappings at once"""
        created_count = 0
        
        for mapping in mappings:
            try:
                await self.create_mapping(
                    workspace_id=workspace_id,
                    data_source_id=data_source_id,
                    mapping_type=mapping.get("mapping_type", "equipment"),
                    source_code=mapping["source_code"],
                    target_code=mapping["target_code"],
                    source_name=mapping.get("source_name"),
                    target_name=mapping.get("target_name"),
                    source_type=mapping.get("source_type"),
                    target_type=mapping.get("target_type"),
                    transform_rules=mapping.get("transform_rules"),
                    created_by=created_by
                )
                created_count += 1
            except Exception as e:
                logger.error(f"Error creating mapping for {mapping.get('source_code')}: {e}")
        
        return created_count
    
    async def delete_mapping(
        self,
        workspace_id: str,
        data_source_id: str,
        mapping_type: str,
        source_code: str
    ) -> bool:
        """Delete a mapping"""
        try:
            query = """
                UPDATE data_source_mappings
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE workspace_id = :workspace_id
                  AND data_source_id = :data_source_id
                  AND mapping_type = :mapping_type
                  AND source_code = :source_code
            """
            
            result = await self.db.execute(text(query), {
                "workspace_id": workspace_id,
                "data_source_id": data_source_id,
                "mapping_type": mapping_type,
                "source_code": source_code
            })
            
            await self.db.commit()
            
            # Invalidate cache
            self._invalidate_cache()
            
            return result.rowcount > 0
            
        except Exception as e:
            logger.error(f"Error deleting mapping: {e}")
            await self.db.rollback()
            return False
    
    def _is_cache_valid(self) -> bool:
        """Check if cache is still valid"""
        if not self._cache_timestamp:
            return False
        
        age = (datetime.now() - self._cache_timestamp).total_seconds()
        return age < self._cache_ttl_seconds
    
    def _invalidate_cache(self):
        """Invalidate the mapping cache"""
        self._mapping_cache.clear()
        self._cache_timestamp = None