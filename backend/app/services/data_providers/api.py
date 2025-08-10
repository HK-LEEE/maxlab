"""
External API data provider implementation.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
import httpx
import json
from urllib.parse import urljoin
import logging

from .base import IDataProvider, EquipmentStatusResponse, EquipmentData, MeasurementData
from sqlalchemy import text

logger = logging.getLogger(__name__)


class APIProvider(IDataProvider):
    """
    Data provider for external REST APIs.
    Maps data requests to configured API endpoints.
    """
    
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        db = None,
        data_source_id: Optional[str] = None
    ):
        """
        Initialize API provider.
        
        Args:
            base_url: Base URL for the API
            api_key: Optional API key for authentication
            headers: Optional additional headers
            db: Database session for loading configurations
            data_source_id: Data source ID for loading mappings
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = headers or {}
        self.session = None
        self.db = db
        self.data_source_id = data_source_id
        self._endpoint_mappings = {}
        self._field_mappings = {}
    
    async def _load_endpoint_mappings(self) -> Dict[str, Dict[str, Any]]:
        """Load API endpoint mappings from configuration."""
        if not self.db or not self.data_source_id:
            # Return default mappings
            return {
                "equipment_status": {
                    "endpoint_path": "/api/equipment/status",
                    "http_method": "GET",
                    "response_path": "$.data"
                },
                "measurement_data": {
                    "endpoint_path": "/api/measurements",
                    "http_method": "GET",
                    "response_path": "$.data"
                },
                "measurement_specs": {
                    "endpoint_path": "/api/measurements/specs",
                    "http_method": "GET",
                    "response_path": "$.data"
                }
            }
        
        query = """
            SELECT data_type, endpoint_path, http_method, request_headers,
                   request_body_template, response_path
            FROM data_source_endpoint_mappings
            WHERE data_source_id = :data_source_id AND is_active = true
        """
        
        result = await self.db.execute(text(query), {"data_source_id": self.data_source_id})
        mappings = {}
        
        for row in result:
            mappings[row.data_type] = {
                "endpoint_path": row.endpoint_path,
                "http_method": row.http_method or "GET",
                "request_headers": row.request_headers or {},
                "request_body_template": row.request_body_template,
                "response_path": row.response_path or "$.data"
            }
        
        return mappings
    
    async def _load_field_mappings(self) -> Dict[str, Dict[str, Dict[str, Any]]]:
        """Load field mappings for data transformation."""
        if not self.db or not self.data_source_id:
            return {}
        
        query = """
            SELECT data_type, source_field, target_field, data_type_conversion,
                   transform_function, default_value
            FROM data_source_field_mappings
            WHERE data_source_id = :data_source_id AND is_active = true
        """
        
        result = await self.db.execute(text(query), {"data_source_id": self.data_source_id})
        mappings = {}
        
        for row in result:
            if row.data_type not in mappings:
                mappings[row.data_type] = {}
            
            mappings[row.data_type][row.target_field] = {
                "source_field": row.source_field,
                "data_type_conversion": row.data_type_conversion,
                "transform_function": row.transform_function,
                "default_value": row.default_value
            }
        
        return mappings
    
    def _prepare_headers(self) -> Dict[str, str]:
        """Prepare request headers including authentication."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            **self.headers
        }
        
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        return headers
    
    async def connect(self) -> None:
        """Create HTTP session for API requests."""
        if not self.session:
            self.session = httpx.AsyncClient(
                headers=self._prepare_headers(),
                timeout=30.0,
                base_url=self.base_url
            )
        
        # Load endpoint and field mappings
        self._endpoint_mappings = await self._load_endpoint_mappings()
        self._field_mappings = await self._load_field_mappings()
    
    async def disconnect(self) -> None:
        """Close HTTP session."""
        if self.session:
            await self.session.aclose()
            self.session = None
    
    async def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make HTTP request to API."""
        if not self.session:
            await self.connect()
        
        response = await self.session.request(
            method=method,
            url=endpoint,
            params=params,
            json=json_data
        )
        response.raise_for_status()
        return response.json()
    
    def _extract_data_from_response(self, response_data: Any, response_path: str) -> List[Dict[str, Any]]:
        """Extract data array from API response using JSONPath-like syntax."""
        if not response_path or response_path == "$":
            return response_data if isinstance(response_data, list) else [response_data]
        
        # Handle common JSONPath patterns
        if response_path == "$.data":
            return response_data.get("data", []) if isinstance(response_data, dict) else []
        elif response_path == "$.result":
            return response_data.get("result", []) if isinstance(response_data, dict) else []
        elif response_path == "$.items":
            return response_data.get("items", []) if isinstance(response_data, dict) else []
        elif response_path.startswith("$.") and "." not in response_path[2:]:
            # Simple field access like $.records
            field = response_path[2:]
            return response_data.get(field, []) if isinstance(response_data, dict) else []
        else:
            # For complex paths, try to parse
            parts = response_path.split(".")
            data = response_data
            for part in parts[1:]:  # Skip $
                if isinstance(data, dict):
                    data = data.get(part, [])
                else:
                    return []
            return data if isinstance(data, list) else [data]
    
    def _transform_field_value(self, value: Any, mapping: Dict[str, Any]) -> Any:
        """Transform field value based on mapping configuration."""
        if value is None and mapping.get("default_value"):
            value = mapping["default_value"]
        
        # Data type conversion
        conversion = mapping.get("data_type_conversion")
        if conversion and value is not None:
            try:
                if conversion == "int":
                    value = int(value)
                elif conversion == "float":
                    value = float(value)
                elif conversion == "string":
                    value = str(value)
                elif conversion == "boolean":
                    value = bool(value)
                elif conversion == "datetime":
                    # Handle various datetime formats
                    if isinstance(value, str):
                        # Try ISO format first
                        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except:
                pass  # Keep original value if conversion fails
        
        return value
    
    def _map_fields(self, source_data: Dict[str, Any], field_mappings: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Map source fields to target fields."""
        mapped_data = {}
        
        for target_field, mapping in field_mappings.items():
            source_field = mapping["source_field"]
            value = source_data.get(source_field)
            mapped_data[target_field] = self._transform_field_value(value, mapping)
        
        return mapped_data
    
    async def get_equipment_status(
        self,
        equipment_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> EquipmentStatusResponse:
        """Get equipment status from API."""
        # Get endpoint mapping
        mapping = self._endpoint_mappings.get("equipment_status", {
            "endpoint_path": "/api/equipment/status",
            "http_method": "GET",
            "response_path": "$.data"
        })
        field_mappings = self._field_mappings.get("equipment_status", {})
        
        params = {
            "limit": limit,
            "offset": offset
        }
        if equipment_type:
            params["equipment_type"] = equipment_type
        if status:
            params["status"] = status
        
        try:
            # Make request based on method
            if mapping["http_method"] == "POST":
                # For POST requests, send params in body
                body = {"filters": params} if mapping.get("request_body_template") else params
                response = await self._make_request("POST", mapping["endpoint_path"], json_data=body)
            else:
                response = await self._make_request("GET", mapping["endpoint_path"], params=params)
            
            # Extract data array from response
            items_raw = self._extract_data_from_response(response, mapping["response_path"])
            
            # Map fields
            items = []
            if field_mappings:
                for item in items_raw:
                    mapped_item = self._map_fields(item, field_mappings)
                    items.append(EquipmentData(
                        equipment_type=mapped_item.get("equipment_type", ""),
                        equipment_code=mapped_item.get("equipment_code", ""),
                        equipment_name=mapped_item.get("equipment_name", ""),
                        status=mapped_item.get("status", "STOP"),
                        last_run_time=mapped_item.get("last_run_time")
                    ))
            else:
                # Use direct mapping if no field mappings defined
                for item in items_raw:
                    items.append(EquipmentData(
                        equipment_type=item.get("equipment_type", ""),
                        equipment_code=item.get("equipment_code", item.get("id", "")),
                        equipment_name=item.get("equipment_name", item.get("name", "")),
                        status=item.get("status", "STOP"),
                        last_run_time=item.get("last_run_time")
                    ))
            
            # Handle response format based on API specification
            # Expected format: {"query_id": "xxx", "data": [...]}
            total = response.get("total", len(items))
            has_more = response.get("has_more", (offset + limit) < total)
            
            return EquipmentStatusResponse(
                items=items,
                total=total,
                limit=limit,
                offset=offset,
                has_more=has_more
            )
        except Exception as e:
            logger.error(f"Failed to get equipment status from API: {str(e)}")
            raise
    
    async def get_measurement_data(
        self,
        equipment_code: Optional[str] = None,
        equipment_type: Optional[str] = None,
        limit: int = 1000
    ) -> List[MeasurementData]:
        """Get measurement data from API."""
        # Get endpoint mapping
        mapping = self._endpoint_mappings.get("measurement_data", {
            "endpoint_path": "/api/measurements",
            "http_method": "GET",
            "response_path": "$.data"
        })
        field_mappings = self._field_mappings.get("measurement_data", {})
        
        params = {
            "limit": limit
        }
        
        if equipment_code:
            params["equipment_code"] = equipment_code
        if equipment_type:
            params["equipment_type"] = equipment_type
        
        try:
            # Make request based on method
            if mapping["http_method"] == "POST":
                body = {"filters": params} if mapping.get("request_body_template") else params
                response = await self._make_request("POST", mapping["endpoint_path"], json_data=body)
            else:
                response = await self._make_request("GET", mapping["endpoint_path"], params=params)
            
            # Extract data array from response
            items_raw = self._extract_data_from_response(response, mapping["response_path"])
            
            # Map fields
            results = []
            if field_mappings:
                for item in items_raw:
                    mapped_item = self._map_fields(item, field_mappings)
                    results.append(MeasurementData(
                        id=mapped_item.get("id", 0),
                        equipment_type=mapped_item.get("equipment_type", ""),
                        equipment_code=mapped_item.get("equipment_code", ""),
                        measurement_code=mapped_item.get("measurement_code", ""),
                        measurement_desc=mapped_item.get("measurement_desc", ""),
                        measurement_value=float(mapped_item.get("measurement_value", 0)),
                        timestamp=mapped_item.get("timestamp", datetime.now()),
                        spec_status=mapped_item.get("spec_status", 0),
                        usl=mapped_item.get("usl"),
                        lsl=mapped_item.get("lsl"),
                        target=mapped_item.get("target")
                    ))
            else:
                # Use direct mapping if no field mappings defined
                for item in items_raw:
                    results.append(MeasurementData(
                        id=item.get("id", 0),
                        equipment_type=item.get("equipment_type", ""),
                        equipment_code=item.get("equipment_code", ""),
                        measurement_code=item.get("measurement_code", ""),
                        measurement_desc=item.get("measurement_desc", ""),
                        measurement_value=float(item.get("measurement_value", 0)),
                        timestamp=item.get("timestamp", datetime.now()),
                        spec_status=item.get("spec_status", 0),
                        usl=item.get("usl"),
                        lsl=item.get("lsl"),
                        target=item.get("target")
                    ))
            
            return results
        except Exception as e:
            logger.error(f"Failed to get measurement data from API: {str(e)}")
            raise
    
    async def get_latest_measurement(
        self,
        equipment_code: str
    ) -> Optional[MeasurementData]:
        """Get latest measurement for specific equipment."""
        measurements = await self.get_measurement_data(
            equipment_code=equipment_code,
            limit=1
        )
        return measurements[0] if measurements else None
    
    async def update_equipment_status(
        self,
        equipment_code: str,
        status: str
    ) -> bool:
        """Update equipment status via API."""
        endpoint = self._endpoint_mappings.get("equipment_status", "/api/equipment/status")
        endpoint = f"{endpoint}/{equipment_code}"
        
        try:
            response = await self._make_request(
                "PUT",
                endpoint,
                json_data={"status": status}
            )
            return response.get("success", True)
        except Exception as e:
            logger.error(f"Failed to update equipment status via API: {str(e)}")
            return False
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test API connection."""
        try:
            await self.connect()
            
            # Try a simple request
            response = await self._make_request("GET", "/health", params={"ping": "true"})
            
            return {
                "status": "success",
                "provider": "API",
                "base_url": self.base_url,
                "message": "API connection successful"
            }
        except Exception as e:
            logger.error(f"API connection test failed: {e}")
            return {
                "status": "error",
                "provider": "API",
                "base_url": self.base_url,
                "message": str(e)
            }
    
    async def execute_sql(self, query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Execute arbitrary SQL query via API endpoint
        
        For API providers, this translates SQL queries to API calls if possible,
        or sends them to a SQL execution endpoint if available.
        
        Args:
            query: SQL query string
            params: Optional query parameters for parameterized queries
            
        Returns:
            List[Dict[str, Any]]: Query results as list of dictionaries
        """
        try:
            # For API providers, we can either:
            # 1. Send the SQL to a SQL execution endpoint if available
            # 2. Parse the SQL and translate to API calls
            # 3. Return empty results if SQL execution is not supported
            
            # Check if the API has a SQL execution endpoint
            if "/execute-sql" in self.base_url or "/sql" in self.base_url:
                # Send SQL to execution endpoint
                payload = {
                    "query": query,
                    "params": params or {}
                }
                
                response = await self._make_request("POST", "/execute-sql", json=payload)
                
                if isinstance(response, list):
                    return response
                elif isinstance(response, dict) and "results" in response:
                    return response["results"]
                elif isinstance(response, dict) and "data" in response:
                    return response["data"]
                else:
                    return [response]
            else:
                # API doesn't support SQL execution
                logger.warning(f"API provider at {self.base_url} does not support SQL execution")
                
                # Try to parse simple SELECT queries and convert to API calls
                query_lower = query.lower().strip()
                
                if query_lower.startswith("select") and "from equipment" in query_lower:
                    # Try to fetch equipment data
                    equipment_data = await self.get_equipment_status(limit=100)
                    results = []
                    for item in equipment_data.items:
                        results.append(item.dict())
                    return results
                
                elif query_lower.startswith("select") and "from measurement" in query_lower:
                    # Try to fetch measurement data
                    measurement_data = await self.get_measurement_data(limit=1000)
                    results = []
                    for item in measurement_data:
                        results.append(item.dict())
                    return results
                
                else:
                    # Cannot execute this SQL query via API
                    logger.warning(f"Cannot execute SQL query via API: {query[:100]}...")
                    return []
                
        except Exception as e:
            logger.error(f"Error executing SQL query via API: {e}")
            logger.error(f"Query was: {query[:500]}...")
            raise RuntimeError(f"API SQL execution failed: {str(e)}")