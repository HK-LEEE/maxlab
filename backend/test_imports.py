#!/usr/bin/env python3
"""Test script to verify all imports work correctly"""

def test_imports():
    print("Testing imports...")
    
    try:
        # Test core imports
        print("✓ Testing core imports...")
        from app.core.config import settings
        from app.core.database import get_db, Base
        from app.core.security import get_current_user
        
        # Test model imports
        print("✓ Testing model imports...")
        from app.models import Workspace, Query, WorkspacePermission
        
        # Test schema imports
        print("✓ Testing schema imports...")
        from app.schemas import (
            WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, WorkspaceListResponse,
            QueryCreate, QueryUpdate, QueryResponse, QueryListResponse, QueryStatusUpdate,
            QueryExecuteRequest, QueryExecuteResponse,
            PermissionCreate, PermissionResponse, PermissionBulkCreate
        )
        
        # Test CRUD imports
        print("✓ Testing CRUD imports...")
        from app.crud import workspace_crud, query_crud, permission_crud
        
        # Test service imports
        print("✓ Testing service imports...")
        from app.services import QueryExecutorService, ExternalAPIService
        
        # Test router imports
        print("✓ Testing router imports...")
        from app.routers import (
            health_router, workspaces_router, queries_router,
            permissions_router, external_router, execute_router
        )
        
        # Test main app import
        print("✓ Testing main app import...")
        from app.main import app
        
        print("\n✅ All imports successful!")
        return True
        
    except ImportError as e:
        print(f"\n❌ Import error: {e}")
        return False

if __name__ == "__main__":
    import sys
    success = test_imports()
    sys.exit(0 if success else 1)