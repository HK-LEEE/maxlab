# MaxLab Security Keys Generation Guide

## Overview

This guide explains how to generate secure keys for MaxLab production deployment. All security keys should be unique, random, and properly protected.

## Required Security Keys

### 1. SECRET_KEY
**Purpose**: General application signing and encryption
**Format**: 32+ character random string
**Usage**: Used by FastAPI for general security operations

### 2. JWT_SECRET_KEY
**Purpose**: JWT token signing and validation
**Format**: 32+ character random string
**Usage**: Signs and validates OAuth access tokens

### 3. CSRF_SECRET_KEY
**Purpose**: CSRF token generation and validation
**Format**: 32+ character random string
**Usage**: Protects against Cross-Site Request Forgery attacks

### 4. SESSION_SECRET_KEY
**Purpose**: Session cookie signing
**Format**: 32+ character random string
**Usage**: Signs session cookies for integrity

### 5. ENCRYPTION_KEY
**Purpose**: Data encryption/decryption
**Format**: 32-byte base64 encoded key
**Usage**: Encrypts sensitive data in database

### 6. WEBSOCKET_TOKEN
**Purpose**: WebSocket authentication
**Format**: 32+ character random string
**Usage**: Authenticates WebSocket connections

## Key Generation Methods

### Method 1: Python Script (Recommended)

Create a script to generate all keys at once:

```python
#!/usr/bin/env python3
"""
MaxLab Security Keys Generator
Generates all required security keys for production deployment
"""

import secrets
import base64
import string

def generate_random_key(length=32):
    """Generate a random alphanumeric key"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_encryption_key():
    """Generate a 32-byte base64 encoded encryption key"""
    key_bytes = secrets.token_bytes(32)
    return base64.urlsafe_b64encode(key_bytes).decode()

def generate_hex_key(length=32):
    """Generate a random hex key"""
    return secrets.token_hex(length)

# Generate all keys
keys = {
    'SECRET_KEY': generate_random_key(64),
    'JWT_SECRET_KEY': generate_random_key(64),
    'CSRF_SECRET_KEY': generate_random_key(64),
    'SESSION_SECRET_KEY': generate_random_key(64),
    'ENCRYPTION_KEY': generate_encryption_key(),
    'WEBSOCKET_TOKEN': generate_random_key(64)
}

print("# MaxLab Production Security Keys")
print("# Generated on:", secrets.SystemRandom().getrandbits(32))
print("# Store these keys securely and never commit to version control")
print()

for key_name, key_value in keys.items():
    print(f"{key_name}={key_value}")

print()
print("# Additional keys you may need:")
print(f"# Database encryption key: {generate_encryption_key()}")
print(f"# API key for external services: {generate_random_key(48)}")
print(f"# Backup encryption key: {generate_encryption_key()}")
```

Save as `generate_keys.py` and run:
```bash
python3 generate_keys.py > production_keys.env
```

### Method 2: Command Line (Individual Keys)

#### For regular keys (SECRET_KEY, JWT_SECRET_KEY, etc.):
```bash
# Method A: Using Python
python3 -c "import secrets; print(secrets.token_urlsafe(64))"

# Method B: Using OpenSSL
openssl rand -base64 48

# Method C: Using /dev/urandom (Linux/macOS)
head -c 48 /dev/urandom | base64
```

#### For ENCRYPTION_KEY (32-byte base64):
```bash
# Method A: Using Python
python3 -c "import secrets, base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"

# Method B: Using OpenSSL
openssl rand -base64 32
```

### Method 3: Online Tools (Not Recommended for Production)

For development/testing only:
- Use password managers with key generation features
- Online random key generators (ensure HTTPS and reputable sources)

⚠️ **Warning**: Never use online tools for production keys!

## Key Storage and Management

### 1. Environment Files
Store keys in environment-specific files:

```bash
# Production
/path/to/maxlab/backend/.env.production

# Staging
/path/to/maxlab/backend/.env.staging
```

### 2. Container Orchestration

#### Docker Secrets
```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    image: maxlab-backend
    secrets:
      - secret_key
      - jwt_secret_key
    environment:
      - SECRET_KEY_FILE=/run/secrets/secret_key
      - JWT_SECRET_KEY_FILE=/run/secrets/jwt_secret_key

secrets:
  secret_key:
    file: ./secrets/secret_key.txt
  jwt_secret_key:
    file: ./secrets/jwt_secret_key.txt
```

#### Kubernetes Secrets
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: maxlab-secrets
type: Opaque
data:
  secret-key: <base64-encoded-secret>
  jwt-secret-key: <base64-encoded-jwt-secret>
  csrf-secret-key: <base64-encoded-csrf-secret>
  session-secret-key: <base64-encoded-session-secret>
  encryption-key: <base64-encoded-encryption-key>
  websocket-token: <base64-encoded-websocket-token>
```

### 3. Cloud Key Management

#### AWS Secrets Manager
```python
import boto3

def store_keys_in_aws():
    client = boto3.client('secretsmanager')
    
    secrets = {
        'maxlab/production/secret-key': 'your-secret-key',
        'maxlab/production/jwt-secret-key': 'your-jwt-secret-key',
        # ... more keys
    }
    
    for secret_name, secret_value in secrets.items():
        client.create_secret(
            Name=secret_name,
            SecretString=secret_value
        )
```

#### Azure Key Vault
```python
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential

def store_keys_in_azure():
    credential = DefaultAzureCredential()
    client = SecretClient(vault_url="https://maxlab.vault.azure.net/", credential=credential)
    
    keys = {
        'secret-key': 'your-secret-key',
        'jwt-secret-key': 'your-jwt-secret-key',
        # ... more keys
    }
    
    for key_name, key_value in keys.items():
        client.set_secret(key_name, key_value)
```

## Key Rotation Strategy

### 1. Regular Rotation Schedule
- **Critical keys** (JWT, SECRET): Every 90 days
- **Medium priority** (CSRF, SESSION): Every 180 days
- **Low priority** (WEBSOCKET): Every 365 days
- **Encryption keys**: Every 2 years (requires data migration)

### 2. Emergency Rotation
Rotate immediately if:
- Security breach suspected
- Key exposure (logs, code commits, etc.)
- Employee departure
- Compliance requirement

### 3. Rotation Process
1. Generate new keys using the methods above
2. Update configuration files
3. Deploy with zero-downtime strategy
4. Verify functionality
5. Invalidate old keys
6. Monitor for issues

## Security Best Practices

### 1. Key Generation
- Always use cryptographically secure random generators
- Generate keys in secure environment
- Use appropriate key lengths (minimum 32 characters)
- Never use predictable patterns or dictionary words

### 2. Key Storage
- Never commit keys to version control
- Use environment variables or key management systems
- Encrypt keys at rest
- Limit access to keys (principle of least privilege)

### 3. Key Usage
- Use different keys for different purposes
- Rotate keys regularly
- Monitor key usage and access
- Log key rotation events

### 4. Key Protection
- Use file permissions (600) for key files
- Encrypt backups containing keys
- Use secure channels for key transmission
- Implement key escrow for business continuity

## Validation and Testing

### 1. Key Format Validation
```python
import base64

def validate_encryption_key(key):
    """Validate encryption key format"""
    try:
        decoded = base64.urlsafe_b64decode(key + '==')  # Add padding
        return len(decoded) == 32
    except:
        return False

def validate_regular_key(key):
    """Validate regular key format"""
    return len(key) >= 32 and key.isalnum()
```

### 2. Testing Key Functionality
```bash
# Test backend starts with new keys
cd backend
python -c "from app.core.config import settings; print('Keys loaded successfully')"

# Test JWT signing
python -c "
from app.core.security import create_access_token
token = create_access_token(data={'sub': 'test'})
print('JWT signing works:', len(token) > 0)
"
```

## Emergency Procedures

### 1. Key Compromise Response
1. **Immediate**: Rotate compromised keys
2. **Short-term**: Invalidate active sessions
3. **Medium-term**: Audit access logs
4. **Long-term**: Review security procedures

### 2. Recovery from Key Loss
1. Use backup keys if available
2. Generate new keys following this guide
3. Update all configuration files
4. Redeploy services
5. Test functionality thoroughly

## Checklist for Production Deployment

- [ ] All keys generated using secure methods
- [ ] Keys stored securely (not in code repository)
- [ ] Different keys used for different environments
- [ ] Key rotation schedule documented
- [ ] Backup and recovery procedures tested
- [ ] Access to keys restricted to authorized personnel
- [ ] Key usage monitoring implemented
- [ ] Emergency response procedures documented

## Support and Maintenance

### Key Management Tools
Consider using:
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault
- Google Secret Manager
- Kubernetes Secrets

### Monitoring
Monitor for:
- Failed authentication attempts
- Key rotation events
- Unusual key access patterns
- Configuration changes

Remember: Security is only as strong as your weakest key. Follow these guidelines carefully and review regularly.