"""
External API data provider implementation.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
import httpx
import json
from urllib.parse import urljoin

from .base import IDataProvider, EquipmentStatusResponse, EquipmentData, MeasurementData


class APIProvider(IDataProvider):
    """
    Data provider for external REST APIs.
    Maps data requests to configured API endpoints.
    """
    
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None
    ):
        """
        Initialize API provider.
        
        Args:
            base_url: Base URL for the API
            api_key: Optional API key for authentication
            headers: Optional additional headers
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = headers or {}
        self.session: Optional[aiohttp.ClientSession] = None
        self._endpoint_mappings: Optional[Dict[str, str]] = None
    
    async def _load_endpoint_mappings(self) -> Dict[str, str]:
        """Load API endpoint mappings from configuration."""
        # In a real implementation, this would query the api_endpoint_mappings table
        # For now, return default mappings
        return {
            "equipment_status": "/api/equipment/status",
            "measurement_data": "/api/measurements",
            "measurement_specs": "/api/measurements/specs"
        }
    
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
        
        # Load endpoint mappings
        self._endpoint_mappings = await self._load_endpoint_mappings()
    
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
    
    async def get_equipment_status(
        self,
        equipment_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> EquipmentStatusResponse:
        """Get equipment status from API."""
        endpoint = self._endpoint_mappings.get("equipment_status", "/api/equipment/status")
        
        params = {}
        if equipment_ids:
            params["equipment_ids"] = ",".join(equipment_ids)
        
        try:
            response = await self._make_request("GET", endpoint, params=params)
            
            # Transform API response to match expected format
            equipment_list = response.get("data", response) if isinstance(response, dict) else response
            
            # Ensure consistent format
            results = []
            for item in equipment_list:
                results.append({
                    "equipment_id": item.get("equipment_id", item.get("id")),
                    "equipment_name": item.get("equipment_name", item.get("name")),
                    "equipment_type": item.get("equipment_type", item.get("type")),
                    "status": item.get("status"),
                    "location": item.get("location"),
                    "last_maintenance_date": item.get("last_maintenance_date"),
                    "updated_at": item.get("updated_at"),
                    "active_alarm_count": item.get("active_alarm_count", 0)
                })
            
            return results
        except Exception as e:
            raise Exception(f"Failed to get equipment status from API: {str(e)}")
    
    async def get_measurement_data(
        self,
        measurement_code: str,
        equipment_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get measurement data from API."""
        endpoint = self._endpoint_mappings.get("measurement_data", "/api/measurements")
        
        params = {
            "measurement_code": measurement_code,
            "limit": limit
        }
        
        if equipment_id:
            params["equipment_id"] = equipment_id
        
        if start_time:
            params["start_time"] = start_time.isoformat()
        
        if end_time:
            params["end_time"] = end_time.isoformat()
        
        try:
            response = await self._make_request("GET", endpoint, params=params)
            
            # Transform API response to match expected format
            measurements = response.get("data", response) if isinstance(response, dict) else response
            
            # Get specs for this measurement code
            specs = await self.get_measurement_specs([measurement_code])
            spec_map = {s["measurement_code"]: s for s in specs}
            spec = spec_map.get(measurement_code, {})
            
            # Ensure consistent format and add spec status
            results = []
            for item in measurements:
                value = float(item.get("measurement_value", item.get("value", 0)))
                
                # Calculate spec status
                spec_status = "IN_SPEC"
                if spec:
                    if spec.get("upper_spec_limit") and value > spec["upper_spec_limit"]:
                        spec_status = "ABOVE_SPEC"
                    elif spec.get("lower_spec_limit") and value < spec["lower_spec_limit"]:
                        spec_status = "BELOW_SPEC"
                
                results.append({
                    "measurement_id": item.get("measurement_id", item.get("id")),
                    "equipment_id": item.get("equipment_id"),
                    "measurement_code": item.get("measurement_code", measurement_code),
                    "measurement_value": value,
                    "unit": item.get("unit"),
                    "measured_at": item.get("measured_at", item.get("timestamp")),
                    "created_at": item.get("created_at"),
                    "upper_spec_limit": spec.get("upper_spec_limit"),
                    "lower_spec_limit": spec.get("lower_spec_limit"),
                    "target_value": spec.get("target_value"),
                    "spec_status": spec_status
                })
            
            return results
        except Exception as e:
            raise Exception(f"Failed to get measurement data from API: {str(e)}")
    
    async def get_measurement_specs(
        self,
        measurement_codes: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get measurement specifications from API."""
        endpoint = self._endpoint_mappings.get("measurement_specs", "/api/measurements/specs")
        
        params = {}
        if measurement_codes:
            params["measurement_codes"] = ",".join(measurement_codes)
        
        try:
            response = await self._make_request("GET", endpoint, params=params)
            
            # Transform API response to match expected format
            specs = response.get("data", response) if isinstance(response, dict) else response
            
            # Ensure consistent format
            results = []
            for item in specs:
                results.append({
                    "measurement_code": item.get("measurement_code", item.get("code")),
                    "upper_spec_limit": item.get("upper_spec_limit", item.get("usl")),
                    "lower_spec_limit": item.get("lower_spec_limit", item.get("lsl")),
                    "target_value": item.get("target_value", item.get("target")),
                    "spec_description": item.get("spec_description", item.get("description")),
                    "created_at": item.get("created_at"),
                    "updated_at": item.get("updated_at")
                })
            
            return results
        except Exception as e:
            raise Exception(f"Failed to get measurement specs from API: {str(e)}")
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test API connection."""
        try:
            await self.connect()
            
            # Try a simple request to test connectivity
            # Most APIs have a health or status endpoint
            health_endpoints = ["/health", "/status", "/api/health", "/api/status", "/"]
            
            for endpoint in health_endpoints:
                try:
                    response = await self._make_request("GET", endpoint)
                    return {
                        "success": True,
                        "source_type": "api",
                        "message": f"Successfully connected to API at {self.base_url}",
                        "endpoint": endpoint,
                        "response": response
                    }
                except:
                    continue
            
            # If no health endpoint works, try getting equipment status
            await self.get_equipment_status()
            
            return {
                "success": True,
                "source_type": "api",
                "message": f"Successfully connected to API at {self.base_url}"
            }
        except Exception as e:
            return {
                "success": False,
                "source_type": "api",
                "message": str(e)
            }