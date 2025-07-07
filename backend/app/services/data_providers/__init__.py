"""
Data Providers for Multi-Database Support
다중 데이터베이스 지원을 위한 데이터 프로바이더
"""
import logging

from .base import IDataProvider, EquipmentData, MeasurementData, EquipmentStatusResponse
from .postgresql_provider import PostgreSQLProvider
from .dynamic import DynamicProvider
from .api import APIProvider

logger = logging.getLogger(__name__)

# Try to import MSSQL provider if available
try:
    from .mssql import MSSQLProvider
    MSSQL_AVAILABLE = True
    __all__ = [
        'IDataProvider',
        'EquipmentData', 
        'MeasurementData',
        'EquipmentStatusResponse',
        'PostgreSQLProvider',
        'DynamicProvider',
        'MSSQLProvider',
        'APIProvider'
    ]
except ImportError as e:
    logger.warning(f"MSSQL provider not available: {e}")
    MSSQL_AVAILABLE = False
    # Create a dummy MSSQLProvider class
    class MSSQLProvider:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("MSSQL provider is not available on this system. Please install ODBC drivers.")
    
    __all__ = [
        'IDataProvider',
        'EquipmentData', 
        'MeasurementData',
        'EquipmentStatusResponse',
        'PostgreSQLProvider',
        'DynamicProvider',
        'APIProvider',
        'MSSQLProvider'  # Include dummy class
    ]