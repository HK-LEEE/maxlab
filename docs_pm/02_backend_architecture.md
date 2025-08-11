# Process Monitoring Backend Architecture
## Maxlab Chemical Workspace Feature

**Version**: 1.0  
**Date**: 2025-01-31  
**Author**: Backend Architecture Team  

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Database Schema Design](#database-schema-design)
3. [API Endpoints Design](#api-endpoints-design)
4. [Data Source Configuration Strategy](#data-source-configuration-strategy)
5. [Security & Permission Model](#security--permission-model)
6. [Versioning Strategy](#versioning-strategy)
7. [Publishing Mechanism](#publishing-mechanism)
8. [Performance Considerations](#performance-considerations)
9. [Scalability Plan](#scalability-plan)
10. [Integration Points](#integration-points)
11. [Data Flow Diagrams](#data-flow-diagrams)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Process Monitoring System                    │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React + ReactFlow)                                  │
│  ├── Flow Management UI                                         │
│  ├── Flow Editor (ReactFlow Canvas)                            │
│  └── Monitoring Dashboard                                       │
├─────────────────────────────────────────────────────────────────┤
│  Backend API Layer (FastAPI)                                   │
│  ├── Flow Management APIs                                       │
│  ├── Versioning APIs                                           │
│  ├── Publishing APIs                                           │
│  └── Monitoring Data APIs                                      │
├─────────────────────────────────────────────────────────────────┤
│  Core Services Layer                                           │
│  ├── Flow Permission Service                                   │
│  ├── Data Provider Service                                     │
│  ├── Version Management Service                                │
│  └── Publishing Service                                        │
├─────────────────────────────────────────────────────────────────┤
│  Data Access Layer                                             │
│  ├── PostgreSQL (Main Database)                                │
│  ├── MSSQL (External Data Sources)                            │
│  └── External APIs (Third-party Data)                         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Core Components

- **Flow Management Engine**: Handles process flow CRUD operations
- **ReactFlow Integration**: Manages visual flow editor data persistence
- **Data Source Abstraction**: Multi-database support with provider pattern
- **Version Control System**: Git-like versioning for process flows
- **Publishing Engine**: Public access mechanism without authentication
- **Permission System**: Role-based access control with workspace isolation

### 1.3 Technology Stack

- **Backend Framework**: FastAPI (Python 3.11+)
- **Primary Database**: PostgreSQL 17
- **ORM**: SQLAlchemy 2.0 + Alembic
- **Authentication**: OAuth2/OIDC (via maxplatform)
- **External Data**: MSSQL, PostgreSQL, REST APIs
- **Encryption**: Fernet (symmetric encryption)
- **Caching**: Redis (future)
- **Background Tasks**: Celery (future)

---

## 2. Database Schema Design

### 2.1 Core Process Flow Tables

```sql
-- Main process flow table
CREATE TABLE process_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_data JSONB NOT NULL, -- ReactFlow nodes and edges
    
    -- Versioning
    current_version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    
    -- Data Source Configuration
    data_source_id UUID REFERENCES data_source_configs(id),
    
    -- Permission and Scope
    scope_type VARCHAR(20) DEFAULT 'USER' CHECK (scope_type IN ('USER', 'WORKSPACE', 'PUBLIC')),
    visibility_scope VARCHAR(20) DEFAULT 'PRIVATE' CHECK (visibility_scope IN ('PRIVATE', 'SHARED', 'PUBLIC')),
    shared_with_workspace BOOLEAN DEFAULT false,
    
    -- Publishing
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    publish_token VARCHAR(64) UNIQUE,
    publish_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(workspace_id, name),
    INDEX idx_process_flows_workspace(workspace_id),
    INDEX idx_process_flows_published(is_published, published_at),
    INDEX idx_process_flows_token(publish_token),
    INDEX idx_process_flows_updated(updated_at DESC)
);
```

### 2.2 Version Control System

```sql
-- Process flow versions
CREATE TABLE process_flow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES process_flows(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_data JSONB NOT NULL,
    data_source_id UUID REFERENCES data_source_configs(id),
    
    -- Version metadata
    change_summary TEXT,
    tags JSONB, -- Array of tags for categorization
    is_major_version BOOLEAN DEFAULT false,
    parent_version_id UUID REFERENCES process_flow_versions(id),
    
    -- Audit
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(flow_id, version_number),
    INDEX idx_flow_versions_flow(flow_id, version_number DESC),
    INDEX idx_flow_versions_created(created_at DESC)
);

-- Version comparison tracking
CREATE TABLE process_flow_version_diffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_version_id UUID NOT NULL REFERENCES process_flow_versions(id),
    to_version_id UUID NOT NULL REFERENCES process_flow_versions(id),
    diff_data JSONB NOT NULL, -- Computed differences
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(from_version_id, to_version_id)
);
```

### 2.3 Data Source Configuration

```sql
-- Multi-database configuration
CREATE TABLE data_source_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    config_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Source type and connection
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('POSTGRESQL', 'MSSQL', 'API', 'ORACLE', 'MYSQL')),
    connection_string TEXT, -- Encrypted connection string
    
    -- API specific
    api_url VARCHAR(500),
    api_key TEXT, -- Encrypted
    api_headers JSONB,
    api_timeout INTEGER DEFAULT 30,
    
    -- Connection pooling
    max_connections INTEGER DEFAULT 5,
    connection_timeout INTEGER DEFAULT 30,
    
    -- Caching and performance
    cache_ttl INTEGER DEFAULT 300, -- 5 minutes
    query_timeout INTEGER DEFAULT 30,
    retry_count INTEGER DEFAULT 3,
    
    -- Status and monitoring
    is_active BOOLEAN DEFAULT true,
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(20) DEFAULT 'UNKNOWN' CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN')),
    error_message TEXT,
    
    -- Audit
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(workspace_id, config_name),
    INDEX idx_data_source_configs_workspace(workspace_id, is_active),
    INDEX idx_data_source_configs_health(health_status, last_health_check)
);
```

### 2.4 Data Mapping and Query Configuration

```sql
-- Field mappings for external data sources
CREATE TABLE data_source_field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES data_source_configs(id) ON DELETE CASCADE,
    data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('EQUIPMENT_STATUS', 'MEASUREMENT_DATA')),
    
    -- Source field mapping
    source_table_name VARCHAR(255),
    source_field_mappings JSONB NOT NULL,
    
    -- Query configuration
    base_query TEXT NOT NULL,
    filter_conditions JSONB,
    order_by_clause TEXT,
    
    -- Performance
    cache_duration INTEGER DEFAULT 300,
    max_records INTEGER DEFAULT 1000,
    
    -- Audit
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(config_id, data_type),
    INDEX idx_field_mappings_config(config_id, data_type)
);

-- Custom SQL queries for specific flows
CREATE TABLE process_flow_custom_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES process_flows(id) ON DELETE CASCADE,
    query_name VARCHAR(255) NOT NULL,
    query_type VARCHAR(50) NOT NULL CHECK (query_type IN ('EQUIPMENT_STATUS', 'MEASUREMENT_DATA', 'CUSTOM')),
    sql_query TEXT NOT NULL,
    parameters JSONB,
    
    -- Execution settings
    execution_interval INTEGER, -- Seconds
    timeout_seconds INTEGER DEFAULT 30,
    max_retries INTEGER DEFAULT 3,
    
    -- Results caching
    cache_results BOOLEAN DEFAULT true,
    cache_duration INTEGER DEFAULT 300,
    
    -- Audit
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(flow_id, query_name),
    INDEX idx_custom_queries_flow(flow_id, query_type)
);
```

### 2.5 Monitoring and Performance Tables

```sql
-- Equipment status tracking
CREATE TABLE equipment_status_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID REFERENCES process_flows(id),
    equipment_type VARCHAR(20) NOT NULL,
    equipment_code VARCHAR(30) NOT NULL,
    equipment_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    previous_status VARCHAR(20),
    last_run_time TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    data_source_id UUID REFERENCES data_source_configs(id),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_equipment_status_log_flow(flow_id, recorded_at DESC),
    INDEX idx_equipment_status_log_equipment(equipment_code, recorded_at DESC)
);

-- Query execution metrics
CREATE TABLE query_execution_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID REFERENCES process_flows(id),
    data_source_id UUID REFERENCES data_source_configs(id),
    query_type VARCHAR(50) NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    result_count INTEGER,
    error_message TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_query_metrics_flow(flow_id, executed_at DESC),
    INDEX idx_query_metrics_source(data_source_id, executed_at DESC)
);
```

### 2.6 Enhanced Permission System

```sql
-- Flow sharing and collaboration
CREATE TABLE process_flow_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES process_flows(id) ON DELETE CASCADE,
    user_id VARCHAR(255),
    group_id VARCHAR(255),
    permission_level VARCHAR(20) NOT NULL CHECK (permission_level IN ('READ', 'write', 'admin')),
    
    -- Collaboration features
    can_edit_flow BOOLEAN DEFAULT false,
    can_manage_versions BOOLEAN DEFAULT false,
    can_publish BOOLEAN DEFAULT false,
    can_share BOOLEAN DEFAULT false,
    
    -- Invitation system
    invited_by VARCHAR(255) NOT NULL,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure either user_id or group_id is set
    CHECK ((user_id IS NOT NULL) != (group_id IS NOT NULL)),
    UNIQUE(flow_id, user_id, group_id),
    INDEX idx_flow_collaborators_flow(flow_id, permission_level)
);
```

---

## 3. API Endpoints Design

### 3.1 Flow Management APIs

```python
# Base URL: /api/v1/process-monitoring/flows

# Flow CRUD Operations
GET    /flows                           # List flows with filtering
POST   /flows                           # Create new flow
GET    /flows/{flow_id}                 # Get flow details
PUT    /flows/{flow_id}                 # Update flow
DELETE /flows/{flow_id}                 # Delete flow
PATCH  /flows/{flow_id}/status          # Update flow status

# Workspace-specific flows
GET    /workspaces/{workspace_id}/flows # List workspace flows
POST   /workspaces/{workspace_id}/flows # Create flow in workspace

# Flow data operations
GET    /flows/{flow_id}/data            # Get ReactFlow data
PUT    /flows/{flow_id}/data            # Update ReactFlow data
POST   /flows/{flow_id}/validate        # Validate flow configuration
```

### 3.2 Version Management APIs

```python
# Base URL: /api/v1/process-monitoring/flows/{flow_id}/versions

# Version operations
GET    /                               # List all versions
POST   /                               # Create new version
GET    /{version_number}               # Get specific version
DELETE /{version_number}               # Delete version (if not current)

# Version comparison and management
GET    /compare/{from_version}/{to_version}  # Compare versions
POST   /revert/{version_number}              # Revert to version
POST   /tag/{version_number}                 # Tag version
GET    /tags                                 # List version tags

# Version metadata
GET    /{version_number}/metadata            # Get version metadata
PUT    /{version_number}/metadata            # Update version metadata
```

### 3.3 Data Source Management APIs

```python
# Base URL: /api/v1/process-monitoring/data-sources

# Data source configuration
GET    /                               # List data sources
POST   /                               # Create data source
GET    /{source_id}                    # Get data source details
PUT    /{source_id}                    # Update data source
DELETE /{source_id}                    # Delete data source

# Connection management
POST   /{source_id}/test-connection    # Test connection
POST   /{source_id}/health-check       # Health check
GET    /{source_id}/schema             # Get database schema
POST   /{source_id}/query-test         # Test query execution

# Field mappings
GET    /{source_id}/mappings           # Get field mappings
POST   /{source_id}/mappings           # Create field mapping
PUT    /{source_id}/mappings/{mapping_id}  # Update mapping
DELETE /{source_id}/mappings/{mapping_id}  # Delete mapping
```

### 3.4 Publishing APIs

```python
# Base URL: /api/v1/process-monitoring/flows/{flow_id}/publish

# Publishing operations
POST   /                               # Publish flow
DELETE /                               # Unpublish flow
GET    /status                         # Get publish status
PUT    /settings                       # Update publish settings

# Public access (no auth required)
GET    /public/{publish_token}/info    # Get published flow info
GET    /public/{publish_token}/data    # Get flow visualization data
GET    /public/{publish_token}/monitoring  # Get monitoring data
```

### 3.5 Monitoring Data APIs

```python
# Base URL: /api/v1/process-monitoring/flows/{flow_id}/monitoring

# Real-time monitoring
GET    /equipment-status               # Get equipment status
GET    /measurement-data               # Get measurement data
GET    /integrated-data                # Get combined monitoring data
POST   /execute-query                  # Execute custom query

# Historical data
GET    /history/equipment/{equipment_code}  # Equipment history
GET    /history/measurements              # Measurement history
GET    /metrics                          # Performance metrics

# Alerts and notifications (future)
GET    /alerts                         # Get active alerts
POST   /alerts/rules                   # Create alert rule
GET    /notifications                  # Get notifications
```

### 3.6 Collaboration APIs

```python
# Base URL: /api/v1/process-monitoring/flows/{flow_id}/collaboration

# Sharing and permissions
GET    /collaborators                  # List collaborators
POST   /collaborators                  # Add collaborator
PUT    /collaborators/{collaborator_id}  # Update permissions
DELETE /collaborators/{collaborator_id}  # Remove collaborator

# Comments and annotations (future)
GET    /comments                       # Get comments
POST   /comments                       # Add comment
PUT    /comments/{comment_id}          # Update comment
DELETE /comments/{comment_id}          # Delete comment
```

---

## 4. Data Source Configuration Strategy

### 4.1 Multi-Database Support Architecture

```python
# Provider Interface Pattern
class IDataProvider(ABC):
    @abstractmethod
    async def connect(self) -> None:
        """Establish connection to data source"""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Close connection"""
        pass
    
    @abstractmethod
    async def execute_query(self, query: str, params: Optional[Dict] = None) -> List[Dict]:
        """Execute query and return results"""
        pass
    
    @abstractmethod
    async def get_schema(self) -> Dict[str, Any]:
        """Get database schema information"""
        pass
    
    @abstractmethod
    async def test_connection(self) -> bool:
        """Test connection health"""
        pass
```

### 4.2 Supported Data Sources

#### 4.2.1 MSSQL Provider
```python
class MSSQLProvider(IDataProvider):
    def __init__(self, connection_string: str):
        self.connection_string = decrypt_connection_string(connection_string)
        self.pool = None
    
    async def connect(self):
        self.pool = await aioodbc.create_pool(self.connection_string)
    
    async def execute_query(self, query: str, params: Optional[Dict] = None):
        # MSSQL-specific query execution with parameter binding
        # Handle datetime conversions and data type mapping
        pass
```

#### 4.2.2 PostgreSQL Provider
```python
class PostgreSQLProvider(IDataProvider):
    def __init__(self, connection_string: str):
        self.connection_string = decrypt_connection_string(connection_string)
        self.pool = None
    
    async def connect(self):
        self.pool = await asyncpg.create_pool(self.connection_string)
    
    async def execute_query(self, query: str, params: Optional[Dict] = None):
        # PostgreSQL-specific query execution
        # Handle JSON/JSONB data types and array types
        pass
```

#### 4.2.3 API Provider
```python
class APIProvider(IDataProvider):
    def __init__(self, base_url: str, api_key: str, headers: Dict = None):
        self.base_url = base_url
        self.api_key = decrypt_api_key(api_key)
        self.headers = headers or {}
        self.session = None
    
    async def execute_query(self, query: str, params: Optional[Dict] = None):
        # Convert SQL-like queries to API calls
        # Handle pagination and result transformation
        pass
```

### 4.3 Configuration Management

#### 4.3.1 Environment-based Configuration
```python
# .env configuration
DATABASE_URLS = {
    "primary": "postgresql+asyncpg://user:pass@host:5432/db",
    "mssql_plant": "ENCRYPTED:gAAAAABh...",
    "mssql_lab": "ENCRYPTED:gAAAAABh...",
    "api_external": "https://api.example.com/v1"
}

API_KEYS = {
    "external_api": "ENCRYPTED:gAAAAABh...",
    "weather_api": "ENCRYPTED:gAAAAABh..."
}
```

#### 4.3.2 Dynamic Configuration Loading
```python
class DataSourceConfigManager:
    def __init__(self):
        self.providers_cache = {}
        self.encryption_key = os.getenv('ENCRYPTION_KEY')
    
    async def get_provider(self, config_id: UUID) -> IDataProvider:
        """Get configured data provider instance"""
        if config_id in self.providers_cache:
            return self.providers_cache[config_id]
        
        config = await self.load_config(config_id)
        provider = await self.create_provider(config)
        self.providers_cache[config_id] = provider
        return provider
    
    async def create_provider(self, config: DataSourceConfig) -> IDataProvider:
        """Factory method to create appropriate provider"""
        if config.source_type == 'MSSQL':
            return MSSQLProvider(config.connection_string)
        elif config.source_type == 'POSTGRESQL':
            return PostgreSQLProvider(config.connection_string)
        elif config.source_type == 'API':
            return APIProvider(config.api_url, config.api_key, config.api_headers)
        else:
            raise ValueError(f"Unsupported source type: {config.source_type}")
```

---

## 5. Security & Permission Model

### 5.1 Multi-Layer Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Security Layers                             │
├─────────────────────────────────────────────────────────────────┤
│ 1. Authentication Layer (OAuth2/OIDC via maxplatform)          │
│    ├── JWT Token Validation                                    │
│    ├── Session Management                                      │
│    └── Multi-Factor Authentication Support                     │
├─────────────────────────────────────────────────────────────────┤
│ 2. Authorization Layer (RBAC + ABAC)                           │
│    ├── Workspace-based Permissions                             │
│    ├── Resource-level Access Control                           │
│    └── Dynamic Permission Evaluation                           │
├─────────────────────────────────────────────────────────────────┤
│ 3. Data Protection Layer                                        │
│    ├── Connection String Encryption (Fernet)                   │
│    ├── API Key Encryption                                      │
│    └── Sensitive Data Masking                                  │
├─────────────────────────────────────────────────────────────────┤
│ 4. Network Security Layer                                      │
│    ├── HTTPS/TLS Enforcement                                   │
│    ├── CSRF Protection                                         │
│    └── Rate Limiting                                           │
├─────────────────────────────────────────────────────────────────┤
│ 5. Database Security Layer                                     │
│    ├── Row-Level Security (RLS)                               │
│    ├── SQL Injection Prevention                                │
│    └── Audit Logging                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Permission Model Implementation

#### 5.2.1 Role-Based Access Control (RBAC)
```python
class Permission(Enum):
    READ_FLOW = "read_flow"
    WRITE_FLOW = "write_flow"
    DELETE_FLOW = "delete_flow"
    MANAGE_VERSIONS = "manage_versions"
    PUBLISH_FLOW = "publish_flow"
    MANAGE_DATA_SOURCES = "manage_data_sources"
    ADMIN_WORKSPACE = "admin_workspace"

class PermissionLevel(Enum):
    VIEWER = "viewer"      # Read-only access
    EDITOR = "editor"      # Read-write access
    ADMIN = "admin"        # Full access including sharing
    OWNER = "owner"        # All permissions

PERMISSION_MATRIX = {
    PermissionLevel.VIEWER: [Permission.READ_FLOW],
    PermissionLevel.EDITOR: [Permission.READ_FLOW, Permission.WRITE_FLOW],
    PermissionLevel.ADMIN: [
        Permission.READ_FLOW, Permission.WRITE_FLOW, 
        Permission.DELETE_FLOW, Permission.MANAGE_VERSIONS,
        Permission.PUBLISH_FLOW
    ],
    PermissionLevel.OWNER: [perm for perm in Permission]
}
```

#### 5.2.2 Workspace Isolation
```python
class WorkspacePermissionChecker:
    async def check_flow_access(
        self, 
        user_id: str, 
        flow_id: UUID, 
        required_permission: Permission
    ) -> bool:
        """Check if user has permission to access flow"""
        
        # 1. Check workspace membership
        workspace_access = await self.check_workspace_access(user_id, flow_id)
        if not workspace_access:
            return False
        
        # 2. Check flow-specific permissions
        flow_permissions = await self.get_flow_permissions(user_id, flow_id)
        return required_permission in flow_permissions
    
    async def check_workspace_access(self, user_id: str, flow_id: UUID) -> bool:
        """Check if user has access to flow's workspace"""
        # Implementation with user/group membership checks
        pass
```

### 5.3 Data Encryption and Security

#### 5.3.1 Connection String Encryption
```python
from cryptography.fernet import Fernet

class SecureConfigManager:
    def __init__(self):
        self.encryption_key = os.getenv('ENCRYPTION_KEY').encode()
        self.cipher_suite = Fernet(self.encryption_key)
    
    def encrypt_connection_string(self, connection_string: str) -> str:
        """Encrypt database connection string"""
        encrypted = self.cipher_suite.encrypt(connection_string.encode())
        return encrypted.decode()
    
    def decrypt_connection_string(self, encrypted_string: str) -> str:
        """Decrypt database connection string"""
        decrypted = self.cipher_suite.decrypt(encrypted_string.encode())
        return decrypted.decode()
```

#### 5.3.2 SQL Injection Prevention
```python
class SQLSecurityValidator:
    DANGEROUS_KEYWORDS = [
        'DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE',
        'TRUNCATE', 'EXEC', 'EXECUTE', 'SCRIPT', 'SHUTDOWN'
    ]
    
    def validate_public_query(self, query: str) -> bool:
        """Validate SQL query for public endpoints"""
        query_upper = query.upper().strip()
        
        # Check for dangerous keywords
        for keyword in self.DANGEROUS_KEYWORDS:
            if keyword in query_upper:
                raise SecurityError(f"Dangerous keyword '{keyword}' not allowed")
        
        # Ensure it's a SELECT query
        if not query_upper.startswith('SELECT'):
            raise SecurityError("Only SELECT queries allowed on public endpoints")
        
        # Check query length
        if len(query) > 5000:
            raise SecurityError("Query too long")
        
        return True
```

### 5.4 Public Publishing Security

#### 5.4.1 Token-Based Access
```python
class PublishTokenManager:
    def generate_publish_token(self, flow_id: UUID, expires_hours: int = 720) -> str:
        """Generate secure publish token"""
        token_data = {
            'flow_id': str(flow_id),
            'created_at': datetime.utcnow().isoformat(),
            'expires_at': (datetime.utcnow() + timedelta(hours=expires_hours)).isoformat()
        }
        
        # Generate cryptographically secure token
        token = secrets.token_urlsafe(32)
        
        # Store token mapping in database
        await self.store_token_mapping(token, token_data)
        return token
    
    async def validate_publish_token(self, token: str) -> Optional[UUID]:
        """Validate publish token and return flow_id"""
        token_data = await self.get_token_data(token)
        
        if not token_data:
            return None
        
        # Check expiration
        expires_at = datetime.fromisoformat(token_data['expires_at'])
        if datetime.utcnow() > expires_at:
            await self.revoke_token(token)
            return None
        
        return UUID(token_data['flow_id'])
```

---

## 6. Versioning Strategy

### 6.1 Git-Like Version Control

The versioning system follows Git-like principles with linear version history and branching capabilities.

```python
class FlowVersionManager:
    async def create_version(
        self, 
        flow_id: UUID, 
        flow_data: dict, 
        user_id: str,
        change_summary: str = None,
        is_major: bool = False
    ) -> ProcessFlowVersion:
        """Create new version of process flow"""
        
        # Get current version number
        current_version = await self.get_current_version_number(flow_id)
        new_version_number = current_version + 1
        
        # Create version record
        version = ProcessFlowVersion(
            flow_id=flow_id,
            version_number=new_version_number,
            flow_data=flow_data,
            change_summary=change_summary,
            is_major_version=is_major,
            created_by=user_id
        )
        
        # Update main flow record
        await self.update_flow_current_version(flow_id, new_version_number)
        
        # Compute diff from previous version
        if current_version > 0:
            await self.compute_version_diff(flow_id, current_version, new_version_number)
        
        return version
```

### 6.2 Version Comparison and Diffing

```python
class FlowDiffCalculator:
    def compute_flow_diff(
        self, 
        from_data: dict, 
        to_data: dict
    ) -> dict:
        """Compute differences between two flow versions"""
        
        diff = {
            'nodes': {
                'added': [],
                'removed': [],
                'modified': []
            },
            'edges': {
                'added': [],
                'removed': [],
                'modified': []
            },
            'metadata_changes': {}
        }
        
        # Compare nodes
        from_nodes = {node['id']: node for node in from_data.get('nodes', [])}
        to_nodes = {node['id']: node for node in to_data.get('nodes', [])}
        
        # Find added, removed, and modified nodes
        for node_id, node in to_nodes.items():
            if node_id not in from_nodes:
                diff['nodes']['added'].append(node)
            elif from_nodes[node_id] != node:
                diff['nodes']['modified'].append({
                    'id': node_id,
                    'from': from_nodes[node_id],
                    'to': node
                })
        
        for node_id, node in from_nodes.items():
            if node_id not in to_nodes:
                diff['nodes']['removed'].append(node)
        
        # Compare edges (similar logic)
        # ... edge comparison implementation
        
        return diff
```

### 6.3 Version Tagging and Release Management

```python
class VersionTagManager:
    async def tag_version(
        self, 
        flow_id: UUID, 
        version_number: int, 
        tag_name: str,
        description: str = None
    ) -> VersionTag:
        """Tag a specific version for easy reference"""
        
        # Validate tag name (semantic versioning pattern)
        if not self.validate_tag_name(tag_name):
            raise ValueError("Invalid tag name format")
        
        # Check if tag already exists
        existing_tag = await self.get_tag_by_name(flow_id, tag_name)
        if existing_tag:
            raise ValueError(f"Tag '{tag_name}' already exists")
        
        # Create tag
        tag = VersionTag(
            flow_id=flow_id,
            version_number=version_number,
            tag_name=tag_name,
            description=description,
            created_by=user_id
        )
        
        return await self.save_tag(tag)
    
    def validate_tag_name(self, tag_name: str) -> bool:
        """Validate tag name against semantic versioning pattern"""
        import re
        pattern = r'^v\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$'
        return bool(re.match(pattern, tag_name))
```

---

## 7. Publishing Mechanism

### 7.1 Public Access Architecture

The publishing mechanism allows process flows to be shared publicly without authentication requirements while maintaining security.

```python
class FlowPublishingService:
    async def publish_flow(
        self, 
        flow_id: UUID, 
        user_id: str,
        publish_settings: PublishSettings
    ) -> PublishResult:
        """Publish flow for public access"""
        
        # Validate user has publish permission
        if not await self.check_publish_permission(user_id, flow_id):
            raise PermissionError("User lacks publish permission")
        
        # Generate unique publish token
        publish_token = self.generate_publish_token()
        expires_at = datetime.utcnow() + timedelta(hours=publish_settings.expires_hours)
        
        # Update flow record
        await self.update_flow_publish_status(
            flow_id=flow_id,
            is_published=True,
            publish_token=publish_token,
            published_at=datetime.utcnow(),
            expires_at=expires_at
        )
        
        # Create public URL
        public_url = f"{settings.BASE_URL}/public/monitoring/{publish_token}"
        
        # Log publish event
        await self.log_publish_event(flow_id, user_id, publish_token)
        
        return PublishResult(
            success=True,
            publish_token=publish_token,
            public_url=public_url,
            expires_at=expires_at
        )
```

### 7.2 Public Data Access Security

```python
class PublicDataAccessController:
    async def get_monitoring_data(
        self, 
        publish_token: str,
        data_type: str = 'integrated'
    ) -> dict:
        """Get monitoring data for published flow (no auth required)"""
        
        # Validate token and get flow
        flow = await self.validate_publish_token(publish_token)
        if not flow:
            raise NotFoundError("Invalid or expired publish token")
        
        # Get data source configuration
        data_source = await self.get_flow_data_source(flow.id)
        if not data_source:
            return {'error': 'No data source configured'}
        
        # Execute queries with security constraints
        try:
            if data_type == 'equipment':
                return await self.get_equipment_status_public(data_source)
            elif data_type == 'measurements':
                return await self.get_measurement_data_public(data_source)
            else:  # integrated
                return await self.get_integrated_data_public(data_source)
                
        except Exception as e:
            # Sanitize error messages for public endpoints
            logger.error(f"Public data access error: {e}")
            return {'error': 'Data temporarily unavailable'}
    
    async def get_integrated_data_public(self, data_source: DataSourceConfig) -> dict:
        """Get integrated monitoring data with security constraints"""
        
        provider = await self.get_data_provider(data_source)
        
        # Execute equipment status query with row limits
        equipment_query = """
        SELECT TOP 100 equipment_type, equipment_code, equipment_name, 
               status, last_run_time
        FROM equipment_status 
        WHERE status IN ('ACTIVE', 'PAUSE', 'STOP')
        ORDER BY last_run_time DESC
        """
        
        # Execute measurement query with time constraints
        measurement_query = """
        SELECT TOP 1000 equipment_type, equipment_code, measurement_code,
               measurement_desc, measurement_value, timestamp
        FROM measurement_data 
        WHERE timestamp >= DATEADD(hour, -24, GETDATE())
        ORDER BY timestamp DESC
        """
        
        # Execute with timeout and error handling
        equipment_data = await self.execute_query_safe(
            provider, equipment_query, timeout=30
        )
        
        measurement_data = await self.execute_query_safe(
            provider, measurement_query, timeout=30
        )
        
        return {
            'equipment_status': equipment_data,
            'measurement_data': measurement_data,
            'last_updated': datetime.utcnow().isoformat()
        }
```

### 7.3 Token Management and Expiration

```python
class PublishTokenLifecycleManager:
    async def check_expired_tokens(self) -> List[str]:
        """Find and process expired publish tokens"""
        
        expired_tokens = await self.db.execute(
            text("""
            SELECT publish_token, flow_id 
            FROM process_flows 
            WHERE is_published = true 
            AND publish_expires_at < NOW()
            """)
        )
        
        expired_list = []
        for row in expired_tokens:
            # Unpublish expired flows
            await self.unpublish_flow(row.flow_id)
            expired_list.append(row.publish_token)
            
            # Notify flow owner
            await self.notify_token_expiration(row.flow_id)
        
        return expired_list
    
    async def extend_token_expiration(
        self, 
        flow_id: UUID, 
        additional_hours: int,
        user_id: str
    ) -> bool:
        """Extend publish token expiration"""
        
        # Validate user has admin permission
        if not await self.check_admin_permission(user_id, flow_id):
            raise PermissionError("User lacks admin permission")
        
        # Update expiration time
        new_expires_at = datetime.utcnow() + timedelta(hours=additional_hours)
        
        await self.db.execute(
            text("""
            UPDATE process_flows 
            SET publish_expires_at = :expires_at,
                updated_at = NOW(),
                updated_by = :user_id
            WHERE id = :flow_id
            """),
            {
                'expires_at': new_expires_at,
                'user_id': user_id,
                'flow_id': flow_id
            }
        )
        
        return True
```

---

## 8. Performance Considerations

### 8.1 Database Optimization Strategy

#### 8.1.1 Index Strategy
```sql
-- Primary indexes for flow operations
CREATE INDEX CONCURRENTLY idx_process_flows_workspace_active 
ON process_flows(workspace_id, is_active) 
WHERE is_active = true;

CREATE INDEX CONCURRENTLY idx_process_flows_published_token 
ON process_flows(publish_token, is_published) 
WHERE is_published = true;

-- Version queries optimization
CREATE INDEX CONCURRENTLY idx_flow_versions_flow_version 
ON process_flow_versions(flow_id, version_number DESC);

-- Data source health monitoring
CREATE INDEX CONCURRENTLY idx_data_source_health 
ON data_source_configs(health_status, last_health_check DESC) 
WHERE is_active = true;

-- Query execution metrics
CREATE INDEX CONCURRENTLY idx_query_metrics_performance 
ON query_execution_metrics(data_source_id, executed_at DESC, execution_time_ms);
```

#### 8.1.2 Partitioning Strategy
```sql
-- Partition large tables by time for better performance
CREATE TABLE query_execution_metrics_2025_01 PARTITION OF query_execution_metrics
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE query_execution_metrics_2025_02 PARTITION OF query_execution_metrics
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Automatic partition creation
CREATE OR REPLACE FUNCTION create_monthly_partition(table_name text, start_date date)
RETURNS void AS $$
DECLARE
    partition_name text;
    end_date date;
BEGIN
    partition_name := table_name || '_' || to_char(start_date, 'YYYY_MM');
    end_date := start_date + interval '1 month';
    
    EXECUTE format('CREATE TABLE %I PARTITION OF %I 
                    FOR VALUES FROM (%L) TO (%L)',
                   partition_name, table_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;
```

### 8.2 Connection Pooling and Resource Management

```python
class ConnectionPoolManager:
    def __init__(self):
        self.pools = {}
        self.pool_stats = {}
        
    async def get_pool(self, data_source_id: UUID) -> asyncpg.Pool:
        """Get or create connection pool for data source"""
        
        if data_source_id not in self.pools:
            config = await self.get_data_source_config(data_source_id)
            
            pool = await asyncpg.create_pool(
                config.connection_string,
                min_size=1,
                max_size=config.max_connections,
                command_timeout=config.query_timeout,
                server_settings={
                    'application_name': 'maxlab_process_monitoring'
                }
            )
            
            self.pools[data_source_id] = pool
            self.pool_stats[data_source_id] = {
                'created_at': datetime.utcnow(),
                'total_queries': 0,
                'failed_queries': 0
            }
        
        return self.pools[data_source_id]
    
    async def execute_with_pool(
        self, 
        data_source_id: UUID, 
        query: str, 
        params: dict = None
    ) -> List[Dict]:
        """Execute query using connection pool with monitoring"""
        
        pool = await self.get_pool(data_source_id)
        start_time = time.time()
        
        try:
            async with pool.acquire() as conn:
                result = await conn.fetch(query, **(params or {}))
                
                # Update statistics
                self.pool_stats[data_source_id]['total_queries'] += 1
                execution_time = int((time.time() - start_time) * 1000)
                
                # Log slow queries
                if execution_time > 5000:  # 5 seconds
                    logger.warning(f"Slow query detected: {execution_time}ms")
                
                # Record metrics
                await self.record_query_metrics(
                    data_source_id, query, execution_time, len(result)
                )
                
                return [dict(record) for record in result]
                
        except Exception as e:
            self.pool_stats[data_source_id]['failed_queries'] += 1
            logger.error(f"Query execution failed: {e}")
            raise
```

### 8.3 Caching Strategy

```python
class MultiLevelCache:
    def __init__(self):
        # In-memory cache for frequently accessed data
        self.memory_cache = TTLCache(maxsize=1000, ttl=300)  # 5 minutes
        # Redis cache for shared data (future implementation)
        self.redis_cache = None
        
    async def get_cached_data(
        self, 
        cache_key: str, 
        fetch_func: Callable,
        ttl: int = 300
    ) -> Any:
        """Get data from cache or fetch and cache"""
        
        # Try memory cache first
        if cache_key in self.memory_cache:
            return self.memory_cache[cache_key]
        
        # Try Redis cache (if available)
        if self.redis_cache:
            cached_data = await self.redis_cache.get(cache_key)
            if cached_data:
                data = pickle.loads(cached_data)
                self.memory_cache[cache_key] = data
                return data
        
        # Fetch fresh data
        data = await fetch_func()
        
        # Cache the result
        self.memory_cache[cache_key] = data
        if self.redis_cache:
            await self.redis_cache.setex(
                cache_key, ttl, pickle.dumps(data)
            )
        
        return data
    
    def generate_cache_key(self, *args) -> str:
        """Generate consistent cache key"""
        return hashlib.md5(str(args).encode()).hexdigest()
```

### 8.4 Query Optimization

```python
class QueryOptimizer:
    def optimize_equipment_status_query(
        self, 
        base_query: str, 
        filters: dict = None
    ) -> str:
        """Optimize equipment status queries"""
        
        # Add appropriate WHERE clauses
        where_clauses = []
        if filters:
            if 'equipment_types' in filters:
                types_list = "', '".join(filters['equipment_types'])
                where_clauses.append(f"equipment_type IN ('{types_list}')")
            
            if 'status_filter' in filters:
                where_clauses.append(f"status = '{filters['status_filter']}'")
            
            if 'time_range' in filters:
                where_clauses.append(
                    f"last_run_time >= '{filters['time_range']}'"
                )
        
        # Construct optimized query
        if where_clauses:
            if 'WHERE' in base_query.upper():
                optimized_query = base_query + ' AND ' + ' AND '.join(where_clauses)
            else:
                optimized_query = base_query + ' WHERE ' + ' AND '.join(where_clauses)
        else:
            optimized_query = base_query
        
        # Add performance hints
        if not 'ORDER BY' in optimized_query.upper():
            optimized_query += ' ORDER BY last_run_time DESC'
        
        # Add row limit for public endpoints
        if not 'LIMIT' in optimized_query.upper() and not 'TOP' in optimized_query.upper():
            optimized_query = optimized_query.replace('SELECT', 'SELECT TOP 100', 1)
        
        return optimized_query
```

---

## 9. Scalability Plan

### 9.1 Horizontal Scaling Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Load Balancer (nginx)                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
┌─────────┐      ┌─────────┐      ┌─────────┐
│FastAPI  │      │FastAPI  │      │FastAPI  │
│Instance │      │Instance │      │Instance │
│   #1    │      │   #2    │      │   #3    │
└─────────┘      └─────────┘      └─────────┘
    │                 │                 │
    └─────────────────┼─────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
┌─────────────────────────────────────────┐  ┌─────────────────────┐
│         PostgreSQL Primary             │  │    Redis Cache      │
│       (Read/Write Master)              │  │   (Session Store)   │
└─────────────────────────────────────────┘  └─────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│        PostgreSQL Read Replicas        │
│      (Read-Only Load Distribution)     │
└─────────────────────────────────────────┘
```

### 9.2 Database Scaling Strategy

#### 9.2.1 Read Replica Configuration
```python
class DatabaseRouter:
    def __init__(self):
        self.write_db_url = settings.DATABASE_WRITE_URL
        self.read_db_urls = settings.DATABASE_READ_URLS
        self.read_replica_index = 0
        
    def get_db_session(self, read_only: bool = False):
        """Route database connections based on operation type"""
        
        if read_only and self.read_db_urls:
            # Round-robin load balancing for read replicas
            db_url = self.read_db_urls[self.read_replica_index]
            self.read_replica_index = (self.read_replica_index + 1) % len(self.read_db_urls)
            return AsyncSession(create_async_engine(db_url))
        else:
            # Use primary database for writes
            return AsyncSession(create_async_engine(self.write_db_url))
```

#### 9.2.2 Sharding Strategy (Future)
```python
class FlowShardingManager:
    """Shard flows based on workspace_id for better distribution"""
    
    def __init__(self, shard_count: int = 4):
        self.shard_count = shard_count
        self.shard_configs = self._load_shard_configs()
    
    def get_shard_for_workspace(self, workspace_id: UUID) -> str:
        """Determine which shard to use for a workspace"""
        shard_id = int(str(workspace_id).replace('-', ''), 16) % self.shard_count
        return f"shard_{shard_id}"
    
    def get_shard_db_session(self, workspace_id: UUID):
        """Get database session for appropriate shard"""
        shard_name = self.get_shard_for_workspace(workspace_id)
        shard_config = self.shard_configs[shard_name]
        return AsyncSession(create_async_engine(shard_config.db_url))
```

### 9.3 Application Scaling

#### 9.3.1 Microservice Architecture (Future)
```python
# Service breakdown for microservices architecture
services = {
    'flow-management-service': {
        'responsibility': 'Flow CRUD operations, version management',
        'database': 'flows_db',
        'dependencies': ['auth-service', 'notification-service']
    },
    'data-source-service': {
        'responsibility': 'Data source configuration and query execution',
        'database': 'datasources_db',
        'dependencies': ['auth-service']
    },
    'monitoring-service': {
        'responsibility': 'Real-time monitoring data aggregation',
        'database': 'metrics_db',
        'dependencies': ['data-source-service']
    },
    'publishing-service': {
        'responsibility': 'Public flow publishing and access',
        'database': 'shared',
        'dependencies': ['flow-management-service']
    },
    'auth-service': {
        'responsibility': 'Authentication and authorization',
        'database': 'auth_db',
        'dependencies': ['external-oauth-provider']
    }
}
```

#### 9.3.2 Background Job Processing
```python
# Using Celery for background tasks (future implementation)
from celery import Celery

app = Celery('process_monitoring')

@app.task(bind=True, max_retries=3)
def execute_scheduled_query(self, flow_id: str, query_config: dict):
    """Execute scheduled monitoring queries in background"""
    try:
        # Execute query logic
        result = execute_monitoring_query(flow_id, query_config)
        
        # Cache results
        cache_key = f"monitoring_data:{flow_id}"
        cache.set(cache_key, result, timeout=300)
        
        return result
        
    except Exception as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))

@app.task
def cleanup_expired_tokens():
    """Background task to clean up expired publish tokens"""
    PublishTokenLifecycleManager().check_expired_tokens()

@app.task
def generate_performance_reports():
    """Generate daily performance reports"""
    PerformanceReportGenerator().generate_daily_report()
```

### 9.4 Caching and Performance Scaling

```python
class DistributedCacheManager:
    """Redis-based distributed caching for multi-instance deployment"""
    
    def __init__(self):
        self.redis_cluster = redis.RedisCluster(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            decode_responses=True
        )
        
    async def get_flow_data(self, flow_id: UUID) -> Optional[dict]:
        """Get cached flow data"""
        cache_key = f"flow_data:{flow_id}"
        cached = await self.redis_cluster.get(cache_key)
        return json.loads(cached) if cached else None
    
    async def cache_flow_data(self, flow_id: UUID, data: dict, ttl: int = 300):
        """Cache flow data with TTL"""
        cache_key = f"flow_data:{flow_id}"
        await self.redis_cluster.setex(
            cache_key, ttl, json.dumps(data, default=str)
        )
    
    async def invalidate_flow_cache(self, flow_id: UUID):
        """Invalidate cached flow data"""
        cache_keys = [
            f"flow_data:{flow_id}",
            f"flow_versions:{flow_id}",
            f"monitoring_data:{flow_id}"
        ]
        await self.redis_cluster.delete(*cache_keys)
```

---

## 10. Integration Points

### 10.1 Authentication Integration (maxplatform)

```python
class MaxPlatformAuthIntegration:
    """Integration with maxplatform OAuth2/OIDC system"""
    
    def __init__(self):
        self.oauth_client_id = settings.OAUTH_CLIENT_ID
        self.oauth_client_secret = settings.OAUTH_CLIENT_SECRET
        self.oauth_server_url = settings.OAUTH_SERVER_URL
        
    async def validate_token(self, token: str) -> Optional[dict]:
        """Validate JWT token with maxplatform"""
        
        try:
            # Verify token signature and expiration
            payload = jwt.decode(
                token,
                key=self.get_public_key(),
                algorithms=['RS256'],
                audience=self.oauth_client_id
            )
            
            # Get user info from maxplatform
            user_info = await self.get_user_info(payload['sub'])
            
            return {
                'user_id': payload['sub'],
                'email': user_info.get('email'),
                'display_name': user_info.get('display_name'),
                'groups': user_info.get('groups', []),
                'roles': user_info.get('roles', [])
            }
            
        except jwt.InvalidTokenError:
            return None
    
    async def get_user_groups(self, user_id: str) -> List[str]:
        """Get user's group memberships from maxplatform"""
        
        headers = {
            'Authorization': f'Bearer {self.get_service_token()}',
            'Content-Type': 'application/json'
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.oauth_server_url}/api/users/{user_id}/groups",
                headers=headers
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return [group['name'] for group in data.get('groups', [])]
                return []
```

### 10.2 External Data Source Integration

```python
class ExternalDataSourceConnector:
    """Connector for various external data sources"""
    
    def __init__(self):
        self.mssql_providers = {}
        self.api_providers = {}
        
    async def connect_mssql_source(self, config: DataSourceConfig) -> MSSQLProvider:
        """Connect to MSSQL data source"""
        
        if config.id not in self.mssql_providers:
            connection_string = decrypt_connection_string(config.connection_string)
            provider = MSSQLProvider(connection_string)
            await provider.connect()
            
            # Test connection
            if not await provider.test_connection():
                raise ConnectionError(f"Failed to connect to MSSQL source: {config.config_name}")
            
            self.mssql_providers[config.id] = provider
        
        return self.mssql_providers[config.id]
    
    async def connect_api_source(self, config: DataSourceConfig) -> APIProvider:
        """Connect to REST API data source"""
        
        if config.id not in self.api_providers:
            api_key = decrypt_api_key(config.api_key) if config.api_key else None
            provider = APIProvider(
                base_url=config.api_url,
                api_key=api_key,
                headers=config.api_headers
            )
            
            # Test API connection
            if not await provider.test_connection():
                raise ConnectionError(f"Failed to connect to API source: {config.config_name}")
            
            self.api_providers[config.id] = provider
        
        return self.api_providers[config.id]
```

### 10.3 Real-time Data Integration

```python
class RealTimeDataProcessor:
    """Process real-time data from various sources"""
    
    def __init__(self):
        self.websocket_manager = WebSocketManager()
        self.data_buffer = {}
        
    async def start_monitoring(self, flow_id: UUID, websocket: WebSocket):
        """Start real-time monitoring for a flow"""
        
        await self.websocket_manager.connect(websocket, flow_id)
        
        try:
            # Get flow configuration
            flow = await self.get_flow(flow_id)
            data_source = await self.get_data_source(flow.data_source_id)
            
            # Start data polling
            while True:
                # Fetch latest data
                monitoring_data = await self.fetch_monitoring_data(data_source)
                
                # Send to connected clients
                await self.websocket_manager.broadcast(
                    flow_id, 
                    {
                        'type': 'monitoring_update',
                        'data': monitoring_data,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                )
                
                # Wait before next poll
                await asyncio.sleep(5)  # 5-second intervals
                
        except WebSocketDisconnect:
            await self.websocket_manager.disconnect(websocket, flow_id)

class WebSocketManager:
    """Manage WebSocket connections for real-time updates"""
    
    def __init__(self):
        self.active_connections = {}  # flow_id -> List[WebSocket]
    
    async def connect(self, websocket: WebSocket, flow_id: UUID):
        """Connect websocket to flow monitoring"""
        await websocket.accept()
        
        if flow_id not in self.active_connections:
            self.active_connections[flow_id] = []
        
        self.active_connections[flow_id].append(websocket)
    
    async def disconnect(self, websocket: WebSocket, flow_id: UUID):
        """Disconnect websocket"""
        if flow_id in self.active_connections:
            self.active_connections[flow_id].remove(websocket)
    
    async def broadcast(self, flow_id: UUID, message: dict):
        """Broadcast message to all connected clients for a flow"""
        if flow_id in self.active_connections:
            disconnected = []
            
            for websocket in self.active_connections[flow_id]:
                try:
                    await websocket.send_json(message)
                except:
                    disconnected.append(websocket)
            
            # Remove disconnected websockets
            for ws in disconnected:
                self.active_connections[flow_id].remove(ws)
```

---

## 11. Data Flow Diagrams

### 11.1 Flow Creation and Management

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend  │    │   Backend API   │    │    Database     │
│  (React +   │    │   (FastAPI)     │    │  (PostgreSQL)   │
│ ReactFlow)  │    │                 │    │                 │
└─────────────┘    └─────────────────┘    └─────────────────┘
      │                       │                       │
      │ 1. Create Flow        │                       │
      ├──────────────────────►│                       │
      │                       │ 2. Validate Data      │
      │                       │   & Permissions       │
      │                       │                       │
      │                       │ 3. Insert Flow Data   │
      │                       ├──────────────────────►│
      │                       │                       │
      │                       │ 4. Create Version     │
      │                       ├──────────────────────►│
      │                       │                       │
      │                       │ 5. Return Flow Info   │
      │ 6. Flow Created       │◄──────────────────────┤
      │◄──────────────────────┤                       │
      │                       │                       │
      │ 7. Update Flow Data   │                       │
      ├──────────────────────►│                       │
      │                       │ 8. Create New Version │
      │                       ├──────────────────────►│
      │                       │                       │
      │                       │ 9. Compute Diff       │
      │                       ├──────────────────────►│
      │                       │                       │
      │ 10. Version Created   │                       │
      │◄──────────────────────┤                       │
```

### 11.2 Data Source Configuration and Query Execution

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────────┐
│   Frontend  │    │  Backend API │    │ Data Provider│    │  External   │
│             │    │              │    │   Service    │    │ Data Source │
└─────────────┘    └──────────────┘    └──────────────┘    └─────────────┘
      │                     │                   │                  │
      │ 1. Configure        │                   │                  │
      │    Data Source      │                   │                  │
      ├────────────────────►│                   │                  │
      │                     │ 2. Encrypt        │                  │
      │                     │    Connection     │                  │
      │                     │    String         │                  │
      │                     │                   │                  │
      │                     │ 3. Test           │                  │
      │                     │    Connection     │                  │
      │                     ├──────────────────►│                  │
      │                     │                   │ 4. Connect &     │
      │                     │                   │    Validate      │
      │                     │                   ├─────────────────►│
      │                     │                   │                  │
      │                     │                   │ 5. Connection    │
      │                     │                   │    Success       │
      │                     │                   │◄─────────────────┤
      │                     │ 6. Config Saved   │                  │
      │ 7. Success          │◄──────────────────┤                  │
      │◄────────────────────┤                   │                  │
      │                     │                   │                  │
      │ 8. Execute Query    │                   │                  │
      ├────────────────────►│                   │                  │
      │                     │ 9. Security       │                  │
      │                     │    Validation     │                  │
      │                     │                   │                  │
      │                     │ 10. Execute       │                  │
      │                     │     Query         │                  │
      │                     ├──────────────────►│                  │
      │                     │                   │ 11. Run Query    │
      │                     │                   ├─────────────────►│
      │                     │                   │                  │
      │                     │                   │ 12. Result Data  │
      │                     │                   │◄─────────────────┤
      │                     │ 13. Cached Result │                  │
      │ 14. Query Results   │◄──────────────────┤                  │
      │◄────────────────────┤                   │                  │
```

### 11.3 Publishing and Public Access

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────────┐
│   Admin     │    │  Backend API │    │   Database   │    │   Public    │
│   User      │    │              │    │              │    │   Visitor   │
└─────────────┘    └──────────────┘    └──────────────┘    └─────────────┘
      │                     │                   │                  │
      │ 1. Publish Flow     │                   │                  │
      ├────────────────────►│                   │                  │
      │                     │ 2. Generate       │                  │
      │                     │    Secure Token   │                  │
      │                     │                   │                  │
      │                     │ 3. Update Flow    │                  │
      │                     │    Publish Status │                  │
      │                     ├──────────────────►│                  │
      │                     │                   │                  │
      │ 4. Public URL       │                   │                  │
      │    & Token          │                   │                  │
      │◄────────────────────┤                   │                  │
      │                     │                   │                  │
      │ 5. Share Public URL │                   │                  │
      ├─────────────────────┼───────────────────┼─────────────────►│
      │                     │                   │                  │
      │                     │ 6. Access Public  │                  │
      │                     │    URL (No Auth)  │                  │
      │                     │◄──────────────────┼──────────────────┤
      │                     │                   │                  │
      │                     │ 7. Validate Token │                  │
      │                     ├──────────────────►│                  │
      │                     │                   │                  │
      │                     │ 8. Flow Data      │                  │
      │                     │◄──────────────────┤                  │
      │                     │                   │                  │
      │                     │ 9. Execute        │                  │
      │                     │    Monitoring     │                  │
      │                     │    Queries        │                  │
      │                     │    (Secured)      │                  │
      │                     │                   │                  │
      │                     │ 10. Public Data   │                  │
      │                     ├───────────────────┼─────────────────►│
```

### 11.4 Real-time Monitoring Data Flow

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────────┐
│  Frontend   │    │  Backend API │    │ Data Provider│    │  External   │
│ (WebSocket) │    │ (WebSocket)  │    │   Service    │    │ Data Source │
└─────────────┘    └──────────────┘    └──────────────┘    └─────────────┘
      │                     │                   │                  │
      │ 1. Connect          │                   │                  │
      │    WebSocket        │                   │                  │
      ├────────────────────►│                   │                  │
      │                     │ 2. Start          │                  │
      │                     │    Monitoring     │                  │
      │                     │    Loop           │                  │
      │                     │                   │                  │
      │                     │  ┌─3. Poll Data──┐ │                  │
      │                     │  │    (5s Timer) │ │                  │
      │                     │  │               │ │                  │
      │                     │  │ 4. Execute    │ │                  │
      │                     │  │    Queries    │ │                  │
      │                     │  └───────────────┘ │                  │
      │                     ├──────────────────►│                  │
      │                     │                   │ 5. Fetch Latest  │
      │                     │                   │    Data          │
      │                     │                   ├─────────────────►│
      │                     │                   │                  │
      │                     │                   │ 6. Fresh Data    │
      │                     │                   │◄─────────────────┤
      │                     │ 7. Real-time Data │                  │
      │                     │◄──────────────────┤                  │
      │                     │                   │                  │
      │ 8. Live Updates     │                   │                  │
      │◄────────────────────┤                   │                  │
      │                     │                   │                  │
      │     ┌───────────────┐│                   │                  │
      │     │   Repeat      ││                   │                  │
      │     │  every 5s     ││                   │                  │
      │     └───────────────┘│                   │                  │
```

---

## Conclusion

This comprehensive backend architecture for the Process Monitoring feature provides:

1. **Scalable Foundation**: Designed to handle growth from small teams to enterprise deployments
2. **Security First**: Multi-layer security with encryption, authentication, and authorization
3. **Flexible Data Integration**: Support for multiple database types and external APIs
4. **Version Control**: Git-like versioning system for process flows
5. **Public Publishing**: Secure token-based public access without authentication
6. **Performance Optimized**: Connection pooling, caching, and query optimization
7. **Real-time Capabilities**: WebSocket-based live monitoring updates
8. **Extensible Design**: Plugin architecture for future enhancements

The architecture follows modern backend development best practices while maintaining simplicity and maintainability for the development team.

---

**Document Status**: ✅ Complete  
**Next Steps**: Implementation phase planning and resource allocation  
**Review Date**: 2025-02-15