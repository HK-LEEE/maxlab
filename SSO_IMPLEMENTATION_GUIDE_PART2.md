# SSO Implementation Guide - Part 2
## Security Features, Configuration, and Best Practices

---

## Security Features

### 1. CSRF Protection Middleware

**File: `app/middleware/csrf.py`**

```python
import secrets
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer
import redis
from datetime import timedelta

class CSRFProtection:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.csrf_token_prefix = "csrf_token:"
        self.token_expiry = timedelta(hours=1)
    
    def generate_csrf_token(self, session_id: str) -> str:
        """Generate CSRF token for session"""
        csrf_token = secrets.token_urlsafe(32)
        key = f"{self.csrf_token_prefix}{session_id}"
        
        # Store in Redis with expiration
        self.redis.setex(key, int(self.token_expiry.total_seconds()), csrf_token)
        
        return csrf_token
    
    async def verify_csrf_token(self, request: Request, csrf_token: str, session_id: str) -> bool:
        """Verify CSRF token for session"""
        key = f"{self.csrf_token_prefix}{session_id}"
        stored_token = self.redis.get(key)
        
        if not stored_token:
            return False
        
        return secrets.compare_digest(csrf_token, stored_token.decode('utf-8'))
    
    async def validate_csrf(self, request: Request):
        """Middleware function to validate CSRF token"""
        # Skip for GET, HEAD, OPTIONS
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return
        
        # Skip for auth endpoints
        if request.url.path.startswith('/auth/'):
            return
        
        csrf_token = request.headers.get('X-CSRF-Token')
        session_id = request.headers.get('X-Session-ID')
        
        if not csrf_token or not session_id:
            raise HTTPException(status_code=403, detail="CSRF token required")
        
        if not await self.verify_csrf_token(request, csrf_token, session_id):
            raise HTTPException(status_code=403, detail="Invalid CSRF token")
```

### 2. Rate Limiting Middleware

**File: `app/middleware/rate_limit.py`**

```python
import redis
from datetime import datetime, timedelta
from fastapi import Request, HTTPException
import json

class RateLimiter:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.rate_limit_prefix = "rate_limit:"
    
    async def check_rate_limit(self, 
                             request: Request, 
                             max_requests: int = 100, 
                             window_minutes: int = 15,
                             identifier_func=None):
        """Check if request exceeds rate limit"""
        
        # Get identifier (IP address or user ID)
        if identifier_func:
            identifier = identifier_func(request)
        else:
            identifier = request.client.host
        
        # Create time window key
        now = datetime.now()
        window_start = now.replace(second=0, microsecond=0)
        window_key = f"{self.rate_limit_prefix}{identifier}:{window_start.isoformat()}"
        
        # Get current count
        current_count = self.redis.get(window_key)
        if current_count is None:
            current_count = 0
        else:
            current_count = int(current_count)
        
        # Check if limit exceeded
        if current_count >= max_requests:
            raise HTTPException(
                status_code=429, 
                detail=f"Rate limit exceeded. Max {max_requests} requests per {window_minutes} minutes."
            )
        
        # Increment counter
        pipe = self.redis.pipeline()
        pipe.incr(window_key)
        pipe.expire(window_key, window_minutes * 60)
        pipe.execute()
        
        return True
    
    async def auth_rate_limit(self, request: Request):
        """Specific rate limiting for authentication endpoints"""
        return await self.check_rate_limit(
            request, 
            max_requests=5,  # 5 login attempts
            window_minutes=15,
            identifier_func=lambda req: req.client.host
        )
```

### 3. Session Security

**File: `app/models/session.py`**

```python
from sqlalchemy import Column, String, DateTime, Boolean, Text, Integer
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timezone
import uuid

Base = declarative_base()

class UserSession(Base):
    __tablename__ = "user_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    session_token = Column(String, nullable=False, unique=True)
    refresh_token_id = Column(String, nullable=False, unique=True)
    
    # Security metadata
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    device_fingerprint = Column(String, nullable=True)
    
    # Session lifecycle
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_accessed = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)
    
    # Security flags
    is_active = Column(Boolean, default=True)
    is_revoked = Column(Boolean, default=False)
    
    # Location and device info
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    device_type = Column(String, nullable=True)  # mobile, desktop, tablet
    
    # Security events
    login_method = Column(String, nullable=True)  # oauth, sso, etc.
    risk_score = Column(Integer, default=0)  # 0-100 risk assessment
```

### 4. Security Event Logging

**File: `app/security/audit_logger.py`**

```python
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from enum import Enum
import json

class SecurityEventType(Enum):
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    TOKEN_REFRESH = "token_refresh"
    TOKEN_REVOKED = "token_revoked"
    LOGOUT = "logout"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    CSRF_VIOLATION = "csrf_violation"
    UNAUTHORIZED_ACCESS = "unauthorized_access"

class SecurityAuditLogger:
    def __init__(self, logger_name: str = "security_audit"):
        self.logger = logging.getLogger(logger_name)
        self.logger.setLevel(logging.INFO)
        
        # Configure structured logging
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
    
    def log_security_event(self,
                          event_type: SecurityEventType,
                          user_id: Optional[str] = None,
                          ip_address: Optional[str] = None,
                          user_agent: Optional[str] = None,
                          details: Optional[Dict[str, Any]] = None,
                          risk_level: str = "low"):
        """Log security event with structured data"""
        
        event_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type.value,
            "user_id": user_id,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "risk_level": risk_level,
            "details": details or {}
        }
        
        # Log based on risk level
        if risk_level == "critical":
            self.logger.critical(json.dumps(event_data))
        elif risk_level == "high":
            self.logger.error(json.dumps(event_data))
        elif risk_level == "medium":
            self.logger.warning(json.dumps(event_data))
        else:
            self.logger.info(json.dumps(event_data))
        
        # Store in database for analysis (implement based on your needs)
        # await self.store_security_event(event_data)
    
    def log_login_success(self, user_id: str, ip_address: str, user_agent: str):
        self.log_security_event(
            SecurityEventType.LOGIN_SUCCESS,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent
        )
    
    def log_login_failed(self, email: str, ip_address: str, reason: str):
        self.log_security_event(
            SecurityEventType.LOGIN_FAILED,
            ip_address=ip_address,
            details={"email": email, "reason": reason},
            risk_level="medium"
        )
    
    def log_suspicious_activity(self, user_id: str, ip_address: str, activity: str):
        self.log_security_event(
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            user_id=user_id,
            ip_address=ip_address,
            details={"activity": activity},
            risk_level="high"
        )
```

---

## Configuration Guide

### 1. Environment Variables

**File: `.env.example`**

```bash
# Application Settings
APP_NAME=MaxLab Platform
APP_VERSION=1.0.0
ENVIRONMENT=development
DEBUG=true

# Server Configuration
HOST=0.0.0.0
PORT=8000
WORKERS=4

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost/maxlab
REDIS_URL=redis://localhost:6379/0

# OAuth 2.0 Configuration
OAUTH_CLIENT_ID=your_oauth_client_id
OAUTH_CLIENT_SECRET=your_oauth_client_secret
OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
OAUTH_AUTH_URL=https://oauth.provider.com/auth
OAUTH_TOKEN_URL=https://oauth.provider.com/token
OAUTH_USER_INFO_URL=https://oauth.provider.com/userinfo

# JWT Configuration
JWT_PRIVATE_KEY_PATH=./keys/jwt_private.pem
JWT_PUBLIC_KEY_PATH=./keys/jwt_public.pem
JWT_ALGORITHM=RS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Security Configuration
SECRET_KEY=your_super_secret_key_here
ENCRYPTION_KEY=your_encryption_key_here
CSRF_SECRET_KEY=your_csrf_secret_key
SESSION_SECRET_KEY=your_session_secret_key

# CORS Configuration
CORS_ORIGINS=["http://localhost:3000", "https://yourdomain.com"]
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
CORS_ALLOW_HEADERS=["*"]

# Rate Limiting
RATE_LIMIT_ENABLED=true
DEFAULT_RATE_LIMIT=100
AUTH_RATE_LIMIT=5
RATE_LIMIT_WINDOW_MINUTES=15

# Security Features
CSRF_PROTECTION_ENABLED=true
SECURE_COOKIES=true
HTTPS_ONLY=false  # Set to true in production
SESSION_TIMEOUT_MINUTES=60

# Logging Configuration
LOG_LEVEL=INFO
SECURITY_LOG_LEVEL=INFO
LOG_FILE_PATH=./logs/app.log
SECURITY_LOG_FILE_PATH=./logs/security.log

# Monitoring
SENTRY_DSN=your_sentry_dsn_here
PROMETHEUS_ENABLED=true
HEALTH_CHECK_ENABLED=true

# Email Configuration (for notifications)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_TLS=true

# Frontend URLs
FRONTEND_URL=http://localhost:3000
LOGIN_REDIRECT_URL=http://localhost:3000/dashboard
LOGOUT_REDIRECT_URL=http://localhost:3000/login
```

### 2. Database Schema

**File: `migrations/001_create_auth_tables.sql`**

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    oauth_provider VARCHAR(50) NOT NULL,
    oauth_id VARCHAR(255) NOT NULL,
    roles TEXT[] DEFAULT ARRAY['user'],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT unique_oauth_user UNIQUE(oauth_provider, oauth_id)
);

-- User sessions table
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Security metadata
    ip_address INET,
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    
    -- Session lifecycle
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Security flags
    is_active BOOLEAN DEFAULT true,
    is_revoked BOOLEAN DEFAULT false,
    
    -- Location and device info
    country VARCHAR(2),
    city VARCHAR(100),
    device_type VARCHAR(20),
    
    -- Security events
    login_method VARCHAR(50),
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100)
);

-- Security events table
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
    
    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    request_path TEXT,
    request_method VARCHAR(10),
    
    -- Event details
    event_data JSONB,
    risk_level VARCHAR(20) DEFAULT 'low',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_security_events_user_id (user_id),
    INDEX idx_security_events_event_type (event_type),
    INDEX idx_security_events_created_at (created_at),
    INDEX idx_security_events_risk_level (risk_level)
);

-- Blacklisted tokens table (backup to Redis)
CREATE TABLE blacklisted_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_type VARCHAR(20) NOT NULL, -- 'access' or 'refresh'
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    blacklisted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason VARCHAR(255),
    
    INDEX idx_blacklisted_tokens_token_id (token_id),
    INDEX idx_blacklisted_tokens_expires_at (expires_at)
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_refresh_token ON user_sessions(refresh_token_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
```

### 3. Redis Configuration

**File: `config/redis.conf`**

```conf
# Basic Configuration
port 6379
bind 127.0.0.1
protected-mode yes
requirepass your_redis_password_here

# Memory Management
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Security
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""
rename-command CONFIG "CONFIG_a1b2c3d4e5f6"

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log

# Performance
tcp-keepalive 60
timeout 0
tcp-backlog 511
```

### 4. FastAPI Application Configuration

**File: `app/config.py`**

```python
from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    # Application
    app_name: str = "MaxLab Platform"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = False
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    # Database
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    
    # OAuth 2.0
    oauth_client_id: str
    oauth_client_secret: str
    oauth_redirect_uri: str
    oauth_auth_url: str
    oauth_token_url: str
    oauth_user_info_url: str
    
    # JWT
    jwt_private_key_path: str = "./keys/jwt_private.pem"
    jwt_public_key_path: str = "./keys/jwt_public.pem"
    jwt_algorithm: str = "RS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    
    # Security
    secret_key: str
    encryption_key: str
    csrf_secret_key: str
    session_secret_key: str
    
    # CORS
    cors_origins: List[str] = ["http://localhost:3000"]
    cors_allow_credentials: bool = True
    cors_allow_methods: List[str] = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    cors_allow_headers: List[str] = ["*"]
    
    # Rate Limiting
    rate_limit_enabled: bool = True
    default_rate_limit: int = 100
    auth_rate_limit: int = 5
    rate_limit_window_minutes: int = 15
    
    # Security Features
    csrf_protection_enabled: bool = True
    secure_cookies: bool = True
    https_only: bool = False
    session_timeout_minutes: int = 60
    
    # Logging
    log_level: str = "INFO"
    security_log_level: str = "INFO"
    log_file_path: str = "./logs/app.log"
    security_log_file_path: str = "./logs/security.log"
    
    # Frontend URLs
    frontend_url: str = "http://localhost:3000"
    login_redirect_url: str = "http://localhost:3000/dashboard"
    logout_redirect_url: str = "http://localhost:3000/login"
    
    @property
    def jwt_private_key(self) -> str:
        with open(self.jwt_private_key_path, 'r') as f:
            return f.read()
    
    @property
    def jwt_public_key(self) -> str:
        with open(self.jwt_public_key_path, 'r') as f:
            return f.read()
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
```

---

## Integration Patterns

### 1. Protected Route Component

**File: `src/components/ProtectedRoute.tsx`**

```typescript
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  requireAuth?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  roles,
  requireAuth = true,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  
  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  // Redirect to login if authentication required but user not authenticated
  if (requireAuth && !isAuthenticated) {
    // Store intended destination
    sessionStorage.setItem('auth_return_to', location.pathname);
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Check role requirements
  if (roles && user) {
    const hasRequiredRole = roles.some(role => user.roles.includes(role));
    if (!hasRequiredRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }
  
  return <>{children}</>;
};
```

### 2. Auth Hook with Token Refresh

**File: `src/hooks/useTokenRefresh.ts`**

```typescript
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { TokenManager } from '../auth/TokenManager';

export const useTokenRefresh = () => {
  const { isAuthenticated, logout } = useAuth();
  const tokenManager = new TokenManager();
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!isAuthenticated) {
      clearRefreshTimer();
      return;
    }
    
    const scheduleTokenRefresh = () => {
      const tokenData = tokenManager.getTokenData();
      if (!tokenData) return;
      
      // Calculate time until token expires (with 2 minute buffer)
      const now = Date.now();
      const expiresAt = tokenData.expiresAt;
      const refreshTime = expiresAt - now - (2 * 60 * 1000); // 2 minutes before expiry
      
      if (refreshTime > 0) {
        refreshTimer.current = setTimeout(async () => {
          try {
            // Token will be automatically refreshed by API interceptor
            // Just trigger a request to refresh the token
            await fetch('/api/auth/me');
            scheduleTokenRefresh(); // Schedule next refresh
          } catch (error) {
            console.error('Token refresh failed:', error);
            logout(); // Logout if refresh fails
          }
        }, refreshTime);
      }
    };
    
    scheduleTokenRefresh();
    
    return () => {
      clearRefreshTimer();
    };
  }, [isAuthenticated, logout]);
  
  const clearRefreshTimer = () => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  };
};
```

### 3. Security Event Monitor

**File: `src/utils/SecurityMonitor.ts`**

```typescript
export class SecurityMonitor {
  private static instance: SecurityMonitor;
  private eventListeners: Set<(event: SecurityEvent) => void> = new Set();
  
  static getInstance(): SecurityMonitor {
    if (!SecurityMonitor.instance) {
      SecurityMonitor.instance = new SecurityMonitor();
    }
    return SecurityMonitor.instance;
  }
  
  private constructor() {
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    // Listen for authentication failures
    window.addEventListener('auth:failure', (event) => {
      this.handleSecurityEvent({
        type: 'auth_failure',
        details: event.detail,
        timestamp: new Date(),
        riskLevel: 'medium'
      });
    });
    
    // Listen for suspicious activity
    window.addEventListener('security:suspicious', (event) => {
      this.handleSecurityEvent({
        type: 'suspicious_activity',
        details: event.detail,
        timestamp: new Date(),
        riskLevel: 'high'
      });
    });
    
    // Listen for token events
    window.addEventListener('auth:token_refresh', () => {
      this.handleSecurityEvent({
        type: 'token_refresh',
        details: {},
        timestamp: new Date(),
        riskLevel: 'low'
      });
    });
  }
  
  private handleSecurityEvent(event: SecurityEvent) {
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Security Event:', event);
    }
    
    // Send to backend for logging
    this.reportSecurityEvent(event);
    
    // Notify listeners
    this.eventListeners.forEach(listener => listener(event));
  }
  
  private async reportSecurityEvent(event: SecurityEvent) {
    try {
      await fetch('/api/security/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error('Failed to report security event:', error);
    }
  }
  
  addEventListener(listener: (event: SecurityEvent) => void) {
    this.eventListeners.add(listener);
  }
  
  removeEventListener(listener: (event: SecurityEvent) => void) {
    this.eventListeners.delete(listener);
  }
  
  // Trigger security events
  reportSuspiciousActivity(details: any) {
    window.dispatchEvent(new CustomEvent('security:suspicious', { detail: details }));
  }
  
  reportAuthFailure(details: any) {
    window.dispatchEvent(new CustomEvent('auth:failure', { detail: details }));
  }
}

interface SecurityEvent {
  type: string;
  details: any;
  timestamp: Date;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}
```

---

## Best Practices

### 1. Security Best Practices

#### Token Security
- **Short-lived access tokens**: 15 minutes maximum
- **Secure refresh token storage**: Encrypted in localStorage with rotation
- **Token rotation**: New refresh token on each use
- **Token blacklisting**: Immediate revocation capability
- **HTTPS only**: All authentication traffic over TLS

#### CSRF Protection
- **CSRF tokens**: Unique tokens for each session
- **SameSite cookies**: Strict SameSite policy
- **Origin validation**: Verify request origin headers
- **State parameters**: CSRF protection in OAuth flow

#### Rate Limiting
- **Authentication endpoints**: 5 attempts per 15 minutes
- **API endpoints**: 100 requests per 15 minutes per user
- **Progressive delays**: Increasing delays for repeated failures
- **IP-based limiting**: Prevent brute force attacks

#### Session Security
- **Session timeout**: 60 minutes of inactivity
- **Device tracking**: Track and limit concurrent sessions
- **Anomaly detection**: Monitor for suspicious login patterns
- **Secure headers**: Implement security headers (HSTS, CSP, etc.)

### 2. Performance Optimization

#### Caching Strategy
```typescript
// Token caching
class TokenCache {
  private cache = new Map<string, { token: string; expiresAt: number }>();
  
  set(key: string, token: string, expiresIn: number) {
    this.cache.set(key, {
      token,
      expiresAt: Date.now() + (expiresIn * 1000)
    });
  }
  
  get(key: string): string | null {
    const cached = this.cache.get(key);
    if (!cached || Date.now() >= cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return cached.token;
  }
}
```

#### Connection Pooling
```python
# Database connection pooling
from sqlalchemy.pool import QueuePool

engine = create_engine(
    settings.database_url,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=0,
    pool_pre_ping=True,
    pool_recycle=300
)
```

### 3. Monitoring and Alerting

#### Health Checks
```python
@router.get("/health")
async def health_check():
    """Comprehensive health check"""
    checks = {
        "database": await check_database_health(),
        "redis": await check_redis_health(),
        "oauth_provider": await check_oauth_provider_health(),
    }
    
    is_healthy = all(checks.values())
    status_code = 200 if is_healthy else 503
    
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if is_healthy else "unhealthy",
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )
```

#### Metrics Collection
```python
from prometheus_client import Counter, Histogram, Gauge

# Define metrics
auth_requests_total = Counter('auth_requests_total', 'Total authentication requests', ['method', 'status'])
auth_request_duration = Histogram('auth_request_duration_seconds', 'Authentication request duration')
active_sessions = Gauge('active_sessions_total', 'Number of active user sessions')

# Usage in endpoints
@auth_request_duration.time()
async def login():
    auth_requests_total.labels(method='login', status='success').inc()
    # ... login logic
```

### 4. Error Handling

#### Frontend Error Boundary
```typescript
class AuthErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to security monitor
    SecurityMonitor.getInstance().reportAuthFailure({
      error: error.message,
      stack: error.stack,
      errorInfo
    });
  }
  
  render() {
    if (this.state.hasError) {
      return <AuthErrorFallback error={this.state.error} />;
    }
    
    return this.props.children;
  }
}
```

#### Backend Error Handling
```python
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # Log security-relevant errors
    if exc.status_code in [401, 403, 429]:
        audit_logger.log_security_event(
            SecurityEventType.UNAUTHORIZED_ACCESS,
            ip_address=request.client.host,
            details={"status_code": exc.status_code, "detail": exc.detail}
        )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Token Refresh Loop
**Problem**: Infinite token refresh requests
**Solution**:
```typescript
// Prevent multiple simultaneous refresh attempts
private refreshPromise: Promise<TokenPair> | null = null;

async refreshToken(): Promise<TokenPair> {
  if (this.refreshPromise) {
    return this.refreshPromise;
  }
  
  this.refreshPromise = this.performRefresh();
  try {
    const result = await this.refreshPromise;
    return result;
  } finally {
    this.refreshPromise = null;
  }
}
```

#### 2. CSRF Token Mismatch
**Problem**: CSRF validation failures
**Solution**:
```typescript
// Ensure CSRF token is updated after login
const updateCSRFToken = async () => {
  const response = await fetch('/api/csrf-token');
  const { csrfToken } = await response.json();
  
  // Update API client headers
  apiClient.defaults.headers['X-CSRF-Token'] = csrfToken;
};
```

#### 3. Session Timeout Issues
**Problem**: Unexpected logouts
**Solution**:
```python
# Implement activity-based session extension
async def extend_session(session_id: str):
    session = await get_session(session_id)
    if session and session.is_active:
        session.last_accessed = datetime.now(timezone.utc)
        session.expires_at = datetime.now(timezone.utc) + timedelta(minutes=60)
        await update_session(session)
```

#### 4. OAuth State Mismatch
**Problem**: OAuth state parameter validation fails
**Solution**:
```typescript
// Ensure state is properly stored and retrieved
const initiateOAuth = async () => {
  const { authUrl, state, codeVerifier } = await getAuthUrl();
  
  // Store with expiration
  const authData = {
    state,
    codeVerifier,
    timestamp: Date.now()
  };
  
  sessionStorage.setItem('oauth_data', JSON.stringify(authData));
  
  // Set expiration cleanup
  setTimeout(() => {
    sessionStorage.removeItem('oauth_data');
  }, 10 * 60 * 1000); // 10 minutes
  
  window.location.href = authUrl;
};
```

### Debug Commands

```bash
# Check Redis token storage
redis-cli KEYS "refresh_token:*"
redis-cli GET "refresh_token:specific_token_id"

# Check blacklisted tokens
redis-cli KEYS "blacklist:*"

# Monitor authentication events
tail -f logs/security.log | grep -E "(LOGIN|TOKEN|LOGOUT)"

# Check database sessions
psql -d maxlab -c "SELECT user_id, ip_address, created_at, expires_at FROM user_sessions WHERE is_active = true;"

# Test token validation
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/auth/me
```

### Security Checklist

- [ ] **HTTPS enforced** in production
- [ ] **Secure cookie flags** set (HttpOnly, Secure, SameSite)
- [ ] **CSRF protection** enabled for state-changing operations
- [ ] **Rate limiting** configured for authentication endpoints
- [ ] **Token rotation** implemented for refresh tokens
- [ ] **Session timeout** configured appropriately
- [ ] **Security headers** implemented (HSTS, CSP, X-Frame-Options)
- [ ] **Input validation** on all user inputs
- [ ] **SQL injection protection** via parameterized queries
- [ ] **XSS protection** via output encoding
- [ ] **Dependency scanning** for known vulnerabilities
- [ ] **Security monitoring** and alerting configured
- [ ] **Backup and recovery** procedures tested
- [ ] **Incident response** plan documented

---

This comprehensive guide provides everything needed to implement a secure, scalable SSO system similar to the MAX Lab platform. The implementation includes OAuth 2.0 with PKCE, JWT token management with rotation, comprehensive security features, and production-ready configuration examples.