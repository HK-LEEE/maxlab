"""
Middleware components for maxlab backend application
Provides session management, authentication, and SSO integration
"""

# Import middleware components for easy access
from .session_middleware import (
    SecureSessionMiddleware,
    get_current_session,
    require_session,
    create_session,
    regenerate_session,
    logout_session,
    logout_all_user_sessions,
    get_session_manager
)

from .sso_session_validator import (
    SSOSessionValidator,
    sso_validator,
    validate_sso_session,
    invalidate_sso_session,
    clear_sso_cache
)

__all__ = [
    # Session middleware
    'SecureSessionMiddleware',
    'get_current_session',
    'require_session',
    'create_session',
    'regenerate_session',
    'logout_session',
    'logout_all_user_sessions',
    'get_session_manager',
    
    # SSO validator
    'SSOSessionValidator',
    'sso_validator',
    'validate_sso_session',
    'invalidate_sso_session',
    'clear_sso_cache'
]