# MaxLab Environment Configuration Guide

## Overview

This guide explains how to configure MaxLab for different environments (development, staging, production) using environment variables.

## Port and URL Configuration Summary

### Development Environment
- **Frontend Dev Server**: `localhost:3010`
- **Backend API Server**: `localhost:8010`
- **Auth Server (MAXDP)**: `localhost:8000`
- **Database**: `localhost:5432` (PostgreSQL)
- **Redis**: `localhost:6379`

### Staging Environment
- **Frontend**: `https://staging.maxlab.com`
- **Backend API**: `https://staging-api.maxlab.com`
- **Auth Server**: `https://staging-auth.maxlab.com`
- **Database**: `staging-db-host:5432`
- **Redis**: `staging-redis:6379`

### Production Environment
- **Frontend**: `https://app.maxlab.com`
- **Backend API**: `https://api.maxlab.com`
- **Auth Server**: `https://auth.maxlab.com`
- **Database**: `production-db-host:5432`
- **Redis**: `redis-host:6379`

## Environment File Setup

### 1. Frontend Configuration

#### Development (.env)
```bash
# Copy from .env.example and modify as needed
cp frontend/.env.example frontend/.env
```

#### Staging (.env.staging)
```bash
# Copy from template and modify
cp frontend/.env.staging.template frontend/.env.staging
```

#### Production (.env.production)
```bash
# Copy from template and modify
cp frontend/.env.production.template frontend/.env.production
```

### 2. Backend Configuration

#### Development (.env)
```bash
# Copy from .env.example and modify as needed
cp backend/.env.example backend/.env
```

#### Staging (.env.staging)
```bash
# Copy from template and modify
cp backend/.env.staging.template backend/.env.staging
```

#### Production (.env.production)
```bash
# Copy from template and modify
cp backend/.env.production.template backend/.env.production
```

## Key Environment Variables

### Frontend (Vite)
- `VITE_AUTH_SERVER_URL`: OAuth/Authentication server URL
- `VITE_API_BASE_URL`: Backend API base URL (used by axios clients)
- `VITE_AUTH_API_URL`: Auth API URL (for legacy compatibility)
- `VITE_CLIENT_ID`: OAuth client ID
- `VITE_REDIRECT_URI`: OAuth callback URL
- `VITE_DEV_SERVER_HOST`: Development server host
- `VITE_DEV_SERVER_PORT`: Development server port

### Backend (FastAPI)
- `AUTH_SERVER_URL`: External authentication server URL
- `DATABASE_URL`: Database connection string
- `HOST`: Server binding host
- `PORT`: Server port
- `BACKEND_CORS_ORIGINS`: Allowed CORS origins
- `REDIS_URL`: Redis connection string
- `ENVIRONMENT`: Environment name (development/staging/production)

## Deployment Scenarios

### 1. Single Server Deployment
All services running on the same server with different ports:
```bash
# Frontend
VITE_AUTH_SERVER_URL=http://your-server:8000
VITE_API_BASE_URL=http://your-server:8010

# Backend
AUTH_SERVER_URL=http://localhost:8000
PORT=8010
```

### 2. Separated Servers
Each service on different servers:
```bash
# Frontend
VITE_AUTH_SERVER_URL=https://auth-server.company.com
VITE_API_BASE_URL=https://api-server.company.com

# Backend
AUTH_SERVER_URL=https://auth-server.company.com
HOST=0.0.0.0
PORT=8010
```

### 3. Docker/Kubernetes
Using service names for internal communication:
```bash
# Frontend
VITE_AUTH_SERVER_URL=http://maxlab-auth:8000
VITE_API_BASE_URL=http://maxlab-backend:8010

# Backend
AUTH_SERVER_URL=http://maxlab-auth:8000
DATABASE_URL=postgresql+asyncpg://postgres:password@maxlab-db:5432/max_lab
REDIS_URL=redis://maxlab-redis:6379/0
```

### 4. Cloud Deployment (AWS/GCP/Azure)
Using load balancer URLs:
```bash
# Frontend
VITE_AUTH_SERVER_URL=https://auth.maxlab.com
VITE_API_BASE_URL=https://api.maxlab.com

# Backend
AUTH_SERVER_URL=https://auth.maxlab.com
DATABASE_URL=postgresql+asyncpg://user:pass@db-cluster.region.provider.com:5432/max_lab
REDIS_URL=redis://redis-cluster.region.provider.com:6379/0
```

## Security Considerations

### Development
- HTTP URLs are acceptable
- Self-signed certificates OK
- Debug logging enabled
- Relaxed CORS policies

### Staging
- HTTPS recommended
- Valid certificates preferred
- Debug logging enabled
- Restricted CORS policies

### Production
- HTTPS required
- Valid certificates required
- Minimal logging
- Strict CORS policies
- Secure cookie settings
- Strong secret keys

## Migration from Current Setup

### Current Issues
1. Hardcoded `localhost:8010` in `vite.config.ts` ✅ Fixed
2. Inconsistent environment variable names ✅ Fixed
3. Missing production-ready configurations ✅ Fixed
4. Port conflicts in different environments ✅ Documented

### Migration Steps
1. Update environment files using templates ✅ Done
2. Configure environment-specific values
3. Test in staging environment
4. Deploy to production
5. Update deployment scripts/Docker files
6. Update CI/CD pipelines

## Testing Environment Setup

To test the new environment configuration:

```bash
# Frontend
cd frontend
npm run build -- --mode staging  # Test staging build
npm run build -- --mode production  # Test production build

# Backend
cd backend
ENVIRONMENT=staging python -m uvicorn app.main:app --reload
ENVIRONMENT=production python -m uvicorn app.main:app --reload
```

## Troubleshooting

### Common Issues
1. **CORS errors**: Check `BACKEND_CORS_ORIGINS` includes frontend URL
2. **Auth failures**: Verify `AUTH_SERVER_URL` is accessible from backend
3. **Database connection**: Check `DATABASE_URL` format and credentials
4. **Port conflicts**: Ensure ports are available and not used by other services

### Debug Commands
```bash
# Check environment loading
cd frontend && npm run dev  # Check frontend env loading
cd backend && python -c "from app.core.config import settings; print(settings.AUTH_SERVER_URL)"

# Test connectivity
curl http://localhost:8010/health  # Test backend
curl http://localhost:8000/health  # Test auth server
```