# Publish Monitoring Real Data Implementation

## Overview
This document describes the implementation of real data source querying for the publish monitoring feature, replacing mock data with actual database queries.

## Problem Statement
The publish monitoring endpoint (`/public/{publish_token}/monitoring/integrated-data`) was returning mock data instead of executing actual queries against configured data sources.

## Solution Implemented

### 1. Added `execute_sql` Method to Data Provider Interface

**File: `app/services/data_providers/base.py`**
- Added abstract method `execute_sql` to `IDataProvider` base class
- Method signature: `async def execute_sql(query: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`

### 2. Implemented `execute_sql` in All Data Providers

#### MSSQL Provider (`app/services/data_providers/mssql.py`)
- Implemented SQL execution using aioodbc/pyodbc
- Handles parameter substitution for pyodbc (? placeholders)
- Converts datetime objects to ISO format strings
- Returns results as list of dictionaries

#### PostgreSQL Provider (`app/services/data_providers/postgresql_provider.py`)
- Dual implementation for asyncpg pool and SQLAlchemy session
- Handles PostgreSQL parameter format ($1, $2, etc.)
- Converts Record objects to dictionaries
- Handles both SELECT and non-SELECT queries

#### API Provider (`app/services/data_providers/api.py`)
- Attempts to send SQL to `/execute-sql` endpoint if available
- Falls back to parsing simple SELECT queries and converting to API calls
- Returns empty results if SQL execution not supported

#### Dynamic Provider (`app/services/data_providers/dynamic.py`)
- Delegates `execute_sql` to the appropriate provider based on configuration
- Handles provider selection and connection management

### 3. Updated `execute_table_query` Function

**File: `app/routers/personal_test_process_flow.py`**

Key changes:
- Uses `DynamicProvider` instead of generating mock data
- Decrypts connection strings using `ENCRYPTION_KEY`
- Executes actual SQL queries against configured data sources
- Added security measures for public endpoints:
  - Blocks dangerous SQL keywords (DROP, DELETE, INSERT, etc.)
  - Limits query length to 5000 characters
  - Enforces maximum result limit of 1000 rows for public endpoints
- Improved error handling with sanitized messages for public endpoints
- Proper resource cleanup with provider disconnection

## Security Features

### SQL Injection Prevention
- Dangerous keyword blocking for public endpoints
- Query length limits
- Parameterized query support in all providers

### Error Message Sanitization
- Public endpoints receive generic error messages
- Specific errors (decryption, connection, timeout) get appropriate messages
- Internal endpoints receive full error details for debugging

### Resource Limits
- Maximum 1000 rows for public endpoints
- Query timeout controls (30 seconds default)
- Automatic LIMIT clause addition if not present

## Configuration Requirements

### Environment Variables
```bash
# Required in .env file
ENCRYPTION_KEY=<your-fernet-key>
```

### Data Source Configuration
1. Data sources must have encrypted connection strings stored in database
2. Connection strings are encrypted using Fernet encryption
3. Each flow must have associated `data_source_id` for monitoring to work

## Testing

### Test Scripts Created
1. `test_publish_monitoring_real_data.py` - Full integration test
2. `test_execute_sql_simple.py` - Implementation verification test

### Verification Steps
1. Ensure ENCRYPTION_KEY is set in .env
2. Configure data sources with proper connection strings
3. Publish flows with associated data sources
4. Access public monitoring endpoint with publish token

## API Endpoints Affected

### Public Monitoring Endpoint
```
GET /api/v1/personal-test/process-flow/public/{publish_token}/monitoring/integrated-data
```

Now executes:
- Equipment status queries from `data_source_mappings`
- Measurement data queries from configured sources
- Table node SQL queries from flow configuration

## Benefits

1. **Real Data**: Monitoring now shows actual data from configured sources
2. **Security**: Proper encryption/decryption of sensitive connection strings
3. **Flexibility**: Supports multiple data source types (MSSQL, PostgreSQL, API)
4. **Performance**: Connection pooling and query optimization
5. **Maintainability**: Clean separation of concerns with provider pattern

## Future Enhancements

1. Add query caching for frequently accessed data
2. Implement query timeout controls per data source
3. Add support for more database types (MySQL, Oracle)
4. Implement query result pagination
5. Add monitoring metrics for query performance

## Troubleshooting

### Common Issues

1. **Decryption Failures**
   - Ensure ENCRYPTION_KEY matches the key used for encryption
   - Check that connection strings are properly encrypted in database

2. **Connection Errors**
   - Verify network connectivity to data sources
   - Check firewall rules and port accessibility
   - Ensure database credentials are correct

3. **Query Failures**
   - Verify SQL syntax matches the target database dialect
   - Check table and column names exist
   - Ensure user has proper permissions

## Conclusion

The publish monitoring feature now successfully queries real data sources using encrypted connection strings, providing actual monitoring data instead of mock data while maintaining security and performance standards.