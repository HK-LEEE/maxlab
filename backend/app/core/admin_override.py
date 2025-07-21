"""
Admin override configuration for MaxLab
Allows defining which users should have admin privileges in MaxLab,
independent of the OAuth server's is_admin field
"""
import os
import json
from typing import Set, Dict, Any
import logging

logger = logging.getLogger(__name__)

class AdminOverrideConfig:
    """Manages admin privilege overrides for MaxLab"""
    
    def __init__(self):
        self._admin_emails: Set[str] = set()
        self._admin_uuids: Set[str] = set()
        self._load_config()
    
    def _load_config(self):
        """Load admin configuration from environment or config file"""
        # Option 1: From environment variable (comma-separated)
        admin_emails_env = os.getenv("MAXLAB_ADMIN_EMAILS", "")
        if admin_emails_env:
            self._admin_emails = set(email.strip() for email in admin_emails_env.split(",") if email.strip())
            logger.info(f"Loaded {len(self._admin_emails)} admin emails from environment")
        
        admin_uuids_env = os.getenv("MAXLAB_ADMIN_UUIDS", "")
        if admin_uuids_env:
            self._admin_uuids = set(uuid.strip() for uuid in admin_uuids_env.split(",") if uuid.strip())
            logger.info(f"Loaded {len(self._admin_uuids)} admin UUIDs from environment")
        
        # Option 2: From config file
        config_file = os.getenv("MAXLAB_ADMIN_CONFIG_FILE", "admin_config.json")
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    self._admin_emails.update(config.get("admin_emails", []))
                    self._admin_uuids.update(config.get("admin_uuids", []))
                    logger.info(f"Loaded admin config from {config_file}")
            except Exception as e:
                logger.error(f"Failed to load admin config from {config_file}: {e}")
    
    def is_admin(self, user_data: Dict[str, Any]) -> bool:
        """
        Check if a user should have admin privileges in MaxLab
        
        Args:
            user_data: User data dictionary from OAuth server
            
        Returns:
            bool: True if user should have admin privileges
        """
        # Check email
        user_email = user_data.get("email", "").lower()
        if user_email and user_email in self._admin_emails:
            logger.debug(f"User {user_email} is admin by email override")
            return True
        
        # Check UUID
        user_uuid = user_data.get("user_uuid") or user_data.get("sub") or user_data.get("id")
        if user_uuid and str(user_uuid) in self._admin_uuids:
            logger.debug(f"User {user_uuid} is admin by UUID override")
            return True
        
        # Check if OAuth server says they're admin (optional - can be disabled)
        if os.getenv("MAXLAB_TRUST_OAUTH_ADMIN", "false").lower() == "true":
            oauth_is_admin = user_data.get("is_admin", False)
            if oauth_is_admin:
                logger.debug(f"User is admin according to OAuth server")
                return oauth_is_admin
        
        return False
    
    def add_admin_email(self, email: str):
        """Add an email to the admin list"""
        self._admin_emails.add(email.lower())
    
    def remove_admin_email(self, email: str):
        """Remove an email from the admin list"""
        self._admin_emails.discard(email.lower())
    
    def get_admin_emails(self) -> Set[str]:
        """Get the set of admin emails"""
        return self._admin_emails.copy()
    
    def get_admin_uuids(self) -> Set[str]:
        """Get the set of admin UUIDs"""
        return self._admin_uuids.copy()

# Global instance
admin_override = AdminOverrideConfig()