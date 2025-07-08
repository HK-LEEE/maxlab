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
    # Force import to see the actual error
    import pyodbc
    import aioodbc
    logger.info(f"ODBC drivers available: {pyodbc.drivers()}")
    
    from .mssql import MSSQLProvider
    MSSQL_AVAILABLE = True
    logger.info("MSSQL provider imported successfully")
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
except ImportError as import_error:
    error_message = str(import_error)
    logger.error(f"MSSQL provider import failed: {import_error}")
    MSSQL_AVAILABLE = False
    # Create a dummy MSSQLProvider class
    class MSSQLProvider:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError(f"MSSQL provider is not available on this system. Error: {error_message}")
    
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