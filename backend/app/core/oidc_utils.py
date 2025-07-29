"""
OpenID Connect (OIDC) Utilities
Handles ID Token validation, JWKS fetching, and RS256 signature verification
"""
import httpx
import jwt
from typing import Dict, Any, Optional, List
import logging
from functools import lru_cache
import time
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
import base64
import json

from .config import settings

logger = logging.getLogger(__name__)


class JWKSClient:
    """JSON Web Key Set (JWKS) client for fetching public keys"""
    
    def __init__(self, jwks_uri: str):
        self.jwks_uri = jwks_uri
        self._keys_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_time = 0
        self._cache_duration = 3600  # 1 hour cache
        
    async def get_signing_key(self, kid: str) -> str:
        """Get public key for given key ID"""
        # Check cache
        if (time.time() - self._cache_time < self._cache_duration and 
            kid in self._keys_cache):
            return self._convert_jwk_to_pem(self._keys_cache[kid])
            
        # Fetch new keys
        await self._fetch_keys()
        
        if kid not in self._keys_cache:
            raise ValueError(f"Key ID '{kid}' not found in JWKS")
            
        return self._convert_jwk_to_pem(self._keys_cache[kid])
    
    async def _fetch_keys(self):
        """Fetch JWKS from endpoint"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self.jwks_uri)
                response.raise_for_status()
                
                jwks = response.json()
                self._keys_cache = {key['kid']: key for key in jwks.get('keys', [])}
                self._cache_time = time.time()
                
                logger.info(f"Fetched {len(self._keys_cache)} keys from JWKS endpoint")
                
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch JWKS: {e}")
            raise
    
    def _convert_jwk_to_pem(self, jwk: Dict[str, Any]) -> str:
        """Convert JWK to PEM format"""
        if jwk['kty'] != 'RSA':
            raise ValueError("Only RSA keys are supported")
            
        # Decode base64url encoded values
        n = self._base64url_to_int(jwk['n'])
        e = self._base64url_to_int(jwk['e'])
        
        # Create RSA public key
        public_key = rsa.RSAPublicNumbers(e, n).public_key(default_backend())
        
        # Convert to PEM format
        pem = public_key.public_key_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        return pem.decode('utf-8')
    
    def _base64url_to_int(self, value: str) -> int:
        """Convert base64url encoded string to integer"""
        # Add padding if needed
        padding = '=' * (4 - len(value) % 4) if len(value) % 4 else ''
        
        # Decode base64url
        decoded = base64.urlsafe_b64decode(value + padding)
        
        # Convert to integer
        return int.from_bytes(decoded, 'big')


class OIDCValidator:
    """OpenID Connect ID Token validator"""
    
    def __init__(self, 
                 issuer: str,
                 client_id: str,
                 jwks_uri: Optional[str] = None):
        self.issuer = issuer
        self.client_id = client_id
        self.jwks_uri = jwks_uri or f"{issuer}/api/oauth/jwks"
        self.jwks_client = JWKSClient(self.jwks_uri)
        
    async def validate_id_token(self, 
                               id_token: str,
                               nonce: Optional[str] = None,
                               max_age: Optional[int] = None) -> Dict[str, Any]:
        """
        Validate ID Token according to OIDC spec
        
        Args:
            id_token: The ID token to validate
            nonce: Expected nonce value
            max_age: Maximum authentication age in seconds
            
        Returns:
            dict: Validated token claims
            
        Raises:
            jwt.InvalidTokenError: If token validation fails
        """
        try:
            # Decode header to get kid
            unverified_header = jwt.get_unverified_header(id_token)
            kid = unverified_header.get('kid')
            
            if not kid:
                # If no kid, try HS256 with secret (backward compatibility)
                return self._validate_hs256_token(id_token, nonce, max_age)
            
            # Get public key for RS256 validation
            public_key = await self.jwks_client.get_signing_key(kid)
            
            # Validate token
            claims = jwt.decode(
                id_token,
                public_key,
                algorithms=['RS256'],
                audience=self.client_id,
                issuer=self.issuer,
                options={"verify_exp": True}
            )
            
            # Additional OIDC validations
            self._validate_oidc_claims(claims, nonce, max_age)
            
            return claims
            
        except jwt.InvalidTokenError:
            raise
        except Exception as e:
            logger.error(f"ID token validation error: {e}")
            raise jwt.InvalidTokenError(f"ID token validation failed: {str(e)}")
    
    def _validate_hs256_token(self, 
                             id_token: str,
                             nonce: Optional[str] = None,
                             max_age: Optional[int] = None) -> Dict[str, Any]:
        """Validate HS256 signed token (backward compatibility)"""
        try:
            # Use JWT secret for HS256
            claims = jwt.decode(
                id_token,
                settings.JWT_SECRET_KEY,
                algorithms=['HS256'],
                audience=self.client_id,
                issuer=self.issuer,
                options={"verify_exp": True}
            )
            
            # Additional OIDC validations
            self._validate_oidc_claims(claims, nonce, max_age)
            
            return claims
            
        except jwt.InvalidTokenError:
            raise
    
    def _validate_oidc_claims(self, 
                             claims: Dict[str, Any],
                             nonce: Optional[str] = None,
                             max_age: Optional[int] = None):
        """Validate OIDC specific claims"""
        # Validate nonce
        if nonce and claims.get('nonce') != nonce:
            raise jwt.InvalidTokenError("Invalid nonce")
        
        # Validate auth_time if max_age is specified
        if max_age is not None:
            auth_time = claims.get('auth_time')
            if not auth_time:
                raise jwt.InvalidTokenError("auth_time claim missing")
                
            if time.time() - auth_time > max_age:
                raise jwt.InvalidTokenError("Authentication too old")
        
        # Validate required claims
        required_claims = ['sub', 'iat', 'exp']
        for claim in required_claims:
            if claim not in claims:
                raise jwt.InvalidTokenError(f"Missing required claim: {claim}")


# Global OIDC validator instance
oidc_validator = OIDCValidator(
    issuer=settings.AUTH_SERVER_URL,
    client_id=settings.CLIENT_ID if hasattr(settings, 'CLIENT_ID') else 'maxlab'
)


async def validate_id_token(id_token: str, 
                           nonce: Optional[str] = None) -> Dict[str, Any]:
    """
    Convenience function to validate ID token
    
    Args:
        id_token: The ID token to validate
        nonce: Expected nonce value
        
    Returns:
        dict: Validated token claims
    """
    return await oidc_validator.validate_id_token(id_token, nonce)


def extract_user_info_from_id_token(claims: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract user information from ID token claims to match existing user format
    
    Args:
        claims: ID token claims
        
    Returns:
        dict: User information in standard format
    """
    user_info = {
        # OIDC standard claims
        "sub": claims.get("sub"),
        "name": claims.get("name"),
        "given_name": claims.get("given_name"),
        "family_name": claims.get("family_name"),
        "email": claims.get("email"),
        "email_verified": claims.get("email_verified", True),
        "locale": claims.get("locale", "ko-KR"),
        "zoneinfo": claims.get("zoneinfo", "Asia/Seoul"),
        "updated_at": claims.get("updated_at"),
        
        # Legacy compatibility
        "user_id": claims.get("sub"),
        "username": claims.get("name") or claims.get("preferred_username"),
        "full_name": claims.get("name"),
        "is_active": True,
        "is_admin": claims.get("is_admin", False),
        "role": "admin" if claims.get("is_admin") else "user",
        "groups": claims.get("groups", []),
        "auth_type": "oidc"
    }
    
    return user_info