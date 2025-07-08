# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev       # Start development server
npm run build     # Build for production
npm run lint      # Run ESLint
npm run test      # Run Jest tests
npm run test:coverage  # Run tests with coverage
```

### Database Operations
```bash
cd backend
# Apply migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "Migration description"

# Database testing/utilities
python check_data_source.py
python run_migrations.py
```

### Testing
```bash
# Backend tests
cd backend
pytest -v --cov=app --cov-report=html

# Frontend tests
cd frontend
npm run test
```

## Architecture Overview

### Full-Stack Platform Structure
- **Backend**: FastAPI application with PostgreSQL database
- **Frontend**: React 19 + TypeScript + Vite with TailwindCSS
- **Architecture**: Dynamic MVP module system with workspace-based organization

### Key Components

#### Backend (`/backend`)
- **FastAPI Application**: Main server at port 8010
- **Database**: PostgreSQL 17 with SQLAlchemy 2.0 async
- **Authentication**: External auth server integration (localhost:8000)
- **Dynamic Module System**: Workspace-based MVP modules that can be loaded at runtime
- **Core Services**: 
  - Data providers (MSSQL, PostgreSQL)
  - Workspace management
  - File management
  - External API integration

#### Frontend (`/frontend`)
- **React 19**: Modern React with TypeScript
- **Routing**: React Router DOM with private/admin routes
- **State Management**: Zustand for auth, React Query for server state
- **UI**: TailwindCSS with custom components
- **Specialized Workspaces**: 
  - Personal Test Workspace with process flow editor/monitor
  - ReactFlow-based visual flow editor
  - Real-time monitoring with WebSocket

#### Database Schema
- **Workspaces**: Multi-tenant workspace system
- **Files**: File management with folder structure
- **MVP Modules**: Dynamic module registration
- **Process Flows**: Complex flow management with versioning and publishing
- **Data Sources**: Multi-database connection management

### Key Features
1. **Dynamic MVP Modules**: Workspace-based modules that can be loaded/unloaded at runtime
2. **Process Flow Management**: Visual flow editor with save/load/version/publish capabilities
3. **Multi-Database Support**: MSSQL and PostgreSQL data provider system
4. **Authentication Integration**: External auth server with JWT tokens
5. **Real-time Monitoring**: WebSocket-based equipment status monitoring
6. **Public Flow Sharing**: Secure token-based public access to published flows

## Development Guidelines

### Backend Development
- Follow FastAPI patterns with async/await
- Use SQLAlchemy 2.0 async patterns
- Implement proper error handling and logging
- Use Pydantic models for request/response validation
- Follow the existing CRUD pattern in `/app/crud/`

### Frontend Development
- Use TypeScript with strict typing
- Follow React 19 patterns with hooks
- Use React Query for server state management
- Implement proper error handling with toast notifications
- Use TailwindCSS for styling

### Database Operations
- Use Alembic for all schema changes
- Test migrations with `run_migrations.py` scripts
- Check data integrity with utility scripts in `/backend/`

### Module Development
New MVP modules should follow the pattern:
```
workspaces/{module_name}/
├── backend/
│   └── router.py  # FastAPI router
├── config/
│   └── module.json  # Module configuration
└── frontend/
    └── index.tsx  # React component
```

### Testing Strategy
- Backend: pytest with async test patterns
- Frontend: Jest with React Testing Library
- Integration: Test scripts in `/backend/` for database operations
- Coverage: Maintain 70%+ test coverage (configured in pytest.ini)

## Important Notes

- **Port Configuration**: Backend runs on 8010, frontend dev server on 3000
- **Database**: PostgreSQL 17 required for full feature support
- **Authentication**: Requires external auth server at localhost:8000
- **Process Flow Features**: Requires specific database migrations for versioning/publishing
- **Multi-Database**: Supports both MSSQL and PostgreSQL data sources
- **Real-time Features**: Uses WebSocket for equipment monitoring
- **Public Access**: Secure token-based system for sharing flows publicly

## Common Workflows

### Adding New Features
1. Create database migration if needed
2. Update backend models/schemas/routers
3. Add frontend API client calls
4. Implement UI components
5. Add tests for both backend and frontend
6. Update documentation

### Debugging Database Issues
Use the provided utility scripts:
- `check_data_source.py` - Test database connections
- `check_workspace_structure.py` - Verify workspace data
- `debug_provider.py` - Debug data provider issues

### Process Flow Development
The personal test workspace includes sophisticated flow management:
- Save/load flows with metadata
- Version management with restore capabilities
- Publishing system for public access
- Real-time monitoring with WebSocket
- Visual editor based on ReactFlow