# OAuth-Only Authentication Architecture Design

## 1. Overview

This document describes the new OAuth-only authentication architecture for MAX Lab, eliminating all fallback mechanisms and implementing a single, reliable authentication flow.

## 2. Authentication Flow

### 2.1 High-Level Flow
```
Frontend (localhost:3010) 
    ↓ Bearer Token
Backend (localhost:8010)
    ↓ OAuth userinfo API call
MAX Platform OAuth (localhost:8000)
    ↓ User data response
Backend (localhost:8010)
    ↓ Processed user data
Frontend (localhost:3010)
```

### 2.2 Detailed Sequence Diagram
```
┌─────────┐    ┌─────────┐    ┌─────────────┐
│Frontend │    │Backend  │    │MAX Platform │
│         │    │         │    │OAuth        │
└─────────┘    └─────────┘    └─────────────┘
     │              │                │
     │ GET /api/v1/auth/me           │
     │ Authorization: Bearer {token} │
     ├──────────────>│               │
     │              │               │
     │              │ GET /api/oauth/userinfo
     │              │ Authorization: Bearer {token}
     │              ├──────────────>│
     │              │               │
     │              │ 200 OK         │
     │              │ {user_data}    │
     │              │<──────────────┤
     │              │               │
     │ 200 OK       │               │
     │ {processed_user_data}        │
     │<──────────────┤               │
     │              │               │
```

## 3. API Contracts

### 3.1 Frontend → Backend Request
```http
GET /api/v1/auth/me HTTP/1.1
Host: localhost:8010
Authorization: Bearer {oauth_token}
```

### 3.2 Backend → MAX Platform OAuth Request
```http
GET /api/oauth/userinfo HTTP/1.1
Host: localhost:8000
Authorization: Bearer {oauth_token}
```

### 3.3 MAX Platform OAuth Response
```json
{
  "sub": "user123",
  "email": "user@example.com",
  "display_name": "John Doe",
  "real_name": "John Doe",
  "is_admin": false,
  "groups": [
    {
      "name": "developers",
      "display_name": "개발팀"
    }
  ],
  "permissions": ["read", "write"],
  "scopes": ["openid", "profile", "groups"]
}
```

### 3.4 Backend → Frontend Response
```json
{
  "user_id": "user123",
  "username": "John Doe",
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "is_admin": false,
  "role": "user",
  "groups": ["개발팀"],
  "auth_type": "oauth",
  "permissions": ["read", "write"],
  "scopes": ["openid", "profile", "groups"],
  "user_uuid": "uuid-v4-generated",
  "group_uuids": ["group-uuid-1"]
}
```

## 4. Data Structures

### 4.1 Internal User Data Structure
```python
UserData = {
    "user_id": str,           # OAuth sub or id
    "username": str,          # display_name
    "email": str,             # OAuth email
    "full_name": str,         # real_name or full_name
    "is_active": bool,        # Always True for OAuth users
    "is_admin": bool,         # From OAuth is_admin field
    "role": str,              # "admin" or "user"
    "groups": List[str],      # Processed group names
    "auth_type": str,         # Always "oauth"
    "permissions": List[str], # OAuth permissions
    "scopes": List[str],      # OAuth scopes
    "token": str,             # Original token for API calls
    "user_uuid": Optional[str],     # UUID mapping
    "group_uuids": List[str]        # UUID group mappings
}
```

### 4.2 Error Response Structure
```python
ErrorResponse = {
    "error": {
        "code": str,          # AUTH_001, AUTH_002, etc.
        "message": str,       # User-friendly message
        "userAction": str,    # LOGIN_REQUIRED, RETRY_ALLOWED, etc.
        "timestamp": str,     # ISO 8601
        "requestId": str,     # UUID for tracing
        "severity": str,      # ERROR, WARNING, INFO
        "details": Optional[Dict]  # Additional context
    }
}
```

## 5. HTTP Header Specifications

### 5.1 Authorization Header Format
```
Authorization: Bearer {token}
```

**Requirements:**
- Token must be a valid OAuth access token
- No empty tokens or malformed headers
- Proper string encoding (no byte strings)

### 5.2 Common Header Issues Prevention
```python
# ✅ Correct implementation
headers = {"Authorization": f"Bearer {token}"}

# ❌ Avoid these patterns
headers = {"Authorization": f"Bearer {token.encode()}"}  # Byte string
headers = {"Authorization": f"Bearer "}                  # Empty token
headers = {"Authorization": b"Bearer " + token}          # Mixed types
```

## 6. SERVICE_TOKEN Configuration

### 6.1 Environment Variables
```bash
# Required for backend-to-OAuth communication
SERVICE_TOKEN=your_service_token_here

# OAuth server configuration
AUTH_SERVER_URL=http://localhost:8000
AUTH_SERVER_TIMEOUT=10.0
```

### 6.2 SERVICE_TOKEN Usage
- Used for service-to-service authentication with MAX Platform
- Required for UUID mapping services
- Should be configured at application startup
- Must be validated before use

## 7. Error Handling Strategy

### 7.1 Error Categories

#### 7.1.1 Token Errors (AUTH_001-099)
- `AUTH_001`: Invalid token format
- `AUTH_002`: Expired token
- `AUTH_003`: Token validation failed
- `AUTH_004`: Missing authorization header
- `AUTH_005`: Insufficient permissions

#### 7.1.2 Connection Errors (CONN_001-099)
- `CONN_001`: OAuth server unreachable
- `CONN_002`: Request timeout
- `CONN_003`: Network error

#### 7.1.3 Configuration Errors (CONFIG_001-099)
- `CONFIG_001`: Missing SERVICE_TOKEN
- `CONFIG_002`: Invalid OAuth configuration

### 7.2 Error Response Flow
```
Error Occurs → Map to Error Code → Generate User Message → Return Immediately
```

**No Retries or Fallbacks**: All errors result in immediate failure with clear messaging.

## 8. Performance Requirements

### 8.1 Response Time Target
- **Target**: < 200ms for authentication requests
- **p50**: < 100ms
- **p95**: < 200ms
- **p99**: < 500ms

### 8.2 Optimization Strategies
1. **Connection Pooling**: Reuse HTTP connections to OAuth server
2. **Request Optimization**: Minimal payload and headers
3. **Caching**: Consider short-term user data caching (with security considerations)
4. **Timeout Management**: Aggressive timeouts to prevent blocking

## 9. Security Considerations

### 9.1 Token Security
- Tokens transmitted only over HTTPS
- No token logging or storage
- Proper token validation

### 9.2 Error Information Security
- No sensitive data in error messages
- Correlation IDs for debugging
- Sanitized error details

## 10. Implementation Phases

### Phase 1: Core Infrastructure
1. Bearer token parsing and validation
2. HTTP header formatting fixes
3. SERVICE_TOKEN configuration

### Phase 2: OAuth Integration
1. MAX Platform userinfo endpoint integration
2. Response processing and mapping
3. Error handling implementation

### Phase 3: Performance & Testing
1. Performance optimization
2. Load testing
3. Error scenario testing

## 11. Configuration Changes

### 11.1 Removed Configurations
- All fallback-related settings
- Traditional auth endpoint configurations
- Multi-tier verification settings

### 11.2 New Configurations
- OAuth-specific timeout settings
- Performance monitoring configurations
- Error code mappings

## 12. Testing Strategy

### 12.1 Unit Tests
- Bearer token parsing
- HTTP header formatting
- Error code generation
- Response processing

### 12.2 Integration Tests
- End-to-end OAuth flow
- Error handling scenarios
- Performance benchmarks

### 12.3 Load Tests
- Concurrent authentication requests
- Response time measurement
- Error rate monitoring

## 13. Monitoring and Logging

### 13.1 Metrics to Track
- Authentication response times
- Error rates by category
- OAuth server availability
- Token validation success rate

### 13.2 Logging Strategy
- Structured logging with correlation IDs
- No sensitive data logging
- Error context for debugging
- Performance metrics logging

This architecture ensures a robust, maintainable, and high-performance OAuth-only authentication system that meets all project requirements while providing excellent user experience through clear error handling.