"""
Authentication and Authorization Module
Re-exports authentication functions from security module for compatibility
"""

from .security import (
    get_current_user,
    get_current_active_user,
    require_admin,
    require_groups,
    require_workspace_permission,
    AuthenticationError,
    AuthorizationError,
    verify_token_with_auth_server,
    create_access_token,
    verify_token
)

# Alias for admin requirement (commonly used name)
get_current_admin_user = require_admin

__all__ = [
    'get_current_user',
    'get_current_active_user',
    'get_current_admin_user',
    'require_admin',
    'require_groups',
    'require_workspace_permission',
    'AuthenticationError',
    'AuthorizationError',
    'verify_token_with_auth_server',
    'create_access_token',
    'verify_token'
]